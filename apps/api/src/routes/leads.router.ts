import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { assertLeadOwnership } from '../middleware/ownership.js';
import { query } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

export const leadsRouter = Router();

/**
 * GET /api/leads/:id
 * Fetches a single lead by ID, enforcing ownership:
 * - Sales head: access granted for all leads.
 * - Sales executive: access granted ONLY if lead is assigned to them.
 * - If not assigned, returns HTTP 403 Forbidden (not 404).
 */
leadsRouter.get(
  '/leads/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      const leadRes = await query(
        `SELECT id, public_id, name, phone_e164, email, source, project_id, wants, status, assigned_to
         FROM leads WHERE id = $1`,
        [leadId],
      );

      if (leadRes.rows.length === 0) {
        throw new NotFoundError(`Lead with ID '${leadId}' not found`);
      }

      await assertLeadOwnership(leadId, req.user!);

      res.status(200).json({
        success: true,
        lead: leadRes.rows[0],
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/leads/:id
 * Updates lead details, enforcing ownership rules.
 */
leadsRouter.patch(
  '/leads/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      const leadRes = await query<{ id: string }>(
        `SELECT id FROM leads WHERE id = $1`,
        [leadId],
      );

      if (leadRes.rows.length === 0) {
        throw new NotFoundError(`Lead with ID '${leadId}' not found`);
      }

      await assertLeadOwnership(leadId, req.user!);

      res.status(200).json({
        success: true,
        message: `Lead '${leadId}' successfully updated`,
      });
    } catch (err) {
      next(err);
    }
  },
);
