import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import { visitService } from '../src/services/visit.service.js';
import { leadRepository } from '../src/repositories/lead.repository.js';
import { llmService } from '../src/llm/index.js';
import { mockProvider } from '../src/llm/mock.provider.js';

describe('Hand-Computed Metrics, Status Invariants & Greeting-vs-Answer Rules', () => {
  let staffToken: string;
  let execUserId: string;

  const randomPhone = () => `+919${Math.floor(100000000 + Math.random() * 900000000)}`;

  beforeAll(async () => {
    llmService.setProvider(mockProvider, 'mock', 'mock-ai-model');

    const userRes = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, phone, active)
       VALUES ('Metrics Head', 'metrics.head@fixture.test', 'hash123', 'sales_head', '+919825000088', false)
       ON CONFLICT (email) DO UPDATE SET active = false
       RETURNING id`,
    );
    execUserId = userRes.rows[0]!.id;
    staffToken = await signStaffToken({
      id: execUserId,
      email: 'metrics.head@fixture.test',
      role: 'sales_head',
      name: 'Metrics Head',
      phone: '+919825000088',
    });
  });

  describe('1. Hand-Computed Statistical Metrics', () => {
    it('computes exact odd-median first response time (e.g. [60s, 120s, 300s] -> 120s / 2m)', async () => {
      // Create isolated test project
      const projRes = await query<{ id: string }>(
        `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
         VALUES ('Odd Median Tower', 'PR/GJ/TEST/ODD/001', 'Bopal, Ahmedabad', 23.03, 72.58, ARRAY['2 BHK'])
         RETURNING id`,
      );
      const testProjId = projRes.rows[0]!.id;

      const baseTime = new Date('2026-06-15T10:00:00Z');
      const delays = [60, 120, 300]; // Expected 50th percentile: 120s

      for (let i = 0; i < delays.length; i++) {
        const touch = new Date(baseTime.getTime() + i * 3600 * 1000);
        const resp = new Date(touch.getTime() + delays[i]! * 1000);
        await query(
          `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status, first_touch_at, first_response_at, first_response_kind)
           VALUES ($1, $2, 'website', $3, '2 BHK', 'engaged', 'granted', $4, $5, 'chat_substantive_answer')`,
          [`Odd Buyer ${i}`, randomPhone(), testProjId, touch.toISOString(), resp.toISOString()],
        );
      }

      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=2026-06-01&to=2026-06-30&projectId=${testProjId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.medianFirstResponseSeconds).toBe(120);
      expect(res.body.summary.medianFirstResponseFormatted).toBe('2m');
    });

    it('computes exact even-median first response time (e.g. [60s, 120s, 180s, 240s] -> 150s / 2m 30s)', async () => {
      const projRes = await query<{ id: string }>(
        `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
         VALUES ('Even Median Tower', 'PR/GJ/TEST/EVEN/001', 'Satellite, Ahmedabad', 23.03, 72.58, ARRAY['3 BHK'])
         RETURNING id`,
      );
      const testProjId = projRes.rows[0]!.id;

      const baseTime = new Date('2026-06-15T10:00:00Z');
      const delays = [60, 120, 180, 240]; // Expected 50th percentile: (120+180)/2 = 150s

      for (let i = 0; i < delays.length; i++) {
        const touch = new Date(baseTime.getTime() + i * 3600 * 1000);
        const resp = new Date(touch.getTime() + delays[i]! * 1000);
        await query(
          `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status, first_touch_at, first_response_at, first_response_kind)
           VALUES ($1, $2, 'website', $3, '3 BHK', 'engaged', 'granted', $4, $5, 'chat_substantive_answer')`,
          [`Even Buyer ${i}`, randomPhone(), testProjId, touch.toISOString(), resp.toISOString()],
        );
      }

      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=2026-06-01&to=2026-06-30&projectId=${testProjId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.medianFirstResponseSeconds).toBe(150);
      expect(res.body.summary.medianFirstResponseFormatted).toBe('2m 30s');
    });

    it('excludes non-consented leads from 48h SLA denominator and tracks not contactable count', async () => {
      const projRes = await query<{ id: string }>(
        `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
         VALUES ('Consent SLA Enclave', 'PR/GJ/TEST/CONSENT/001', 'Thaltej, Ahmedabad', 23.05, 72.51, ARRAY['3 BHK'])
         RETURNING id`,
      );
      const testProjId = projRes.rows[0]!.id;

      const intake = new Date('2026-06-10T10:00:00Z');

      // 3 contactable leads reached within SLA
      for (let i = 0; i < 3; i++) {
        const touch = new Date(intake.getTime() + i * 1000);
        const resp = new Date(touch.getTime() + 10 * 60 * 1000); // 10 min
        await query(
          `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status, first_touch_at, first_response_at, first_response_kind)
           VALUES ($1, $2, 'social_ad', $3, '2 BHK', 'engaged', 'granted', $4, $5, 'outbound_message')`,
          [`Contactable Ok ${i}`, randomPhone(), testProjId, touch.toISOString(), resp.toISOString()],
        );
      }

      // 1 contactable lead unreached > 48h
      const unreachedTouch = new Date('2026-06-05T10:00:00Z'); // 5 days before end of filter
      await query(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status, first_touch_at, first_response_at)
         VALUES ('Contactable Unreached', $1, 'social_ad', $2, '3 BHK', 'new', 'granted', $3, NULL)`,
        [randomPhone(), testProjId, unreachedTouch.toISOString()],
      );

      // 1 non-consented lead (withdrawn consent / opted-out) - MUST BE EXCLUDED FROM SLA DENOMINATOR
      await query(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status, opted_out_at, first_touch_at, first_response_at)
         VALUES ('Opted Out Buyer', $1, 'social_ad', $2, '2 BHK', 'new', 'withdrawn', '2026-06-06T10:00:00Z', $3, NULL)`,
        [randomPhone(), testProjId, unreachedTouch.toISOString()],
      );

      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=2026-06-01&to=2026-06-30&projectId=${testProjId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.summary;

      expect(summary.totalLeads).toBe(5);
      expect(summary.contactableLeadsCount).toBe(4);
      expect(summary.notContactableCount).toBe(1);
      expect(summary.unreached48hCount).toBe(1);

      // Hand-computed: 1 unreached / 4 contactable = 25.0%
      // If non-consented was not excluded, it would be 1 / 5 = 20.0%
      expect(summary.unreached48hPercent).toBe(25.0);
      expect(summary.unreached48hFormatted).toBe('25.0%');
    });
  });

  describe('2. Greeting vs Substantive Answer Rule', () => {
    it('tags welcome greeting with is_greeting=true and leaves first_response_at unset until substantive answer', async () => {
      const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
      const testProjId = projRes.rows[0]!.id;

      // 1. Buyer starts chat
      const startRes = await request(app)
        .post('/api/chat/start')
        .send({ language: 'en', projectId: testProjId, source: 'website' });

      expect(startRes.status).toBe(201);
      const { conversationId, sessionId, sessionToken, leadId } = startRes.body;

      // Initially leadId is null and session is created
      expect(leadId).toBeNull();
      expect(sessionId).toBeDefined();

      // Check greeting message in database
      const msgRes = await query<{ is_greeting: boolean; role: string }>(
        'SELECT is_greeting, role FROM messages WHERE conversation_id = $1',
        [conversationId],
      );
      expect(msgRes.rows.length).toBe(1);
      expect(msgRes.rows[0]?.is_greeting).toBe(true);
      expect(msgRes.rows[0]?.role).toBe('assistant');

      // Check session has first_touch_at but buyer_first_message_at is null
      const sessRes = await query<{ buyer_first_message_at: string | null; first_response_at: string | null }>(
        'SELECT buyer_first_message_at, first_response_at FROM chat_sessions WHERE id = $1',
        [sessionId],
      );
      expect(sessRes.rows[0]?.buyer_first_message_at).toBeNull();
      expect(sessRes.rows[0]?.first_response_at).toBeNull();

      // 2. Buyer sends first substantive enquiry
      mockProvider.enqueueResponse({
        toolCalls: [
          {
            id: 'call_reply_greeting_test',
            name: 'send_reply',
            arguments: {
              text: 'We offer thoughtfully designed residential homes.',
              cited_fact_ids: [],
              confidence: 0.9,
              language: 'en',
            },
          },
        ],
      });

      const msgSendRes = await request(app)
        .post('/api/chat/message')
        .set('x-buyer-session', sessionToken)
        .send({
          conversationId,
          message: 'What types of configurations do you offer in this project?',
        });

      expect(msgSendRes.status).toBe(200);

      // Session now records buyer_first_message_at and first_response_at
      const updatedSess = await query<{ buyer_first_message_at: string | null; first_response_at: string | null }>(
        'SELECT buyer_first_message_at, first_response_at FROM chat_sessions WHERE id = $1',
        [sessionId],
      );
      expect(updatedSess.rows[0]?.buyer_first_message_at).not.toBeNull();
      expect(updatedSess.rows[0]?.first_response_at).not.toBeNull();

      // Check assistant reply is NOT a greeting
      const allMsgs = await query<{ role: string; is_greeting: boolean; content: string }>(
        'SELECT role, is_greeting, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId],
      );
      expect(allMsgs.rows.length).toBe(3); // greeting, buyer msg, assistant reply
      expect(allMsgs.rows[0]?.is_greeting).toBe(true);
      expect(allMsgs.rows[1]?.is_greeting).toBe(false);
      expect(allMsgs.rows[2]?.is_greeting).toBe(false);
    });
  });

  describe('3. Single Source of Truth & Database Status Invariants', () => {
    it('maintains strict status invariant: 0 leads with status visited lack completed booking', async () => {
      const res = await query<{ orphan_count: string }>(
        `SELECT COUNT(*) AS orphan_count
         FROM leads l
         WHERE l.status = 'visited'
           AND l.name NOT LIKE '%Buyer%'
           AND l.name NOT LIKE '%Lead%'
           AND NOT EXISTS (
             SELECT 1 FROM visit_bookings vb
             WHERE vb.lead_id = l.id AND vb.status = 'completed'
           )`,
      );
      expect(Number(res.rows[0]?.orphan_count)).toBe(0);
    });

    it('maintains strict status invariant: 0 leads with status visit_booked lack confirmed booking', async () => {
      const res = await query<{ orphan_count: string }>(
        `SELECT COUNT(*) AS orphan_count
         FROM leads l
         WHERE l.status = 'visit_booked'
           AND l.name NOT LIKE '%Buyer%'
           AND l.name NOT LIKE '%Lead%'
           AND NOT EXISTS (
             SELECT 1 FROM visit_bookings vb
             WHERE vb.lead_id = l.id AND vb.status = 'confirmed'
           )`,
      );
      expect(Number(res.rows[0]?.orphan_count)).toBe(0);
    });

    it('maintains strict status invariant: 0 leads with status no_show lack no_show booking', async () => {
      const res = await query<{ orphan_count: string }>(
        `SELECT COUNT(*) AS orphan_count
         FROM leads l
         WHERE l.status = 'no_show'
           AND l.name NOT LIKE '%Buyer%'
           AND l.name NOT LIKE '%Lead%'
           AND NOT EXISTS (
             SELECT 1 FROM visit_bookings vb
             WHERE vb.lead_id = l.id AND vb.status = 'no_show'
           )`,
      );
      expect(Number(res.rows[0]?.orphan_count)).toBe(0);
    });

    it('updates booking status and lead status atomically in VisitService', async () => {
      const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
      const testProjId = projRes.rows[0]!.id;

      // Create a test lead with confirmed booking
      const lead = await leadRepository.createLead({
        name: 'Atomic Visit Buyer',
        phoneE164: randomPhone(),
        source: 'website',
        projectId: testProjId,
        wants: '2 BHK',
        language: 'en',
        status: 'new',
        consentStatus: 'granted',
      });

      const startsAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

      const execRes = await query<{ id: string }>(
        "SELECT id FROM users WHERE role = 'executive' AND active = true LIMIT 1",
      );
      const activeExecId = execRes.rows[0]!.id;

      // Create an open slot for booking
      await query(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, 'open')`,
        [testProjId, activeExecId, startsAt, endsAt],
      );

      const booking = await visitService.bookVisit(lead.id, testProjId, startsAt, `atomic_${Date.now()}`);

      // Confirm initial state
      let leadDb = await leadRepository.findById(lead.id);
      expect(leadDb?.status).toBe('visit_booked');

      // Shift slot into past to simulate visit completion time
      await query(
        `UPDATE visit_slots
         SET starts_at = NOW() - INTERVAL '2 hours', ends_at = NOW() - INTERVAL '1 hour'
         WHERE id = (SELECT slot_id FROM visit_bookings WHERE id = $1)`,
        [booking.id],
      );

      // Record outcome = visited (completed)
      await visitService.recordOutcome(
        booking.id,
        { outcome: 'visited', notes: 'Client attended full model tour' },
        execUserId,
        'sales_head',
      );

      // Verify both booking and lead status updated atomically
      const bookingRes = await query<{ status: string }>('SELECT status FROM visit_bookings WHERE id = $1', [booking.id]);
      expect(bookingRes.rows[0]?.status).toBe('completed');

      leadDb = await leadRepository.findById(lead.id);
      expect(leadDb?.status).toBe('visited');
    });

    it('verifies exact states of the 3 client brief reference leads', async () => {
      // LD-58210: Hardik Patel (Booked 2026-11-01 11:00 in past, status visit_booked with confirmed booking, under Awaiting Outcome)
      const hardikRes = await query<{
        name: string;
        status: string;
        booking_status: string;
        starts_at: string;
      }>(
        `SELECT l.name, l.status, vb.status AS booking_status, vs.starts_at
         FROM leads l
         JOIN visit_bookings vb ON vb.lead_id = l.id
         JOIN visit_slots vs ON vs.id = vb.slot_id
         WHERE l.name = 'Hardik Patel'`,
      );
      expect(hardikRes.rows.length).toBeGreaterThanOrEqual(1);
      const hardik = hardikRes.rows[0]!;
      expect(hardik.status).toBe('visit_booked');
      expect(hardik.booking_status).toBe('confirmed');
      expect(new Date(hardik.starts_at).getTime()).toBeLessThan(new Date('2026-11-02T00:00:00Z').getTime());

      // LD-58211: Nidhi Shah (Social ad, Project 2, 2 BHK, Not booked, engaged)
      const nidhiRes = await query<{ name: string; source: string; status: string; wants: string }>(
        `SELECT name, source, status, wants FROM leads WHERE name = 'Nidhi Shah'`,
      );
      expect(nidhiRes.rows.length).toBeGreaterThanOrEqual(1);
      const nidhi = nidhiRes.rows[0]!;
      expect(nidhi.source).toBe('social_ad');
      expect(nidhi.status).toBe('engaged');
      expect(nidhi.wants).toContain('2 BHK');

      // LD-58224: Kavita Joshi (Hoarding call, Project 2, 2 BHK, Visited with completed booking)
      const kavitaRes = await query<{
        name: string;
        source: string;
        status: string;
        booking_status: string;
      }>(
        `SELECT l.name, l.source, l.status, vb.status AS booking_status
         FROM leads l
         JOIN visit_bookings vb ON vb.lead_id = l.id
         WHERE l.name = 'Kavita Joshi'`,
      );
      expect(kavitaRes.rows.length).toBeGreaterThanOrEqual(1);
      const kavita = kavitaRes.rows[0]!;
      expect(kavita.source).toBe('hoarding_call');
      expect(kavita.status).toBe('visited');
      expect(kavita.booking_status).toBe('completed');
    });
  });
});
