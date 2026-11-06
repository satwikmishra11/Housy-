import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, NotFoundError, ForbiddenError } from './errors/index.js';
import {
  requestIdMiddleware,
  authenticateStaff,
  csrfProtection,
  generalRateLimiter,
} from './middleware/index.js';

export function createApp(): Express {
  const app = express();

  // 1. Request correlation ID
  app.use(requestIdMiddleware);

  // 2. Strict CORS allowlist from configuration (supports exact origins and wildcards like https://*.vercel.app)
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());

  const isOriginAllowed = (origin: string): boolean => {
    if (
      process.env.VERCEL &&
      (origin.endsWith('.vercel.app') || origin === 'https://vercel.live' || origin.endsWith('.vercel.dev'))
    ) {
      return true;
    }
    return allowedOrigins.some((pattern) => {
      if (pattern === '*' || pattern === origin) return true;
      if (pattern.includes('*')) {
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        return new RegExp(regexStr).test(origin);
      }
      return false;
    });
  };

  // 3. Security headers via Helmet with Content Security Policy
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: ["'self'", ...allowedOrigins, 'https://*.vercel.app', 'https://vercel.live'],
          fontSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new ForbiddenError(`Origin '${origin}' not allowed by CORS`));
        }
      },
      credentials: true,
    }),
  );

  // 4. Request size limits and body parsing
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // 5. Logging middleware
  if (config.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
    app.use(generalRateLimiter);
  }

  // 6. Authentication and CSRF protection
  app.use(authenticateStaff);
  app.use(csrfProtection);

  // 7. Mount API router (both with /api prefix and root for reverse proxies)
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  // 8. Fallback 404 handler for unknown routes
  app.use((_req, _res, next) => {
    next(new NotFoundError('The requested endpoint was not found on this server'));
  });

  // 9. Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;

