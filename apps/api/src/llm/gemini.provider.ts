import {
  type LLMProvider,
  type LLMChatParams,
  type LLMChatResult,
  type LLMToolCall,
  type LLMErrorKind,
  LLMError,
  redactApiKey,
} from './llm.types.js';
import { logger } from '../utils/logger.js';

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
}

function mapStatusToErrorKind(status: number): LLMErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'invalid_model';
  if (status === 400) return 'bad_request';
  if (status === 408 || status === 504) return 'timeout';
  return 'server';
}

/**
 * Sanitizes JSON schemas for Gemini OpenAPI specification.
 * Strips $schema, additionalProperties, and other unsupported keywords recursively.
 */
export function sanitizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === 'additionalProperties') {
      continue;
    }

    if (key === 'properties' && value && typeof value === 'object') {
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        if (propVal && typeof propVal === 'object') {
          sanitizedProps[propKey] = sanitizeSchemaForGemini(propVal as Record<string, unknown>);
        } else {
          sanitizedProps[propKey] = propVal;
        }
      }
      result[key] = sanitizedProps;
    } else if (key === 'items' && value && typeof value === 'object') {
      result[key] = sanitizeSchemaForGemini(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = options.model ?? process.env.LLM_MODEL ?? '';

    if (!this.apiKey) {
      logger.warn('GeminiProvider initialized without GEMINI_API_KEY');
    }
    if (!this.model) {
      logger.warn('GeminiProvider initialized without LLM_MODEL');
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    if (!this.apiKey) {
      throw new LLMError('GEMINI_API_KEY is not configured', 'auth');
    }
    if (!this.model) {
      throw new LLMError('LLM_MODEL is not configured', 'bad_request');
    }

    const contents = this.formatContents(params.messages);
    const body: Record<string, unknown> = {
      contents,
    };

    if (params.system) {
      body.systemInstruction = {
        parts: [{ text: params.system }],
      };
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeSchemaForGemini(t.parameters),
          })),
        },
      ];
      // Force tool use
      body.toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: params.tools.map((t) => t.name),
        },
      };
    }

    const candidateModels = [
      this.model,
      ...(this.model.startsWith('gemini-3')
        ? ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].filter((m) => m !== this.model)
        : []),
    ];

    interface GeminiPart {
      text?: string;
      functionCall?: {
        name: string;
        args?: Record<string, unknown>;
      };
    }

    interface GeminiCandidate {
      content?: {
        parts?: GeminiPart[];
        role?: string;
      };
    }

    interface GeminiResponse {
      candidates?: GeminiCandidate[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    }

    let data: GeminiResponse | null = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const activeModel = candidateModels[i]!;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
          signal: params.signal,
        });
      } catch (err: unknown) {
        if (err instanceof LLMError) throw err;
        const error = err as Error;
        if (error.name === 'AbortError') {
          throw new LLMError('Gemini request timed out or was aborted', 'timeout');
        }
        throw new LLMError(`Gemini network failure: ${redactApiKey(error.message, [this.apiKey])}`, 'server');
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        const safeErrText = redactApiKey(errText, [this.apiKey]);
        const kind = mapStatusToErrorKind(response.status);

        // If quota was exhausted on this model and we have another candidate model, rotate
        if (
          response.status === 429 &&
          (safeErrText.includes('QuotaFailure') || safeErrText.includes('rate-limits') || safeErrText.includes('quota') || safeErrText.includes('RESOURCE_EXHAUSTED')) &&
          i < candidateModels.length - 1
        ) {
          const nextModel = candidateModels[i + 1]!;
          logger.warn(
            { currentModel: activeModel, nextModel, error: safeErrText.slice(0, 120) },
            'Gemini model quota exhausted; falling back to continued model',
          );
          this.model = nextModel;
          continue;
        }

        throw new LLMError(`Gemini API error (${response.status}): ${safeErrText}`, kind, response.status);
      }

      this.model = activeModel;
      data = (await response.json()) as GeminiResponse;
      break;
    }

    if (!data) {
      throw new LLMError('Gemini returned empty response', 'server');
    }
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    let text: string | undefined;
    const textParts = parts.filter((p) => p.text);
    if (textParts.length > 0) {
      text = textParts.map((p) => p.text).join('\n');
    }

    const toolCalls: LLMToolCall[] = [];
    const callParts = parts.filter((p) => p.functionCall);
    callParts.forEach((p, idx) => {
      if (p.functionCall) {
        toolCalls.push({
          id: `${p.functionCall.name}_${idx}_${Date.now()}`,
          name: p.functionCall.name,
          arguments: p.functionCall.args ?? {},
        });
      }
    });

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  private formatContents(messages: LLMChatParams['messages']): unknown[] {
    const contents: unknown[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue;
      }

      if (msg.role === 'tool') {
        contents.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.name ?? 'tool_result',
                response: {
                  content: msg.content,
                },
              },
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        const parts: unknown[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        contents.push({ role: 'model', parts });
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return contents;
  }
}
