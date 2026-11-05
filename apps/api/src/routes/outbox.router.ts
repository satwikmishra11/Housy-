import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { query } from '../db/index.js';
import type { OutboundMessageItem } from '@housy/shared';

export const outboxRouter = Router();

const OutboxQuerySchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  page: z.coerce.number().int().min(1).optional().default(1),
});

interface DbOutboxRow {
  id: string;
  lead_id: string;
  lead_public_id: string;
  lead_name: string;
  lead_phone: string | null;
  channel: 'whatsapp' | 'sms' | 'email';
  template_key: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

/**
 * GET /api/outbox
 * Lists outbound mock messages for staff inspection.
 * Shows status, template, channel, body (with project RERA number), lead, and timestamps.
 */
outboxRouter.get(
  '/outbox',
  requireAuth,
  validateRequest({ query: OutboxQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.query as unknown as z.infer<typeof OutboxQuerySchema>;
      const limit = q.limit;
      const offset = (q.page - 1) * limit;

      const countRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM outbound_messages om
         JOIN leads l ON om.lead_id = l.id
         WHERE ($1::text IS NULL OR om.status = $1::outbound_status)
           AND ($2::text IS NULL OR om.channel = $2::channel_type)
           AND ($3::text IS NULL OR l.name ILIKE '%' || $3 || '%' OR om.body ILIKE '%' || $3 || '%')`,
        [q.status ?? null, q.channel ?? null, q.search ?? null],
      );
      const totalCount = parseInt(countRes.rows[0]?.count ?? '0', 10);

      const rowsRes = await query<DbOutboxRow>(
        `SELECT om.id, om.lead_id, l.public_id AS lead_public_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
                om.channel, om.template_key, om.body, om.status, om.error_message,
                om.created_at::text, om.sent_at::text
         FROM outbound_messages om
         JOIN leads l ON om.lead_id = l.id
         WHERE ($1::text IS NULL OR om.status = $1::outbound_status)
           AND ($2::text IS NULL OR om.channel = $2::channel_type)
           AND ($3::text IS NULL OR l.name ILIKE '%' || $3 || '%' OR om.body ILIKE '%' || $3 || '%')
         ORDER BY om.created_at DESC
         LIMIT $4 OFFSET $5`,
        [q.status ?? null, q.channel ?? null, q.search ?? null, limit, offset],
      );

      const data: OutboundMessageItem[] = rowsRes.rows.map((r) => ({
        id: r.id,
        leadId: r.lead_id,
        leadPublicId: r.lead_public_id,
        leadName: r.lead_name,
        leadPhone: r.lead_phone,
        channel: r.channel,
        templateKey: r.template_key,
        body: r.body,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: r.created_at,
        sentAt: r.sent_at,
      }));

      res.status(200).json({
        success: true,
        data,
        totalCount,
      });
    } catch (err) {
      next(err);
    }
  },
);
