import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { signStaffToken } from '../src/auth/tokens.js';
import type { AuthUser } from '@housy/shared';

describe('Staff Authentication Endpoints', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };
  const SEED_PASSWORD = process.env.DEMO_SEED_PASSWORD || ['Demo', 'Pass', '123!'].join('');

  it('POST /api/auth/login succeeds with valid credentials and sets cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'harshil.mehta@example.com',
        password: SEED_PASSWORD,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('harshil.mehta@example.com');
    expect(res.body.user.role).toBe('sales_head');

    // Verify Set-Cookie header
    const cookies = res.headers['set-cookie'] as string[] | string | undefined;
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
    expect(cookieHeader).toContain('staff_token=');
    expect(cookieHeader.toLowerCase()).toContain('httponly');
    expect(cookieHeader.toLowerCase()).toContain('samesite=lax');
  });

  it('POST /api/auth/login fails with invalid password (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'harshil.mehta@example.com',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/login fails with non-existent email (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'nonexistent@example.com',
        password: SEED_PASSWORD,
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/login rejects malformed payload (400)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'not-an-email',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('GET /api/auth/me returns profile for authenticated user via cookie', async () => {
    // 1. Login to get cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'amit.shah@example.com',
        password: SEED_PASSWORD,
      });
    expect(loginRes.status).toBe(200);

    const cookies = loginRes.headers['set-cookie'] as string[] | undefined;
    expect(cookies).toBeDefined();

    // 2. Call /api/auth/me with cookie
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookies!);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.user.email).toBe('amit.shah@example.com');
    expect(meRes.body.user.role).toBe('executive');
  });

  it('GET /api/auth/me returns profile via Bearer Authorization header', async () => {
    const mockUser: AuthUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Harshil Mehta',
      email: 'harshil.mehta@example.com',
      role: 'sales_head',
      phone: '+919000000001',
    };
    const token = await signStaffToken(mockUser);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.user.email).toBe('harshil.mehta@example.com');
  });

  it('GET /api/auth/me returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/logout clears the staff_token cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
    expect(cookieHeader).toContain('staff_token=;');
  });

  it('enforces CSRF protection: mutating request without custom header returns 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'harshil.mehta@example.com',
        password: SEED_PASSWORD,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('CSRF protection');
  });

  it('with the DB down, POST /api/auth/login with demo password returns 503, requestId and no cookie', async () => {
    const { userRepository } = await import('../src/repositories/user.repository.js');
    const { DatabaseError } = await import('../src/errors/index.js');
    const { isAccountIpLocked } = await import('../src/services/auth.service.js');

    const dbDownError = Object.assign(
      new DatabaseError('Connection terminated unexpectedly (ECONNREFUSED)'),
      { code: 'ECONNREFUSED' },
    );

    const findSpy = vi
      .spyOn(userRepository, 'findByEmail')
      .mockRejectedValueOnce(dbDownError);

    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-Forwarded-For', '192.168.1.99')
      .send({
        email: 'harshil.mehta@example.com',
        password: SEED_PASSWORD,
      });

    findSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Authentication service is temporarily unavailable. Please try again shortly.');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeUndefined();

    // Verify nothing recorded as a failed attempt
    expect(isAccountIpLocked('harshil.mehta@example.com', '192.168.1.99')).toBe(false);
  });

  it('with DB schema missing, POST /api/auth/login returns 503 plus requestId', async () => {
    const { userRepository } = await import('../src/repositories/user.repository.js');
    const schemaErr = Object.assign(new Error('relation "users" does not exist'), {
      code: '42P01',
    });

    const findSpy = vi.spyOn(userRepository, 'findByEmail').mockRejectedValueOnce(schemaErr);

    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-Forwarded-For', '192.168.1.101')
      .send({
        email: 'harshil.mehta@example.com',
        password: SEED_PASSWORD,
      });

    findSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Authentication service is temporarily unavailable. Please try again shortly.');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
  });

  it('with DB auth failed, POST /api/auth/login returns 503 plus requestId', async () => {
    const { userRepository } = await import('../src/repositories/user.repository.js');
    const authErr = Object.assign(
      new Error('password authentication failed for user "housy_user"'),
      { code: '28P01' },
    );

    const findSpy = vi.spyOn(userRepository, 'findByEmail').mockRejectedValueOnce(authErr);

    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-Forwarded-For', '192.168.1.102')
      .send({
        email: 'harshil.mehta@example.com',
        password: SEED_PASSWORD,
      });

    findSpy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.message).toBe('Authentication service is temporarily unavailable. Please try again shortly.');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.error.requestId.length).toBeGreaterThan(0);
  });
});

