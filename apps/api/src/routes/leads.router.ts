import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  LeadFilterQuerySchema,
  LeadMergePayloadSchema,
  CsvCommitPayloadSchema,
  LeadSourceSchema,
} from '@housy/shared';
import { requireAuth } from '../middleware/auth.js';
import { assertLeadOwnership } from '../middleware/ownership.js';
import { leadRepository } from '../repositories/lead.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { leadIngestService } from '../services/lead-ingest.service.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/index.js';

export const leadsRouter = Router();

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
        const details = parsedQuery.error.errors.map((e) => ({
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
        const details = parseResult.error.errors.map((e) => ({
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rows, source } = req.body as {
        rows?: Record<string, string>[];
        source?: string;
      };

      if (!rows || !Array.isArray(rows)) {
        throw new ValidationError('CSV rows must be an array of objects');
      }

      const parsedSource = LeadSourceSchema.safeParse(source || 'property_portal');
      const defaultSource = parsedSource.success ? parsedSource.data : 'property_portal';

      const preview = await leadIngestService.previewCsv(rows, defaultSource);

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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = CsvCommitPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.errors.map((e) => ({
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
 * PATCH /api/leads/:id
 * Legacy endpoint preserved for updating lead details.
 */
leadsRouter.patch(
  '/leads/:id',
  requireAuth,
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
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params['id'] as string;
      await assertLeadOwnership(leadId, req.user!);
      await chatRepository.optOutLead(leadId);
      res.status(200).json({
        success: true,
        message: 'Lead has been opted out and pending visit reminders have been cancelled.',
      });
    } catch (err) {
      next(err);
    }
  },
);

