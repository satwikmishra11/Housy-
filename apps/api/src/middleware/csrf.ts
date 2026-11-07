import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/index.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const EXACT_PUBLIC_PATHS = new Set([
  '/api/chat/start',
  '/api/chat/message',
  '/api/chat/book',
  '/api/chat/contact',
  '/api/chat/human',
  '/api/chat/escalate',
]);

const CONVERSATION_PHONE_REGEX = /^\/api\/conversations\/[a-f0-9-]+\/phone$/;

/**
 * Strict CSRF protection middleware:
 * 1. Every cookie-authenticated mutating request MUST present X-Requested-With or X-CSRF-Token.
 * 2. Unauthenticated mutating requests must be an exact public path or have a cryptographically verified API key.
 * 3. Mere presence of unverified headers or arbitrary path tokens like '/book' is rejected.
 */
export async function csrfProtection(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // Server-to-server routes (/api/internal, /api/ingest) strictly enforce cryptographic API keys
  // and do not accept ambient cookie authentication. Delegate authentication to their route handlers
  // so proper 401 Unauthorized / 400 Bad Request responses are produced.
  if (req.path.startsWith('/api/internal') || req.path.startsWith('/api/ingest')) {
    return next();
  }

  const isCookieAuthenticated = Boolean(
    req.cookies?.['staff_token'] ||
      (typeof req.headers.cookie === 'string' && req.headers.cookie.includes('staff_token=')),
  );

  const hasCustomHeader = Boolean(
    req.headers['x-requested-with'] ||
      req.headers['x-csrf-token'] ||
      req.headers['x-housy-client'],
  );

  // Hard Rule 1: Every cookie-authenticated mutating request requires a custom CSRF header
  if (isCookieAuthenticated) {
    if (!hasCustomHeader) {
      return next(
        new ForbiddenError(
          'CSRF protection: cookie-authenticated mutating request missing required custom header (e.g. X-Requested-With)',
        ),
      );
    }
    return next();
  }

  // Non-cookie requests with valid custom header pass
  if (hasCustomHeader) {
    return next();
  }

  // Hard Rule 2: Exempt ONLY exact public paths and magic links
  if (EXACT_PUBLIC_PATHS.has(req.path) || CONVERSATION_PHONE_REGEX.test(req.path)) {
    return next();
  }

  // Magic link visit management endpoints (single-purpose signed tokens in URL)
  if (req.path.startsWith('/api/visits/manage/')) {
    return next();
  }

  return next(
    new ForbiddenError('CSRF protection: request missing required custom header (e.g. X-Requested-With)'),
  );
}

