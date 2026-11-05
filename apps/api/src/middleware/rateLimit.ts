import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import type { ApiErrorResponse } from '@housy/shared';

/**
 * Standard 429 response formatter matching our ApiErrorResponse schema.
 */
function createRateLimitHandler(message: string) {
  return (req: Request, res: Response): void => {
    const timestamp = new Date().toISOString();
    const requestId =
      (req.headers['x-request-id'] as string) ||
      (res.locals['requestId'] as string) ||
      undefined;

    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message,
        statusCode: 429,
        timestamp,
        requestId,
      },
    };
    res.status(429).json(payload);
  };
}

/**
 * General API rate limiter across all incoming traffic.
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_GENERAL_WINDOW_MS,
  limit: config.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests, please slow down'),
});

/**
 * Strict login rate limiter to protect staff authentication against brute force attacks.
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_LOGIN_WINDOW_MS,
  limit: config.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: createRateLimitHandler(
    'Too many login attempts. Your IP has been temporarily rate limited, please try again later.',
  ),
});

/**
 * Chat assistant rate limiter applied per IP and per buyer session.
 */
export const chatRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_CHAT_WINDOW_MS,
  limit: config.RATE_LIMIT_CHAT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    const sessionToken = req.cookies?.['buyer_session'] as string | undefined;
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    return sessionToken ? `${ip}:${sessionToken}` : ip;
  },
  handler: createRateLimitHandler(
    'Chat rate limit reached. Please wait a moment before sending another message.',
  ),
});

/**
 * Ingest API rate limiter to protect server-to-server lead ingestion against denial-of-service.
 */
export const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    const rawKey = (req.headers['x-source-key'] as string | undefined) || req.ip || 'unknown-ip';
    return rawKey;
  },
  handler: createRateLimitHandler(
    'Lead ingest rate limit exceeded. Please slow down submission rate.',
  ),
});

