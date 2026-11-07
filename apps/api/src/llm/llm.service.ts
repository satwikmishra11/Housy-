import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { llmCallRepository } from '../repositories/llm-call.repository.js';
import {
  type LLMProvider,
  type LLMChatParams,
  type LLMChatResult,
  type LLMErrorKind,
  LLMError,
  redactApiKey,
} from './llm.types.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { GeminiProvider } from './gemini.provider.js';

export interface LLMProbeResult {
  ok: boolean;
  latencyMs: number;
  errorKind?: LLMErrorKind | 'timeout' | 'unconfigured' | null;
  errorMessage?: string;
}

export class LLMService {
  private provider: LLMProvider | null = null;
  private providerName: string;
  private modelName: string;
  private lastProbeResult: {
    result: LLMProbeResult;
    timestamp: number;
  } | null = null;

  constructor() {
    this.providerName = config.LLM_PROVIDER;
    this.modelName = config.LLM_MODEL;

    if (this.providerName === 'mock') {
      if (config.NODE_ENV !== 'test') {
        throw new Error(
          `Refusing to start with LLM_PROVIDER=mock when NODE_ENV is "${config.NODE_ENV}". MockProvider is strictly permitted under NODE_ENV=test only.`,
        );
      }
      // Under NODE_ENV=test, provider is loaded dynamically on demand in ensureProvider() or setProvider()
    } else if (this.providerName === 'anthropic') {
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
      throw new Error(`Unknown LLM provider: ${this.providerName}`);
    }
  }

  /**
   * For testing: swap or configure the active provider.
   */
  setProvider(provider: LLMProvider, name = 'mock', model = 'mock-model'): void {
    this.provider = provider;
    this.providerName = name;
    this.modelName = model;
    this.lastProbeResult = null;
  }

  getProvider(): LLMProvider {
    if (!this.provider) {
      throw new Error(
        `LLM provider "${this.providerName}" has not been initialized. Ensure provider is loaded before synchronous access.`,
      );
    }
    return this.provider;
  }

  getProviderName(): string {
    return this.providerName;
  }

  getModelName(): string {
    return this.modelName;
  }

  private async ensureProvider(): Promise<LLMProvider> {
    if (this.provider) return this.provider;
    if (this.providerName === 'mock') {
      if (config.NODE_ENV !== 'test') {
        throw new Error(
          `LLM_PROVIDER=mock is strictly permitted under NODE_ENV=test (current: ${config.NODE_ENV})`,
        );
      }
      const { mockProvider } = await import('./mock.provider.js');
      this.provider = mockProvider;
      return this.provider;
    }
    throw new Error(`LLM provider "${this.providerName}" is not initialized.`);
  }

  /**
   * Run a 1-token diagnostic probe against the active LLM provider.
   * Results are cached for 60 seconds to prevent unnecessary external network calls.
   */
  async probe(force = false): Promise<LLMProbeResult> {
    const now = Date.now();
    if (!force && this.lastProbeResult && now - this.lastProbeResult.timestamp < 60_000) {
      return this.lastProbeResult.result;
    }

    if (this.providerName === 'mock') {
      if (config.NODE_ENV !== 'test') {
        const res: LLMProbeResult = {
          ok: false,
          latencyMs: 0,
          errorKind: 'server',
          errorMessage: 'Mock provider used outside test environment',
        };
        this.lastProbeResult = { result: res, timestamp: now };
        return res;
      }
      const res: LLMProbeResult = { ok: true, latencyMs: 1, errorKind: null };
      this.lastProbeResult = { result: res, timestamp: now };
      return res;
    }

    if (this.providerName === 'anthropic' && !config.ANTHROPIC_API_KEY) {
      const res: LLMProbeResult = {
        ok: false,
        latencyMs: 0,
        errorKind: 'unconfigured',
        errorMessage: 'ANTHROPIC_API_KEY is not configured',
      };
      this.lastProbeResult = { result: res, timestamp: now };
      return res;
    }

    if (this.providerName === 'gemini' && !config.GEMINI_API_KEY) {
      const res: LLMProbeResult = {
        ok: false,
        latencyMs: 0,
        errorKind: 'unconfigured',
        errorMessage: 'GEMINI_API_KEY is not configured',
      };
      this.lastProbeResult = { result: res, timestamp: now };
      return res;
    }

    const startTime = performance.now();
    const probeController = new AbortController();
    const timer = setTimeout(() => probeController.abort(), 5000);

    try {
      const provider = await this.ensureProvider();
      await provider.chat({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
        signal: probeController.signal,
      });
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - startTime);
      const res: LLMProbeResult = { ok: true, latencyMs, errorKind: null };
      this.lastProbeResult = { result: res, timestamp: now };
      return res;
    } catch (err: unknown) {
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - startTime);
      let kind: LLMErrorKind | 'timeout' = 'server';
      if (err instanceof LLMError) {
        kind = err.kind;
      } else if (
        probeController.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && /abort|timeout/i.test(err.message))
      ) {
        kind = 'timeout';
      }

      const res: LLMProbeResult = {
        ok: false,
        latencyMs,
        errorKind: kind,
        errorMessage: redactApiKey(err instanceof Error ? err.message : String(err), [
          config.ANTHROPIC_API_KEY ?? '',
          config.GEMINI_API_KEY ?? '',
        ]),
      };
      this.lastProbeResult = { result: res, timestamp: now };
      return res;
    }
  }

  /**
   * Call LLM provider with 20s timeout, 1 retry, daily message cap check, and telemetry logging.
   */
  async chat(params: LLMChatParams, conversationId?: string): Promise<LLMChatResult> {
    const provider = await this.ensureProvider();

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
        const result = await provider.chat({
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

        let outcome: string = isTimeout ? 'timeout' : 'error';
        if (err instanceof LLMError) {
          outcome = `error:${err.kind}`;
        }

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
