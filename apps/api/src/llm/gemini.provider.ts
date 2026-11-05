import type { LLMProvider, LLMChatParams, LLMChatResult, LLMToolCall } from './llm.types.js';
import { logger } from '../utils/logger.js';

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = options.model || process.env.LLM_MODEL || 'gemini-1.5-flash';

    if (!this.apiKey) {
      logger.warn('GeminiProvider initialized without GEMINI_API_KEY');
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
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
            parameters: t.parameters,
          })),
        },
      ];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

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

    const data = (await response.json()) as GeminiResponse;
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
