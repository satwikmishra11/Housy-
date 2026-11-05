import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signStaffToken,
  verifyStaffToken,
  signBuyerSession,
  verifyBuyerSession,
  signMagicLinkToken,
  verifyMagicLinkToken,
} from '../src/auth/index.js';
import type { AuthUser } from '@housy/shared';

describe('Auth Password Hashing & Tokens', () => {
  const mockUser: AuthUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Harshil Mehta',
    email: 'harshil.mehta@example.com',
    role: 'sales_head',
    phone: '+919000000001',
  };

  it('hashes password with Argon2id and verifies successfully', async () => {
    const rawPass = 'DemoPass123!';
    const hash = await hashPassword(rawPass);

    expect(hash).toContain('$argon2id$');
    const valid = await verifyPassword(hash, rawPass);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, 'WrongPassword!');
    expect(invalid).toBe(false);
  });

  it('signs and verifies staff JWT token', async () => {
    const token = await signStaffToken(mockUser);
    expect(typeof token).toBe('string');

    const decoded = await verifyStaffToken(token);
    expect(decoded).toEqual(mockUser);
  });

  it('rejects tampered staff JWT token', async () => {
    const token = await signStaffToken(mockUser);
    const tampered = token.slice(0, -4) + 'abcd';
    const decoded = await verifyStaffToken(tampered);
    expect(decoded).toBeNull();
  });

  it('signs and verifies buyer session token', async () => {
    const session = {
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      leadId: '550e8400-e29b-41d4-a716-446655440001',
    };
    const token = await signBuyerSession(session);
    const decoded = await verifyBuyerSession(token);
    expect(decoded).toEqual(session);
  });

  it('signs and verifies single-purpose magic-link token', async () => {
    const params = {
      bookingId: '550e8400-e29b-41d4-a716-446655440000',
      leadId: '550e8400-e29b-41d4-a716-446655440001',
    };
    const token = await signMagicLinkToken(params);
    const decoded = await verifyMagicLinkToken(token);
    expect(decoded).toBeDefined();
    expect(decoded?.bookingId).toBe(params.bookingId);
    expect(decoded?.leadId).toBe(params.leadId);
    expect(decoded?.purpose).toBe('manage_visit');
    expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects expired magic-link token', async () => {
    const params = {
      bookingId: '550e8400-e29b-41d4-a716-446655440000',
      leadId: '550e8400-e29b-41d4-a716-446655440001',
    };
    // Sign with 0s expiry (immediately expired)
    const token = await signMagicLinkToken(params, '0s');
    // Wait tiny moment
    await new Promise((r) => setTimeout(r, 100));
    const decoded = await verifyMagicLinkToken(token);
    expect(decoded).toBeNull();
  });
});
