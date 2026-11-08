import type { PoolClient, QueryResultRow } from 'pg';
import { query, pool } from '../db/index.js';
import type { BookingStatus, ReminderKind, ReminderStatus } from '@housy/shared';

export interface DbBookingRow extends QueryResultRow {
  id: string;
  lead_id: string;
  slot_id: string;
  status: BookingStatus;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

export interface DbVisitDetailsRow extends QueryResultRow {
  booking_id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  lead_public_id: string | null;
  project_id: string;
  project_name: string;
  rera_number?: string;
  project_address: string;
  project_lat: number;
  project_lng: number;
  slot_id: string;
  starts_at: Date;
  ends_at: Date;
  status: BookingStatus;
  executive_id: string;
  executive_name: string;
  executive_phone: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbReminderRow extends QueryResultRow {
  id: string;
  booking_id: string;
  kind: ReminderKind;
  scheduled_at: Date;
  status: ReminderStatus;
  attempts: number;
  last_attempt_at: Date | null;
  created_at: Date;
}

export class VisitRepository {
  /**
   * Finds an existing booking by idempotency key.
   */
  async findByIdempotencyKey(key: string, client?: PoolClient): Promise<DbBookingRow | null> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbBookingRow>(
      `SELECT id, lead_id, slot_id, status, idempotency_key, created_at, updated_at
       FROM visit_bookings
       WHERE idempotency_key = $1
       LIMIT 1`,
      [key],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Finds active confirmed booking for a lead.
   */
  async findActiveBookingByLeadId(leadId: string, client?: PoolClient): Promise<DbBookingRow | null> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbBookingRow>(
      `SELECT id, lead_id, slot_id, status, idempotency_key, created_at, updated_at
       FROM visit_bookings
       WHERE lead_id = $1 AND status = 'confirmed'
       LIMIT 1`,
      [leadId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Finds a booking by ID with row lock for update.
   */
  async findByIdForUpdate(bookingId: string, client: PoolClient): Promise<DbBookingRow | null> {
    const res = await client.query<DbBookingRow>(
      `SELECT id, lead_id, slot_id, status, idempotency_key, created_at, updated_at
       FROM visit_bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Inserts a visit booking inside an active client transaction.
   */
  async insertBooking(
    client: PoolClient,
    leadId: string,
    slotId: string,
    idempotencyKey: string,
  ): Promise<DbBookingRow> {
    const res = await client.query<DbBookingRow>(
      `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
       VALUES ($1, $2, 'confirmed', $3)
       RETURNING id, lead_id, slot_id, status, idempotency_key, created_at, updated_at`,
      [leadId, slotId, idempotencyKey],
    );
    return res.rows[0]!;
  }

  /**
   * Updates an existing booking's slot_id atomically (rescheduling).
   */
  async updateBookingSlot(client: PoolClient, bookingId: string, newSlotId: string): Promise<void> {
    await client.query(
      `UPDATE visit_bookings
       SET slot_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [newSlotId, bookingId],
    );
  }

  /**
   * Updates booking status (cancelled, completed, no_show).
   */
  async updateBookingStatus(
    client: PoolClient,
    bookingId: string,
    status: BookingStatus,
  ): Promise<void> {
    await client.query(
      `UPDATE visit_bookings
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, bookingId],
    );
  }

  /**
   * Inserts a reminder row for a booking.
   */
  async insertReminder(
    client: PoolClient,
    bookingId: string,
    kind: ReminderKind,
    scheduledAt: Date,
    status: ReminderStatus = 'pending',
  ): Promise<DbReminderRow> {
    const res = await client.query<DbReminderRow>(
      `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, booking_id, kind, scheduled_at, status, attempts, last_attempt_at, created_at`,
      [bookingId, kind, scheduledAt.toISOString(), status],
    );
    return res.rows[0]!;
  }

  /**
   * Cancels pending reminders for a booking.
   */
  async cancelPendingReminders(client: PoolClient, bookingId: string): Promise<void> {
    await client.query(
      `UPDATE reminders
       SET status = 'cancelled'
       WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId],
    );
  }

  /**
   * Gets reminders for a booking.
   */
  async getRemindersByBookingId(bookingId: string): Promise<DbReminderRow[]> {
    const res = await query<DbReminderRow>(
      `SELECT id, booking_id, kind, scheduled_at, status, attempts, last_attempt_at, created_at
       FROM reminders
       WHERE booking_id = $1
       ORDER BY scheduled_at ASC`,
      [bookingId],
    );
    return res.rows;
  }

  /**
   * Fetches full joined details of a visit by booking ID.
   */
  async findDetailsByBookingId(bookingId: string, client?: PoolClient): Promise<DbVisitDetailsRow | null> {
    const q = client ? client.query.bind(client) : query;
    const sql = `
      SELECT
        vb.id as booking_id,
        vb.status,
        vb.created_at,
        vb.updated_at,
        l.id as lead_id,
        l.name as lead_name,
        l.phone_e164 as lead_phone,
        l.public_id as lead_public_id,
        p.id as project_id,
        COALESCE(p.display_name, p.name) as project_name,
        p.rera_number,
        p.address as project_address,
        p.lat as project_lat,
        p.lng as project_lng,
        s.id as slot_id,
        s.starts_at,
        s.ends_at,
        u.id as executive_id,
        u.name as executive_name,
        u.phone as executive_phone
      FROM visit_bookings vb
      JOIN leads l ON l.id = vb.lead_id
      JOIN visit_slots s ON s.id = vb.slot_id
      JOIN projects p ON p.id = s.project_id
      JOIN users u ON u.id = s.executive_id
      WHERE vb.id = $1
      LIMIT 1
    `;
    const res = await q<DbVisitDetailsRow>(sql, [bookingId]);
    return res.rows[0] ?? null;
  }

  /**
   * Lists visits for executive screen (upcoming and awaiting outcome).
   */
  async listVisitsForStaff(executiveId?: string): Promise<DbVisitDetailsRow[]> {
    let sql = `
      SELECT
        vb.id as booking_id,
        vb.status,
        vb.created_at,
        vb.updated_at,
        l.id as lead_id,
        l.name as lead_name,
        l.phone_e164 as lead_phone,
        l.public_id as lead_public_id,
        p.id as project_id,
        COALESCE(p.display_name, p.name) as project_name,
        p.rera_number,
        p.address as project_address,
        p.lat as project_lat,
        p.lng as project_lng,
        s.id as slot_id,
        s.starts_at,
        s.ends_at,
        u.id as executive_id,
        u.name as executive_name,
        u.phone as executive_phone
      FROM visit_bookings vb
      JOIN leads l ON l.id = vb.lead_id
      JOIN visit_slots s ON s.id = vb.slot_id
      JOIN projects p ON p.id = s.project_id
      JOIN users u ON u.id = s.executive_id
    `;
    const params: unknown[] = [];
    if (executiveId) {
      sql += ' WHERE s.executive_id = $1';
      params.push(executiveId);
    }
    sql += ' ORDER BY s.starts_at ASC';

    const res = await query<DbVisitDetailsRow>(sql, params);
    return res.rows;
  }

  /**
   * Helper to execute queries inside a managed database transaction.
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const visitRepository = new VisitRepository();
