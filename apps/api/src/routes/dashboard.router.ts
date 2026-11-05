import { Router, type Request, type Response, type NextFunction } from 'express';
import { DashboardFilterQuerySchema } from '@housy/shared';
import { requireAuth } from '../middleware/auth.js';
import { dashboardService } from '../services/dashboard.service.js';
import { ValidationError } from '../errors/index.js';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/metrics
 * Returns comprehensive Sales Dashboard metrics, KPIs, by-source performance,
 * conversion funnel, and response-time distribution.
 * Scoped by RBAC:
 * - Sales head: aggregate data across all developer leads (or selected project).
 * - Sales executive: scoped strictly to leads assigned to the authenticated executive.
 */
dashboardRouter.get(
  '/dashboard/metrics',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DashboardFilterQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid dashboard filter parameters', details);
      }

      const data = await dashboardService.getDashboardMetrics(parsed.data, {
        id: req.user!.id,
        role: req.user!.role,
      });

      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/dashboard/export-csv
 * Exports period metrics and source breakdown table as an RFC 4180-compliant CSV download.
 */
dashboardRouter.get(
  '/dashboard/export-csv',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DashboardFilterQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const details = parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid dashboard export parameters', details);
      }

      const data = await dashboardService.getDashboardMetrics(parsed.data, {
        id: req.user!.id,
        role: req.user!.role,
      });

      const csv = dashboardService.generateCsv(data);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sales-dashboard-${data.filter.period}-${data.filter.from}.csv"`,
      );
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  },
);

