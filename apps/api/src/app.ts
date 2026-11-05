import express, { type Express } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, NotFoundError } from './errors/index.js';

export function createApp(): Express {
  const app = express();

  // Security and cross-origin handling
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }),
  );

  // Request parsing
  app.use(express.json());

  // Logging middleware (skip during unit tests if needed, or keep at level)
  if (config.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // Mount API router at both /api and root level for flexibility
  app.use('/api', apiRouter);

  // Fallback 404 handler for unknown routes
  app.use((_req, _res, next) => {
    next(new NotFoundError('The requested endpoint was not found on this server'));
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

