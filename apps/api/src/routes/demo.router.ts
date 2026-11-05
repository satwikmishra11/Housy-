import { Router, type Request, type Response, type NextFunction } from 'express';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { leadIngestService } from '../services/lead-ingest.service.js';
import { reminderService } from '../services/reminder.service.js';
import { query } from '../db/index.js';
import { NotFoundError } from '../errors/AppError.js';
import {
  DemoSimulateLeadPayloadSchema,
  DemoFastForwardRemindersPayloadSchema,
} from '@housy/shared';

export const demoRouter = Router();

// Middleware: ensure DEMO_MODE is true
demoRouter.use('/demo', (_req: Request, _res: Response, next: NextFunction) => {
  if (!config.DEMO_MODE) {
    throw new NotFoundError('Demo endpoints are disabled when DEMO_MODE is false.');
  }
  next();
});

// Require sales_head role for all demo control mutations
demoRouter.use('/demo', requireAuth, requireRole('sales_head'));

/**
 * POST /api/demo/simulate-lead
 * Simulates an incoming buyer lead from a specified marketing channel.
 */
demoRouter.post(
  '/demo/simulate-lead',
  validateRequest({ body: DemoSimulateLeadPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { source, name, phone, wants, projectId } = req.body;

      // Realistic mock datasets for Ahmedabad luxury buyer profiles
      const sampleNames: Record<string, string[]> = {
        property_portal: ['Rohan Shah', 'Meera Trivedi', 'Ketan Vora', 'Hiren Doshi'],
        social_ad: ['Aarav Patel', 'Pooja Desai', 'Devang Pandya', 'Sneha Joshi'],
        website: ['Anand Mehta', 'Bhavna Parekh', 'Samir Parikh', 'Nisha Solanki'],
        hoarding_call: ['Jignesh Patel', 'Shilpa Brahmbhatt', 'Chirag Dave', 'Pravin Modi'],
      };

      const sampleWants: Record<string, string[]> = {
        property_portal: ['3 BHK Luxury Penthouse', '3 BHK High Rise'],
        social_ad: ['2 BHK Garden Residence', '2 BHK Premium'],
        website: ['3 BHK Golf Facing', '2 BHK Sky Villa'],
        hoarding_call: ['3 BHK East Facing with Balcony', '2 BHK Road Facing'],
      };

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const namePool = sampleNames[source] || ['Vikas Patel'];
      const wantsPool = sampleWants[source] || ['3 BHK Luxury'];

      const selectedName = name || namePool[Math.floor(Math.random() * namePool.length)]!;
      const selectedPhone = phone || `+9198250${randomSuffix}`;
      const selectedWants = wants || wantsPool[Math.floor(Math.random() * wantsPool.length)]!;

      // Lookup project
      let targetProjectId = projectId;
      if (!targetProjectId) {
        const projRes = await query<{ id: string }>(
          `SELECT id FROM projects WHERE rera_number NOT LIKE '%TEST%' ORDER BY created_at ASC LIMIT 1`,
        );
        targetProjectId = projRes.rows[0]?.id;
      }

      const outcome = await leadIngestService.ingest(
        {
          name: selectedName,
          phone: selectedPhone,
          wants: selectedWants,
          projectId: targetProjectId,
          consent: true,
        },
        source,
      );

      res.status(201).json({
        success: true,
        message: `Simulated lead created from channel '${source}'`,
        simulatedLead: {
          name: selectedName,
          phone: selectedPhone,
          wants: selectedWants,
          source,
          projectId: targetProjectId,
        },
        outcome,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/demo/run-reminders
 * Fast-triggers the site-visit reminder worker.
 */
demoRouter.post(
  '/demo/run-reminders',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await reminderService.processDueReminders(50);
      res.status(200).json({
        success: true,
        message: 'Reminder worker executed',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/demo/fast-forward-reminders
 * Modifies pending reminders for a booking to be due immediately (scheduled_at = NOW() - 1m).
 */
demoRouter.post(
  '/demo/fast-forward-reminders',
  validateRequest({ body: DemoFastForwardRemindersPayloadSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let bookingId = req.body.bookingId;

      if (!bookingId) {
        // Pick the latest confirmed booking with pending reminders
        const bkgRes = await query<{ id: string }>(
          `SELECT vb.id
           FROM visit_bookings vb
           JOIN reminders r ON r.booking_id = vb.id
           WHERE vb.status = 'confirmed' AND r.status = 'pending'
           ORDER BY vb.created_at DESC
           LIMIT 1`,
        );

        if (!bkgRes.rows[0]) {
          // If none with pending, pick any confirmed booking and insert a pending reminder
          const anyConfirmed = await query<{ id: string }>(
            `SELECT id FROM visit_bookings WHERE status = 'confirmed' ORDER BY created_at DESC LIMIT 1`,
          );
          if (!anyConfirmed.rows[0]) {
            throw new NotFoundError('No confirmed visit bookings found to fast-forward.');
          }
          bookingId = anyConfirmed.rows[0].id;

          // Insert a 24h reminder due right now
          await query(
            `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
             VALUES ($1, '24h', NOW() - INTERVAL '1 minute', 'pending')`,
            [bookingId],
          );
        } else {
          bookingId = bkgRes.rows[0].id;
        }
      }

      // Fast forward all pending reminders for this booking
      const updateRes = await query(
        `UPDATE reminders
         SET scheduled_at = NOW() - INTERVAL '1 minute'
         WHERE booking_id = $1 AND status = 'pending'`,
        [bookingId],
      );

      res.status(200).json({
        success: true,
        message: `Fast-forwarded ${updateRes.rowCount ?? 0} reminders for booking ${bookingId} to be due now.`,
        bookingId,
        updatedRemindersCount: updateRes.rowCount ?? 0,
      });
    } catch (err) {
      next(err);
    }
  },
);
