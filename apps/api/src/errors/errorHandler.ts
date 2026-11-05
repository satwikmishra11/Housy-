import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, DatabaseError, SlotUnavailableError } from './AppError.js';
import type { ApiErrorResponse, ErrorDetail } from '@housy/shared';
import { logger } from '../utils/logger.js';

const SQL_LEAK_REGEX = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INTO|TABLE|syntax error at or near|violates foreign key|relation "[^"]+" does not exist|column "[^"]+" does not exist)\b/i;

function sanitizeErrorMessage(msg: string, statusCode: number): string {
  if (statusCode >= 500 || SQL_LEAK_REGEX.test(msg)) {
    return 'An unexpected database or internal server error occurred';
  }
  return msg;
}

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

    const safeMessage = err instanceof DatabaseError
      ? 'An unexpected database or internal server error occurred'
      : sanitizeErrorMessage(err.message, err.statusCode);

    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: safeMessage,
        statusCode: err.statusCode,
        details: err.details,
        alternatives: err instanceof SlotUnavailableError ? err.alternatives : undefined,
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

