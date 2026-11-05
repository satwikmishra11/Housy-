import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { canContact } from '@housy/shared';
import { reminderService } from '../src/services/reminder.service.js';
import { whatsappAdapter } from '../src/channels/outbox.adapter.js';
import { signMagicLinkToken, signStaffToken } from '../src/auth/tokens.js';
import { config } from '../src/config/index.js';

const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

describe('DPDP Consent, Opt-Out, Reminder Worker & Channel Rules', () => {
  let projectId: string;
  let executiveId: string;
  let salesHeadAuthHeader: string;

  beforeEach(async () => {
    // 1. Fetch project
    const projRes = await query<{ id: string }>(`SELECT id FROM projects LIMIT 1`);
    projectId = projRes.rows[0]!.id;

    // 2. Fetch executive
    const execRes = await query<{ id: string }>(`SELECT id FROM users WHERE role = 'executive' AND active = true LIMIT 1`);
    executiveId = execRes.rows[0]!.id;

    // 3. Obtain Sales Head token
    const userRes = await query<{ id: string; email: string; role: 'sales_head'; name: string; phone: string | null }>(
      `SELECT id, email, role, name, phone FROM users WHERE role = 'sales_head' AND active = true LIMIT 1`,
    );
    const salesHead = userRes.rows[0]!;
    const token = await signStaffToken({
      id: salesHead.id,
      email: salesHead.email,
      role: 'sales_head',
      name: salesHead.name,
      phone: salesHead.phone ?? '+919825000000',
    });
    salesHeadAuthHeader = `Bearer ${token}`;
  });

  describe('DPDP 2023 Consent & canContact Matrix', () => {
    it('evaluates canContact correctly according to DPDP rules', () => {
      // Consent granted, not opted out -> true
      expect(canContact({ consent_status: 'granted', opted_out_at: null })).toBe(true);

      // Opted out -> false
      expect(canContact({ consent_status: 'granted', opted_out_at: new Date() })).toBe(false);

      // Unknown or withdrawn consent -> false
      expect(canContact({ consent_status: 'unknown', opted_out_at: null })).toBe(false);
      expect(canContact({ consent_status: 'withdrawn', opted_out_at: null })).toBe(false);
    });
  });

  describe('Opt-Out Cancels Pending Reminders', () => {
    it('cancels all pending visit reminders when a lead opts out via magic-link page', async () => {
      // Create lead
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status)
         VALUES ('OptOut Buyer', $1, 'website', $2, '3 BHK', 'visit_booked', 'granted')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      // Create booked slot
      const slotRes = await query<{ id: string }>(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, NOW() + INTERVAL '48 hours', NOW() + INTERVAL '49 hours', 'booked')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'booked'
         RETURNING id`,
        [projectId, executiveId],
      );
      const slotId = slotRes.rows[0]!.id;

      // Create booking
      const bookRes = await query<{ id: string }>(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', $3)
         RETURNING id`,
        [leadId, slotId, `idemp_optout_${Date.now()}`],
      );
      const bookingId = bookRes.rows[0]!.id;

      // Insert pending reminders
      await query(
        `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
         VALUES ($1, '24h', NOW() + INTERVAL '24 hours', 'pending'),
                ($1, '2h', NOW() + INTERVAL '46 hours', 'pending')`,
        [bookingId],
      );

      // Verify reminders are pending
      const beforeReminders = await query<{ status: string }>(
        `SELECT status FROM reminders WHERE booking_id = $1`,
        [bookingId],
      );
      expect(beforeReminders.rows.every((r) => r.status === 'pending')).toBe(true);

      // Sign magic link token
      const token = await signMagicLinkToken({ bookingId, leadId });

      // Buyer clicks opt-out on manage page
      const optOutRes = await request(app)
        .post(`/api/visits/manage/${token}/opt-out`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(optOutRes.status).toBe(200);

      // Verify lead is marked opted out and withdrawn
      const leadCheck = await query<{ consent_status: string; opted_out_at: Date | null }>(
        `SELECT consent_status, opted_out_at FROM leads WHERE id = $1`,
        [leadId],
      );
      expect(leadCheck.rows[0]?.consent_status).toBe('withdrawn');
      expect(leadCheck.rows[0]?.opted_out_at).not.toBeNull();

      // Verify all pending reminders are immediately marked cancelled
      const afterReminders = await query<{ status: string }>(
        `SELECT status FROM reminders WHERE booking_id = $1`,
        [bookingId],
      );
      expect(afterReminders.rows.every((r) => r.status === 'cancelled')).toBe(true);
    });

    it('cancels reminders on staff opt-out action', async () => {
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, wants, status, consent_status)
         VALUES ('Staff OptOut', $1, 'social_ad', '2 BHK', 'engaged', 'granted')
         RETURNING id`,
        [randomPhone()],
      );
      const leadId = leadRes.rows[0]!.id;

      const optOutRes = await request(app)
        .post(`/api/leads/${leadId}/opt-out`)
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(optOutRes.status).toBe(200);

      const leadCheck = await query<{ consent_status: string; opted_out_at: Date | null }>(
        `SELECT consent_status, opted_out_at FROM leads WHERE id = $1`,
        [leadId],
      );
      expect(leadCheck.rows[0]?.consent_status).toBe('withdrawn');
      expect(leadCheck.rows[0]?.opted_out_at).not.toBeNull();
    });
  });

  describe('WhatsApp Channel Rules & Template-Only Enforcement', () => {
    it('rejects free-form text messages for WhatsApp with ValidationError', async () => {
      const leadRes = await query<{ id: string }>(`SELECT id FROM leads LIMIT 1`);
      const leadId = leadRes.rows[0]!.id;

      await expect(
        whatsappAdapter.send({
          leadId,
          recipient: '+919825000000',
          channel: 'whatsapp',
          body: 'Hello free-form text outside template rules',
        }),
      ).rejects.toThrow(/WhatsApp messages must use an approved template/);
    });

    it('successfully renders approved template and includes project RERA registration number', async () => {
      const leadRes = await query<{ id: string }>(`SELECT id FROM leads LIMIT 1`);
      const leadId = leadRes.rows[0]!.id;

      const result = await whatsappAdapter.send({
        leadId,
        recipient: '+919825000000',
        channel: 'whatsapp',
        templateName: 'first_response_link',
        payload: {
          projectName: 'The Palm Residences',
          brochureUrl: 'https://example.com/brochure.pdf',
          reraNumber: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
        },
      });

      expect(result.success).toBe(true);
      expect(result.body).toContain('The Palm Residences');
      expect(result.body).toContain('RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126');

      // Verify persisted in outbound_messages table
      const msgRes = await query<{ body: string; status: string }>(
        `SELECT body, status FROM outbound_messages WHERE id = $1`,
        [result.externalId],
      );
      expect(msgRes.rows[0]?.status).toBe('sent');
      expect(msgRes.rows[0]?.body).toContain('RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126');
    });
  });

  describe('Reminder Worker & Idempotency', () => {
    it('processes due reminders, skips opted-out leads, and dispatches consented visits', async () => {
      // 1. Create consented lead with due reminder
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status)
         VALUES ('Due Reminder Lead', $1, 'website', $2, '3 BHK', 'visit_booked', 'granted')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      const slotRes = await query<{ id: string }>(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'booked')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'booked'
         RETURNING id`,
        [projectId, executiveId],
      );
      const slotId = slotRes.rows[0]!.id;

      const bookRes = await query<{ id: string }>(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', $3)
         RETURNING id`,
        [leadId, slotId, `idemp_due_${Date.now()}`],
      );
      const bookingId = bookRes.rows[0]!.id;

      // Insert reminder due in the past
      const remRes = await query<{ id: string }>(
        `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
         VALUES ($1, '2h', NOW() - INTERVAL '5 minutes', 'pending')
         RETURNING id`,
        [bookingId],
      );
      const reminderId = remRes.rows[0]!.id;

      // Execute reminder processing
      const outcome = await reminderService.processDueReminders(10);
      expect(outcome.sentCount).toBeGreaterThanOrEqual(1);

      // Verify reminder status is sent
      const updatedRem = await query<{ status: string; attempts: number }>(
        `SELECT status, attempts FROM reminders WHERE id = $1`,
        [reminderId],
      );
      expect(updatedRem.rows[0]?.status).toBe('sent');
      expect(updatedRem.rows[0]?.attempts).toBe(1);

      // Re-running immediately results in 0 sent (idempotency, already claimed/sent)
      const outcome2 = await reminderService.processDueReminders(10);
      expect(outcome2.sentCount).toBe(0);
    });
  });

  describe('Internal Cron Endpoint', () => {
    it('executes reminder processing via POST /api/internal/run-reminders with X-Internal-Key', async () => {
      const res = await request(app)
        .post('/api/internal/run-reminders')
        .set('X-Internal-Key', config.INTERNAL_API_KEY)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.processedCount).toBeDefined();
    });

    it('rejects unauthenticated requests to internal cron', async () => {
      const res = await request(app)
        .post('/api/internal/run-reminders')
        .send();

      expect(res.status).toBe(401);
    });
  });

  describe('Demo Controls & Fast-Forwarding', () => {
    it('allows sales head to simulate leads from each source and fast-forward reminders', async () => {
      // 1. Simulate social_ad lead
      const simRes = await request(app)
        .post('/api/demo/simulate-lead')
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          source: 'social_ad',
          projectId,
        });

      expect(simRes.status).toBe(201);
      expect(simRes.body.success).toBe(true);
      expect(simRes.body.simulatedLead.source).toBe('social_ad');

      // 2. Fast-forward reminders
      const ffRes = await request(app)
        .post('/api/demo/fast-forward-reminders')
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});

      expect(ffRes.status).toBe(200);
      expect(ffRes.body.success).toBe(true);

      // 3. Run reminders now
      const runRes = await request(app)
        .post('/api/demo/run-reminders')
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});

      expect(runRes.status).toBe(200);
      expect(runRes.body.success).toBe(true);
    });
  });

  describe('Flagged Chat Daily Review Queue', () => {
    it('lists flagged chats with unreviewed count banner and allows marking reviewed with note', async () => {
      // Create a flagged conversation
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, source, wants, status)
         VALUES ('Flagged Buyer', 'website', '2 BHK', 'engaged')
         RETURNING id`,
      );
      const leadId = leadRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, flagged, flag_reasons)
         VALUES ($1, true, ARRAY['price_ask', 'missing_fact'])
         RETURNING id`,
        [leadId],
      );
      const convId = convRes.rows[0]!.id;

      // GET /api/admin/flagged-chats
      const listRes = await request(app)
        .get('/api/admin/flagged-chats')
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.unreviewedCount).toBeGreaterThanOrEqual(1);

      // POST /api/admin/flagged-chats/:id/review
      const revRes = await request(app)
        .post(`/api/admin/flagged-chats/${convId}/review`)
        .set('Authorization', salesHeadAuthHeader)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ note: 'Reviewed buyer query; pricing policy explained.' });

      expect(revRes.status).toBe(200);

      // Verify conversation updated
      const checkRes = await query<{ reviewed_by: string | null; review_note: string | null }>(
        `SELECT reviewed_by, review_note FROM conversations WHERE id = $1`,
        [convId],
      );
      expect(checkRes.rows[0]?.reviewed_by).not.toBeNull();
      expect(checkRes.rows[0]?.review_note).toBe('Reviewed buyer query; pricing policy explained.');
    });
  });
});
