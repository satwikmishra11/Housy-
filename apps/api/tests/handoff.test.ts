import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { handoffService } from '../src/services/handoff.service.js';
import { handoffRepository } from '../src/repositories/handoff.repository.js';
import { llmService } from '../src/llm/llm.service.js';
import { mockProvider } from '../src/llm/mock.provider.js';
import { signStaffToken } from '../src/auth/tokens.js';

const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

describe('Human Handoff Workflow & Assignment Rules', () => {
  let executiveAId: string;
  let executiveBId: string;
  let projectId: string;

  beforeEach(async () => {
    // 1. Fetch or ensure 2 active executives
    const execRes = await query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE role = 'executive' AND active = true ORDER BY email ASC LIMIT 2`,
    );
    expect(execRes.rows.length).toBeGreaterThanOrEqual(2);
    executiveAId = execRes.rows[0]!.id;
    executiveBId = execRes.rows[1]!.id;

    // 2. Fetch project
    const projRes = await query<{ id: string }>(`SELECT id FROM projects LIMIT 1`);
    projectId = projRes.rows[0]!.id;
  });

  describe('Executive Assignment Logic', () => {
    it('prefers the executive who owns the confirmed visit slot for the lead', async () => {
      // Create lead
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status)
         VALUES ('Visit Lead', $1, 'website', $2, '3 BHK Luxury', 'new', 'granted')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      // Create slot owned by Executive B
      const slotRes = await query<{ id: string }>(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours', NOW() + INTERVAL '25 hours', 'booked')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'booked'
         RETURNING id`,
        [projectId, executiveBId],
      );
      const slotId = slotRes.rows[0]!.id;

      // Create confirmed booking
      await query(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', $3)`,
        [leadId, slotId, `idemp_handoff_${Date.now()}`],
      );

      // Trigger handoff
      const handoff = await handoffService.createHandoff(leadId, 'Site visit booked');

      expect(handoff.executiveId).toBe(executiveBId);

      // Verify lead assigned_to is updated
      const updatedLead = await query<{ assigned_to: string; status: string }>(
        `SELECT assigned_to, status FROM leads WHERE id = $1`,
        [leadId],
      );
      expect(updatedLead.rows[0]?.assigned_to).toBe(executiveBId);
    });

    it('falls back to the active executive with fewest open assigned leads when no booked visit exists', async () => {
      // Mark any open leads currently assigned to Executive B as visited so Executive B has 0 open leads
      await query(`UPDATE leads SET status = 'visited' WHERE assigned_to = $1`, [executiveBId]);

      // Heavily load Executive A with open leads
      for (let i = 0; i < 3; i++) {
        await query(
          `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, assigned_to)
           VALUES ($1, $2, 'website', $3, '2 BHK', 'engaged', $4)`,
          [`Loaded Lead ${i}`, randomPhone(), projectId, executiveAId],
        );
      }

      // Create new unassigned lead
      const unassignedRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status)
         VALUES ('Unassigned Lead', $1, 'website', $2, '3 BHK', 'new')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = unassignedRes.rows[0]!.id;

      // Executive assignment should pick Executive B (fewer open assigned leads)
      const assignedExec = await handoffRepository.findBestExecutiveForLead(leadId);
      expect(assignedExec.id).toBe(executiveBId);

      const handoff = await handoffService.createHandoff(leadId, 'Buyer requested human');
      expect(handoff.executiveId).toBe(executiveBId);
    });
  });

  describe('Summary Generation & Fallback', () => {
    it('generates summary conforming to strict schema with deterministic fallback on model failure', async () => {
      // Force mock provider to return invalid JSON
      mockProvider.reset();
      mockProvider.enqueueResponse({ text: 'INVALID NOT JSON TEXT {{' });
      llmService.setProvider(mockProvider);

      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, language, source, project_id, wants, budget_min, budget_max, status)
         VALUES ('Fallback Lead', $1, 'hi', 'social_ad', $2, '3 BHK High Rise', 8000000, 11000000, 'new')
         RETURNING id`,
        [randomPhone(), projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      const handoff = await handoffService.createHandoff(leadId, 'Missing fact fallback');

      // Summary must adhere strictly to schema
      expect(handoff.summary).toBeDefined();
      expect(handoff.summary.name).toBe('Fallback Lead');
      expect(handoff.summary.language).toBe('hi');
      expect(handoff.summary.budgetRange).toContain('₹80L - ₹110L');
      expect(handoff.summary.wants).toBe('3 BHK High Rise');
      expect(handoff.summary.sentiment).toBeDefined();

      // Hindi localized buyer message
      expect(handoff.buyerMessage).toContain('हमारी सेल्स टीम से जल्द ही आपसे संपर्क करेंगे।');
    });

    it('notifies buyer in their language (EN, HI, GU)', async () => {
      // English
      const enRes = await query<{ id: string }>(
        `INSERT INTO leads (name, language, source, wants, status) VALUES ('EN Buyer', 'en', 'website', '2 BHK', 'new') RETURNING id`,
      );
      const enHandoff = await handoffService.createHandoff(enRes.rows[0]!.id, 'Human requested');
      expect(enHandoff.buyerMessage).toContain('from our sales team will contact you.');

      // Gujarati
      const guRes = await query<{ id: string }>(
        `INSERT INTO leads (name, language, source, wants, status) VALUES ('GU Buyer', 'gu', 'website', '3 BHK', 'new') RETURNING id`,
      );
      const guHandoff = await handoffService.createHandoff(guRes.rows[0]!.id, 'Human requested');
      expect(guHandoff.buyerMessage).toContain('અમારી સેલ્સ ટીમમાંથી ટૂંક સમયમાં તમારો સંપર્ક કરશે.');
    });
  });

  describe('Executive Inbox API Endpoints', () => {
    it('lists handoffs filtered by role and status, allows accepting and posting message', async () => {
      // Generate auth token for Executive A
      const token = await signStaffToken({
        id: executiveAId,
        email: 'amit.shah@example.com',
        role: 'executive',
        name: 'Amit Shah',
        phone: '+919825011111',
      });
      const authHeader = `Bearer ${token}`;

      // Create a lead with a booked visit slot owned by Executive A to guarantee assignment to Executive A
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, wants, status)
         VALUES ('Inbox Lead', $1, 'property_portal', '2 BHK', 'engaged')
         RETURNING id`,
        [randomPhone()],
      );
      const leadId = leadRes.rows[0]!.id;

      const slotRes = await query<{ id: string }>(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours', NOW() + INTERVAL '25 hours', 'booked')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'booked'
         RETURNING id`,
        [projectId, executiveAId],
      );
      const slotId = slotRes.rows[0]!.id;

      await query(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', $3)`,
        [leadId, slotId, `idemp_inbox_${Date.now()}`],
      );

      const handoff = await handoffService.createHandoff(leadId, 'Human requested');

      // GET /api/handoffs
      const listRes = await request(app)
        .get('/api/handoffs')
        .set('Authorization', authHeader)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(Array.isArray(listRes.body.data)).toBe(true);

      const targetHandoff = listRes.body.data.find((h: { id: string }) => h.id === handoff.handoffId);
      expect(targetHandoff).toBeDefined();
      expect(targetHandoff.status).toBe('new');

      // POST /api/handoffs/:id/accept
      const acceptRes = await request(app)
        .post(`/api/handoffs/${handoff.handoffId}/accept`)
        .set('Authorization', authHeader)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.handoff.status).toBe('accepted');

      // POST /api/handoffs/:id/message
      const msgRes = await request(app)
        .post(`/api/handoffs/${handoff.handoffId}/message`)
        .set('Authorization', authHeader)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ message: 'Hello! I am taking over this conversation to assist you.' });

      expect(msgRes.status).toBe(200);
      expect(msgRes.body.success).toBe(true);

      // Verify conversation status is now 'human'
      const convRes = await query<{ status: string }>(
        `SELECT status FROM conversations WHERE id = (SELECT conversation_id FROM handoffs WHERE id = $1)`,
        [handoff.handoffId],
      );
      expect(convRes.rows[0]?.status).toBe('human');
    });
  });
});
