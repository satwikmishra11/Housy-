import { SignJWT, jwtVerify } from 'jose';
import {
  AuthUserSchema,
  BuyerSessionPayloadSchema,
  MagicLinkTokenPayloadSchema,
  type AuthUser,
  type BuyerSessionPayload,
  type MagicLinkTokenPayload,
} from '@housy/shared';
import { config } from '../config/index.js';

const getJwtSecretKey = (): Uint8Array => new TextEncoder().encode(config.JWT_SECRET);
const getSessionSecretKey = (): Uint8Array => new TextEncoder().encode(config.SESSION_SECRET);

/**
 * Signs a JWT for an authenticated staff member.
 */
export async function signStaffToken(user: AuthUser, expiresIn = '24h'): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretKey());
}

/**
 * Verifies and decodes a staff member JWT.
 */
export async function verifyStaffToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ['HS256'],
    });

    const parsed = AuthUserSchema.safeParse(payload['user']);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Signs an httpOnly session token for a buyer conversation.
 */
export async function signBuyerSession(
  session: BuyerSessionPayload,
  expiresIn = '30d',
): Promise<string> {
  return new SignJWT({ session })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.conversationId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSessionSecretKey());
}

/**
 * Verifies and decodes a buyer session token.
 */
export async function verifyBuyerSession(token: string): Promise<BuyerSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey(), {
      algorithms: ['HS256'],
    });

    const parsed = BuyerSessionPayloadSchema.safeParse(payload['session']);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Signs a single-purpose magic-link token for a buyer to manage their site visit.
 */
export async function signMagicLinkToken(
  params: { bookingId: string; leadId: string },
  expiresIn = '48h',
): Promise<string> {
  return new SignJWT({
    bookingId: params.bookingId,
    leadId: params.leadId,
    purpose: 'manage_visit',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.bookingId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSessionSecretKey());
}

/**
 * Verifies and decodes a single-purpose magic-link token.
 */
export async function verifyMagicLinkToken(
  token: string,
): Promise<MagicLinkTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey(), {
      algorithms: ['HS256'],
    });

    const parsed = MagicLinkTokenPayloadSchema.safeParse({
      bookingId: payload['bookingId'],
      leadId: payload['leadId'],
      purpose: payload['purpose'],
      exp: payload.exp,
    });

    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
