import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../src/llm/anthropic.provider.js';
import { GeminiProvider, sanitizeSchemaForGemini } from '../src/llm/gemini.provider.js';
import { LLMError } from '../src/llm/llm.types.js';

describe('LLM Provider Adapters & Error Mapping', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('AnthropicProvider', () => {
    it('forces tool_choice: { type: "any" } and sends x-api-key header', async () => {
      let interceptedHeaders: HeadersInit | undefined;
      let interceptedBody: Record<string, unknown> | undefined;

      global.fetch = vi.fn().mockImplementation(async (_url, init) => {
        interceptedHeaders = init?.headers;
        interceptedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Hello' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const provider = new AnthropicProvider({
        apiKey: 'test-ant-key',
        model: 'claude-3-5-sonnet-20241022',
      });

      const res = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            name: 'send_reply',
            description: 'Send reply',
            parameters: { type: 'object', properties: {} },
          },
        ],
      });

      expect(res.text).toBe('Hello');
      expect((interceptedHeaders as Record<string, string>)['x-api-key']).toBe('test-ant-key');
      expect(interceptedBody?.tool_choice).toEqual({ type: 'any' });
    });

    it('maps 401/403 to auth kind with redacted secrets', async () => {
      const dummyAuthKey = 'test-ant-redact-key';
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(`Invalid key: ${dummyAuthKey}`, { status: 401 });
      });

      const provider = new AnthropicProvider({
        apiKey: dummyAuthKey,
      });

      await expect(provider.chat({ messages: [{ role: 'user', content: 'test' }] })).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(LLMError);
          const llmErr = err as LLMError;
          expect(llmErr.kind).toBe('auth');
          expect(llmErr.statusCode).toBe(401);
          expect(llmErr.message).not.toContain(dummyAuthKey);
          expect(llmErr.message).toContain('[REDACTED_API_KEY]');
          return true;
        },
      );
    });

    it('maps 429 to rate_limit kind', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('Quota exceeded', { status: 429 }));
      const provider = new AnthropicProvider({ apiKey: 'valid-test-key' });

      await expect(provider.chat({ messages: [{ role: 'user', content: 'test' }] })).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(LLMError);
          expect((err as LLMError).kind).toBe('rate_limit');
          return true;
        },
      );
    });
  });

  describe('GeminiProvider', () => {
    it('sends API key in x-goog-api-key header and NOT in URL query parameters', async () => {
      let requestedUrl = '';
      let interceptedHeaders: HeadersInit | undefined;
      let interceptedBody: Record<string, unknown> | undefined;

      const dummyGeminiHeaderKey = 'test-gem-hdr-key';

      global.fetch = vi.fn().mockImplementation(async (url, init) => {
        requestedUrl = String(url);
        interceptedHeaders = init?.headers;
        interceptedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response from Gemini' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const provider = new GeminiProvider({
        apiKey: dummyGeminiHeaderKey,
        model: 'gemini-1.5-flash',
      });

      const res = await provider.chat({
        messages: [{ role: 'user', content: 'Hello Gemini' }],
        tools: [
          {
            name: 'check_slots',
            description: 'Check available slots',
            parameters: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              additionalProperties: false,
              properties: {
                date: { type: 'string', additionalProperties: false },
              },
            },
          },
        ],
      });

      expect(res.text).toBe('Response from Gemini');
      expect(requestedUrl).not.toContain('key=');
      expect((interceptedHeaders as Record<string, string>)['x-goog-api-key']).toBe(
        dummyGeminiHeaderKey,
      );

      // Verify toolConfig mode ANY
      const toolConfig = interceptedBody?.toolConfig as Record<string, unknown>;
      expect(toolConfig?.functionCallingConfig).toEqual({
        mode: 'ANY',
        allowedFunctionNames: ['check_slots'],
      });
    });

    it('sanitizeSchemaForGemini removes $schema and additionalProperties recursively', () => {
      const inputSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', additionalProperties: false },
          nested: {
            $schema: 'nested-schema',
            type: 'object',
            additionalProperties: false,
            properties: {
              val: { type: 'number' },
            },
          },
          tags: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { id: { type: 'string' } },
            },
          },
        },
      };

      const sanitized = sanitizeSchemaForGemini(inputSchema);
      expect(sanitized).not.toHaveProperty('$schema');
      expect(sanitized).not.toHaveProperty('additionalProperties');
      expect((sanitized.properties as Record<string, unknown>).name).not.toHaveProperty(
        'additionalProperties',
      );
      const nested = (sanitized.properties as Record<string, unknown>).nested as Record<string, unknown>;
      expect(nested).not.toHaveProperty('$schema');
      expect(nested).not.toHaveProperty('additionalProperties');
    });

    it('maps 404 to invalid_model kind with secrets redacted', async () => {
      const dummyModelToken = 'gemini-model-token';
      global.fetch = vi.fn().mockImplementation(async () => {
        return new Response(`Model not found with key ${dummyModelToken}`, { status: 404 });
      });

      const provider = new GeminiProvider({
        apiKey: dummyModelToken,
        model: 'nonexistent-model',
      });

      await expect(provider.chat({ messages: [{ role: 'user', content: 'test' }] })).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(LLMError);
          const llmErr = err as LLMError;
          expect(llmErr.kind).toBe('invalid_model');
          expect(llmErr.statusCode).toBe(404);
          expect(llmErr.message).not.toContain(dummyModelToken);
          expect(llmErr.message).toContain('[REDACTED_API_KEY]');
          return true;
        },
      );
    });
  });

  describe('LLMService Integration', () => {
    it('refuses to start when LLM_PROVIDER=mock and NODE_ENV=production', async () => {
      const { config } = await import('../src/config/index.js');
      const { LLMService } = await import('../src/llm/llm.service.js');
      const origEnv = config.NODE_ENV;
      const origProvider = config.LLM_PROVIDER;

      try {
        const mutableConfig = config as { NODE_ENV: string; LLM_PROVIDER: string };
        mutableConfig.NODE_ENV = 'production';
        mutableConfig.LLM_PROVIDER = 'mock';

        expect(() => new LLMService()).toThrow(/Refusing to start with LLM_PROVIDER=mock/);
      } finally {
        const mutableConfig = config as { NODE_ENV: string; LLM_PROVIDER: string };
        mutableConfig.NODE_ENV = origEnv;
        mutableConfig.LLM_PROVIDER = origProvider;
      }
    });

    it('caches probe results for 60 seconds unless forced', async () => {
      const { LLMService } = await import('../src/llm/llm.service.js');
      const { mockProvider } = await import('../src/llm/mock.provider.js');
      const service = new LLMService();
      service.setProvider(mockProvider, 'mock', 'mock-model');

      const first = await service.probe();
      expect(first.ok).toBe(true);

      const second = await service.probe();
      expect(second).toBe(first);

      const third = await service.probe(true);
      expect(third).not.toBe(first);
      expect(third.ok).toBe(true);
    });
  });
});
