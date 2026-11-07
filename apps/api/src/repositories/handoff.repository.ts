import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { HandoffSummary, HandoffStatus, HandoffItem } from '@housy/shared';

export interface DbExecutiveAssignment {
  id: string;
  name: string;
  phone: string | null;
}

export interface DbHandoffRow extends QueryResultRow {
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
  priority?: 'normal' | 'high' | 'urgent';
  is_escalated?: boolean;
  created_at: string;
  updated_at: string;
}

export class HandoffRepository {
  /**
   * Executive assignment rule:
   * 1. Prefer the executive who owns the confirmed visit slot for this lead.
   * 2. Else prefer active executive who speaks the buyer's language (users.languages).
   * 3. Otherwise, assign the active executive with the fewest open assigned leads.
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

    // 2. Query lead language preference (active conversation preferred, then lead record)
    const leadRes = await dbCaller<{ language: string | null }>(
      `SELECT COALESCE(
         (SELECT c.language FROM conversations c WHERE c.lead_id = l.id ORDER BY c.created_at DESC LIMIT 1),
         l.language,
         'en'
       ) AS language
       FROM leads l
       WHERE l.id = $1`,
      [leadId],
    );
    const leadLang = leadRes.rows[0]?.language;

    // 3. Try to match an active executive who speaks the lead's language
    if (leadLang) {
      const langMatchRes = await dbCaller<{ id: string; name: string; phone: string | null }>(
        `SELECT u.id, u.name, u.phone, COUNT(l.id) AS open_leads_count
         FROM users u
         LEFT JOIN leads l ON l.assigned_to = u.id AND l.status NOT IN ('visited', 'lost')
         WHERE u.role = 'executive' AND u.active = true AND u.languages @> ARRAY[$1::text]
         GROUP BY u.id, u.name, u.phone, u.created_at
         ORDER BY open_leads_count ASC, u.created_at ASC
         LIMIT 1`,
        [leadLang],
      );

      if (langMatchRes.rows[0]) {
        return langMatchRes.rows[0];
      }
    }

    // 4. Fall back to active executive with fewest open assigned leads
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

    // 5. Fallback to any active user if no executive found
    const fallbackRes = await dbCaller<{ id: string; name: string; phone: string | null }>(
      `SELECT id, name, phone FROM users WHERE active = true ORDER BY created_at ASC LIMIT 1`,
    );

    if (!fallbackRes.rows[0]) {
      throw new Error('No active executive or user available for handoff assignment');
    }

    return fallbackRes.rows[0];
  }

  /**
   * Persists a handoff row or appends an event if an open handoff already exists.
   * Enforces one open handoff per conversation and bumps priority on recurring triggers.
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

    // Check if an open handoff already exists for this conversation
    const existingRes = await dbCaller<{ id: string; priority: string; status: string }>(
      `SELECT id, priority, status
       FROM handoffs
       WHERE conversation_id = $1 AND status IN ('new', 'accepted')
       LIMIT 1`,
      [conversationId],
    );

    if (existingRes.rows[0]) {
      const existing = existingRes.rows[0];
      const newPriority = existing.priority === 'normal' ? 'high' : 'urgent';

      await dbCaller(
        `UPDATE handoffs
         SET priority = $1, updated_at = NOW()
         WHERE id = $2`,
        [newPriority, existing.id],
      );

      await dbCaller(
        `INSERT INTO handoff_events (handoff_id, event_type, reason, metadata)
         VALUES ($1, 'trigger_appended', $2, $3::jsonb)`,
        [existing.id, reason, JSON.stringify({ summary, escalatedPriority: newPriority })],
      );

      return existing.id;
    }

    // Insert new handoff
    const res = await dbCaller<{ id: string }>(
      `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status, priority, is_escalated)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'new', 'normal', false)
       RETURNING id`,
      [leadId, conversationId, executiveId, reason, JSON.stringify(summary)],
    );
    const handoffId = res.rows[0]!.id;

    // Log initial creation event in handoff_events
    await dbCaller(
      `INSERT INTO handoff_events (handoff_id, event_type, reason, metadata)
       VALUES ($1, 'created', $2, $3::jsonb)`,
      [handoffId, reason, JSON.stringify({ summary })],
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

    return handoffId;
  }

  /**
   * Escalates handoffs that have been in 'new' status for more than 15 minutes.
   */
  async escalateStaleHandoffs(): Promise<Array<{
    handoffId: string;
    leadId: string;
    leadName: string;
    executiveId: string;
    salesHeadId: string;
  }>> {
    const salesHeadRes = await query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'sales_head' AND active = true ORDER BY created_at ASC LIMIT 1`,
    );
    const salesHeadId = salesHeadRes.rows[0]?.id;
    if (!salesHeadId) return [];

    const staleRes = await query<{
      id: string;
      lead_id: string;
      lead_name: string;
      executive_id: string;
    }>(
      `SELECT h.id, h.lead_id, l.name as lead_name, h.executive_id
       FROM handoffs h
       JOIN leads l ON h.lead_id = l.id
       WHERE h.status = 'new'
         AND h.is_escalated = false
         AND h.created_at <= NOW() - INTERVAL '15 minutes'`,
    );

    const escalated: Array<{
      handoffId: string;
      leadId: string;
      leadName: string;
      executiveId: string;
      salesHeadId: string;
    }> = [];

    for (const row of staleRes.rows) {
      await query(
        `UPDATE handoffs
         SET priority = 'urgent', is_escalated = true, updated_at = NOW()
         WHERE id = $1`,
        [row.id],
      );

      await query(
        `INSERT INTO handoff_events (handoff_id, event_type, reason, metadata)
         VALUES ($1, 'sla_escalation', 'Unaccepted for over 15 minutes - escalated to Sales Head', $2::jsonb)`,
        [row.id, JSON.stringify({ salesHeadId })],
      );

      escalated.push({
        handoffId: row.id,
        leadId: row.lead_id,
        leadName: row.lead_name,
        executiveId: row.executive_id,
        salesHeadId,
      });
    }

    return escalated;
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
              h.reason, h.summary, h.status, h.priority, h.is_escalated,
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
      priority: row.priority || 'normal',
      isEscalated: Boolean(row.is_escalated),
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
              h.reason, h.summary, h.status, h.priority, h.is_escalated,
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
      priority: row.priority || 'normal',
      isEscalated: Boolean(row.is_escalated),
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
   * Switches conversation status to 'human' (pauses AI assistant).
   */
  async takeOverChat(conversationId: string, executiveId?: string): Promise<void> {
    await query(
      `UPDATE conversations
       SET status = 'human', updated_at = NOW()
       WHERE id = $1`,
      [conversationId],
    );

    // If an open handoff exists, log takeover event
    const hRes = await query<{ id: string }>(
      `SELECT id FROM handoffs WHERE conversation_id = $1 AND status IN ('new', 'accepted') LIMIT 1`,
      [conversationId],
    );
    if (hRes.rows[0]) {
      await query(
        `INSERT INTO handoff_events (handoff_id, event_type, reason, metadata)
         VALUES ($1, 'human_takeover', 'Executive took over live chat', $2::jsonb)`,
        [hRes.rows[0].id, JSON.stringify({ executiveId })],
      );
    }
  }

  /**
   * Resumes AI assistant by switching conversation status back to 'ai'.
   */
  async handBackToAssistant(conversationId: string): Promise<void> {
    await query(
      `UPDATE conversations
       SET status = 'ai', updated_at = NOW()
       WHERE id = $1`,
      [conversationId],
    );

    const hRes = await query<{ id: string }>(
      `SELECT id FROM handoffs WHERE conversation_id = $1 AND status IN ('new', 'accepted') LIMIT 1`,
      [conversationId],
    );
    if (hRes.rows[0]) {
      await query(
        `INSERT INTO handoff_events (handoff_id, event_type, reason, metadata)
         VALUES ($1, 'hand_back', 'Chat handed back to AI assistant', '{}'::jsonb)`,
        [hRes.rows[0].id],
      );
    }
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
    await this.takeOverChat(conversationId, executiveId);

    // 2. Query executive first name for badge
    const userRes = await query<{ name: string }>(
      `SELECT name FROM users WHERE id = $1`,
      [executiveId],
    );
    const execName = userRes.rows[0]?.name || 'Executive';
    const firstName = execName.split(' ')[0] || execName;

    // 3. Insert message with role 'executive'
    const msgRes = await query<{ id: string }>(
      `INSERT INTO messages (conversation_id, role, content, meta)
       VALUES ($1, 'executive', $2, $3::jsonb)
       RETURNING id`,
      [
        conversationId,
        content,
        JSON.stringify({
          executiveId,
          senderName: execName,
          executiveFirstName: firstName,
          isHumanIntervention: true,
        }),
      ],
    );

    return msgRes.rows[0]!.id;
  }
}

export const handoffRepository = new HandoffRepository();
