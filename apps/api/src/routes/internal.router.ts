import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config/index.js';
import { jobsService } from '../services/jobs.service.js';
import { reminderService } from '../services/reminder.service.js';
import { handoffService } from '../services/handoff.service.js';
import { UnauthorizedError } from '../errors/AppError.js';

export const internalRouter = Router();

/**
 * Constant-time header verification against config.INTERNAL_API_KEY using crypto.timingSafeEqual.
 * Header only (X-Internal-Key); explicitly rejects query parameters and cookie authentication.
 */
export function verifyInternalKey(providedKey: string | undefined, expectedKey: string): boolean {
  if (!providedKey || typeof providedKey !== 'string') return false;
  const providedBuf = Buffer.from(providedKey);
  const expectedBuf = Buffer.from(expectedKey);

  if (providedBuf.length !== expectedBuf.length) {
    // Perform dummy timing-safe comparison to prevent length-dependent timing leak
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Middleware ensuring valid X-Internal-Key header via timing-safe comparison.
 * Never inspects query string or cookies to prevent secret leakage in server logs.
 */
function requireInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const headerKey = req.header('x-internal-key');
  if (!verifyInternalKey(headerKey, config.INTERNAL_API_KEY)) {
    throw new UnauthorizedError('Unauthorized internal invocation. Valid X-Internal-Key header required.');
  }
  next();
}

/**
 * POST /api/internal/run-jobs
 * Unified internal cron endpoint to execute all periodic background routines:
 * 1. Site-visit reminders (limit 100, idempotent)
 * 2. Site-visit slot top-up to 28 days ahead
 * 3. Handoff SLA escalation (R3: unaccepted handoffs > 15m)
 * 4. Stale anonymous chat session cleanup (> 24h)
 *
 * Each routine is isolated with try/catch, logging runs to job_runs table
 * and returning duration and counts with zero stack trace leakage.
 */
internalRouter.post(
  '/internal/run-jobs',
  requireInternalKey,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await jobsService.runAllJobs();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/internal/run-reminders
 * Legacy reminder cron trigger, secured strictly with X-Internal-Key header.
 */
internalRouter.post(
  '/internal/run-reminders',
  requireInternalKey,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await reminderService.processDueReminders(100);
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
 * POST /api/internal/run-escalations
 * Legacy escalation cron trigger, secured strictly with X-Internal-Key header.
 */
internalRouter.post(
  '/internal/run-escalations',
  requireInternalKey,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
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
