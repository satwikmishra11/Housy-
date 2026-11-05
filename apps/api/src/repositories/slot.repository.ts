import type { PoolClient } from 'pg';
import { query, pool } from '../db/index.js';
import type { GeneratedSlotRow, AvailabilityRuleInput, BlackoutDateInput } from '../services/slot-generator.js';
import type { SlotAlternative } from '@housy/shared';

export interface DbSlotRow {
  id: string;
  project_id: string;
  executive_id: string;
  starts_at: Date;
  ends_at: Date;
  status: 'open' | 'booked' | 'blocked';
  created_at: Date;
}

export interface GroupedSlotSummary {
  starts_at: Date;
  ends_at: Date;
  available_count: number;
}

export class SlotRepository {
  /**
   * Idempotently inserts generated slots in batches.
   * Uses ON CONFLICT (executive_id, starts_at) DO NOTHING to never overwrite or alter booked slots.
   */
  async insertSlotsBatch(slots: readonly GeneratedSlotRow[]): Promise<number> {
    if (slots.length === 0) {
      return 0;
    }

    const batchSize = 100;
    let totalInserted = 0;

    for (let i = 0; i < slots.length; i += batchSize) {
      const batch = slots.slice(i, i + batchSize);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];

      batch.forEach((slot, idx) => {
        const offset = idx * 5;
        rowPlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
        );
        values.push(
          slot.projectId,
          slot.executiveId,
          slot.startsAt.toISOString(),
          slot.endsAt.toISOString(),
          slot.status,
        );
      });

      const sql = `
        INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
        VALUES ${rowPlaceholders.join(', ')}
        ON CONFLICT (executive_id, starts_at) DO NOTHING
      `;

      const res = await query(sql, values);
      totalInserted += res.rowCount || 0;
    }

    return totalInserted;
  }

  /**
   * Fetches open slots for a project within a time range, grouped by (starts_at, ends_at).
   * Collapses multiple executives at the same time into a single chip with availableCount.
   * Respects minimum lead time (default 3 hours from now).
   */
  async findOpenSlotsGrouped(
    projectId: string,
    fromUtc: Date,
    toUtc: Date,
    minLeadTimeHours = 3,
  ): Promise<GroupedSlotSummary[]> {
    const sql = `
      SELECT starts_at, ends_at, COUNT(*)::int as available_count
      FROM visit_slots
      WHERE project_id = $1
        AND status = 'open'
        AND starts_at >= NOW() + ($2 || ' hours')::INTERVAL
        AND starts_at >= $3
        AND starts_at <= $4
      GROUP BY starts_at, ends_at
      ORDER BY starts_at ASC
    `;

    const res = await query<GroupedSlotSummary>(sql, [
      projectId,
      minLeadTimeHours,
      fromUtc.toISOString(),
      toUtc.toISOString(),
    ]);

    return res.rows;
  }

  /**
   * Finds the next available date with an open slot after `afterUtc`.
   */
  async findNextAvailableDate(
    projectId: string,
    afterUtc: Date,
    minLeadTimeHours = 3,
  ): Promise<Date | null> {
    const sql = `
      SELECT starts_at
      FROM visit_slots
      WHERE project_id = $1
        AND status = 'open'
        AND starts_at >= NOW() + ($2 || ' hours')::INTERVAL
        AND starts_at > $3
      ORDER BY starts_at ASC
      LIMIT 1
    `;

    const res = await query<{ starts_at: Date }>(sql, [
      projectId,
      minLeadTimeHours,
      afterUtc.toISOString(),
    ]);

    return res.rows[0]?.starts_at ?? null;
  }

  /**
   * Finds the 3 nearest open slot alternatives closest in time to targetStartsAt.
   */
  async findAlternativeSlots(
    projectId: string,
    targetStartsAt: Date,
    limit = 3,
    minLeadTimeHours = 3,
  ): Promise<SlotAlternative[]> {
    const sql = `
      SELECT DISTINCT starts_at, ends_at
      FROM visit_slots
      WHERE project_id = $1
        AND status = 'open'
        AND starts_at >= NOW() + ($2 || ' hours')::INTERVAL
        AND starts_at != $3
      ORDER BY ABS(EXTRACT(EPOCH FROM (starts_at - $3::TIMESTAMPTZ))) ASC
      LIMIT $4
    `;

    const res = await query<{ starts_at: Date; ends_at: Date }>(sql, [
      projectId,
      minLeadTimeHours,
      targetStartsAt.toISOString(),
      limit,
    ]);

    return res.rows.map((r) => ({
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: new Date(r.ends_at).toISOString(),
    }));
  }

  /**
   * Inside an active transaction, locks a single candidate slot for the requested project & startsAt
   * using SELECT ... FOR UPDATE SKIP LOCKED, preferring the executive with the lowest open load.
   */
  async lockBestSlotForBooking(
    client: PoolClient,
    projectId: string,
    startsAt: Date,
    minLeadTimeHours = 3,
  ): Promise<DbSlotRow | null> {
    const sql = `
      WITH exec_loads AS (
        SELECT u.id as executive_id,
               COUNT(vb.id) as active_bookings_count
        FROM users u
        LEFT JOIN visit_slots vs ON vs.executive_id = u.id AND vs.status = 'booked'
        LEFT JOIN visit_bookings vb ON vb.slot_id = vs.id AND vb.status = 'confirmed'
        WHERE u.role = 'executive' AND u.active = true
        GROUP BY u.id
      )
      SELECT s.id, s.project_id, s.executive_id, s.starts_at, s.ends_at, s.status, s.created_at
      FROM visit_slots s
      JOIN exec_loads el ON el.executive_id = s.executive_id
      WHERE s.project_id = $1
        AND s.starts_at = $2
        AND s.status = 'open'
        AND s.starts_at >= NOW() + ($3 || ' hours')::INTERVAL
      ORDER BY el.active_bookings_count ASC, s.created_at ASC
      FOR UPDATE OF s SKIP LOCKED
      LIMIT 1
    `;

    const res = await client.query<DbSlotRow>(sql, [
      projectId,
      startsAt.toISOString(),
      minLeadTimeHours,
    ]);

    return res.rows[0] ?? null;
  }

  async markSlotBooked(client: PoolClient, slotId: string): Promise<void> {
    await client.query(
      `UPDATE visit_slots SET status = 'booked' WHERE id = $1`,
      [slotId],
    );
  }

  async markSlotOpen(client: PoolClient, slotId: string): Promise<void> {
    await client.query(
      `UPDATE visit_slots SET status = 'open' WHERE id = $1`,
      [slotId],
    );
  }

  async getAvailabilityRules(projectId?: string): Promise<AvailabilityRuleInput[]> {
    let sql = `
      SELECT id, project_id as "projectId", executive_id as "executiveId",
             weekday, start_time::text as "startTime", end_time::text as "endTime",
             slot_minutes as "slotMinutes"
      FROM availability_rules
    `;
    const params: unknown[] = [];
    if (projectId) {
      sql += ' WHERE project_id = $1';
      params.push(projectId);
    }
    sql += ' ORDER BY weekday, start_time ASC';

    const res = await query<AvailabilityRuleInput>(sql, params);
    return res.rows;
  }

  async getBlackoutDates(projectId?: string): Promise<BlackoutDateInput[]> {
    let sql = `
      SELECT id, project_id as "projectId", executive_id as "executiveId",
             blackout_date::text as "blackoutDate", reason
      FROM blackout_dates
    `;
    const params: unknown[] = [];
    if (projectId) {
      sql += ' WHERE project_id IS NULL OR project_id = $1';
      params.push(projectId);
    }
    sql += ' ORDER BY blackout_date ASC';

    const res = await query<BlackoutDateInput>(sql, params);
    return res.rows;
  }
}

export const slotRepository = new SlotRepository();
