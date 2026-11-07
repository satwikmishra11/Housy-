import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import { leadRepository } from '../src/repositories/lead.repository.js';
import type { AuthUser } from '@housy/shared';

describe('Lead Ingest, Deduplication, Merge & Role Scoping', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };
  const PORTAL_KEY_HEADER = { 'X-Source-Key': 'portal_demo_key_123' };
  const SOCIAL_KEY_HEADER = { 'X-Source-Key': 'social_demo_key_123' };

  function makePhone(): string {
    const rand = Math.floor(10000000 + Math.random() * 90000000);
    return `98${rand}`;
  }

  let salesHeadToken: string;
  let exec1User: AuthUser;
  let exec1Token: string;
  let exec2User: AuthUser;
  let exec2Token: string;
  let projectId: string;

  beforeAll(async () => {
    // 1. Get staff users
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: 'executive' | 'sales_head';
      phone: string | null;
    }>(`SELECT id, name, email, role, phone FROM users WHERE active = true ORDER BY email`);

    const headDb = usersRes.rows.find((u) => u.role === 'sales_head')!;
    salesHeadToken = await signStaffToken({ ...headDb });

    const execs = usersRes.rows.filter((u) => u.role === 'executive');
    exec1User = { ...execs[0]! };
    exec1Token = await signStaffToken(exec1User);

    exec2User = { ...execs[1]! };
    exec2Token = await signStaffToken(exec2User);

    // 2. Get a project ID
    const projRes = await query<{ id: string }>(`SELECT id FROM projects LIMIT 1`);
    projectId = projRes.rows[0]!.id;
  });

  describe('Authentication & API Keys on /api/ingest/:source', () => {
    it('rejects ingest without API key with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .send({
          name: 'Anonymous Ingest',
          phone: '9825099991',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or wrong API key with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .set('X-Source-Key', 'wrong_secret_key')
        .send({
          name: 'Anonymous Ingest',
          phone: '9825099991',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid source param with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/ingest/billboard_ad')
        .set('X-Source-Key', 'portal_demo_key_123')
        .send({
          name: 'Bad Source Lead',
          phone: '9825099991',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('Deduplication & Ingest Branches', () => {
    let testPhone1: string;
    let testEmail1: string;

    beforeAll(() => {
      testPhone1 = makePhone();
      testEmail1 = `buyer_${Date.now()}@ahmedabad.test`;
    });

    it('Branch 1: Creates a new lead when phone and email are new', async () => {
      const uniqueName = `UniqueBuyer_${Date.now()}`;
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: uniqueName,
          phone: testPhone1,
          email: testEmail1,
          projectId,
          wants: '3 BHK',
          consent: true,
          externalId: `EXT-PORTAL-${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe('created');
      expect(res.body.leadId).toBeDefined();

      // Check consent and outbound message queued
      const msgRes = await query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM outbound_messages WHERE lead_id = $1 AND template_key = 'first_response_link'`,
        [res.body.leadId],
      );
      expect(msgRes.rows[0]?.count).toBe(1);

      // Check first_response_at was recorded
      const leadRes = await query<{ first_response_at: Date; source: string }>(
        `SELECT first_response_at, source FROM leads WHERE id = $1`,
        [res.body.leadId],
      );
      expect(leadRes.rows[0]?.first_response_at).not.toBeNull();
      expect(leadRes.rows[0]?.source).toBe('property_portal');
    });

    it('Branch 2: Idempotent ingest returns existing lead without duplicate creation', async () => {
      const extId = `EXT-PORTAL-IDEM-${Date.now()}`;
      const p = makePhone();

      // First call
      await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: 'Rajesh G. Vora',
          phone: p,
          projectId,
          externalId: extId,
        });

      // Second identical call
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: 'Rajesh G. Vora',
          phone: p,
          projectId,
          externalId: extId,
        });

      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('idempotent');
    });

    it('Branch 3: Exact phone match merges touchpoint and retains original source attribution', async () => {
      const res = await request(app)
        .post('/api/ingest/social_ad')
        .set(SOCIAL_KEY_HEADER)
        .send({
          name: 'Rajesh Vora',
          phone: `+91 ${testPhone1.slice(0, 5)}-${testPhone1.slice(5)}`, // Same phone, formatted
          projectId,
          externalId: `FB-LEAD-${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('merged');

      // Verify touchpoints count increased to 2
      const tpRes = await query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM lead_touchpoints WHERE lead_id = $1`,
        [res.body.leadId],
      );
      expect(tpRes.rows[0]?.count).toBe(2);

      // Verify original first-touch source is still property_portal
      const leadRes = await query<{ source: string }>(
        `SELECT source FROM leads WHERE id = $1`,
        [res.body.leadId],
      );
      expect(leadRes.rows[0]?.source).toBe('property_portal');
    });

    it('Branch 4: Exact email match merges into existing lead', async () => {
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: 'R. Vora',
          email: `  ${testEmail1.toUpperCase()} `, // Same email, un-normalized
          projectId,
          externalId: `EXT-PORTAL-EMAIL-${Date.now()}`,
        });

      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('merged');
    });

    it('Branch 5: Fuzzy name match (>= 0.85) on same project flags possible duplicate', async () => {
      const p1 = makePhone();
      const p2 = makePhone();
      const uniqueBase = `ShaileshPatel_${Date.now()}`;

      // Create primary lead with distinct phone
      const primaryRes = await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: uniqueBase,
          phone: p1,
          projectId,
          wants: '2 BHK',
        });
      expect(primaryRes.status).toBe(201);
      const primaryId = primaryRes.body.leadId;

      // Ingest lead with same project and slight name variation (similarity >= 0.85)
      const dupRes = await request(app)
        .post('/api/ingest/social_ad')
        .set(SOCIAL_KEY_HEADER)
        .send({
          name: `${uniqueBase} V`,
          phone: p2, // Different phone
          projectId, // Same project
          wants: '2 BHK',
        });

      expect(dupRes.status).toBe(200);
      expect(dupRes.body.outcome).toBe('possible_duplicate');
      expect(dupRes.body.duplicateOf).toBe(primaryId);
    });

    it('Branch 6: Non-consenting lead marks consent withdrawn and queues 0 outbound messages', async () => {
      const uniqueName = `Unconsenting_${Date.now()}`;
      const res = await request(app)
        .post('/api/ingest/property_portal')
        .set(PORTAL_KEY_HEADER)
        .send({
          name: uniqueName,
          phone: makePhone(),
          projectId,
          consent: false,
        });

      expect(res.status).toBe(201);

      const leadRes = await query<{ consent_status: string; first_response_at: Date | null }>(
        `SELECT consent_status, first_response_at FROM leads WHERE id = $1`,
        [res.body.leadId],
      );
      expect(leadRes.rows[0]?.consent_status).toBe('withdrawn');
      expect(leadRes.rows[0]?.first_response_at).toBeNull();

      // No outbound messages should be queued
      const msgRes = await query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM outbound_messages WHERE lead_id = $1`,
        [res.body.leadId],
      );
      expect(msgRes.rows[0]?.count).toBe(0);
    });
  });

  describe('Anonymous Web Chat & Late Phone Arrival', () => {
    it('merges conversation into existing lead when phone matches existing customer', async () => {
      const phone = makePhone();
      // 1. Existing customer
      const existing = await leadRepository.createLead({
        name: 'Bhavin Soni',
        phoneE164: `+91${phone}`,
        email: null,
        source: 'property_portal',
      });

      // 2. Anonymous web chat lead starts a conversation
      const anonLead = await leadRepository.createLead({
        name: 'Website Visitor',
        phoneE164: null,
        email: null,
        source: 'website',
      });
      const convRes = await query<{ id: string }>(
        `INSERT INTO conversations (lead_id, status, language) VALUES ($1, 'ai', 'en') RETURNING id`,
        [anonLead.id],
      );
      const conversationId = convRes.rows[0]!.id;

      // 3. Late phone arrival matches Bhavin Soni's phone
      const attachRes = await request(app)
        .post(`/api/conversations/${conversationId}/phone`)
        .send({ phone: `0${phone}`, name: 'Bhavin' });

      expect(attachRes.status).toBe(200);
      expect(attachRes.body.outcome).toBe('merged');
      expect(attachRes.body.leadId).toBe(existing.id);

      // Verify conversation now belongs to existing lead
      const checkConv = await query<{ lead_id: string }>(
        `SELECT lead_id FROM conversations WHERE id = $1`,
        [conversationId],
      );
      expect(checkConv.rows[0]?.lead_id).toBe(existing.id);

      // Verify anonymous stub lead was deleted
      const checkStub = await query(`SELECT id FROM leads WHERE id = $1`, [anonLead.id]);
      expect(checkStub.rows.length).toBe(0);
    });
  });

  describe('Manual Merge Transaction & Rollback', () => {
    it('merges secondary lead into primary lead atomically', async () => {
      const p1 = makePhone();
      const p2 = makePhone();

      // Create primary lead
      const primary = await leadRepository.createLead({
        name: 'Jignesh Panchal',
        phoneE164: `+91${p1}`,
        email: `jignesh_${Date.now()}@ahmedabad.test`,
        source: 'website',
      });

      // Create secondary lead with touchpoint
      const secondary = await leadRepository.createLead({
        name: 'Jignesh M. Panchal',
        phoneE164: `+91${p2}`,
        email: null,
        source: 'social_ad',
      });
      const extId = `FB-TOUCH-${Date.now()}`;
      await leadRepository.addTouchpoint({
        leadId: secondary.id,
        source: 'social_ad',
        channel: 'facebook',
        externalId: extId,
      });

      // Merge secondary into primary as Sales Head
      const mergeRes = await request(app)
        .post('/api/leads/merge')
        .set('Cookie', `staff_token=${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          primaryLeadId: primary.id,
          secondaryLeadId: secondary.id,
        });

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.success).toBe(true);

      // Verify secondary lead was deleted
      const secondaryCheck = await query(`SELECT id FROM leads WHERE id = $1`, [secondary.id]);
      expect(secondaryCheck.rows.length).toBe(0);

      // Verify touchpoint was moved to primary
      const tpCheck = await query<{ lead_id: string }>(
        `SELECT lead_id FROM lead_touchpoints WHERE external_id = $1`,
        [extId],
      );
      expect(tpCheck.rows[0]?.lead_id).toBe(primary.id);
    });

    it('rolls back cleanly on invalid merge without corrupting data', async () => {
      const res = await request(app)
        .post('/api/leads/merge')
        .set('Cookie', `staff_token=${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          primaryLeadId: 'a0000000-0000-4000-8000-000000000001',
          secondaryLeadId: 'a0000000-0000-4000-8000-000000000002',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('Role-Scoped Lead Listing & Detail Access', () => {
    let leadAssignedToExec1Id: string;
    let leadAssignedToExec2Id: string;

    beforeAll(async () => {
      const p1 = makePhone();
      const p2 = makePhone();

      const l1 = await leadRepository.createLead({
        name: 'Exec 1 Lead Exclusive',
        phoneE164: `+91${p1}`,
        email: null,
        source: 'website',
      });
      await query(`UPDATE leads SET assigned_to = $1 WHERE id = $2`, [exec1User.id, l1.id]);
      leadAssignedToExec1Id = l1.id;

      const l2 = await leadRepository.createLead({
        name: 'Exec 2 Lead Exclusive',
        phoneE164: `+91${p2}`,
        email: null,
        source: 'website',
      });
      await query(`UPDATE leads SET assigned_to = $1 WHERE id = $2`, [exec2User.id, l2.id]);
      leadAssignedToExec2Id = l2.id;
    });

    it('Sales Executive only sees leads assigned to them on GET /api/leads', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set('Cookie', `staff_token=${exec1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Every returned lead must be assigned to Exec 1
      for (const lead of res.body.data) {
        expect(lead.assignedTo).toBe(exec1User.id);
      }
      expect(res.body.data.some((l: { id: string }) => l.id === leadAssignedToExec1Id)).toBe(true);

      // Verify Exec 2 sees their own assigned lead
      const res2 = await request(app)
        .get('/api/leads')
        .set('Cookie', `staff_token=${exec2Token}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data.every((l: { assignedTo: string }) => l.assignedTo === exec2User.id)).toBe(true);
    });

    it('Sales Head sees leads from all executives on GET /api/leads', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set('Cookie', `staff_token=${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThan(1);
    });

    it('Sales Executive accessing another executive lead receives 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadAssignedToExec2Id}`)
        .set('Cookie', `staff_token=${exec1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Sales Head can access any lead on GET /api/leads/:id', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadAssignedToExec2Id}`)
        .set('Cookie', `staff_token=${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(leadAssignedToExec2Id);
    });
  });

  describe('CSV Import Preview & Commit', () => {
    it('previews CSV rows identifying new, duplicate, and invalid rows with reasons', async () => {
      const existingPhone = makePhone();
      await leadRepository.createLead({
        name: 'Existing Customer',
        phoneE164: `+91${existingPhone}`,
        email: null,
        source: 'property_portal',
      });

      const rows = [
        // 1. Valid new lead
        {
          Name: 'New CSV Buyer',
          Phone: makePhone(),
          Email: 'new.csv@test.in',
          Wants: '3 BHK',
        },
        // 2. Duplicate lead by phone
        {
          Name: 'Existing Customer Duplicate',
          Phone: existingPhone,
          Email: 'duplicate@test.in',
        },
        // 3. Invalid row: missing name
        {
          Name: '',
          Phone: makePhone(),
        },
        // 4. Invalid row: bad phone & missing email
        {
          Name: 'Bad Phone Buyer',
          Phone: '12345',
        },
      ];

      const res = await request(app)
        .post('/api/leads/csv-preview')
        .set('Cookie', `staff_token=${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({ rows, source: 'property_portal' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(4);
      expect(res.body.validCount).toBe(2);
      expect(res.body.invalidCount).toBe(2);

      const previewRows = res.body.rows;
      expect(previewRows[0].classification).toBe('new');
      expect(previewRows[1].classification).toBe('duplicate');
      expect(previewRows[2].classification).toBe('invalid');
      expect(previewRows[2].errors).toContain('Name is required');
      expect(previewRows[3].classification).toBe('invalid');
      expect(previewRows[3].errors.some((e: string) => e.includes('Invalid Indian mobile phone'))).toBe(true);
    });

    it('commits valid CSV rows successfully', async () => {
      const p1 = makePhone();
      const p2 = makePhone();
      const timestamp = Date.now();

      const res = await request(app)
        .post('/api/leads/csv-commit')
        .set('Cookie', `staff_token=${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({
          source: 'property_portal',
          rows: [
            {
              name: `Aarav_Buyer_${timestamp}`,
              phone: `+91${p1}`,
              email: `commit1_${timestamp}@test.in`,
              wants: '2 BHK',
              consent: true,
            },
            {
              name: `Zoya_Buyer_${timestamp}`,
              phone: `+91${p2}`,
              email: null,
              wants: '3 BHK',
              consent: false,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.imported).toBe(2);
    });
  });

  describe('Keep Separate Action', () => {
    it('clears possible_duplicate_of reference when keep-separate is requested', async () => {
      const p1 = makePhone();
      const p2 = makePhone();
      const lead1 = await leadRepository.createLead({
        name: 'Duplicate Root',
        phoneE164: `+91${p1}`,
        email: null,
        source: 'website',
      });
      const lead2 = await leadRepository.createLead({
        name: 'Duplicate Flagged',
        phoneE164: `+91${p2}`,
        email: null,
        source: 'website',
        possibleDuplicateOf: lead1.id,
      });

      const res = await request(app)
        .post(`/api/leads/${lead2.id}/keep-separate`)
        .set('Cookie', `staff_token=${salesHeadToken}`)
        .set(CSRF_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await leadRepository.findById(lead2.id);
      expect(check?.possible_duplicate_of).toBeNull();
    });
  });
});
