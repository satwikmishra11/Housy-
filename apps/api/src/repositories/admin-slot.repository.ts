import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type {
  AdminAvailabilityRule,
  AdminBlackoutDate,
  AdminSlotItem,
  CreateAvailabilityRulePayload,
  CreateBlackoutDatePayload,
  SlotStatus,
  BookingStatus,
} from '@housy/shared';

interface DbRuleRow extends QueryResultRow {
  id: string;
  project_id: string;
  project_name: string;
  executive_id: string;
  executive_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  created_at: Date;
}

interface DbBlackoutRow extends QueryResultRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  executive_id: string | null;
  executive_name: string | null;
  blackout_date: string;
  reason: string | null;
  created_at: Date;
}

interface DbSlotPreviewRow extends QueryResultRow {
  id: string;
  project_id: string;
  project_name: string;
  executive_id: string;
  executive_name: string;
  starts_at: Date;
  ends_at: Date;
  status: SlotStatus;
  booking_id: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_public_id: string | null;
  booking_status: string | null;
}

export class AdminSlotRepository {
  async listAvailabilityRules(projectId?: string): Promise<AdminAvailabilityRule[]> {
    let sql = `
      SELECT r.id, r.project_id, p.name as project_name, r.executive_id, u.name as executive_name,
             r.weekday, r.start_time::text as start_time, r.end_time::text as end_time,
             r.slot_minutes, r.created_at
      FROM availability_rules r
      JOIN projects p ON p.id = r.project_id
      JOIN users u ON u.id = r.executive_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (projectId) {
      params.push(projectId);
      sql += ` AND r.project_id = $1`;
    }
    sql += ` ORDER BY r.weekday ASC, r.start_time ASC`;

    const res = await query<DbRuleRow>(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      executiveId: r.executive_id,
      executiveName: r.executive_name,
      weekday: r.weekday,
      startTime: r.start_time,
      endTime: r.end_time,
      slotMinutes: r.slot_minutes,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async insertAvailabilityRule(
    payload: CreateAvailabilityRulePayload,
  ): Promise<AdminAvailabilityRule> {
    const res = await query<DbRuleRow>(
      `INSERT INTO availability_rules (project_id, executive_id, weekday, start_time, end_time, slot_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, '' as project_name, executive_id, '' as executive_name,
                 weekday, start_time::text as start_time, end_time::text as end_time,
                 slot_minutes, created_at`,
      [
        payload.projectId,
        payload.executiveId,
        payload.weekday,
        payload.startTime,
        payload.endTime,
        payload.slotMinutes,
      ],
    );
    const row = res.rows[0]!;
    return {
      id: row.id,
      projectId: row.project_id,
      executiveId: row.executive_id,
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
      slotMinutes: row.slot_minutes,
      createdAt: row.created_at.toISOString(),
    };
  }

  async deleteAvailabilityRule(id: string): Promise<boolean> {
    const res = await query(`DELETE FROM availability_rules WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async listBlackoutDates(projectId?: string): Promise<AdminBlackoutDate[]> {
    let sql = `
      SELECT b.id, b.project_id, p.name as project_name, b.executive_id, u.name as executive_name,
             b.blackout_date::text as blackout_date, b.reason, b.created_at
      FROM blackout_dates b
      LEFT JOIN projects p ON p.id = b.project_id
      LEFT JOIN users u ON u.id = b.executive_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (projectId) {
      params.push(projectId);
      sql += ` AND (b.project_id IS NULL OR b.project_id = $1)`;
    }
    sql += ` ORDER BY b.blackout_date ASC`;

    const res = await query<DbBlackoutRow>(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      executiveId: r.executive_id,
      executiveName: r.executive_name,
      blackoutDate: r.blackout_date,
      reason: r.reason,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async insertBlackoutDate(payload: CreateBlackoutDatePayload): Promise<AdminBlackoutDate> {
    const res = await query<DbBlackoutRow>(
      `INSERT INTO blackout_dates (blackout_date, project_id, executive_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id, NULL as project_name, executive_id, NULL as executive_name,
                 blackout_date::text as blackout_date, reason, created_at`,
      [
        payload.blackoutDate,
        payload.projectId ?? null,
        payload.executiveId ?? null,
        payload.reason ?? null,
      ],
    );
    const row = res.rows[0]!;
    return {
      id: row.id,
      projectId: row.project_id,
      executiveId: row.executive_id,
      blackoutDate: row.blackout_date,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
    };
  }

  async deleteBlackoutDate(id: string): Promise<boolean> {
    const res = await query(`DELETE FROM blackout_dates WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async listSlotsPreview(filters: {
    projectId?: string;
    executiveId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AdminSlotItem[]> {
    let sql = `
      SELECT s.id, s.project_id, p.name as project_name, s.executive_id, u.name as executive_name,
             s.starts_at, s.ends_at, s.status,
             b.id as booking_id, b.lead_id, l.name as lead_name, l.phone_e164 as lead_phone,
             l.public_id as lead_public_id, b.status as booking_status
      FROM visit_slots s
      JOIN projects p ON p.id = s.project_id
      JOIN users u ON u.id = s.executive_id
      LEFT JOIN visit_bookings b ON b.slot_id = s.id AND b.status = 'confirmed'
      LEFT JOIN leads l ON l.id = b.lead_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters.projectId) {
      params.push(filters.projectId);
      sql += ` AND s.project_id = $${params.length}`;
    }

    if (filters.executiveId) {
      params.push(filters.executiveId);
      sql += ` AND s.executive_id = $${params.length}`;
    }

    if (filters.fromDate) {
      params.push(filters.fromDate);
      sql += ` AND s.starts_at >= $${params.length}::timestamptz`;
    }

    if (filters.toDate) {
      params.push(filters.toDate);
      sql += ` AND s.starts_at <= $${params.length}::timestamptz`;
    }

    sql += ` ORDER BY s.starts_at ASC, p.name ASC, u.name ASC`;

    const res = await query<DbSlotPreviewRow>(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      executiveId: r.executive_id,
      executiveName: r.executive_name,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
      booking: r.booking_id
        ? {
            id: r.booking_id,
            leadId: r.lead_id!,
            leadName: r.lead_name || 'Visitor',
            leadPhone: r.lead_phone,
            leadPublicId: r.lead_public_id,
            status: (r.booking_status as BookingStatus) || 'confirmed',
          }
        : null,
    }));
  }

  async getSlotWithBooking(slotId: string): Promise<AdminSlotItem | null> {
    const res = await query<DbSlotPreviewRow>(
      `SELECT s.id, s.project_id, p.name as project_name, s.executive_id, u.name as executive_name,
              s.starts_at, s.ends_at, s.status,
              b.id as booking_id, b.lead_id, l.name as lead_name, l.phone_e164 as lead_phone,
              l.public_id as lead_public_id, b.status as booking_status
       FROM visit_slots s
       JOIN projects p ON p.id = s.project_id
       JOIN users u ON u.id = s.executive_id
       LEFT JOIN visit_bookings b ON b.slot_id = s.id AND b.status = 'confirmed'
       LEFT JOIN leads l ON l.id = b.lead_id
       WHERE s.id = $1
       LIMIT 1`,
      [slotId],
    );

    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      executiveId: r.executive_id,
      executiveName: r.executive_name,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
      booking: r.booking_id
        ? {
            id: r.booking_id,
            leadId: r.lead_id!,
            leadName: r.lead_name || 'Visitor',
            leadPhone: r.lead_phone,
            leadPublicId: r.lead_public_id,
            status: (r.booking_status as BookingStatus) || 'confirmed',
          }
        : null,
    };
  }

  async updateSlotStatus(slotId: string, status: SlotStatus): Promise<void> {
    await query(`UPDATE visit_slots SET status = $1 WHERE id = $2`, [status, slotId]);
  }
}

export const adminSlotRepository = new AdminSlotRepository();
