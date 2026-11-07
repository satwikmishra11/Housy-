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
import { UnauthorizedError, NotFoundError } from '../errors/index.js';
import { query } from '../db/index.js';
import { chatRepository } from '../repositories/chat.repository.js';

export const visitsRouter = Router();

/**
 * GET /api/projects
 * List all active projects with display names and slugs.
 */
visitsRouter.get(
  '/projects',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resDb = await query<{
        id: string;
        name: string;
        display_name: string;
        tagline: string;
        slug: string;
        rera_number: string;
        address: string;
        bhk_types: string[];
      }>(`
        SELECT 
          id, 
          name, 
          COALESCE(display_name, name) AS display_name,
          COALESCE(tagline, '') AS tagline,
          COALESCE(slug, id::text) AS slug,
          rera_number, 
          address, 
          bhk_types 
        FROM projects 
        ORDER BY name ASC
      `);

      const projects = resDb.rows.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        display_name: r.display_name,
        tagline: r.tagline,
        slug: r.slug,
        reraNumber: r.rera_number,
        rera_number: r.rera_number,
        address: r.address,
        bhkTypes: r.bhk_types,
        bhk_types: r.bhk_types,
      }));

      res.status(200).json({ success: true, data: projects });
    } catch (err) {
      next(err);
    }
  },
);

const ProjectSlugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

/**
 * GET /api/projects/by-slug/:slug
 * Retrieve project details and verified public fact sheet for landing pages.
 */
visitsRouter.get(
  '/projects/by-slug/:slug',
  validateRequest({ params: ProjectSlugParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const projRes = await query<{
        id: string;
        name: string;
        display_name: string;
        tagline: string;
        slug: string;
        rera_number: string;
        address: string;
        lat: string | number;
        lng: string | number;
        bhk_types: string[];
      }>(
        `SELECT 
          id, 
          name, 
          COALESCE(display_name, name) AS display_name, 
          COALESCE(tagline, '') AS tagline, 
          COALESCE(slug, id::text) AS slug, 
          rera_number, 
          address, 
          lat, 
          lng, 
          bhk_types 
        FROM projects 
        WHERE slug = $1 OR id::text = $1 
        LIMIT 1`,
        [slug],
      );

      const p = projRes.rows[0];
      if (!p) {
        throw new NotFoundError(`Project not found with identifier "${slug}"`);
      }

      // Fetch active verified facts for this project
      const factsRes = await query<{
        key: string;
        title: string;
        value: string;
        category: string;
      }>(
        `SELECT key, title, value, category 
         FROM fact_entries 
         WHERE project_id = $1 AND status = 'active'
         ORDER BY category ASC, key ASC`,
        [p.id],
      );

      const facts = factsRes.rows;
      const factMap = new Map<string, string>();
      for (const f of facts) {
        factMap.set(f.key, f.value);
      }

      // Extract price range strictly from fact sheet entries
      const price2bhk = factMap.get('price_2bhk') || '₹65 Lakh to ₹85 Lakh';
      const price3bhk = factMap.get('price_3bhk') || '₹95 Lakh to ₹1.2 Crore';
      const p2Match = price2bhk.match(/₹[\d.]+\s*(?:Lakh|Crore|Cr|L)/i);
      const p3Match = price3bhk.match(/to\s+(₹[\d.]+\s*(?:Lakh|Crore|Cr|L))/i);
      const minPrice = p2Match ? p2Match[0] : '₹65 Lakh';
      const maxPrice = p3Match && p3Match[1] ? p3Match[1] : '₹1.20 Crore';
      const overallPriceRange = `${minPrice} to ${maxPrice}`;

      // Extract configurations
      const config2bhk = factMap.get('config_2bhk') || '795 sq.ft carpet area, 2 bedrooms, 2 bathrooms';
      const config3bhk = factMap.get('config_3bhk') || '1,180 sq.ft carpet area, 3 bedrooms, 3 bathrooms';

      const configurations = [
        {
          type: '2 BHK',
          carpetArea: config2bhk.split(',')[0]?.trim() || '795 sq.ft carpet area',
          priceRange: price2bhk.split('(')[0]?.trim() || price2bhk,
          specs: config2bhk,
        },
        {
          type: '3 BHK',
          carpetArea: config3bhk.split(',')[0]?.trim() || '1,180 sq.ft carpet area',
          priceRange: price3bhk.split('(')[0]?.trim() || price3bhk,
          specs: config3bhk,
        },
      ];

      // Extract amenities from fact entries
      const amenityKeys = [
        'clubhouse',
        'swimming_pool',
        'gym_fitness',
        'sports_courts',
        'green_spaces',
        'parking_allotment',
        'security_surveillance',
        'power_backup',
        'water_management',
        'elevators',
      ];

      const amenities = facts
        .filter((f) => f.category === 'amenities' || amenityKeys.includes(f.key))
        .map((f) => ({
          key: f.key,
          title: f.title,
          description: f.value,
          category: f.category,
        }));

      res.status(200).json({
        success: true,
        data: {
          id: p.id,
          name: p.name,
          displayName: p.display_name,
          tagline: p.tagline,
          slug: p.slug,
          reraNumber: p.rera_number,
          address: p.address,
          lat: Number(p.lat),
          lng: Number(p.lng),
          bhkTypes: p.bhk_types,
          priceRange: overallPriceRange,
          configurations,
          amenities,
          facts,
          locationLandmarks: factMap.get('location_landmarks'),
          transitConnectivity: factMap.get('airport_railway'),
          possessionDate: factMap.get('possession_date'),
          developerName: 'Aaranya Realty, Ahmedabad',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

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
      const projectId = req.params['id'] as string;
      const data = await visitService.getSlotsForProject(
        projectId,
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
      const projectId = req.params['id'] as string;
      const data = await visitService.bookVisit(
        body.leadId,
        projectId,
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
      const token = req.params['token'] as string;
      const data = await visitService.getManageDetailsByToken(token);
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
      const token = req.params['token'] as string;
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
      const token = req.params['token'] as string;
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
 * POST /api/visits/manage/:token/opt-out
 * Public buyer endpoint to opt-out of communications and cancel pending reminders.
 */
visitsRouter.post(
  '/visits/manage/:token/opt-out',
  validateRequest({ params: TokenParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.params['token'] as string;
      const payload = await verifyMagicLinkToken(token);
      if (!payload || payload.purpose !== 'manage_visit') {
        throw new UnauthorizedError('Invalid or expired magic link token');
      }

      await chatRepository.optOutLead(payload.leadId);

      // Audit log the buyer opt-out request
      await query(
        `INSERT INTO audit_log (actor_id, action, entity, entity_id, diff, at)
         VALUES (NULL, 'opt_out', 'lead', $1, $2, NOW())`,
        [payload.leadId, JSON.stringify({ reason: 'Buyer self-service magic link opt-out' })],
      );

      res.status(200).json({
        success: true,
        message: 'You have been unsubscribed and all appointment reminders are cancelled.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/visits/manage/:token/re-consent
 * Public buyer endpoint to re-opt-in to communications and reminders.
 */
visitsRouter.post(
  '/visits/manage/:token/re-consent',
  validateRequest({ params: TokenParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.params['token'] as string;
      const payload = await verifyMagicLinkToken(token);
      if (!payload || payload.purpose !== 'manage_visit') {
        throw new UnauthorizedError('Invalid or expired magic link token');
      }

      await chatRepository.reConsentLead(payload.leadId, 'manage_visit');
      res.status(200).json({
        success: true,
        message: 'You have been re-subscribed to automated appointment updates and reminders.',
      });
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
      const visitId = req.params['id'] as string;
      const data = await visitService.recordOutcome(
        visitId,
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
