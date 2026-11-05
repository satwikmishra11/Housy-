import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  BookVisitPayloadSchema,
  RescheduleVisitPayloadSchema,
  CancelVisitPayloadSchema,
  VisitOutcomePayloadSchema,
} from '@housy/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { visitService } from '../services/visit.service.js';
import { verifyMagicLinkToken } from '../auth/tokens.js';
import { UnauthorizedError } from '../errors/index.js';

export const visitsRouter = Router();

const ProjectParamSchema = z.object({
  id: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
});

const SlotsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const VisitIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Visit ID must be a valid UUID' }),
});

const TokenParamSchema = z.object({
  token: z.string().min(10, { message: 'Token must be provided' }),
});

/**
 * GET /api/projects/:id/slots
 * Returns open slots grouped by day in Asia/Kolkata for a project.
 */
visitsRouter.get(
  '/projects/:id/slots',
  validateRequest({ params: ProjectParamSchema, query: SlotsQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await visitService.getSlotsForProject(
        req.params['id']!,
        req.query['from'] as string | undefined,
        req.query['to'] as string | undefined,
      );
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/projects/:id/book
 * Atomically books a free slot for a lead.
 * Enforces zero double-booking and minimum 3-hour lead time.
 */
visitsRouter.post(
  '/projects/:id/book',
  validateRequest({ params: ProjectParamSchema, body: BookVisitPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body;
      const data = await visitService.bookVisit(
        body.leadId,
        req.params['id']!,
        body.startsAt,
        body.idempotencyKey,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/visits/manage/:token
 * Public buyer endpoint to fetch visit details and location pin using magic link token.
 */
visitsRouter.get(
  '/visits/manage/:token',
  validateRequest({ params: TokenParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await visitService.getManageDetailsByToken(req.params['token']!);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/visits/manage/:token/reschedule
 * Public buyer endpoint to reschedule a visit atomically.
 */
visitsRouter.post(
  '/visits/manage/:token/reschedule',
  validateRequest({ params: TokenParamSchema, body: RescheduleVisitPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.params['token']!;
      const payload = await verifyMagicLinkToken(token);
      if (!payload || payload.purpose !== 'manage_visit') {
        throw new UnauthorizedError('Invalid or expired magic link token');
      }

      const data = await visitService.rescheduleVisit(payload.bookingId, req.body.newStartsAt);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/visits/manage/:token/cancel
 * Public buyer endpoint to cancel a visit.
 */
visitsRouter.post(
  '/visits/manage/:token/cancel',
  validateRequest({ params: TokenParamSchema, body: CancelVisitPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.params['token']!;
      const payload = await verifyMagicLinkToken(token);
      if (!payload || payload.purpose !== 'manage_visit') {
        throw new UnauthorizedError('Invalid or expired magic link token');
      }

      const data = await visitService.cancelVisit(payload.bookingId, req.body.reason);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/visits/my
 * Staff endpoint to list upcoming visits and visits awaiting outcome.
 */
visitsRouter.get(
  '/visits/my',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await visitService.listStaffVisits(req.user!.id, req.user!.role);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/visits/:id/outcome
 * Staff endpoint for executives to record visit outcome (visited or no_show).
 */
visitsRouter.post(
  '/visits/:id/outcome',
  requireAuth,
  validateRequest({ params: VisitIdParamSchema, body: VisitOutcomePayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await visitService.recordOutcome(
        req.params['id']!,
        req.body,
        req.user!.id,
        req.user!.role,
      );
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);
