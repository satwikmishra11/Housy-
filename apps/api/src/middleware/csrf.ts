import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/index.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection middleware using custom header verification for mutating requests.
 * Modern browsers enforce CORS preflights when custom headers are set, preventing simple HTML form-based CSRF.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // Exempt server-to-server ingest endpoints authenticated via API key
  if (
    req.path.startsWith('/api/ingest') ||
    req.path.startsWith('/ingest') ||
    Boolean(req.headers['x-source-key'])
  ) {
    return next();
  }

  // Exempt public conversation endpoints
  if (req.path.startsWith('/api/conversations') || req.path.startsWith('/conversations')) {
    return next();
  }

  const hasCustomHeader = Boolean(
    req.headers['x-requested-with'] ||
    req.headers['x-csrf-token'] ||
    req.headers['x-housy-client']
  );

  if (!hasCustomHeader) {
    return next(
      new ForbiddenError('CSRF protection: request missing required custom header (e.g. X-Requested-With)')
    );
  }

  next();
}

