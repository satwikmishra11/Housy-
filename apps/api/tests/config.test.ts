import { describe, it, expect } from 'vitest';
import {
  parseBoolean,
  booleanSchema,
  evaluateConfig,
  validateConfig,
  getDevelopmentDefaults,
  KNOWN_DEFAULT_SECRETS,
} from '../src/config/index.js';

describe('Configuration & Strict Boolean Parsing', () => {
  describe('parseBoolean() & booleanSchema', () => {
    it('correctly parses true representations', () => {
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('TRUE')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean(true)).toBe(true);

      expect(booleanSchema.parse('true')).toBe(true);
      expect(booleanSchema.parse('1')).toBe(true);
      expect(booleanSchema.parse(true)).toBe(true);
    });

    it('correctly parses false representations', () => {
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('FALSE')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean(false)).toBe(false);

      expect(booleanSchema.parse('false')).toBe(false);
      expect(booleanSchema.parse('0')).toBe(false);
      expect(booleanSchema.parse(false)).toBe(false);
    });

    it('throws validation error on invalid boolean representations', () => {
      expect(() => parseBoolean('yes')).toThrow(/Expected 'true', 'false', '1', or '0'/);
      expect(() => parseBoolean('no')).toThrow(/Expected 'true', 'false', '1', or '0'/);
      expect(() => parseBoolean('2')).toThrow(/Expected 'true', 'false', '1', or '0'/);
      expect(() => parseBoolean('random-string')).toThrow(/Expected 'true', 'false', '1', or '0'/);

      expect(() => booleanSchema.parse('yes')).toThrow();
      expect(() => booleanSchema.parse('no')).toThrow();
      expect(() => booleanSchema.parse('random')).toThrow();
    });
  });

  describe('evaluateConfig() in Production (NODE_ENV=production)', () => {
    const PROD_TEST_JWT_SECRET = 'sample-prod-jwt-secret-min-32-chars-long!';
    const PROD_TEST_SESSION_SECRET = 'sample-prod-session-secret-min-32-chars-long!';
    const PROD_TEST_INTERNAL_KEY = 'sample-prod-cron-key-12';
    const PROD_TEST_GEMINI_KEY = 'test-gemini-sample-key';
    const PROD_TEST_ANTHROPIC_KEY = 'test-anthropic-sample-key';

    const validProdEnv = {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'postgres://real_user:strong_pass@prod-db.internal:5432/housy_prod',
      CORS_ORIGIN: 'https://housy.example.com',
      JWT_SECRET: PROD_TEST_JWT_SECRET,
      SESSION_SECRET: PROD_TEST_SESSION_SECRET,
      INTERNAL_API_KEY: PROD_TEST_INTERNAL_KEY,
      LLM_PROVIDER: 'gemini',
      LLM_MODEL: 'gemini-3.8-flash',
      GEMINI_API_KEY: PROD_TEST_GEMINI_KEY,
      COOKIE_SECURE: 'true',
      DEMO_MODE: 'false',
    };

    it('passes with fully configured valid production environment', () => {
      const result = evaluateConfig(validProdEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.LLM_PROVIDER).toBe('gemini');
        expect(result.data.COOKIE_SECURE).toBe(true);
        expect(result.data.DEMO_MODE).toBe(false);
      }
    });

    it('refuses to boot if JWT_SECRET uses a known dev default', () => {
      for (const secret of KNOWN_DEFAULT_SECRETS) {
        if (secret.includes('jwt')) {
          const result = evaluateConfig({
            ...validProdEnv,
            JWT_SECRET: secret,
          });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.some((e) => e.includes('JWT_SECRET cannot use default'))).toBe(true);
          }
        }
      }
    });

    it('refuses to boot if SESSION_SECRET uses a known dev default', () => {
      for (const secret of KNOWN_DEFAULT_SECRETS) {
        if (secret.includes('session')) {
          const result = evaluateConfig({
            ...validProdEnv,
            SESSION_SECRET: secret,
          });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.some((e) => e.includes('SESSION_SECRET cannot use default'))).toBe(true);
          }
        }
      }
    });

    it('refuses to boot if INTERNAL_API_KEY uses a known dev default', () => {
      for (const secret of KNOWN_DEFAULT_SECRETS) {
        if (secret.includes('cron')) {
          const result = evaluateConfig({
            ...validProdEnv,
            INTERNAL_API_KEY: secret,
          });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.some((e) => e.includes('INTERNAL_API_KEY cannot use default'))).toBe(true);
          }
        }
      }
    });

    it('refuses wildcard CORS_ORIGIN ("*") or empty CORS_ORIGIN in production', () => {
      const resultWildcard = evaluateConfig({
        ...validProdEnv,
        CORS_ORIGIN: '*',
      });
      expect(resultWildcard.success).toBe(false);
      if (!resultWildcard.success) {
        expect(resultWildcard.errors.some((e) => e.includes('CORS_ORIGIN cannot be wildcard "*"'))).toBe(true);
      }

      const resultEmpty = evaluateConfig({
        ...validProdEnv,
        CORS_ORIGIN: '',
      });
      expect(resultEmpty.success).toBe(false);
      if (!resultEmpty.success) {
        expect(resultEmpty.errors.some((e) => e.includes('CORS_ORIGIN cannot be empty'))).toBe(true);
      }
    });

    it('refuses LLM_PROVIDER="mock" or unset LLM_PROVIDER in production', () => {
      const resultMock = evaluateConfig({
        ...validProdEnv,
        LLM_PROVIDER: 'mock',
      });
      expect(resultMock.success).toBe(false);
      if (!resultMock.success) {
        expect(resultMock.errors.some((e) => e.includes('LLM_PROVIDER cannot be "mock"'))).toBe(true);
      }

      const resultUnset = evaluateConfig({
        ...validProdEnv,
        LLM_PROVIDER: undefined,
      });
      expect(resultUnset.success).toBe(false);
      if (!resultUnset.success) {
        expect(resultUnset.errors.some((e) => e.includes('LLM_PROVIDER must be set'))).toBe(true);
      }
    });

    it('refuses if the API key for the chosen provider is missing', () => {
      // Gemini selected without GEMINI_API_KEY
      const resultGemini = evaluateConfig({
        ...validProdEnv,
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: undefined,
      });
      expect(resultGemini.success).toBe(false);
      if (!resultGemini.success) {
        expect(resultGemini.errors.some((e) => e.includes('GEMINI_API_KEY is required'))).toBe(true);
      }

      // Anthropic selected without ANTHROPIC_API_KEY
      const resultAnthropicNoKey = evaluateConfig({
        ...validProdEnv,
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: undefined,
        GEMINI_API_KEY: undefined,
      });
      expect(resultAnthropicNoKey.success).toBe(false);
      if (!resultAnthropicNoKey.success) {
        expect(resultAnthropicNoKey.errors.some((e) => e.includes('ANTHROPIC_API_KEY is required'))).toBe(true);
      }

      // Anthropic selected with ANTHROPIC_API_KEY passes
      const resultAnthropicValid = evaluateConfig({
        ...validProdEnv,
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: PROD_TEST_ANTHROPIC_KEY,
        GEMINI_API_KEY: undefined,
      });
      expect(resultAnthropicValid.success).toBe(true);
    });

    it('refuses if LLM_MODEL is unset', () => {
      const resultModel = evaluateConfig({
        ...validProdEnv,
        LLM_MODEL: '',
      });
      expect(resultModel.success).toBe(false);
      if (!resultModel.success) {
        expect(resultModel.errors.some((e) => e.includes('LLM_MODEL must be set'))).toBe(true);
      }
    });

    it('throws when validateConfig() is called with an invalid prod env', () => {
      expect(() =>
        validateConfig({
          NODE_ENV: 'production',
          LLM_PROVIDER: 'mock',
        }),
      ).toThrow(/Configuration validation failed/);
    });
  });

  describe('evaluateConfig() in Development and Test environments', () => {
    it('ensures LLM_MODEL has no default in development defaults', () => {
      const devDefaults = getDevelopmentDefaults('development');
      expect(devDefaults.LLM_MODEL).toBeUndefined();
    });

    it('populates defaults when env fields are empty strings in test mode', () => {
      const result = evaluateConfig({
        NODE_ENV: 'test',
        LLM_PROVIDER: '',
        DATABASE_URL: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('test');
        expect(result.data.LLM_PROVIDER).toBe('mock');
        expect(result.data.DATABASE_URL).toContain('housy_test');
      }
    });

    it('refuses to run tests when TEST_DATABASE_URL does not end in _test in test mode', () => {
      const result = evaluateConfig({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgres://housy_user:housy_password@localhost:5432/housy_db',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.some((e) => e.includes('Database name must end in "_test"'))).toBe(true);
      }
    });

    it('prioritizes TEST_DATABASE_URL in test mode and validates it ends in _test', () => {
      const result = evaluateConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://localhost:5432/ignored',
        TEST_DATABASE_URL: 'postgres://localhost:5432/my_ci_suite_test',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe('postgres://localhost:5432/my_ci_suite_test');
      }
    });

    it('populates gemini default when LLM_PROVIDER is empty string in development mode', () => {
      const result = evaluateConfig({
        NODE_ENV: 'development',
        LLM_PROVIDER: '   ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
        expect(result.data.LLM_PROVIDER).toBe('gemini');
      }
    });
  });
});
