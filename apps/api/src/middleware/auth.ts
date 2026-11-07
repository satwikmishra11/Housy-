import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../errors/index.js';
import { verifyStaffToken } from '../auth/tokens.js';
import { query } from '../db/index.js';
import type { UserRole } from '@housy/shared';

/**
 * Middleware that extracts and verifies staff JWT token from cookies or Authorization header.
 * Attaches decoded user to req.user if valid, otherwise continues with req.user undefined.
 */
export async function authenticateStaff(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const tokenFromCookie = req.cookies?.['staff_token'] as string | undefined;
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  const token = tokenFromCookie || tokenFromHeader;
  if (!token) {
    return next();
  }

  const user = await verifyStaffToken(token);
  if (user) {
    req.user = user;
  }
  next();
}

/**
 * Middleware that requires the request to have a valid authenticated staff member.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }
  next();
}

/**
 * Middleware factory requiring the authenticated staff member to possess one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    try {
      const res = await query<{ role: UserRole; active: boolean }>(
        `SELECT role, active FROM users WHERE id = $1`,
        [req.user.id],
      );

      if (res.rows.length === 0 || !res.rows[0]?.active) {
        return next(new ForbiddenError('User account not found or deactivated'));
      }

      const freshRole = res.rows[0].role;
      req.user.role = freshRole;

      if (!allowedRoles.includes(freshRole)) {
        return next(
          new ForbiddenError(
            `Insufficient permissions: required role '${allowedRoles.join("' or '")}', found '${freshRole}'`,
          ),
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

