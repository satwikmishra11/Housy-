import { z } from 'zod';

export const ChatRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMChatParams {
  system?: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMChatResult {
  text?: string;
  toolCalls?: LLMToolCall[];
  usage: LLMUsage;
}

export interface LLMProvider {
  chat(params: LLMChatParams): Promise<LLMChatResult>;
}

export type LLMErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'invalid_model'
  | 'bad_request'
  | 'server';

export class LLMError extends Error {
  public readonly kind: LLMErrorKind;
  public readonly statusCode?: number;

  constructor(message: string, kind: LLMErrorKind, statusCode?: number) {
    super(message);
    this.name = 'LLMError';
    this.kind = kind;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export function redactApiKey(text: string, keys: (string | undefined)[]): string {
  let redacted = text;
  for (const k of keys) {
    if (k && k.length >= 6) {
      redacted = redacted.replaceAll(k, '[REDACTED_API_KEY]');
    }
  }
  return redacted;
}

// Backwards-compatible aliases
export type ChatMessage = LLMMessage;
export type ToolDefinition = LLMToolDefinition;
export interface LlmCompletionRequest {
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
}
export interface LlmCompletionResponse {
  content: string;
  toolCalls?: LLMToolCall[];
}
