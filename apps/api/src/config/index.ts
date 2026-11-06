import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgres://housy_user:housy_password@localhost:5432/housy_db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(16).default('housy-dev-jwt-secret-min-32-chars-long!'),
  SESSION_SECRET: z.string().min(16).default('housy-dev-session-secret-min-32-chars-long!'),
  COOKIE_SECURE: z.coerce.boolean().default(process.env.NODE_ENV === 'production'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().default(100),
  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().default(60 * 1000),
  RATE_LIMIT_CHAT_MAX: z.coerce.number().default(30),
  RATE_LIMIT_CHAT_WINDOW_MS: z.coerce.number().default(60 * 1000),
  LLM_PROVIDER: z.enum(['anthropic', 'gemini', 'mock']).default('mock'),
  LLM_MODEL: z.string().default('gemini-1.5-flash'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(20000),
  LLM_DAILY_MESSAGE_CAP: z.coerce.number().default(1000),
  DEMO_MODE: z.coerce.boolean().default(true),
  INTERNAL_API_KEY: z.string().default('housy-internal-cron-key-12345'),
}).refine(
  (data) => !(data.NODE_ENV === 'production' && data.LLM_PROVIDER === 'mock'),
  {
    message: 'Refusing to start in production with LLM_PROVIDER=mock. Must be configured with real provider (anthropic or gemini).',
    path: ['LLM_PROVIDER'],
  },
);

export type Config = z.infer<typeof EnvSchema>;

export const config: Config = EnvSchema.parse(process.env);

