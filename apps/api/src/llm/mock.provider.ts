import type { LLMProvider, LLMChatParams, LLMChatResult } from './llm.types.js';

type MockResponseItem =
  | Partial<LLMChatResult>
  | Error
  | ((params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult);

export class MockProvider implements LLMProvider {
  private queue: MockResponseItem[] = [];
  private calls: LLMChatParams[] = [];
  private defaultHandler: ((params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult) | null = null;

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    this.calls.push(params);

    if (params.signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next instanceof Error) {
        throw next;
      }
      if (typeof next === 'function') {
        return next(params);
      }
      return {
        text: next.text,
        toolCalls: next.toolCalls,
        usage: next.usage ?? { inputTokens: 50, outputTokens: 25 },
      };
    }

    if (this.defaultHandler) {
      return this.defaultHandler(params);
    }

    // Default fallback response
    return {
      text: 'Namaste! Welcome to our luxury residences. How may I assist you with your home search today?',
      usage: { inputTokens: 40, outputTokens: 20 },
    };
  }

  enqueueResponse(item: MockResponseItem): this {
    this.queue.push(item);
    return this;
  }

  setDefaultHandler(handler: (params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult): this {
    this.defaultHandler = handler;
    return this;
  }

  getCalls(): LLMChatParams[] {
    return [...this.calls];
  }

  clearCalls(): void {
    this.calls = [];
  }

  reset(): void {
    this.queue = [];
    this.calls = [];
    this.defaultHandler = null;
  }
}

export const mockProvider = new MockProvider();
