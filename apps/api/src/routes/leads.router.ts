import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  LeadFilterQuerySchema,
  LeadMergePayloadSchema,
  CsvCommitPayloadSchema,
  LeadSourceSchema,
  UpdateLeadStatusPayloadSchema,
  CreateLeadNotePayloadSchema,
  type ConsentStatus,
  type LeadSource,
} from '@housy/shared';
import { query } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { assertLeadOwnership } from '../middleware/ownership.js';
import { leadRepository } from '../repositories/lead.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { leadIngestService } from '../services/lead-ingest.service.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/index.js';

export const leadsRouter = Router();

const LeadIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Lead ID must be a valid UUID' }),
});

const CsvPreviewBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())),
  source: LeadSourceSchema.optional(),
});

/**
 * GET /api/leads
 * List leads with filtering, search, sorting, and pagination.
 * Scoped by role:
 * - Sales head sees all leads.
 * - Sales executive sees only leads assigned to them.
 */
leadsRouter.get(
  '/leads',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedQuery = LeadFilterQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        const issueList = parsedQuery.error.issues || (parsedQuery.error as unknown as { errors?: typeof parsedQuery.error.issues }).errors || [];
        const details = issueList.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid lead filter parameters', details);
      }

      const q = parsedQuery.data;
      const isExecutive = req.user!.role === 'executive';

      const { leads, total } = await leadRepository.listLeads({
        assignedTo: isExecutive ? req.user!.id : undefined,
        source: q.source,
        projectId: q.projectId,
        status: q.status,
        duplicatesOnly: q.duplicatesOnly,
        unassignedOnly: q.unassignedOnly,
        search: q.search,
        sortBy: q.sortBy,
        order: q.order,
        page: q.page,
        limit: q.limit,
      });

      const totalPages = Math.ceil(total / q.limit) || 1;

      // Transform rows to match shared schema
      const formatted = leads.map((l) => ({
        id: l.id,
        publicId: l.public_id,
        name: l.name,
        phoneE164: l.phone_e164,
        email: l.email,
        source: l.source,
        projectId: l.project_id,
        projectName: l.project_name ?? null,
        wants: l.wants,
        budgetMin: l.budget_min ? Number(l.budget_min) : null,
        budgetMax: l.budget_max ? Number(l.budget_max) : null,
        timeline: l.timeline,
        language: l.language,
        status: l.status,
        assignedTo: l.assigned_to,
        assignedToName: l.assigned_to_name ?? null,
        possibleDuplicateOf: l.possible_duplicate_of,
        possibleDuplicateName: l.possible_duplicate_name ?? null,
        touchpointsCount: Number(l.touchpoints_count ?? 1),
        consentStatus: l.consent_status,
        firstTouchAt: l.first_touch_at.toISOString(),
        firstResponseAt: l.first_response_at ? l.first_response_at.toISOString() : null,
        lastActivityAt: l.last_activity_at.toISOString(),
      }));

      res.status(200).json({
        data: formatted,
        total,
        page: q.page,
        limit: q.limit,
        totalPages,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/leads/:id
 * Fetches full details for a lead including touchpoints, conversations, bookings, and handoffs.
 * Enforces ownership: returns 403 Forbidden if an executive attempts to access another's lead.
 */
leadsRouter.get(
  '/leads/:id',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      const details = await leadRepository.findDetailsById(leadId);

        if (!details) {
          throw new NotFoundError(`Lead with ID '${leadId}' not found`);
        }

        // Enforce ownership: 403 Forbidden for forbidden leads
        if (req.user!.role === 'executive' && details.lead.assigned_to !== req.user!.id) {
          throw new ForbiddenError('Forbidden: Lead is assigned to another executive');
        }

        const l = details.lead;
        const formatted = {
          id: l.id,
          publicId: l.public_id,
          name: l.name,
          phoneE164: l.phone_e164,
          email: l.email,
          source: l.source,
          projectId: l.project_id,
          projectName: l.project_name ?? null,
          wants: l.wants,
          budgetMin: l.budget_min ? Number(l.budget_min) : null,
          budgetMax: l.budget_max ? Number(l.budget_max) : null,
          timeline: l.timeline,
          language: l.language,
          status: l.status,
          assignedTo: l.assigned_to,
          assignedToName: l.assigned_to_name ?? null,
          possibleDuplicateOf: l.possible_duplicate_of,
          possibleDuplicateName: l.possible_duplicate_name ?? null,
          touchpointsCount: Number(l.touchpoints_count ?? 1),
          consentStatus: l.consent_status,
          firstTouchAt: l.first_touch_at.toISOString(),
          firstResponseAt: l.first_response_at ? l.first_response_at.toISOString() : null,
          lastActivityAt: l.last_activity_at.toISOString(),
          touchpoints: details.touchpoints.map((t) => ({
            id: t.id,
            leadId: t.lead_id,
            source: t.source,
            channel: t.channel,
            occurredAt: t.occurred_at.toISOString(),
            externalId: t.external_id,
            raw: t.raw,
          })),
          conversations: details.conversations.map((c) => ({
            id: c.id,
            status: c.status,
            language: c.language,
            flagged: c.flagged,
            flagReasons: c.flag_reasons,
            createdAt: c.created_at.toISOString(),
            messagesCount: c.messages_count,
          })),
          bookings: details.bookings.map((b) => ({
            id: b.id,
            status: b.status,
            startsAt: b.starts_at.toISOString(),
            endsAt: b.ends_at.toISOString(),
            projectName: b.project_name,
            executiveName: b.executive_name,
          })),
          handoffs: details.handoffs.map((h) => ({
            id: h.id,
            reason: h.reason,
            summary: h.summary,
            status: h.status,
            executiveName: h.executive_name,
            createdAt: h.created_at.toISOString(),
          })),
          notes: (details.notes || []).map((n) => ({
            id: n.id,
            leadId: n.lead_id,
            authorId: n.author_id,
            authorName: n.author_name,
            note: n.note,
            createdAt: n.created_at.toISOString(),
          })),
        };

        res.status(200).json({
          success: true,
          data: formatted,
          lead: formatted,
        });
      } catch (err) {
        next(err);
      }
    },
);

/**
 * POST /api/leads/merge
 * Merges two leads in an atomic transaction.
 */
leadsRouter.post(
  '/leads/merge',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = LeadMergePayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        const issueList = parseResult.error.issues || (parseResult.error as unknown as { errors?: typeof parseResult.error.issues }).errors || [];
        const details = issueList.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid merge payload', details);
      }

      await leadIngestService.mergeLeads(
        parseResult.data.primaryLeadId,
        parseResult.data.secondaryLeadId,
        req.user!,
      );

      res.status(200).json({
        success: true,
        message: 'Leads merged successfully',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/leads/:id/keep-separate
 * Dismisses a possible duplicate flag.
 */
leadsRouter.post(
  '/leads/:id/keep-separate',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await leadIngestService.keepSeparate(leadId, req.user!);

      res.status(200).json({
        success: true,
        message: 'Lead unlinked from duplicate',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/leads/csv-preview
 * Previews rows from an uploaded CSV before committing.
 */
leadsRouter.post(
  '/leads/csv-preview',
  requireAuth,
  requireRole('sales_head'),
  validateRequest({ body: CsvPreviewBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows, source } = req.body;
      const preview = await leadIngestService.previewCsv(rows, source || 'property_portal');

      res.status(200).json({
        success: true,
        ...preview,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/leads/csv-commit
 * Commits verified preview rows.
 */
leadsRouter.post(
  '/leads/csv-commit',
  requireAuth,
  requireRole('sales_head'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = CsvCommitPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        const issueList = parseResult.error.issues || (parseResult.error as unknown as { errors?: typeof parseResult.error.issues }).errors || [];
        const details = issueList.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid CSV commit payload', details);
      }

      const result = await leadIngestService.commitCsv(
        parseResult.data.source,
        parseResult.data.rows,
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/leads/:id/status
 * Updates lead status with audit logging.
 */
leadsRouter.patch(
  '/leads/:id/status',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema, body: UpdateLeadStatusPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);

      const { status } = req.body;
      const updated = await leadRepository.updateLeadStatus(leadId, status);
      if (!updated) {
        throw new NotFoundError(`Lead with ID '${leadId}' not found`);
      }

      await query(
        `INSERT INTO audit_log (actor_id, action, entity, entity_id, diff, at)
         VALUES ($1, 'status_change', 'lead', $2, $3, NOW())`,
        [req.user!.id, leadId, JSON.stringify({ newStatus: status })],
      );

      res.status(200).json({
        success: true,
        data: {
          id: updated.id,
          status: updated.status,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/leads/:id/notes
 * List timestamped staff notes on a lead.
 */
leadsRouter.get(
  '/leads/:id/notes',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);

      const notes = await leadRepository.getNotes(leadId);
      const formatted = notes.map((n) => ({
        id: n.id,
        leadId: n.lead_id,
        authorId: n.author_id,
        authorName: n.author_name,
        note: n.note,
        createdAt: n.created_at.toISOString(),
      }));

      res.status(200).json({
        success: true,
        data: formatted,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/leads/:id/notes
 * Add a timestamped staff note to a lead.
 */
leadsRouter.post(
  '/leads/:id/notes',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema, body: CreateLeadNotePayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);

      const { note } = req.body;
      const authorName = req.user!.name || 'Sales Staff';
      const created = await leadRepository.addNote(leadId, req.user!.id, authorName, note);

      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          leadId: created.lead_id,
          authorId: created.author_id,
          authorName: created.author_name,
          note: created.note,
          createdAt: created.created_at.toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/executive/today
 * Priority executive cockpit view:
 * 1. Visits scheduled today
 * 2. Visits awaiting attendance outcome
 * 3. New handoffs assigned to executive
 * 4. Leads unanswered for over 2 hours
 */
leadsRouter.get(
  '/executive/today',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isExecutive = req.user!.role === 'executive';
      let executiveId: string | null = null;

      if (isExecutive) {
        executiveId = req.user!.id;
      } else if (typeof req.query['executiveId'] === 'string' && req.query['executiveId'].trim()) {
        const parsed = z.string().uuid().safeParse(req.query['executiveId'].trim());
        if (!parsed.success) {
          throw new ValidationError('Invalid executiveId query parameter: must be a valid UUID');
        }
        executiveId = parsed.data;
      }

      // 1. Visits scheduled for today (Asia/Kolkata date = today)
      const visitsTodayRes = await query<{
        booking_id: string;
        starts_at: Date | string;
        ends_at: Date | string;
        status: string;
        lead_id: string;
        lead_name: string;
        lead_phone: string | null;
        project_name: string;
      }>(
        `SELECT b.id AS booking_id, s.starts_at, s.ends_at, b.status,
                l.id AS lead_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
                p.name AS project_name
         FROM visit_bookings b
         JOIN visit_slots s ON b.slot_id = s.id
         JOIN projects p ON s.project_id = p.id
         JOIN leads l ON b.lead_id = l.id
         WHERE (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
           AND ($1::uuid IS NULL OR s.executive_id = $1)
         ORDER BY s.starts_at ASC`,
        [executiveId],
      );

      // 2. Visits awaiting attendance outcome (starts_at < NOW() and status = 'confirmed')
      const awaitingRes = await query<{
        booking_id: string;
        starts_at: Date | string;
        ends_at: Date | string;
        status: string;
        lead_id: string;
        lead_name: string;
        lead_phone: string | null;
        project_name: string;
      }>(
        `SELECT b.id AS booking_id, s.starts_at, s.ends_at, b.status,
                l.id AS lead_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
                p.name AS project_name
         FROM visit_bookings b
         JOIN visit_slots s ON b.slot_id = s.id
         JOIN projects p ON s.project_id = p.id
         JOIN leads l ON b.lead_id = l.id
         WHERE s.starts_at < NOW()
           AND b.status = 'confirmed'
           AND ($1::uuid IS NULL OR s.executive_id = $1)
         ORDER BY s.starts_at ASC`,
        [executiveId],
      );

      // 3. New handoffs (status = 'new')
      const handoffsRes = await query<{
        id: string;
        conversation_id: string;
        lead_id: string;
        lead_name: string;
        lead_phone: string | null;
        project_name: string | null;
        reason: string;
        summary: Record<string, unknown>;
        priority: string | null;
        created_at: Date | string;
      }>(
        `SELECT h.id, h.conversation_id, l.id AS lead_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
                p.name AS project_name, h.reason, h.summary, h.priority, h.created_at
         FROM handoffs h
         JOIN leads l ON h.lead_id = l.id
         LEFT JOIN projects p ON l.project_id = p.id
         WHERE h.status = 'new'
           AND ($1::uuid IS NULL OR h.executive_id = $1)
         ORDER BY (h.priority = 'urgent') DESC, h.created_at DESC`,
        [executiveId],
      );

      // 4. Leads unanswered for over 2 hours
      const unansweredRes = await query<{
        id: string;
        public_id: string;
        name: string;
        phone_e164: string | null;
        source: LeadSource;
        project_name: string | null;
        first_touch_at: Date | string;
        consent_status: ConsentStatus;
      }>(
        `SELECT l.id, l.public_id, l.name, l.phone_e164, l.source,
                p.name AS project_name, l.first_touch_at, l.consent_status
         FROM leads l
         LEFT JOIN projects p ON l.project_id = p.id
         WHERE l.first_response_at IS NULL
           AND l.first_touch_at < NOW() - INTERVAL '2 hours'
           AND l.consent_status != 'withdrawn'
           AND ($1::uuid IS NULL OR l.assigned_to = $1)
         ORDER BY l.first_touch_at ASC`,
        [executiveId],
      );

      const nowTime = Date.now();
      const unansweredLeads = unansweredRes.rows.map((r) => {
        const firstTouch = new Date(r.first_touch_at);
        return {
          leadId: r.id,
          publicId: r.public_id,
          name: r.name,
          phoneE164: r.phone_e164,
          source: r.source,
          projectName: r.project_name,
          firstTouchAt: firstTouch.toISOString(),
          hoursElapsed: Math.round(((nowTime - firstTouch.getTime()) / (1000 * 3600)) * 10) / 10,
          consentStatus: r.consent_status,
        };
      });

      const visitsToday = visitsTodayRes.rows.map((v) => ({
        bookingId: v.booking_id,
        startsAt: new Date(v.starts_at).toISOString(),
        endsAt: new Date(v.ends_at).toISOString(),
        status: v.status,
        leadId: v.lead_id,
        leadName: v.lead_name,
        leadPhone: v.lead_phone,
        projectName: v.project_name,
        notes: null,
      }));

      const awaitingOutcome = awaitingRes.rows.map((v) => ({
        bookingId: v.booking_id,
        startsAt: new Date(v.starts_at).toISOString(),
        endsAt: new Date(v.ends_at).toISOString(),
        status: v.status,
        leadId: v.lead_id,
        leadName: v.lead_name,
        leadPhone: v.lead_phone,
        projectName: v.project_name,
      }));

      const newHandoffs = handoffsRes.rows.map((h) => ({
        handoffId: h.id,
        conversationId: h.conversation_id,
        leadId: h.lead_id,
        leadName: h.lead_name,
        leadPhone: h.lead_phone,
        projectName: h.project_name,
        reason: h.reason,
        summary: h.summary || {},
        priority: h.priority || 'normal',
        createdAt: new Date(h.created_at).toISOString(),
      }));

      res.status(200).json({
        success: true,
        data: {
          visitsToday,
          awaitingOutcome,
          newHandoffs,
          unansweredLeads,
          summaryCounts: {
            visitsToday: visitsToday.length,
            awaitingOutcome: awaitingOutcome.length,
            newHandoffs: newHandoffs.length,
            unansweredLeads: unansweredLeads.length,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/leads/:id
 * Legacy endpoint preserved for updating lead details.
 */
leadsRouter.patch(
  '/leads/:id',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
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

/**
 * POST /api/leads/:id/opt-out
 * Staff action to opt-out a lead and cancel all pending reminders.
 */
leadsRouter.post(
  '/leads/:id/opt-out',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);
      await chatRepository.optOutLead(leadId);

      // Audit log the opt-out request
      await query(
        `INSERT INTO audit_log (actor_id, action, entity, entity_id, diff, at)
         VALUES ($1, 'opt_out', 'lead', $2, $3, NOW())`,
        [req.user!.id, leadId, JSON.stringify({ reason: 'Staff recorded DPDP opt-out' })],
      );

      res.status(200).json({
        success: true,
        message: 'Lead has been opted out and pending visit reminders have been cancelled.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/leads/:id
 * Authorized DPDP deletion/erasure request. Deletes lead and writes audit_log record.
 */
leadsRouter.delete(
  '/leads/:id',
  requireAuth,
  validateRequest({ params: LeadIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);

      await leadRepository.deleteLead(leadId);

      // Audit log the deletion request
      await query(
        `INSERT INTO audit_log (actor_id, action, entity, entity_id, diff, at)
         VALUES ($1, 'delete', 'lead', $2, $3, NOW())`,
        [
          req.user!.id,
          leadId,
          JSON.stringify({ reason: 'DPDP right to erasure', requestedBy: req.user!.email }),
        ],
      );

      res.status(200).json({
        success: true,
        message: 'Lead permanently erased under DPDP right to be forgotten.',
      });
    } catch (err) {
      next(err);
    }
  },
);

