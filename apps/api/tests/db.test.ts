import { describe, it, expect } from 'vitest';
import { query } from '../src/db/index.js';

describe('Database Schema & Seed Verification', () => {
  it('contains all required tables', async () => {
    const expectedTables = [
      'users',
      'projects',
      'fact_entries',
      'fact_entry_versions',
      'leads',
      'lead_touchpoints',
      'consents',
      'conversations',
      'messages',
      'availability_rules',
      'blackout_dates',
      'visit_slots',
      'visit_bookings',
      'handoffs',
      'reminders',
      'outbound_messages',
      'ad_spend',
      'audit_log',
      'llm_calls',
      'unanswered_questions',
    ];

    const res = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const existingTables = res.rows.map((r) => r.table_name);

    for (const t of expectedTables) {
      expect(existingTables).toContain(t);
    }
  });

  it('contains the 3 sample leads from the client brief verbatim', async () => {
    const res = await query<{
      public_id: string;
      name: string;
      source: string;
      wants: string;
      status: string;
    }>(
      `SELECT public_id, name, source, wants, status FROM leads
       WHERE public_id IN ('LD-58210', 'LD-58211', 'LD-58224')
       ORDER BY public_id`,
    );

    expect(res.rows).toHaveLength(3);

    const hardik = res.rows.find((r) => r.public_id === 'LD-58210');
    expect(hardik).toBeDefined();
    expect(hardik?.name).toBe('Hardik Patel');
    expect(hardik?.source).toBe('property_portal');
    expect(hardik?.wants).toBe('3 BHK');
    expect(['visit_booked', 'visited']).toContain(hardik?.status);

    const nidhi = res.rows.find((r) => r.public_id === 'LD-58211');
    expect(nidhi).toBeDefined();
    expect(nidhi?.name).toBe('Nidhi Shah');
    expect(nidhi?.source).toBe('social_ad');
    expect(nidhi?.wants).toBe('2 BHK');

    const kavita = res.rows.find((r) => r.public_id === 'LD-58224');
    expect(kavita).toBeDefined();
    expect(kavita?.name).toBe('Kavita Joshi');
    expect(kavita?.source).toBe('hoarding_call');
    expect(kavita?.status).toBe('visited');
  });

  it('verifies ~25 fact entries per project with price ranges only', async () => {
    const res = await query<{ project_name: string; count: number }>(
      `SELECT p.name AS project_name, count(f.id)::int AS count
       FROM projects p
       JOIN fact_entries f ON f.project_id = p.id
       GROUP BY p.name`,
    );

    expect(res.rows.length).toBe(2);
    for (const row of res.rows) {
      expect(row.count).toBeGreaterThanOrEqual(24);
    }

    // Verify all price quotes are ranges (contain 'to')
    const priceFacts = await query<{ key: string; value: string }>(
      `SELECT key, value FROM fact_entries WHERE category = 'pricing' AND key LIKE 'price_%'`,
    );
    expect(priceFacts.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of priceFacts.rows) {
      expect(row.value.toLowerCase()).toContain('to');
    }
  });

  it('enforces partial unique index preventing duplicate active bookings on slot', async () => {
    // Find an open slot
    const slotRes = await query<{ id: string; project_id: string }>(
      `SELECT id, project_id FROM visit_slots WHERE status = 'open' LIMIT 1`,
    );
    expect(slotRes.rows.length).toBe(1);
    const slotId = slotRes.rows[0]!.id;

    // Pick two distinct leads who do NOT currently have an active confirmed booking
    const leadsRes = await query<{ id: string }>(
      `SELECT id FROM leads WHERE id NOT IN (SELECT lead_id FROM visit_bookings WHERE status = 'confirmed') LIMIT 2`,
    );
    expect(leadsRes.rows.length).toBe(2);
    const lead1 = leadsRes.rows[0]!.id;
    const lead2 = leadsRes.rows[1]!.id;

    // Insert first booking
    await query(
      `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
       VALUES ($1, $2, 'confirmed', 'test-slot-dup-1')`,
      [lead1, slotId],
    );

    // Attempt second confirmed booking on the SAME slot (should throw unique constraint error)
    await expect(
      query(
        `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
         VALUES ($1, $2, 'confirmed', 'test-slot-dup-2')`,
        [lead2, slotId],
      ),
    ).rejects.toThrow(/idx_visit_bookings_unique_active_slot/);

    // Clean up test booking
    await query(`DELETE FROM visit_bookings WHERE idempotency_key = 'test-slot-dup-1'`);
  });

  it('verifies monthly ad spend totals ₹30 Lakh per month across 4 sources', async () => {
    const res = await query<{ month: string; total_inr: string }>(
      `SELECT month::text, sum(amount_inr)::text AS total_inr
       FROM ad_spend
       GROUP BY month
       ORDER BY month`,
    );

    expect(res.rows.length).toBe(3);
    for (const row of res.rows) {
      expect(parseFloat(row.total_inr)).toBe(3000000.0);
    }
  });
});
