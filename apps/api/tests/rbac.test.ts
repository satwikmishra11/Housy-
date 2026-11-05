import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import type { AuthUser } from '@housy/shared';

describe('RBAC & Resource Ownership Matrix', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  let salesHeadUser: AuthUser;
  let salesHeadToken: string;

  let exec1User: AuthUser;
  let exec1Token: string;

  let exec2User: AuthUser;
  let exec2Token: string;

  let leadAssignedToExec1Id: string;
  let leadAssignedToExec2Id: string;

  beforeAll(async () => {
    // 1. Fetch Sales Head and Executives from seeded DB
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: 'executive' | 'sales_head';
      phone: string | null;
    }>(`SELECT id, name, email, role, phone FROM users ORDER BY email`);

    const headDb = usersRes.rows.find((u) => u.role === 'sales_head')!;
    salesHeadUser = { ...headDb };
    salesHeadToken = await signStaffToken(salesHeadUser);

    const execs = usersRes.rows.filter((u) => u.role === 'executive');
    const exec1Db = execs[0]!;
    const exec2Db = execs[1]!;

    exec1User = { ...exec1Db };
    exec1Token = await signStaffToken(exec1User);

    exec2User = { ...exec2Db };
    exec2Token = await signStaffToken(exec2User);

    // 2. Fetch or create a lead assigned to Exec 1 and a lead assigned to Exec 2
    const lead1Res = await query<{ id: string }>(
      `SELECT id FROM leads WHERE assigned_to = $1 LIMIT 1`,
      [exec1User.id],
    );
    if (lead1Res.rows.length > 0) {
      leadAssignedToExec1Id = lead1Res.rows[0]!.id;
    } else {
      const ins1 = await query<{ id: string }>(
        `INSERT INTO leads (name, source, assigned_to) VALUES ('Lead For Exec 1', 'website', $1) RETURNING id`,
        [exec1User.id],
      );
      leadAssignedToExec1Id = ins1.rows[0]!.id;
    }

    const lead2Res = await query<{ id: string }>(
      `SELECT id FROM leads WHERE assigned_to = $1 LIMIT 1`,
      [exec2User.id],
    );
    if (lead2Res.rows.length > 0) {
      leadAssignedToExec2Id = lead2Res.rows[0]!.id;
    } else {
      const ins2 = await query<{ id: string }>(
        `INSERT INTO leads (name, source, assigned_to) VALUES ('Lead For Exec 2', 'website', $1) RETURNING id`,
        [exec2User.id],
      );
      leadAssignedToExec2Id = ins2.rows[0]!.id;
    }
  });

  describe('Lead Resource Ownership: GET /api/leads/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/leads/${leadAssignedToExec1Id}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows Executive 1 to view their own assigned lead (200)', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${exec1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lead.id).toBe(leadAssignedToExec1Id);
    });

    it('denies Executive 2 from viewing Executive 1 assigned lead with 403 Forbidden (not 404)', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${exec2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Forbidden');
    });

    it('allows Executive 2 to view their own assigned lead (200), and denies Executive 1 (403)', async () => {
      const res2 = await request(app)
        .get(`/api/leads/${leadAssignedToExec2Id}`)
        .set('Authorization', `Bearer ${exec2Token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.lead.id).toBe(leadAssignedToExec2Id);

      const res1 = await request(app)
        .get(`/api/leads/${leadAssignedToExec2Id}`)
        .set('Authorization', `Bearer ${exec1Token}`);

      expect(res1.status).toBe(403);
      expect(res1.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Sales Head to view any assigned lead across the organization (200)', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lead.id).toBe(leadAssignedToExec1Id);
    });

    it('returns 404 when lead does not exist for both executive and sales head', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const resExec = await request(app)
        .get(`/api/leads/${nonExistentId}`)
        .set('Authorization', `Bearer ${exec1Token}`);
      expect(resExec.status).toBe(404);

      const resHead = await request(app)
        .get(`/api/leads/${nonExistentId}`)
        .set('Authorization', `Bearer ${salesHeadToken}`);
      expect(resHead.status).toBe(404);
    });
  });

  describe('Lead Resource Ownership: PATCH /api/leads/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .patch(`/api/leads/${leadAssignedToExec1Id}`)
        .set(CSRF_HEADER)
        .send({ wants: '3 BHK Luxury' });

      expect(res.status).toBe(401);
    });

    it('allows Executive 1 to edit their own assigned lead (200)', async () => {
      const res = await request(app)
        .patch(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${exec1Token}`)
        .set(CSRF_HEADER)
        .send({ wants: '3 BHK' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies Executive 2 from editing Executive 1 assigned lead with 403 Forbidden', async () => {
      const res = await request(app)
        .patch(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${exec2Token}`)
        .set(CSRF_HEADER)
        .send({ wants: '2 BHK' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Sales Head to edit any lead (200)', async () => {
      const res = await request(app)
        .patch(`/api/leads/${leadAssignedToExec1Id}`)
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set(CSRF_HEADER)
        .send({ wants: 'Penthouse' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Admin Permissions: Fact Sheet, Slot Rules, and Ad Spend', () => {
    const adminEndpoints = [
      { name: 'Fact Sheet Editor', path: '/api/fact-sheet' },
      { name: 'Slot Availability Rules', path: '/api/availability-rules' },
      { name: 'Marketing Ad Spend', path: '/api/ad-spend' },
    ];

    for (const ep of adminEndpoints) {
      it(`${ep.name} (${ep.path}) returns 401 when unauthenticated`, async () => {
        const res = await request(app)
          .post(ep.path)
          .set(CSRF_HEADER)
          .send({});

        expect(res.status).toBe(401);
      });

      it(`${ep.name} (${ep.path}) returns 403 Forbidden for Sales Executive`, async () => {
        const res = await request(app)
          .post(ep.path)
          .set('Authorization', `Bearer ${exec1Token}`)
          .set(CSRF_HEADER)
          .send({});

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.body.error.message).toContain('Insufficient permissions');
      });

      it(`${ep.name} (${ep.path}) returns 200 OK for Sales Head`, async () => {
        const res = await request(app)
          .post(ep.path)
          .set('Authorization', `Bearer ${salesHeadToken}`)
          .set(CSRF_HEADER)
          .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    }
  });
});
