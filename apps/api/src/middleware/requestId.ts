import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  const id = typeof existing === 'string' && existing.trim().length > 0
    ? existing.trim()
    : crypto.randomUUID();

  res.locals['requestId'] = id;
  res.setHeader('X-Request-Id', id);
  next();
}

