import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { llmCallRepository } from '../repositories/llm-call.repository.js';
import type { LLMProvider, LLMChatParams, LLMChatResult } from './llm.types.js';
import { mockProvider } from './mock.provider.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { GeminiProvider } from './gemini.provider.js';

export class LLMService {
  private provider: LLMProvider;
  private providerName: string;
  private modelName: string;

  constructor() {
    this.providerName = config.LLM_PROVIDER;
    this.modelName = config.LLM_MODEL;

    if (config.NODE_ENV === 'production' && this.providerName === 'mock') {
      throw new Error(
        'Refusing to start in production with LLM_PROVIDER=mock. Must be configured with real provider (anthropic or gemini).',
      );
    }

    if (this.providerName === 'anthropic') {
      this.provider = new AnthropicProvider({
        apiKey: config.ANTHROPIC_API_KEY,
        model: this.modelName,
      });
    } else if (this.providerName === 'gemini') {
      this.provider = new GeminiProvider({
        apiKey: config.GEMINI_API_KEY,
        model: this.modelName,
      });
    } else {
      this.provider = mockProvider;
    }
  }

  /**
   * For testing: swap or configure the active provider.
   */
  setProvider(provider: LLMProvider, name = 'mock', model = 'mock-model'): void {
    this.provider = provider;
    this.providerName = name;
    this.modelName = model;
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Call LLM provider with 20s timeout, 1 retry, daily message cap check, and telemetry logging.
   */
  async chat(params: LLMChatParams, conversationId?: string): Promise<LLMChatResult> {
    // 1. Check daily message cap
    const todayCount = await llmCallRepository.getTodayCallCount();
    if (todayCount >= config.LLM_DAILY_MESSAGE_CAP) {
      await llmCallRepository.logCall({
        conversationId,
        provider: this.providerName,
        model: this.modelName,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        outcome: 'cap_exceeded',
      });
      throw new Error(`LLM daily message cap of ${config.LLM_DAILY_MESSAGE_CAP} reached`);
    }

    const timeoutMs = config.LLM_TIMEOUT_MS;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < 2) {
      attempt++;
      const startTime = performance.now();
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

      // Merge signals if caller provided one
      let combinedSignal = timeoutController.signal;
      if (params.signal) {
        combinedSignal = AbortSignal.any([params.signal, timeoutController.signal]);
      }

      try {
        const result = await this.provider.chat({
          ...params,
          signal: combinedSignal,
        });
        clearTimeout(timer);

        const latencyMs = Math.round(performance.now() - startTime);
        await llmCallRepository.logCall({
          conversationId,
          provider: this.providerName,
          model: this.modelName,
          latencyMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          outcome: 'success',
        });

        return result;
      } catch (err: unknown) {
        clearTimeout(timer);
        const latencyMs = Math.round(performance.now() - startTime);
        lastError = err;

        const isTimeout =
          timeoutController.signal.aborted ||
          (err instanceof DOMException && err.name === 'TimeoutError') ||
          (err instanceof Error && /timeout|abort/i.test(err.message));

        const outcome = isTimeout ? 'timeout' : 'error';

        await llmCallRepository.logCall({
          conversationId,
          provider: this.providerName,
          model: this.modelName,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          outcome,
        });

        logger.warn(
          { attempt, provider: this.providerName, error: String(err), outcome },
          `LLM call attempt ${attempt} failed`,
        );

        if (attempt >= 2) {
          break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export const llmService = new LLMService();
