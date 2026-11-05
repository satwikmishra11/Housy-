import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import type { ApiErrorResponse, ErrorDetail } from '@housy/shared';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const timestamp = new Date().toISOString();
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (res.locals['requestId'] as string) ||
    undefined;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, requestId }, err.message);
    } else {
      logger.warn({ err, path: req.path, requestId }, err.message);
    }

    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
        timestamp,
        requestId,
      },
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  if (err instanceof ZodError) {
    const details: ErrorDetail[] = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        statusCode: 400,
        details,
        timestamp,
        requestId,
      },
    };
    res.status(400).json(payload);
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: error, path: req.path, requestId }, 'Unhandled server error');

  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred',
      statusCode: 500,
      timestamp,
      requestId,
    },
  };

  res.status(500).json(payload);
}

