import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { signStaffToken } from '../src/auth/tokens.js';
import type { AuthUser } from '@housy/shared';

describe('Staff Authentication Endpoints', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  it('POST /api/auth/login succeeds with valid credentials and sets cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'harshil.mehta@example.com',
        password: 'DemoPass123!',
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
        password: 'DemoPass123!',
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
        password: 'DemoPass123!',
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
        password: 'DemoPass123!',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('CSRF protection');
  });
});
