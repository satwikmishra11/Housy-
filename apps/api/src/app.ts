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

  // 2. Strict CORS allowlist from configuration (exact origins; wildcard previews only when ALLOW_PREVIEW_ORIGINS=true)
  const allowedOrigins = config.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isOriginAllowed = (origin: string): boolean => {
    // Only permit preview wildcards if explicitly opted-in via ALLOW_PREVIEW_ORIGINS=true
    if (config.ALLOW_PREVIEW_ORIGINS) {
      if (origin.endsWith('.vercel.app') || origin === 'https://vercel.live' || origin.endsWith('.vercel.dev')) {
        return true;
      }
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

  const connectSources = ["'self'", ...allowedOrigins];
  if (config.ALLOW_PREVIEW_ORIGINS) {
    connectSources.push('https://*.vercel.app', 'https://vercel.live');
  }

  // 3. Security headers via Helmet with hardened Content Security Policy and Production HSTS
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: connectSources,
          fontSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts:
        config.NODE_ENV === 'production'
          ? {
              maxAge: 31536000,
              includeSubDomains: true,
              preload: true,
            }
          : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Permissions-Policy header
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

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

  // Diagnostic ping route accessible prior to any stateful middleware
  app.get('/api/ping', (_req, res) => {
    res.json({ status: 'ok', service: 'housy-api', timestamp: new Date().toISOString() });
  });

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

  // 7. Mount API router strictly at /api
  app.use('/api', apiRouter);

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

