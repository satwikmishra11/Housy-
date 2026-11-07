import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Strict boolean parser:
 * - 'true' | '1' | true => true
 * - 'false' | '0' | false => false
 * - anything else => throws validation error
 */
export function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === 'true' || trimmed === '1') return true;
    if (trimmed === 'false' || trimmed === '0') return false;
  }
  throw new Error(`Invalid boolean value: "${String(val)}". Expected 'true', 'false', '1', or '0'.`);
}

export const booleanSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return undefined;
  return parseBoolean(val);
}, z.boolean({ invalid_type_error: "Must be a valid boolean ('true'|'1' or 'false'|'0')" }));

const DEV_INTERNAL_CRON_KEY = 'housy-internal-cron-key-12345';
const DEV_JWT_SECRET = 'housy-dev-jwt-secret-min-32-chars-long!';
const DEV_SESSION_SECRET = 'housy-dev-session-secret-min-32-chars-long!';

export const KNOWN_DEFAULT_SECRETS = new Set<string>([
  DEV_JWT_SECRET,
  DEV_SESSION_SECRET,
  'housy-fallback-jwt-secret-min-32-chars-long!',
  'housy-fallback-session-secret-min-32-chars-long!',
  DEV_INTERNAL_CRON_KEY,
]);

/**
 * Clearly named function containing development/test only defaults.
 * Strictly forbidden in production (NODE_ENV === 'production').
 */
export function getDevelopmentDefaults(): Record<string, string> {
  return {
    PORT: '3001',
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://housy_user:housy_password@localhost:5432/housy_db',
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'info',
    JWT_SECRET: DEV_JWT_SECRET,
    SESSION_SECRET: DEV_SESSION_SECRET,
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: 'lax',
    RATE_LIMIT_LOGIN_MAX: '5',
    RATE_LIMIT_LOGIN_WINDOW_MS: '900000',
    RATE_LIMIT_GENERAL_MAX: '100',
    RATE_LIMIT_GENERAL_WINDOW_MS: '60000',
    RATE_LIMIT_CHAT_MAX: '30',
    RATE_LIMIT_CHAT_WINDOW_MS: '60000',
    LLM_PROVIDER: process.env.NODE_ENV === 'test' ? 'mock' : 'gemini',
    LLM_MODEL: 'gemini-1.5-flash',
    LLM_TIMEOUT_MS: '20000',
    LLM_DAILY_MESSAGE_CAP: '1000',
    DEMO_MODE: 'true',
    INTERNAL_API_KEY: DEV_INTERNAL_CRON_KEY,
  };
}

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  COOKIE_SECURE: booleanSchema.default(process.env.NODE_ENV === 'production'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().default(100),
  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().default(60 * 1000),
  RATE_LIMIT_CHAT_MAX: z.coerce.number().default(30),
  RATE_LIMIT_CHAT_WINDOW_MS: z.coerce.number().default(60 * 1000),
  LLM_PROVIDER: z.enum(['anthropic', 'gemini', 'mock']),
  LLM_MODEL: z.string().min(1, 'LLM_MODEL is required'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(20000),
  LLM_DAILY_MESSAGE_CAP: z.coerce.number().default(1000),
  DEMO_MODE: booleanSchema.default(true),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
});

export type Config = z.infer<typeof EnvSchema>;

export type ConfigValidationResult =
  | { success: true; data: Config }
  | { success: false; errors: string[] };

/**
 * Validates environment variables according to environment requirements.
 */
export function evaluateConfig(rawEnv: Record<string, string | undefined>): ConfigValidationResult {
  const isProduction = rawEnv['NODE_ENV'] === 'production';
  const errors: string[] = [];

  // In non-production, fill missing values with dev defaults
  const effectiveEnv: Record<string, unknown> = isProduction
    ? { ...rawEnv }
    : { ...getDevelopmentDefaults(), ...rawEnv };

  // Remove empty strings so Zod defaults / optional can take over when appropriate
  for (const [key, value] of Object.entries(effectiveEnv)) {
    if (value === undefined || value === '') {
      delete effectiveEnv[key];
    }
  }

  // 1. Production Specific Hard Security Rules
  if (isProduction) {
    const jwtSecret = rawEnv['JWT_SECRET'];
    if (!jwtSecret) {
      errors.push('JWT_SECRET must be set in production');
    } else if (KNOWN_DEFAULT_SECRETS.has(jwtSecret)) {
      errors.push('JWT_SECRET cannot use default/known development value in production');
    }

    const sessionSecret = rawEnv['SESSION_SECRET'];
    if (!sessionSecret) {
      errors.push('SESSION_SECRET must be set in production');
    } else if (KNOWN_DEFAULT_SECRETS.has(sessionSecret)) {
      errors.push('SESSION_SECRET cannot use default/known development value in production');
    }

    const internalKey = rawEnv['INTERNAL_API_KEY'];
    if (!internalKey) {
      errors.push('INTERNAL_API_KEY must be set in production');
    } else if (KNOWN_DEFAULT_SECRETS.has(internalKey)) {
      errors.push('INTERNAL_API_KEY cannot use default/known development value in production');
    }

    const corsOrigin = rawEnv['CORS_ORIGIN'];
    if (!corsOrigin || corsOrigin.trim() === '') {
      errors.push('CORS_ORIGIN cannot be empty in production');
    } else if (corsOrigin.trim() === '*') {
      errors.push('CORS_ORIGIN cannot be wildcard "*" in production');
    }

    const provider = rawEnv['LLM_PROVIDER'];
    if (!provider) {
      errors.push('LLM_PROVIDER must be set in production (anthropic or gemini)');
    } else if (provider === 'mock') {
      errors.push('LLM_PROVIDER cannot be "mock" in production');
    } else if (provider === 'anthropic' && !rawEnv['ANTHROPIC_API_KEY']) {
      errors.push('ANTHROPIC_API_KEY is required in production when LLM_PROVIDER is "anthropic"');
    } else if (provider === 'gemini' && !rawEnv['GEMINI_API_KEY']) {
      errors.push('GEMINI_API_KEY is required in production when LLM_PROVIDER is "gemini"');
    }

    const model = rawEnv['LLM_MODEL'];
    if (!model || model.trim() === '') {
      errors.push('LLM_MODEL must be set in production');
    }
  }

  // 2. Schema Parse
  const parseResult = EnvSchema.safeParse(effectiveEnv);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: parseResult.data! };
}

export function validateConfig(rawEnv: Record<string, string | undefined>): Config {
  const result = evaluateConfig(rawEnv);
  if (!result.success) {
    throw new Error(`Configuration validation failed: ${result.errors.join('; ')}`);
  }
  return result.data;
}

function initConfig(): Config {
  const result = evaluateConfig(process.env);
  if (!result.success) {
    const errorBanner = [
      '================================================================================',
      'FATAL: Application configuration validation failed on startup!',
      ...result.errors.map((e) => `  - ${e}`),
      '================================================================================',
    ].join('\n');
    console.error(errorBanner);

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw new Error(`Configuration validation failed on startup: ${result.errors.join('; ')}`);
  }
  return result.data;
}

export const config: Config = initConfig();
