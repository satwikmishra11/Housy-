import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { config } from '../src/config/index.js';
import { signStaffToken } from '../src/auth/tokens.js';

const randomPhone = () => `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

describe('Internal Jobs Runner & Health Diagnostics (/api/internal/run-jobs)', () => {
  let projectId: string;
  let executiveId: string;
  let staffToken: string;

  beforeEach(async () => {
    const projRes = await query<{ id: string }>(`SELECT id FROM projects LIMIT 1`);
    projectId = projRes.rows[0]!.id;

    const execRes = await query<{ id: string; email: string; name: string; phone: string | null }>(
      `SELECT id, email, name, phone FROM users WHERE role = 'executive' AND active = true LIMIT 1`,
    );
    executiveId = execRes.rows[0]!.id;

    staffToken = await signStaffToken({
      id: execRes.rows[0]!.id,
      email: execRes.rows[0]!.email,
      role: 'executive',
      name: execRes.rows[0]!.name,
      phone: execRes.rows[0]!.phone ?? '+919800000001',
    });
  });

  describe('1. Authentication & Security Boundary', () => {
    it('rejects POST /api/internal/run-jobs without X-Internal-Key header with 401', async () => {
      const res = await request(app).post('/api/internal/run-jobs');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/internal/run-jobs with an invalid X-Internal-Key header with 401', async () => {
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', 'wrong-secret-key-12345');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('strictly rejects query parameter key ?key= without X-Internal-Key header with 401', async () => {
      const res = await request(app)
        .post(`/api/internal/run-jobs?key=${encodeURIComponent(config.INTERNAL_API_KEY)}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('strictly rejects query parameter ?apiKey= without X-Internal-Key header with 401', async () => {
      const res = await request(app)
        .post(`/api/internal/run-jobs?apiKey=${encodeURIComponent(config.INTERNAL_API_KEY)}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('strictly rejects staff cookie authentication without X-Internal-Key header with 401', async () => {
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('Cookie', [`staff_token=${staffToken}`]);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('strictly rejects Bearer staff authorization header without X-Internal-Key header with 401', async () => {
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('accepts POST /api/internal/run-jobs with valid X-Internal-Key header with 200', async () => {
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobs).toHaveProperty('reminders');
      expect(res.body.jobs).toHaveProperty('slot_top_up');
      expect(res.body.jobs).toHaveProperty('handoff_escalation');
      expect(res.body.jobs).toHaveProperty('stale_session_cleanup');
    });
  });

  describe('2. Idempotency: Double Call Sends Due Reminder Once', () => {
    it('processes due reminder on first run and skips it on immediate second run', async () => {
      // 1. Create lead with affirmative DPDP consent
      const phone = randomPhone();
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status)
         VALUES ('Idempotent Test Buyer', $1, 'website', $2, '3 BHK', 'visit_booked', 'granted')
         RETURNING id`,
        [phone, projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      // 2. Create slot and booking in the future
      const slotRes = await query<{ id: string }>(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'booked')
         RETURNING id`,
        [projectId, executiveId],
      );
      const slotId = slotRes.rows[0]!.id;

      const bookingRes = await query<{ id: string }>(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', uuid_generate_v4())
         RETURNING id`,
        [leadId, slotId],
      );
      const bookingId = bookingRes.rows[0]!.id;

      // 3. Create due reminder scheduled in the past
      const remRes = await query<{ id: string }>(
        `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
         VALUES ($1, '2h', NOW() - INTERVAL '5 minutes', 'pending')
         RETURNING id`,
        [bookingId],
      );
      const reminderId = remRes.rows[0]!.id;

      // First run: reminder should be processed and sent
      const firstRun = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(firstRun.status).toBe(200);
      expect(firstRun.body.jobs.reminders.ok).toBe(true);
      expect(firstRun.body.jobs.reminders.counts.sentCount).toBeGreaterThanOrEqual(1);

      // Verify reminder status in database is now 'sent'
      const check1 = await query<{ status: string }>(
        `SELECT status FROM reminders WHERE id = $1`,
        [reminderId],
      );
      expect(check1.rows[0]?.status).toBe('sent');

      // Second immediate run: reminder must NOT be sent again (idempotent)
      const secondRun = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(secondRun.status).toBe(200);
      expect(secondRun.body.jobs.reminders.ok).toBe(true);
      // On second run, this specific reminder is already in 'sent' status, so sent count for it is 0
      const check2 = await query<{ status: string; attempts: number }>(
        `SELECT status, attempts FROM reminders WHERE id = $1`,
        [reminderId],
      );
      expect(check2.rows[0]?.status).toBe('sent');
      expect(check2.rows[0]?.attempts).toBe(1); // Still exactly 1 attempt
    });
  });

  describe('3. Slot Top-Up to 28 Days Ahead', () => {
    it('generates slots up to 28 days ahead and is idempotent on repeat execution', async () => {
      const res1 = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(res1.status).toBe(200);
      expect(res1.body.jobs.slot_top_up.ok).toBe(true);

      // Verify slots extend up to 27+ days into the future
      const maxSlotRes = await query<{ max_starts_at: Date }>(
        `SELECT MAX(starts_at) AS max_starts_at FROM visit_slots`,
      );
      expect(maxSlotRes.rows[0]?.max_starts_at).toBeDefined();
      const maxDate = new Date(maxSlotRes.rows[0]!.max_starts_at);
      const daysAhead = (maxDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysAhead).toBeGreaterThanOrEqual(25);

      // Second run: should insert 0 new slots because all 28 days are already present
      const res2 = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(res2.status).toBe(200);
      expect(res2.body.jobs.slot_top_up.ok).toBe(true);
      expect(res2.body.jobs.slot_top_up.counts.insertedSlots).toBe(0);
    });
  });

  describe('4. Handoff SLA Escalation (R3)', () => {
    it('escalates unaccepted handoff older than 15 minutes to urgent priority', async () => {
      // 1. Create lead and conversation
      const phone = randomPhone();
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status)
         VALUES ('Escalation Test Lead', $1, 'social_ad', $2, '2 BHK', 'engaged')
         RETURNING id`,
        [phone, projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, language, status)
         VALUES ($1, 'en', 'ai')
         RETURNING id`,
        [leadId],
      );
      const convId = convRes.rows[0]!.id;

      // 2. Create unaccepted handoff in 'new' status created 20 minutes ago
      const handoffRes = await query<{ id: string }>(
        `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, status, priority, is_escalated, created_at, updated_at)
         VALUES ($1, $2, $3, 'Price inquiry escalation', 'new', 'normal', false, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '20 minutes')
         RETURNING id`,
        [leadId, convId, executiveId],
      );
      const handoffId = handoffRes.rows[0]!.id;

      // Run internal jobs
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.jobs.handoff_escalation.ok).toBe(true);
      expect(res.body.jobs.handoff_escalation.counts.escalatedCount).toBeGreaterThanOrEqual(1);

      // Check handoff was marked urgent and escalated in DB
      const check = await query<{ priority: string; is_escalated: boolean }>(
        `SELECT priority, is_escalated FROM handoffs WHERE id = $1`,
        [handoffId],
      );
      expect(check.rows[0]?.priority).toBe('urgent');
      expect(check.rows[0]?.is_escalated).toBe(true);
    });
  });

  describe('5. Stale Anonymous Chat Session Cleanup', () => {
    it('cleans up anonymous chat session inactive for over 24 hours', async () => {
      // Create stale session
      const sessionRes = await query<{ id: string }>(
        `INSERT INTO chat_sessions (source, project_id, language, status, created_at, updated_at)
         VALUES ('website', $1, 'en', 'active', NOW() - INTERVAL '30 hours', NOW() - INTERVAL '30 hours')
         RETURNING id`,
        [projectId],
      );
      const sessionId = sessionRes.rows[0]!.id;

      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (chat_session_id, language, status, created_at, updated_at)
         VALUES ($1, 'en', 'ai', NOW() - INTERVAL '30 hours', NOW() - INTERVAL '30 hours')
         RETURNING id`,
        [sessionId],
      );
      const convId = convRes.rows[0]!.id;

      // Run internal jobs
      const res = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.jobs.stale_session_cleanup.ok).toBe(true);
      expect(res.body.jobs.stale_session_cleanup.counts.cleanedCount).toBeGreaterThanOrEqual(1);

      // Check session status is abandoned and conversation status is closed
      const sCheck = await query<{ status: string }>(
        `SELECT status FROM chat_sessions WHERE id = $1`,
        [sessionId],
      );
      expect(sCheck.rows[0]?.status).toBe('abandoned');

      const cCheck = await query<{ status: string }>(
        `SELECT status FROM conversations WHERE id = $1`,
        [convId],
      );
      expect(cCheck.rows[0]?.status).toBe('closed');
    });
  });

  describe('6. Job Runs Audit Logging & Health Endpoint Telemetry', () => {
    it('logs execution runs in job_runs table and reflects fresh status on GET /api/health', async () => {
      // 1. Trigger jobs run
      const jobRes = await request(app)
        .post('/api/internal/run-jobs')
        .set('X-Internal-Key', config.INTERNAL_API_KEY);

      expect(jobRes.status).toBe(200);

      // 2. Query job_runs table to verify database rows
      const runs = await query<{ job: string; ok: boolean }>(
        `SELECT job, ok FROM job_runs ORDER BY finished_at DESC LIMIT 10`,
      );
      expect(runs.rows.length).toBeGreaterThanOrEqual(4);
      const jobNames = runs.rows.map((r) => r.job);
      expect(jobNames).toContain('reminders');
      expect(jobNames).toContain('slot_top_up');
      expect(jobNames).toContain('handoff_escalation');
      expect(jobNames).toContain('stale_session_cleanup');

      // 3. Call GET /api/health - since reminders just ran, remindersOverdue must be false
      const healthRes = await request(app).get('/api/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.body.jobs).toBeDefined();
      expect(healthRes.body.jobs.remindersOverdue).toBe(false);
      expect(healthRes.body.jobs.remindersStatus).toBe('ok');
      expect(healthRes.body.jobs.recentRuns.length).toBeGreaterThanOrEqual(4);
    });

    it('marks health degraded and remindersOverdue true if reminders have not run for >10 minutes', async () => {
      // Set all reminder job runs in the database to 15 minutes ago
      await query(
        `UPDATE job_runs
         SET finished_at = NOW() - INTERVAL '15 minutes'
         WHERE job = 'reminders'`,
      );

      const healthRes = await request(app).get('/api/health');
      expect(healthRes.body.jobs.remindersOverdue).toBe(true);
      expect(healthRes.body.jobs.remindersStatus).toBe('overdue');
      expect(healthRes.body.status).toBe('degraded');
      expect(healthRes.status).toBe(503); // Degraded returns 503 per health check contract
    });

    afterAll(async () => {
      // Restore reminder run to now so other suites start with a healthy SLA
      await query(
        `UPDATE job_runs
         SET finished_at = NOW()
         WHERE job = 'reminders'`,
      );
    });
  });
});
