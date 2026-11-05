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
});

