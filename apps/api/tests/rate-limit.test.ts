import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { config } from '../src/config/index.js';

describe('Login Rate Limiting', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  it('enforces rate limit after exceeding max login attempts', async () => {
    const maxAttempts = config.RATE_LIMIT_LOGIN_MAX; // 5

    // Send maxAttempts requests (some failed logins)
    for (let i = 0; i < maxAttempts; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set(CSRF_HEADER)
        .send({
          email: 'rate-limit-test@example.com',
          password: 'wrong-password',
        });

      // Should be 401 Unauthorized for invalid password
      expect(res.status).toBe(401);
    }

    // The (maxAttempts + 1)th request must be rate limited with 429
    const rateLimitedRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'rate-limit-test@example.com',
        password: 'wrong-password',
      });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.success).toBe(false);
    expect(rateLimitedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(rateLimitedRes.body.error.statusCode).toBe(429);
    expect(rateLimitedRes.body.error.message).toContain('rate limited');
  });

  it('handles Forwarded and X-Forwarded-For headers from reverse proxies without throwing ValidationError', async () => {
    // Standard RFC 7239 Forwarded header
    const resForwarded = await request(app)
      .get('/api/ping')
      .set('Forwarded', 'for=203.0.113.195;proto=https;host=housy-ebon.vercel.app');

    expect(resForwarded.status).toBe(200);
    expect(resForwarded.body.status).toBe('ok');

    // De facto standard X-Forwarded-For header
    const resXForwarded = await request(app)
      .get('/api/ping')
      .set('X-Forwarded-For', '203.0.113.195, 70.41.3.18');

    expect(resXForwarded.status).toBe(200);
    expect(resXForwarded.body.status).toBe('ok');
  });
});

