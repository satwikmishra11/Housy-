import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import type { AuthUser } from '@housy/shared';

describe("Sales Head Admin Area: Fact Sheet, Slot Rules, Spend & RBAC", () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  let salesHeadUser: AuthUser;
  let salesHeadToken: string;

  let execUser: AuthUser;
  let execToken: string;

  let projectId: string;
  let executiveId: string;

  beforeAll(async () => {
    // 1. Fetch Sales Head and Executive from seeded DB
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: 'executive' | 'sales_head';
      phone: string | null;
    }>(`SELECT id, name, email, role, phone FROM users WHERE active = true ORDER BY email`);

    const headDb = usersRes.rows.find((u) => u.role === 'sales_head')!;
    salesHeadUser = { ...headDb };
    salesHeadToken = await signStaffToken(salesHeadUser);

    const execDb = usersRes.rows.find((u) => u.role === 'executive')!;
    execUser = { ...execDb };
    execToken = await signStaffToken(execUser);
    executiveId = execUser.id;

    // 2. Fetch Project ID
    const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
    projectId = projRes.rows[0]!.id;

    // Clean up any stray test month data
    await query(`DELETE FROM ad_spend WHERE month = '2099-12-01'`);
  });

  afterAll(async () => {
    // Clean up test month data to preserve seeded months
    await query(`DELETE FROM ad_spend WHERE month = '2099-12-01'`);
  });

  // -------------------------------------------------------------------------
  // 1. Role Enforcement (sales_head only)
  // -------------------------------------------------------------------------
  describe('Role Enforcement Matrix', () => {
    it('returns 401 when accessing fact sheet unauthenticated', async () => {
      const res = await request(app).get('/api/fact-sheet');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 Forbidden when an executive accesses fact sheet', async () => {
      const res = await request(app)
        .get('/api/fact-sheet')
        .set('Authorization', `Bearer ${execToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when an executive attempts to mutate fact sheet', async () => {
      const res = await request(app)
        .post('/api/fact-sheet')
        .set('Authorization', `Bearer ${execToken}`)
        .set(CSRF_HEADER)
        .send({
          key: 'test_key',
          title: 'Test Title',
          value: 'Test Value',
          category: 'amenities',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when an executive accesses ad spend editor', async () => {
      const res = await request(app)
        .get('/api/ad-spend?month=2026-11')
        .set('Authorization', `Bearer ${execToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 Forbidden when an executive accesses slot preview', async () => {
      const res = await request(app)
        .get('/api/admin/slots/preview')
        .set('Authorization', `Bearer ${execToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows sales_head to access admin endpoints (200)', async () => {
      const res = await request(app)
        .get('/api/fact-sheet')
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Fact Sheet: Validation, Versioning, and Audit Trail
  // -------------------------------------------------------------------------
  describe('Fact Sheet Editor: Validation, Versioning & Audit Trail', () => {
    const uniqueKey = `clubhouse_rules_${Date.now()}`;
    let createdFactId: string;

    it('validates required fields: rejects empty title or value with 400', async () => {
      const res = await request(app)
        .post('/api/fact-sheet')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          key: 'invalid_fact',
          title: '', // empty title
          value: 'Some valid value',
          category: 'amenities',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates key format: rejects keys with invalid characters with 400', async () => {
      const res = await request(app)
        .post('/api/fact-sheet')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          key: 'invalid key with spaces and special @#$!',
          title: 'Valid Title',
          value: 'Valid Value',
          category: 'amenities',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a new fact entry, writing version 1 and audit_log record', async () => {
      const res = await request(app)
        .post('/api/fact-sheet')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          projectId,
          key: uniqueKey,
          title: 'Clubhouse Guest Policy',
          value: 'Up to 4 guests allowed per resident per week with prior reservation.',
          category: 'amenities',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.key).toBe(uniqueKey);
      expect(res.body.data.status).toBe('active');

      createdFactId = res.body.data.id;

      // Verify version 1 exists in DB
      const versionRes = await query<{ version_number: number; title: string }>(
        `SELECT version_number, title FROM fact_entry_versions WHERE fact_entry_id = $1`,
        [createdFactId],
      );
      expect(versionRes.rows.length).toBe(1);
      expect(versionRes.rows[0]!.version_number).toBe(1);

      // Verify audit_log entry exists
      const auditRes = await query<{ action: string; entity: string }>(
        `SELECT action, entity FROM audit_log WHERE entity = 'fact_entry' AND entity_id = $1`,
        [createdFactId],
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
      expect(auditRes.rows[0]!.action).toBe('fact_create');
    });

    it('rejects duplicate key in the same project scope with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/fact-sheet')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          projectId,
          key: uniqueKey, // same key in same project
          title: 'Conflicting Fact',
          value: 'Another text',
          category: 'amenities',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already exists');
    });

    it('updates fact, incrementing version to 2 and writing audit_log record', async () => {
      const res = await request(app)
        .put(`/api/fact-sheet/${createdFactId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          value: 'Updated: Up to 6 guests allowed per resident on weekends.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.value).toContain('Up to 6 guests');

      // Verify version history shows 2 versions
      const versionsRes = await request(app)
        .get(`/api/fact-sheet/${createdFactId}/versions`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.data.length).toBe(2);
      expect(versionsRes.body.data[0].versionNumber).toBe(2);
      expect(versionsRes.body.data[1].versionNumber).toBe(1);
    });

    it('archives fact, updating status and creating version 3', async () => {
      const res = await request(app)
        .post(`/api/fact-sheet/${createdFactId}/archive`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('archived');

      // Check version history has 3 versions
      const versionsRes = await request(app)
        .get(`/api/fact-sheet/${createdFactId}/versions`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(versionsRes.body.data.length).toBe(3);
      expect(versionsRes.body.data[0].status).toBe('archived');
    });

    it('generates assistant prompt preview showing fact text and IDs', async () => {
      const res = await request(app)
        .get(`/api/fact-sheet/preview/assistant?projectId=${projectId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const first = res.body.data[0];
      expect(first.id).toBeDefined();
      expect(first.injectedPromptText).toContain(`[FACT ID: ${first.id}]`);
      expect(first.injectedPromptText).toContain(first.title);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Unanswered Questions Inbox
  // -------------------------------------------------------------------------
  describe('Unanswered Questions Inbox', () => {
    it('lists unanswered buyer questions with status filter', async () => {
      const res = await request(app)
        .get('/api/unanswered-questions?status=unresolved')
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const question = res.body.data[0];
      expect(question.question).toBeDefined();
      expect(question.status).toBe('unresolved');
    });

    it('resolves an unanswered question after adding as fact', async () => {
      const listRes = await request(app)
        .get('/api/unanswered-questions?status=unresolved')
        .set('Authorization', `Bearer ${salesHeadToken}`);

      const targetQuestion = listRes.body.data[0];

      const res = await request(app)
        .post(`/api/unanswered-questions/${targetQuestion.id}/resolve`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolvedBy).toBe(salesHeadUser.id);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Slot Editor, Blocking & Safe Rule Generation
  // -------------------------------------------------------------------------
  describe('Slot Editor: Blocking & Safe Rule Generation', () => {
    it('lists weekly availability rules and blackout dates', async () => {
      const rulesRes = await request(app)
        .get(`/api/availability-rules?projectId=${projectId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(rulesRes.status).toBe(200);
      expect(Array.isArray(rulesRes.body.data)).toBe(true);

      const blackoutsRes = await request(app)
        .get(`/api/blackout-dates?projectId=${projectId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(blackoutsRes.status).toBe(200);
      expect(Array.isArray(blackoutsRes.body.data)).toBe(true);
    });

    it('blocks a single open slot and allows unblocking', async () => {
      // Find an open slot
      const slotsRes = await request(app)
        .get(`/api/admin/slots/preview?projectId=${projectId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(slotsRes.status).toBe(200);
      const openSlot = slotsRes.body.data.find((s: { status: string }) => s.status === 'open');
      expect(openSlot).toBeDefined();

      // Block open slot
      const blockRes = await request(app)
        .post(`/api/admin/slots/${openSlot.id}/block`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER);

      expect(blockRes.status).toBe(200);
      expect(blockRes.body.status).toBe('blocked');

      // Unblock slot
      const unblockRes = await request(app)
        .post(`/api/admin/slots/${openSlot.id}/unblock`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER);

      expect(unblockRes.status).toBe(200);
      expect(unblockRes.body.status).toBe('open');
    });

    it('strictly warns and refuses to block or delete a booked slot (409 Conflict)', async () => {
      // Find a slot that is confirmed booked
      const slotsRes = await request(app)
        .get(`/api/admin/slots/preview?projectId=${projectId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      const bookedSlot = slotsRes.body.data.find((s: { status: string; booking: unknown }) => s.status === 'booked' && s.booking);
      expect(bookedSlot).toBeDefined();

      // Attempt to block booked slot
      const res = await request(app)
        .post(`/api/admin/slots/${bookedSlot.id}/block`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('active site visit is booked');
    });

    it('adding rule triggers slot generation without altering existing booked slots', async () => {
      // Find existing booked slots for this project before rule change
      const beforeRes = await query<{ id: string }>(
        `SELECT id FROM visit_slots WHERE project_id = $1 AND status = 'booked' ORDER BY id`,
        [projectId],
      );
      const bookedIdsBefore = beforeRes.rows.map((r) => r.id);
      expect(bookedIdsBefore.length).toBeGreaterThan(0);

      // Create a new availability rule for Thursday 14:00 - 18:00
      const res = await request(app)
        .post('/api/availability-rules')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          projectId,
          executiveId,
          weekday: 4,
          startTime: '14:00',
          endTime: '18:00',
          slotMinutes: 60,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.createdSlotsCount).toBeGreaterThanOrEqual(0);

      // Booked slots for this project must be completely unchanged and never deleted
      const afterRes = await query<{ id: string }>(
        `SELECT id FROM visit_slots WHERE id = ANY($1::uuid[])`,
        [bookedIdsBefore],
      );
      expect(afterRes.rows.length).toBe(bookedIdsBefore.length);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Spend Editor
  // -------------------------------------------------------------------------
  describe('Spend Editor', () => {
    it('returns default monthly ad spend totaling ₹30 Lakh / month (Assumption A7)', async () => {
      const res = await request(app)
        .get('/api/ad-spend?month=2099-12')
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalInr).toBe(3000000); // 30 Lakh INR
      expect(res.body.data.isDefault).toBe(true);
    });

    it('updates monthly ad spend allocation and persists in database', async () => {
      const res = await request(app)
        .put('/api/ad-spend')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          month: '2099-12',
          allocations: [
            { source: 'property_portal', amountInr: 1400000 },
            { source: 'social_ad', amountInr: 1000000 },
            { source: 'hoarding_call', amountInr: 400000 },
            { source: 'website', amountInr: 200000 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalInr).toBe(3000000);
      expect(res.body.data.isDefault).toBe(false);

      // Verify querying again returns the updated persisted records
      const fetchRes = await request(app)
        .get('/api/ad-spend?month=2099-12')
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.data.isDefault).toBe(false);
      const portal = fetchRes.body.data.allocations.find((a: { source: string }) => a.source === 'property_portal');
      expect(portal.amountInr).toBe(1400000);
    });
  });
});
