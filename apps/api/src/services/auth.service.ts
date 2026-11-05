import { userRepository, type UserRepository } from '../repositories/user.repository.js';
import { verifyPassword } from '../auth/password.js';
import { signStaffToken } from '../auth/tokens.js';
import { UnauthorizedError } from '../errors/index.js';
import type { AuthUser, LoginRequest } from '@housy/shared';

export interface LoginResult {
  user: AuthUser;
  token: string;
}

export class AuthService {
  constructor(private readonly userRepo: UserRepository = userRepository) {}

  async login(credentials: LoginRequest): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(credentials.email);
    if (!user || !user.active) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await verifyPassword(user.password_hash, credentials.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

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
    const user = await this.userRepo.findById(userId);
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

