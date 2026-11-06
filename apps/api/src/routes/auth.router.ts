import { Router, type Request, type Response, type NextFunction } from 'express';
import { authService, type AuthService } from '../services/auth.service.js';
import { validateRequest } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { LoginRequestSchema, type LoginResponse, type LogoutResponse, type MeResponse } from '@housy/shared';
import { config } from '../config/index.js';

export function createAuthRouter(service: AuthService = authService): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Authenticates staff via email and password, setting an httpOnly JWT cookie.
   */
  router.post(
    '/auth/login',
    loginRateLimiter,
    validateRequest({ body: LoginRequestSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const result = await service.login(req.body);

        res.cookie('staff_token', result.token, {
          httpOnly: true,
          secure: config.COOKIE_SECURE,
          sameSite: config.COOKIE_SAME_SITE,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
        });

        const response: LoginResponse = {
          success: true,
          user: result.user,
        };

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/auth/logout
   * Clears staff authentication cookie.
   */
  router.post(
    '/auth/logout',
    (_req: Request, res: Response): void => {
      res.clearCookie('staff_token', {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: config.COOKIE_SAME_SITE,
        path: '/',
      });

      const response: LogoutResponse = {
        success: true,
      };

      res.status(200).json(response);
    },
  );

  /**
   * GET /api/auth/me
   * Returns current authenticated staff profile.
   */
  router.get(
    '/auth/me',
    requireAuth,
    (req: Request, res: Response): void => {
      const response: MeResponse = {
        success: true,
        user: req.user!,
      };

      res.status(200).json(response);
    },
  );

  return router;
}

export const authRouter = createAuthRouter();

