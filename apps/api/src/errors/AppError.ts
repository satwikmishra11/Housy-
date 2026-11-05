import type { ErrorDetail } from '@housy/shared';

export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetail[];

  constructor(message: string, isOperational = true, details?: ErrorDetail[]) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly statusCode = 400;
  public readonly code = 'VALIDATION_ERROR';

  constructor(message = 'Validation failed', details?: ErrorDetail[]) {
    super(message, true, details);
  }
}

export class BadRequestError extends AppError {
  public readonly statusCode = 400;
  public readonly code = 'BAD_REQUEST';

  constructor(message = 'Bad request', details?: ErrorDetail[]) {
    super(message, true, details);
  }
}

export class UnauthorizedError extends AppError {
  public readonly statusCode = 401;
  public readonly code = 'UNAUTHORIZED';

  constructor(message = 'Unauthorized access') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  public readonly statusCode = 403;
  public readonly code = 'FORBIDDEN';

  constructor(message = 'Forbidden access') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';

  constructor(message = 'Resource not found') {
    super(message);
  }
}

export class ConflictError extends AppError {
  public readonly statusCode = 409;
  public readonly code = 'CONFLICT';

  constructor(message = 'Resource conflict detected') {
    super(message);
  }
}

export class DatabaseError extends AppError {
  public readonly statusCode = 500;
  public readonly code = 'DATABASE_ERROR';

  constructor(message = 'Database operation failed', isOperational = true) {
    super(message, isOperational);
  }
}

export class ServiceUnavailableError extends AppError {
  public readonly statusCode = 503;
  public readonly code = 'SERVICE_UNAVAILABLE';

  constructor(message = 'Service temporarily unavailable') {
    super(message);
  }
}

