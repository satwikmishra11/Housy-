import { userRepository, type UserRepository } from '../repositories/user.repository.js';
import { verifyPassword } from '../auth/password.js';
import { signStaffToken } from '../auth/tokens.js';
import { UnauthorizedError, ServiceUnavailableError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import type { AuthUser, LoginRequest } from '@housy/shared';

export interface LoginResult {
  user: AuthUser;
  token: string;
}

interface LockoutState {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

const failedAttempts = new Map<string, LockoutState>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function getAccountIpKey(email: string, ip: string): string {
  return `${email.toLowerCase().trim()}:${ip.trim()}`;
}

export function isAccountIpLocked(email: string, ip: string): boolean {
  const key = getAccountIpKey(email, ip);
  const state = failedAttempts.get(key);
  if (!state || !state.lockedUntil) return false;
  if (Date.now() > state.lockedUntil) {
    failedAttempts.delete(key);
    return false;
  }
  return true;
}

export function recordFailedAttempt(email: string, ip: string): void {
  const key = getAccountIpKey(email, ip);
  const now = Date.now();
  const state = failedAttempts.get(key);

  if (!state || now - state.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_WINDOW_MS;
  }
}

export function clearFailedAttempts(email: string, ip: string): void {
  const key = getAccountIpKey(email, ip);
  failedAttempts.delete(key);
}

export function resetAllLockouts(): void {
  failedAttempts.clear();
}

export class AuthService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async login(credentials: LoginRequest, ip = '127.0.0.1'): Promise<LoginResult> {
    const normalizedEmail = credentials.email.toLowerCase().trim();

    if (isAccountIpLocked(normalizedEmail, ip)) {
      throw new UnauthorizedError(
        'Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
      );
    }

    let user = null;
    try {
      user = await this.userRepo.findByEmail(credentials.email);
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Database error during staff login');
      throw new ServiceUnavailableError('Authentication service is temporarily unavailable. Please try again shortly.');
    }

    if (!user || !user.active) {
      recordFailedAttempt(normalizedEmail, ip);
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await verifyPassword(user.password_hash, credentials.password);
    if (!isValid) {
      recordFailedAttempt(normalizedEmail, ip);
      throw new UnauthorizedError('Invalid email or password');
    }

    clearFailedAttempts(normalizedEmail, ip);

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };

    const token = await signStaffToken(authUser);

    return {
      user: authUser,
      token,
    };
  }

  async getMe(userId: string): Promise<AuthUser> {
    let user = null;
    try {
      user = await this.userRepo.findById(userId);
    } catch (err) {
      logger.error({ err, userId }, 'Database error during getMe');
      throw new ServiceUnavailableError('Authentication service is temporarily unavailable. Please try again shortly.');
    }

    if (!user || !user.active) {
      throw new UnauthorizedError('User profile not found or inactive');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };
  }
}

export const authService = new AuthService();

