import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config/index.js';
import { reminderService } from '../services/reminder.service.js';
import { handoffService } from '../services/handoff.service.js';
import { UnauthorizedError } from '../errors/AppError.js';
import { verifyStaffToken } from '../auth/tokens.js';

export const internalRouter = Router();

/**
 * POST / GET /api/internal/run-reminders
 * Internal cron endpoint to trigger due reminder processing.
 * Authenticated via X-Internal-Key header, ?key= query param, or valid staff JWT.
 */
internalRouter.all(
  '/internal/run-reminders',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const internalKey =
        (req.headers['x-internal-key'] as string | undefined) ||
        (req.query['key'] as string | undefined) ||
        (req.query['apiKey'] as string | undefined);
      const authHeader = req.headers.authorization;
      const token =
        req.cookies?.['staff_token'] ||
        req.cookies?.['auth_token'] ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

      let isAuthorized = false;

      // 1. Check API Key for external cron
      if (internalKey && internalKey === config.INTERNAL_API_KEY) {
        isAuthorized = true;
      }

      // 2. Or check authenticated staff user / token
      if (!isAuthorized && req.user) {
        isAuthorized = true;
      } else if (!isAuthorized && token) {
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

/**
 * POST / GET /api/internal/run-escalations
 * Internal cron endpoint to trigger SLA escalation for unaccepted handoffs (>15 minutes).
 */
internalRouter.all(
  '/internal/run-escalations',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const internalKey =
        (req.headers['x-internal-key'] as string | undefined) ||
        (req.query['key'] as string | undefined) ||
        (req.query['apiKey'] as string | undefined);
      const authHeader = req.headers.authorization;
      const token =
        req.cookies?.['staff_token'] ||
        req.cookies?.['auth_token'] ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

      let isAuthorized = false;

      if (internalKey && internalKey === config.INTERNAL_API_KEY) {
        isAuthorized = true;
      } else if (req.user) {
        isAuthorized = true;
      } else if (token) {
        const payload = await verifyStaffToken(token);
        if (payload) isAuthorized = true;
      }

      if (!isAuthorized) {
        throw new UnauthorizedError('Unauthorized internal cron invocation. Invalid key or token.');
      }

      const escalatedCount = await handoffService.escalateStaleHandoffs();

      res.status(200).json({
        success: true,
        message: 'Handoff SLA escalation check completed',
        escalatedCount,
      });
    } catch (err) {
      next(err);
    }
  },
);
