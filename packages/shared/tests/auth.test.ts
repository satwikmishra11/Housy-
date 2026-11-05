import { describe, it, expect } from 'vitest';
import {
  AuthUserSchema,
  LoginRequestSchema,
  BuyerSessionPayloadSchema,
  MagicLinkTokenPayloadSchema,
} from '../src/auth.js';

describe('Shared Auth Schemas', () => {
  it('validates a valid AuthUser object', () => {
    const validUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Harshil Mehta',
      email: 'harshil.mehta@example.com',
      role: 'sales_head',
      phone: '+919000000001',
    };
    const parsed = AuthUserSchema.safeParse(validUser);
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid role in AuthUser', () => {
    const invalidUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Unknown',
      email: 'unknown@example.com',
      role: 'super_admin',
      phone: null,
    };
    const parsed = AuthUserSchema.safeParse(invalidUser);
    expect(parsed.success).toBe(false);
  });

  it('validates login request payload', () => {
    const validLogin = {
      email: '  test@example.com  ',
      password: 'password123',
    };
    const parsed = LoginRequestSchema.safeParse(validLogin);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe('test@example.com');
    }
  });

  it('rejects invalid email in login request', () => {
    const invalidLogin = {
      email: 'not-an-email',
      password: 'password123',
    };
    const parsed = LoginRequestSchema.safeParse(invalidLogin);
    expect(parsed.success).toBe(false);
  });

  it('validates buyer session and magic link payloads', () => {
    const session = {
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      leadId: '550e8400-e29b-41d4-a716-446655440001',
    };
    expect(BuyerSessionPayloadSchema.safeParse(session).success).toBe(true);

    const magicLink = {
      bookingId: '550e8400-e29b-41d4-a716-446655440000',
      leadId: '550e8400-e29b-41d4-a716-446655440001',
      purpose: 'manage_visit',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    expect(MagicLinkTokenPayloadSchema.safeParse(magicLink).success).toBe(true);
  });
});
