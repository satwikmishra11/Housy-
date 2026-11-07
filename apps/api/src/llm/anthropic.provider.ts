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

export interface AnthropicProviderOptions {
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

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = options.model || process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022';

    if (!this.apiKey) {
      logger.warn('AnthropicProvider initialized without ANTHROPIC_API_KEY');
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    if (!this.apiKey) {
      throw new LLMError('ANTHROPIC_API_KEY is not configured', 'auth');
    }

    const messages = this.formatMessages(params.messages);
    const tools = params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: params.maxTokens ?? 1024,
      messages,
    };

    if (params.system) {
      body.system = params.system;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      // Force tool use per engineering guidelines
      body.tool_choice = { type: 'any' };
    }

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (err: unknown) {
      if (err instanceof LLMError) throw err;
      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new LLMError('Anthropic request timed out or was aborted', 'timeout');
      }
      throw new LLMError(`Anthropic network failure: ${redactApiKey(error.message, [this.apiKey])}`, 'server');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      const safeErrText = redactApiKey(errText, [this.apiKey]);
      const kind = mapStatusToErrorKind(response.status);
      throw new LLMError(`Anthropic API error (${response.status}): ${safeErrText}`, kind, response.status);
    }

    interface AnthropicContentBlock {
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }

    interface AnthropicResponse {
      content: AnthropicContentBlock[];
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    }

    const data = (await response.json()) as AnthropicResponse;

    let text: string | undefined;
    const textBlocks = data.content.filter((b) => b.type === 'text' && b.text);
    if (textBlocks.length > 0) {
      text = textBlocks.map((b) => b.text).join('\n');
    }

    const toolCalls: LLMToolCall[] = [];
    const toolBlocks = data.content.filter((b) => b.type === 'tool_use' && b.id && b.name);
    for (const b of toolBlocks) {
      toolCalls.push({
        id: b.id!,
        name: b.name!,
        arguments: b.input ?? {},
      });
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }

  private formatMessages(messages: LLMChatParams['messages']): unknown[] {
    const formatted: unknown[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue; // Handled in params.system
      }

      if (msg.role === 'tool') {
        formatted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? 'unknown',
              content: msg.content,
            },
          ],
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const content: unknown[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        formatted.push({ role: 'assistant', content });
      } else {
        formatted.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    return formatted;
  }
}
