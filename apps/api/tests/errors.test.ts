import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../src/errors/errorHandler.js';
import {
  BadRequestError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  ServiceUnavailableError,
} from '../src/errors/AppError.js';
import { z } from 'zod';
import { ApiErrorResponseSchema } from '@housy/shared';

describe('Error Handling Middleware', () => {
  it('formats NotFoundError correctly with 404', async () => {
    const testApp = express();
    testApp.get('/test-not-found', () => {
      throw new NotFoundError('Item not found');
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-not-found');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Item not found');
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('formats ValidationError with 400 and detail items', async () => {
    const testApp = express();
    testApp.get('/test-val-err', () => {
      throw new ValidationError('Validation error', [{ field: 'email', message: 'Invalid email' }]);
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-val-err');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveLength(1);
    expect(res.body.error.details[0].field).toBe('email');
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('formats native ZodError properly as 400', async () => {
    const testSchema = z.object({ age: z.number().min(18) });
    const testApp = express();
    testApp.get('/test-zod', () => {
      testSchema.parse({ age: 12 });
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-zod');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('handles all typed errors with correct HTTP status codes', async () => {
    const testApp = express();

    testApp.get('/400', () => {
      throw new BadRequestError();
    });
    testApp.get('/401', () => {
      throw new UnauthorizedError();
    });
    testApp.get('/403', () => {
      throw new ForbiddenError();
    });
    testApp.get('/409', () => {
      throw new ConflictError();
    });
    testApp.get('/500', () => {
      throw new DatabaseError();
    });
    testApp.get('/503', () => {
      throw new ServiceUnavailableError();
    });
    testApp.use(errorHandler);

    expect((await request(testApp).get('/400')).status).toBe(400);
    expect((await request(testApp).get('/401')).status).toBe(401);
    expect((await request(testApp).get('/403')).status).toBe(403);
    expect((await request(testApp).get('/409')).status).toBe(409);
    expect((await request(testApp).get('/500')).status).toBe(500);
    expect((await request(testApp).get('/503')).status).toBe(503);
  });
});
