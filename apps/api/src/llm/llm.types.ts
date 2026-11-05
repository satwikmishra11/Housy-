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
