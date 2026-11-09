import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';
import type { AuthUser } from '@housy/shared';

describe('GET /api/executive/today - Priority Action Queue Cockpit', () => {
  const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };

  let executiveUser: AuthUser;
  let executiveToken: string;
  let salesHeadUser: AuthUser;
  let salesHeadToken: string;

  beforeAll(async () => {
    const usersRes = await query<{
      id: string;
      name: string;
      email: string;
      role: 'executive' | 'sales_head';
      phone: string | null;
    }>(`SELECT id, name, email, role, phone FROM users WHERE active = true ORDER BY role ASC`);

    const execDb = usersRes.rows.find((u) => u.role === 'executive');
    if (!execDb) {
      throw new Error('No active executive found in database');
    }
    executiveUser = { ...execDb };
    executiveToken = await signStaffToken(executiveUser);

    const headDb = usersRes.rows.find((u) => u.role === 'sales_head');
    if (!headDb) {
      throw new Error('No active sales_head found in database');
    }
    salesHeadUser = { ...headDb };
    salesHeadToken = await signStaffToken(salesHeadUser);
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/executive/today')
      .set(CSRF_HEADER);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 and structured today briefing for logged-in executive', async () => {
    const res = await request(app)
      .get('/api/executive/today')
      .set('Authorization', `Bearer ${executiveToken}`)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(Array.isArray(data.visitsToday)).toBe(true);
    expect(Array.isArray(data.awaitingOutcome)).toBe(true);
    expect(Array.isArray(data.newHandoffs)).toBe(true);
    expect(Array.isArray(data.unansweredLeads)).toBe(true);
    expect(data.summaryCounts).toEqual({
      visitsToday: data.visitsToday.length,
      awaitingOutcome: data.awaitingOutcome.length,
      newHandoffs: data.newHandoffs.length,
      unansweredLeads: data.unansweredLeads.length,
    });
  });

  it('allows Sales Head to fetch executive briefing without query param', async () => {
    const res = await request(app)
      .get('/api/executive/today')
      .set('Authorization', `Bearer ${salesHeadToken}`)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summaryCounts).toBeDefined();
  });

  it('allows Sales Head to filter by specific executiveId', async () => {
    const res = await request(app)
      .get(`/api/executive/today?executiveId=${executiveUser.id}`)
      .set('Authorization', `Bearer ${salesHeadToken}`)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summaryCounts).toBeDefined();
  });

  it('rejects invalid executiveId query parameter with 400 ValidationError', async () => {
    const res = await request(app)
      .get('/api/executive/today?executiveId=not-a-valid-uuid')
      .set('Authorization', `Bearer ${salesHeadToken}`)
      .set(CSRF_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

