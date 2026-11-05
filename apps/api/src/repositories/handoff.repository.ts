import type { PoolClient } from 'pg';
import { query } from '../db/index.js';
import type { HandoffSummary, HandoffStatus, HandoffItem } from '@housy/shared';

export interface DbExecutiveAssignment {
  id: string;
  name: string;
  phone: string | null;
}

export interface DbHandoffRow {
  id: string;
  lead_id: string;
  lead_public_id: string;
  lead_name: string;
  lead_phone: string | null;
  conversation_id: string;
  executive_id: string;
  executive_name: string;
  executive_phone: string | null;
  reason: string;
  summary: HandoffSummary;
  status: HandoffStatus;
  created_at: string;
  updated_at: string;
}

export class HandoffRepository {
  /**
   * Executive assignment rule:
   * 1. Prefer the executive who owns the confirmed visit slot for this lead.
   * 2. Otherwise, assign the active executive with the fewest open assigned leads.
   */
  async findBestExecutiveForLead(
    leadId: string,
    client?: PoolClient,
  ): Promise<DbExecutiveAssignment> {
    const dbCaller = client ? client.query.bind(client) : query;

    // 1. Check if the lead has a confirmed site-visit slot
    const slotExecRes = await dbCaller<{ id: string; name: string; phone: string | null }>(
      `SELECT u.id, u.name, u.phone
       FROM visit_bookings vb
       JOIN visit_slots vs ON vb.slot_id = vs.id
       JOIN users u ON vs.executive_id = u.id
       WHERE vb.lead_id = $1 AND vb.status = 'confirmed' AND u.active = true
       LIMIT 1`,
      [leadId],
    );

    if (slotExecRes.rows[0]) {
      return slotExecRes.rows[0];
    }

    // 2. Fall back to active executive with fewest open assigned leads
    const leastLoadedRes = await dbCaller<{ id: string; name: string; phone: string | null }>(
      `SELECT u.id, u.name, u.phone, COUNT(l.id) AS open_leads_count
       FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id AND l.status NOT IN ('visited', 'lost')
       WHERE u.role = 'executive' AND u.active = true
       GROUP BY u.id, u.name, u.phone, u.created_at
       ORDER BY open_leads_count ASC, u.created_at ASC
       LIMIT 1`,
    );

    if (leastLoadedRes.rows[0]) {
      return leastLoadedRes.rows[0];
    }

    // 3. Fallback to any active user if no executive found
    const fallbackRes = await dbCaller<{ id: string; name: string; phone: string | null }>(
      `SELECT id, name, phone FROM users WHERE active = true ORDER BY created_at ASC LIMIT 1`,
    );

    if (!fallbackRes.rows[0]) {
      throw new Error('No active executive or user available for handoff assignment');
    }

    return fallbackRes.rows[0];
  }

  /**
   * Persists a handoff row and updates the lead assignment and status.
   */
  async insertHandoff(
    leadId: string,
    conversationId: string,
    executiveId: string,
    reason: string,
    summary: HandoffSummary,
    client?: PoolClient,
  ): Promise<string> {
    const dbCaller = client ? client.query.bind(client) : query;

    const res = await dbCaller<{ id: string }>(
      `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'new')
       RETURNING id`,
      [leadId, conversationId, executiveId, reason, JSON.stringify(summary)],
    );

    // Update lead assigned_to and advance status to engaged if new
    await dbCaller(
      `UPDATE leads
       SET assigned_to = $1,
           status = CASE WHEN status = 'new' THEN 'engaged'::lead_status ELSE status END,
           last_activity_at = NOW()
       WHERE id = $2`,
      [executiveId, leadId],
    );

    return res.rows[0]!.id;
  }

  /**
   * List handoffs with filtering by executive and status.
   */
  async findHandoffs(filters: {
    executiveId?: string;
    status?: HandoffStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ items: HandoffItem[]; totalCount: number }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM handoffs h
       WHERE ($1::uuid IS NULL OR h.executive_id = $1)
         AND ($2::text IS NULL OR h.status = $2::handoff_status)`,
      [filters.executiveId ?? null, filters.status ?? null],
    );
    const totalCount = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rowsRes = await query<DbHandoffRow>(
      `SELECT h.id, h.lead_id, l.public_id AS lead_public_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
              h.conversation_id, h.executive_id, u.name AS executive_name, u.phone AS executive_phone,
              h.reason, h.summary, h.status,
              h.created_at::text, h.updated_at::text
       FROM handoffs h
       JOIN leads l ON h.lead_id = l.id
       JOIN users u ON h.executive_id = u.id
       WHERE ($1::uuid IS NULL OR h.executive_id = $1)
         AND ($2::text IS NULL OR h.status = $2::handoff_status)
       ORDER BY h.created_at DESC
       LIMIT $3 OFFSET $4`,
      [filters.executiveId ?? null, filters.status ?? null, limit, offset],
    );

    const items: HandoffItem[] = rowsRes.rows.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      leadPublicId: row.lead_public_id,
      leadName: row.lead_name,
      leadPhone: row.lead_phone,
      conversationId: row.conversation_id,
      executiveId: row.executive_id,
      executiveName: row.executive_name,
      executivePhone: row.executive_phone,
      reason: row.reason,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { items, totalCount };
  }

  /**
   * Find handoff by ID with full details.
   */
  async findHandoffById(handoffId: string): Promise<HandoffItem | null> {
    const res = await query<DbHandoffRow>(
      `SELECT h.id, h.lead_id, l.public_id AS lead_public_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
              h.conversation_id, h.executive_id, u.name AS executive_name, u.phone AS executive_phone,
              h.reason, h.summary, h.status,
              h.created_at::text, h.updated_at::text
       FROM handoffs h
       JOIN leads l ON h.lead_id = l.id
       JOIN users u ON h.executive_id = u.id
       WHERE h.id = $1`,
      [handoffId],
    );

    const row = res.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      leadId: row.lead_id,
      leadPublicId: row.lead_public_id,
      leadName: row.lead_name,
      leadPhone: row.lead_phone,
      conversationId: row.conversation_id,
      executiveId: row.executive_id,
      executiveName: row.executive_name,
      executivePhone: row.executive_phone,
      reason: row.reason,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Accept a handoff by setting status to 'accepted'.
   */
  async acceptHandoff(handoffId: string, executiveId?: string): Promise<boolean> {
    const res = await query(
      `UPDATE handoffs
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND ($2::uuid IS NULL OR executive_id = $2)`,
      [handoffId, executiveId ?? null],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Post executive reply into conversation thread, setting conversation status to 'human' (pauses AI).
   */
  async postExecutiveMessage(
    conversationId: string,
    executiveId: string,
    content: string,
  ): Promise<string> {
    // 1. Set conversation status to human
    await query(
      `UPDATE conversations
       SET status = 'human', updated_at = NOW()
       WHERE id = $1`,
      [conversationId],
    );

    // 2. Insert message with role 'executive'
    const msgRes = await query<{ id: string }>(
      `INSERT INTO messages (conversation_id, role, content, meta)
       VALUES ($1, 'executive', $2, $3::jsonb)
       RETURNING id`,
      [conversationId, content, JSON.stringify({ executiveId, isHumanIntervention: true })],
    );

    return msgRes.rows[0]!.id;
  }
}

export const handoffRepository = new HandoffRepository();
