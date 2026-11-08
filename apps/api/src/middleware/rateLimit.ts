import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import type { ApiErrorResponse } from '@housy/shared';

/**
 * Robustly extracts the real client IP address from proxy headers (Forwarded, X-Forwarded-For)
 * or socket remoteAddress, avoiding express-rate-limit proxy validation errors on cloud platforms.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const forwarded = req.headers['forwarded'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const match = /for="?([^";, ]+)/i.exec(forwarded);
    if (match?.[1]) return match[1].replace(/[[\]]/g, '');
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

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
  keyGenerator: (req: Request): string => getClientIp(req),
  validate: false,
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
  keyGenerator: (req: Request): string => getClientIp(req),
  validate: false,
  handler: createRateLimitHandler(
    'Too many login attempts. Your IP has been temporarily rate limited, please try again later.',
  ),
});

/**
 * Dedicated rate limiter for /chat/start to prevent conversation creation abuse.
 * Limit: 10 starts per hour per IP.
 */
export const chatStartRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test' && !process.env.ENFORCE_RATE_LIMIT,
  validate: false,
  keyGenerator: (req: Request): string => getClientIp(req),
  handler: createRateLimitHandler(
    'Chat start rate limit exceeded. You may only initiate up to 10 chat sessions per hour.',
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
  validate: false,
  keyGenerator: (req: Request): string => {
    const sessionToken = (req.headers['x-buyer-session'] || req.cookies?.['buyer_session']) as string | undefined;
    const ip = getClientIp(req);
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
  validate: false,
  keyGenerator: (req: Request): string => {
    const rawKey = (req.headers['x-source-key'] as string | undefined) || getClientIp(req);
    return rawKey;
  },
  handler: createRateLimitHandler(
    'Lead ingest rate limit exceeded. Please slow down submission rate.',
  ),
});

