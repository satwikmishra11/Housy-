import type { LlmProvider, LlmCompletionRequest, LlmCompletionResponse } from './llm.types.js';
import { logger } from '../utils/logger.js';

export class MockLlmProvider implements LlmProvider {
  async generateResponse(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    logger.debug({ messagesCount: request.messages.length }, 'Processing LLM request');
    return {
      content: 'Namaste! Welcome to Company A. How may I assist you with your home search today?',
    };
  }
}

export const llmProvider = new MockLlmProvider();

