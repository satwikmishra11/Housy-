import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { signStaffToken } from '../src/auth/tokens.js';

describe('Sales Analytics & Executive Performance Dashboard', () => {
  let headToken: string;
  let exec1Token: string;
  let exec2Token: string;
  let headUserId: string;
  let exec1Id: string;
  let exec2Id: string;
  let projectId: string;

  const TEST_FROM = '2026-06-01';
  const TEST_TO = '2026-06-30';

  beforeAll(async () => {
    // 1. Create a dedicated test project for complete isolation from parallel tests
    const projRes = await query<{ id: string }>(
      `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
       VALUES ('Dashboard Isolated Heights', 'PR/GJ/TEST/DASHBOARD/001', 'SG Highway, Ahmedabad', 23.0225, 72.5714, ARRAY['2 BHK', '3 BHK'])
       RETURNING id`,
    );
    projectId = projRes.rows[0]!.id;

    // 2. Create isolated test staff users (active = false so other test suites will never assign them)
    const headRes = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, phone, active)
       VALUES ('Dash Head', 'dash.head@fixture.test', 'hash123', 'sales_head', '+919825000099', false)
       ON CONFLICT (email) DO UPDATE SET active = false
       RETURNING id`,
    );
    headUserId = headRes.rows[0]!.id;

    const exec1Res = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, phone, active)
       VALUES ('Dash Exec One', 'dash.exec1@fixture.test', 'hash123', 'executive', '+919825000091', false)
       ON CONFLICT (email) DO UPDATE SET active = false
       RETURNING id`,
    );
    exec1Id = exec1Res.rows[0]!.id;

    const exec2Res = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, phone, active)
       VALUES ('Dash Exec Two', 'dash.exec2@fixture.test', 'hash123', 'executive', '+919825000092', false)
       ON CONFLICT (email) DO UPDATE SET active = false
       RETURNING id`,
    );
    exec2Id = exec2Res.rows[0]!.id;

    headToken = await signStaffToken({
      id: headUserId,
      email: 'dash.head@fixture.test',
      role: 'sales_head',
      name: 'Dash Head',
      phone: '+919825000099',
    });

    exec1Token = await signStaffToken({
      id: exec1Id,
      email: 'dash.exec1@fixture.test',
      role: 'executive',
      name: 'Dash Exec One',
      phone: '+919825000091',
    });

    exec2Token = await signStaffToken({
      id: exec2Id,
      email: 'dash.exec2@fixture.test',
      role: 'executive',
      name: 'Dash Exec Two',
      phone: '+919825000092',
    });

    // 3. Build Hand-Crafted Test Fixture (6 known leads attached to isolated project and users)
    // Lead 1: property_portal, response 120s (2m), visited, assigned to exec1
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead One', 'lead1@fixture.test', '+919100000001', 'property_portal', $1, '3 BHK', 'visited', $2, '2026-06-10T10:00:00Z', '2026-06-10T10:02:00Z')`,
      [projectId, exec1Id],
    );

    // Lead 2: property_portal, response 360s (6m), no_show, assigned to exec1
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead Two', 'lead2@fixture.test', '+919100000002', 'property_portal', $1, '2 BHK', 'no_show', $2, '2026-06-10T11:00:00Z', '2026-06-10T11:06:00Z')`,
      [projectId, exec1Id],
    );

    // Lead 3: social_ad, response 49 hours (176400s > 48h boundary), engaged, assigned to exec2
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead Three', 'lead3@fixture.test', '+919100000003', 'social_ad', $1, '3 BHK', 'engaged', $2, '2026-06-11T09:00:00Z', '2026-06-13T10:00:00Z')`,
      [projectId, exec2Id],
    );

    // Lead 4: social_ad, response 300s (5m), visit_booked, assigned to exec2
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead Four', 'lead4@fixture.test', '+919100000004', 'social_ad', $1, '2 BHK', 'visit_booked', $2, '2026-06-12T14:00:00Z', '2026-06-12T14:05:00Z')`,
      [projectId, exec2Id],
    );

    // Lead 5: website, never responded (unreached > 48h), status 'new', assigned to exec1
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead Five', 'lead5@fixture.test', '+919100000005', 'website', $1, '3 BHK', 'new', $2, '2026-06-05T08:00:00Z', NULL)`,
      [projectId, exec1Id],
    );

    // Lead 6: hoarding_call, response 60s (1m), visited, assigned to exec2
    await query(
      `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, assigned_to, first_touch_at, first_response_at)
       VALUES ('Lead Six', 'lead6@fixture.test', '+919100000006', 'hoarding_call', $1, '2 BHK', 'visited', $2, '2026-06-15T12:00:00Z', '2026-06-15T12:01:00Z')`,
      [projectId, exec2Id],
    );
  });

  afterAll(async () => {
    await query('DELETE FROM leads WHERE project_id = $1', [projectId]);
    await query('DELETE FROM projects WHERE id = $1', [projectId]);
  });

  describe('Mathematical Metric Calculations on Known Fixture', () => {
    it('computes exact median first response time across responded leads', async () => {
      // 5 responded leads with response times in seconds: [60, 120, 300, 360, 176400]
      // 50th percentile (median) is exactly 300s (5m)
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.body.summary.medianFirstResponseSeconds).toBe(300);
      expect(res.body.summary.medianFirstResponseFormatted).toBe('5m');
    });

    it('computes leads not reached within 48 hours boundary accurately', async () => {
      // Out of 6 leads:
      // Lead 3 (first_response took 49h > 48h) and Lead 5 (no response, created in June > 48h ago) = 2 leads
      // 2 / 6 = 33.3%
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.body.summary.unreached48hCount).toBe(2);
      expect(res.body.summary.unreached48hPercent).toBe(33.3);
      expect(res.body.summary.unreached48hFormatted).toBe('33.3%');
    });

    it('computes show-up rate and lead-to-visit conversion rates', async () => {
      // Total leads: 6
      // Engaged leads: 5 (Lead 1 visited, Lead 2 no_show, Lead 3 engaged, Lead 4 booked, Lead 6 visited)
      // Visits booked: 4 (Lead 1, Lead 2, Lead 4, Lead 6)
      // Visits completed: 2 (Lead 1, Lead 6)
      // Visits no_show: 1 (Lead 2)
      // Show-up rate: completed / (completed + no_show) = 2 / (2 + 1) = 66.7%
      // Lead-to-visit rate: completed / total = 2 / 6 = 33.3%
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.body.summary.totalLeads).toBe(6);
      expect(res.body.summary.engagedLeads).toBe(5);
      expect(res.body.summary.visitsBooked).toBe(4);
      expect(res.body.summary.visitsCompleted).toBe(2);
      expect(res.body.summary.visitsNoShow).toBe(1);

      expect(res.body.summary.showUpRate).toBeCloseTo(0.6667, 3);
      expect(res.body.summary.showUpRateFormatted).toBe('66.7%');

      expect(res.body.summary.leadToVisitRate).toBeCloseTo(0.3333, 3);
      expect(res.body.summary.leadToVisitRateFormatted).toBe('33.3%');
    });

    it('validates 48-hour boundary: recent lead under 48h is NOT marked unreached', async () => {
      // Insert temporary recent lead 2 hours old without response in the isolated project
      const recentRes = await query<{ id: string }>(
        `INSERT INTO leads (name, email, phone_e164, source, project_id, wants, status, first_touch_at, first_response_at)
         VALUES ('Fresh Lead', 'fresh@fixture.test', '+919100000099', 'website', $1, '2 BHK', 'new', NOW() - INTERVAL '2 hours', NULL)
         RETURNING id`,
        [projectId],
      );

      try {
        const res = await request(app)
          .get(`/api/dashboard/metrics?period=7d&projectId=${projectId}`)
          .set('Authorization', `Bearer ${headToken}`)
          .expect(200);

        // The 2-hour-old lead is within SLA window, unreached48hCount must be 0
        expect(res.body.summary.unreached48hCount).toBe(0);
      } finally {
        await query('DELETE FROM leads WHERE id = $1', [recentRes.rows[0]!.id]);
      }
    });
  });

  describe('First-Touch Source Attribution & Performance Breakdown', () => {
    it('aggregates leads, response times, visits, and show-up rates by source', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      const bySource = res.body.bySource;
      expect(bySource).toBeInstanceOf(Array);
      expect(bySource.length).toBe(4);

      // Property portal: Lead 1 (completed, 120s) and Lead 2 (no_show, 360s)
      const portal = bySource.find((s: { source: string }) => s.source === 'property_portal');
      expect(portal).toBeDefined();
      expect(portal.leadsCount).toBe(2);
      expect(portal.visitsBooked).toBe(2);
      expect(portal.visitsCompleted).toBe(1);
      expect(portal.visitsNoShow).toBe(1);
      // Show-up rate = 1 / (1 + 1) = 50.0%
      expect(portal.showUpRate).toBe(0.5);
      expect(portal.showUpRateFormatted).toBe('50.0%');
      // Median response of 120s and 360s = 240s (4m)
      expect(portal.medianResponseSeconds).toBe(240);
      expect(portal.medianResponseFormatted).toBe('4m');
      // Prorated spend for June (30 days = 100% of ₹12 Lakh)
      expect(portal.spendInr).toBe(1200000);
      // Cost per completed visit = 12,00,000 / 1 = 12,00,000
      expect(portal.costPerVisitInr).toBe(1200000);
      expect(portal.costPerVisitFormatted).toBe('₹12,00,000');

      // Social ad: Lead 3 (engaged, 176400s) and Lead 4 (booked, 300s)
      const social = bySource.find((s: { source: string }) => s.source === 'social_ad');
      expect(social.leadsCount).toBe(2);
      expect(social.visitsBooked).toBe(1);
      expect(social.visitsCompleted).toBe(0);
      // Zero completed visits: safe divide-by-zero
      expect(social.showUpRate).toBeNull();
      expect(social.showUpRateFormatted).toBe('-');
      expect(social.costPerVisitInr).toBeNull();
      expect(social.costPerVisitFormatted).toBe('-');

      // Website: Lead 5 (1 lead, unreached, 0 completed visits)
      const website = bySource.find((s: { source: string }) => s.source === 'website');
      expect(website.leadsCount).toBe(1);
      expect(website.visitsCompleted).toBe(0);
      expect(website.costPerVisitFormatted).toBe('-');
    });

    it('includes conversion funnel stages with progression percentages', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      const funnel = res.body.funnel;
      expect(funnel).toHaveLength(4);

      expect(funnel[0].stage).toBe('leads');
      expect(funnel[0].count).toBe(6);

      expect(funnel[1].stage).toBe('engaged');
      expect(funnel[1].count).toBe(5);
      expect(funnel[1].conversionFromPreviousFormatted).toBe('83.3%');

      expect(funnel[2].stage).toBe('booked');
      expect(funnel[2].count).toBe(4);
      expect(funnel[2].conversionFromPreviousFormatted).toBe('80.0%');

      expect(funnel[3].stage).toBe('visited');
      expect(funnel[3].count).toBe(2);
      expect(funnel[3].conversionFromPreviousFormatted).toBe('50.0%');
    });
  });

  describe('Role-Based Scoping (RBAC)', () => {
    it('sales head sees aggregate metrics across all 6 leads', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.body.userRole).toBe('sales_head');
      expect(res.body.summary.totalLeads).toBe(6);
      expect(res.body.summary.visitsCompleted).toBe(2);
    });

    it('sales executive 1 sees only their own assigned leads (Leads 1, 2, 5)', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${exec1Token}`)
        .expect(200);

      expect(res.body.userRole).toBe('executive');
      expect(res.body.scopedExecutiveId).toBe(exec1Id);
      // Executive 1 owns Leads 1, 2, 5
      expect(res.body.summary.totalLeads).toBe(3);
      expect(res.body.summary.visitsCompleted).toBe(1);
      expect(res.body.summary.visitsNoShow).toBe(1);
      expect(res.body.summary.showUpRateFormatted).toBe('50.0%');
    });

    it('sales executive 2 sees only their own assigned leads (Leads 3, 4, 6)', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${exec2Token}`)
        .expect(200);

      expect(res.body.userRole).toBe('executive');
      expect(res.body.scopedExecutiveId).toBe(exec2Id);
      // Executive 2 owns Leads 3, 4, 6
      expect(res.body.summary.totalLeads).toBe(3);
      expect(res.body.summary.visitsCompleted).toBe(1);
      expect(res.body.summary.visitsNoShow).toBe(0);
      expect(res.body.summary.showUpRateFormatted).toBe('100.0%');
    });
  });

  describe('Empty Periods & Divide-by-Zero Safety', () => {
    it('handles empty periods with zero leads cleanly and returns "-" for all ratios', async () => {
      // Query a period in 2024 where no test leads exist
      const res = await request(app)
        .get(`/api/dashboard/metrics?period=custom&from=2024-01-01&to=2024-01-15&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.body.summary.totalLeads).toBe(0);
      expect(res.body.summary.engagedLeads).toBe(0);
      expect(res.body.summary.visitsCompleted).toBe(0);

      expect(res.body.summary.medianFirstResponseFormatted).toBe('-');
      expect(res.body.summary.unreached48hFormatted).toBe('-');
      expect(res.body.summary.showUpRateFormatted).toBe('-');
      expect(res.body.summary.leadToVisitRateFormatted).toBe('-');
      expect(res.body.summary.isSmallSample).toBe(true);

      for (const item of res.body.bySource) {
        expect(item.leadsCount).toBe(0);
        expect(item.medianResponseFormatted).toBe('-');
        expect(item.showUpRateFormatted).toBe('-');
        expect(item.costPerVisitFormatted).toBe('-');
      }
    });
  });

  describe('CSV Export Endpoint', () => {
    it('exports period metrics as an attachment with correct CSV headers and format', async () => {
      const res = await request(app)
        .get(`/api/dashboard/export-csv?period=custom&from=${TEST_FROM}&to=${TEST_TO}&projectId=${projectId}`)
        .set('Authorization', `Bearer ${headToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('sales-dashboard-custom');

      const csv = res.text;
      expect(csv).toContain('HOUSY SALES ANALYTICS REPORT');
      expect(csv).toContain('EXECUTIVE SUMMARY METRICS');
      expect(csv).toContain('Median First Response Time');
      expect(csv).toContain('PERFORMANCE BY MARKETING SOURCE');
      expect(csv).toContain('Property Portal');
      expect(csv).toContain('CONVERSION FUNNEL PROGRESSION');
      expect(csv).toContain('Total Ingested Leads');
    });
  });
});
