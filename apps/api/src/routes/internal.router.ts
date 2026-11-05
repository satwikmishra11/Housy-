import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config/index.js';
import { reminderService } from '../services/reminder.service.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { verifyStaffToken } from '../auth/tokens.js';

export const internalRouter = Router();

/**
 * POST /api/internal/run-reminders
 * Internal cron endpoint to trigger due reminder processing.
 * Authenticated via X-Internal-Key header OR valid staff JWT.
 */
internalRouter.post(
  '/internal/run-reminders',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const internalKey = req.headers['x-internal-key'];
      const authHeader = req.headers.authorization;
      const token = req.cookies?.['auth_token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

      let isAuthorized = false;

      // 1. Check API Key for external cron
      if (internalKey && internalKey === config.INTERNAL_API_KEY) {
        isAuthorized = true;
      }

      // 2. Or check staff token
      if (!isAuthorized && token) {
        const payload = await verifyStaffToken(token);
        if (payload) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw new UnauthorizedError('Unauthorized internal cron invocation. Invalid key or token.');
      }

      const result = await reminderService.processDueReminders(50);

      res.status(200).json({
        success: true,
        message: 'Reminder check completed',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);
