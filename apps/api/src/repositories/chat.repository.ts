import { query } from '../db/index.js';
import type { ChatLanguage, ChatMessageRole } from '@housy/shared';

export interface ConversationRecord {
  [key: string]: unknown;
  id: string;
  lead_id: string;
  language: string;
  status: string;
  flagged: boolean;
  flag_reasons: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  [key: string]: unknown;
  id: string;
  conversation_id: string;
  role: ChatMessageRole;
  content: string;
  cited_fact_ids: string[];
  meta: Record<string, unknown>;
  created_at: string;
}

export class ChatRepository {
  /**
   * Create a new conversation for a lead.
   */
  async createConversation(leadId: string, language: ChatLanguage = 'en'): Promise<ConversationRecord> {
    const res = await query<ConversationRecord>(
      `INSERT INTO conversations (lead_id, language, status, flagged, flag_reasons)
       VALUES ($1, $2, 'ai', false, ARRAY[]::text[])
       RETURNING *`,
      [leadId, language],
    );
    return res.rows[0]!;
  }

  /**
   * Find a conversation by ID.
   */
  async findConversationById(id: string): Promise<ConversationRecord | null> {
    const res = await query<ConversationRecord>(
      `SELECT * FROM conversations WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Flag a conversation with specific reasons.
   */
  async flagConversation(id: string, reasons: string[]): Promise<void> {
    await query(
      `UPDATE conversations
       SET flagged = true,
           flag_reasons = array_cat(flag_reasons, $2::text[]),
           updated_at = NOW()
       WHERE id = $1`,
      [id, reasons],
    );
  }

  /**
   * Update conversation language.
   */
  async updateLanguage(id: string, language: string): Promise<void> {
    await query(
      `UPDATE conversations
       SET language = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, language],
    );
  }

  /**
   * List messages for a conversation ordered chronologically.
   */
  async getMessages(conversationId: string): Promise<MessageRecord[]> {
    const res = await query<MessageRecord>(
      `SELECT id, conversation_id, role, content, cited_fact_ids, meta, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );
    return res.rows;
  }

  /**
   * Insert a message into a conversation.
   */
  async insertMessage(
    conversationId: string,
    role: ChatMessageRole,
    content: string,
    citedFactIds: string[] = [],
    meta: Record<string, unknown> = {},
  ): Promise<MessageRecord> {
    const res = await query<MessageRecord>(
      `INSERT INTO messages (conversation_id, role, content, cited_fact_ids, meta)
       VALUES ($1, $2, $3, $4::uuid[], $5::jsonb)
       RETURNING id, conversation_id, role, content, cited_fact_ids, meta, created_at`,
      [conversationId, role, content, citedFactIds, JSON.stringify(meta)],
    );
    return res.rows[0]!;
  }

  /**
   * Create a handoff entry when human intervention is needed.
   */
  async createHandoff(
    leadId: string,
    conversationId: string,
    reason: string,
    summary: Record<string, unknown> = {},
    executiveId?: string,
  ): Promise<string> {
    let assignedExec = executiveId;

    if (!assignedExec) {
      // Find lead's assigned executive or fallback to any executive
      const leadRes = await query<{ assigned_to: string | null }>(
        `SELECT assigned_to FROM leads WHERE id = $1`,
        [leadId],
      );
      if (leadRes.rows[0]?.assigned_to) {
        assignedExec = leadRes.rows[0].assigned_to;
      } else {
        const execRes = await query<{ id: string }>(
          `SELECT id FROM users WHERE role = 'executive' ORDER BY created_at ASC LIMIT 1`,
        );
        assignedExec = execRes.rows[0]?.id;
        if (!assignedExec) {
          const anyUser = await query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
          assignedExec = anyUser.rows[0]?.id;
        }
      }
    }

    if (!assignedExec) {
      throw new Error('No user available to assign handoff to');
    }

    const res = await query<{ id: string }>(
      `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'new')
       RETURNING id`,
      [leadId, conversationId, assignedExec, reason, JSON.stringify(summary)],
    );
    return res.rows[0]!.id;
  }

  /**
   * Store question in unanswered_questions for sales head review.
   */
  async recordUnansweredQuestion(
    conversationId: string,
    question: string,
    language: string,
  ): Promise<void> {
    await query(
      `INSERT INTO unanswered_questions (conversation_id, question, buyer_language, status)
       VALUES ($1, $2, $3, 'unresolved')`,
      [conversationId, question, language],
    );
  }

  /**
   * Record DPDP consent.
   */
  async recordConsent(
    leadId: string,
    purpose: string,
    granted: boolean,
    noticeVersion = 'v1.0',
    channel = 'web_chat',
  ): Promise<void> {
    await query(
      `INSERT INTO consents (lead_id, purpose, granted, notice_version, channel, at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [leadId, purpose, granted, noticeVersion, channel],
    );
  }

  /**
   * Update lead profile attributes.
   */
  async updateLeadProfile(
    leadId: string,
    profile: {
      budgetMin?: number;
      budgetMax?: number;
      wants?: string;
      projectId?: string;
      timeline?: string;
      language?: string;
      phoneE164?: string;
      name?: string;
      consentStatus?: string;
    },
  ): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [leadId];
    let idx = 2;

    if (profile.budgetMin !== undefined) {
      updates.push(`budget_min = $${idx++}`);
      values.push(profile.budgetMin);
    }
    if (profile.budgetMax !== undefined) {
      updates.push(`budget_max = $${idx++}`);
      values.push(profile.budgetMax);
    }
    if (profile.wants !== undefined) {
      updates.push(`wants = $${idx++}`);
      values.push(profile.wants);
    }
    if (profile.projectId !== undefined) {
      updates.push(`project_id = $${idx++}`);
      values.push(profile.projectId);
    }
    if (profile.timeline !== undefined) {
      updates.push(`timeline = $${idx++}`);
      values.push(profile.timeline);
    }
    if (profile.language !== undefined) {
      updates.push(`language = $${idx++}`);
      values.push(profile.language);
    }
    if (profile.phoneE164 !== undefined) {
      updates.push(`phone_e164 = $${idx++}`);
      values.push(profile.phoneE164);
    }
    if (profile.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(profile.name);
    }
    if (profile.consentStatus !== undefined) {
      updates.push(`consent_status = $${idx++}`);
      values.push(profile.consentStatus);
    }

    if (updates.length > 0) {
      updates.push('last_activity_at = NOW()');
      await query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $1`,
        values,
      );
    }
  }

  /**
   * Mark lead as opted out, set consent status to withdrawn, record in consents,
   * and cancel all pending reminders for this lead's bookings.
   */
  async optOutLead(leadId: string): Promise<void> {
    // 1. Update lead record
    await query(
      `UPDATE leads
       SET opted_out_at = NOW(),
           consent_status = 'withdrawn',
           last_activity_at = NOW()
       WHERE id = $1`,
      [leadId],
    );

    // 2. Record explicit opt-out in consents
    await query(
      `INSERT INTO consents (lead_id, purpose, granted, notice_version, channel)
       VALUES ($1, 'communication', false, 'dpdp_v1', 'opt_out')`,
      [leadId],
    );

    // 3. Cancel all pending visit reminders for this lead
    await query(
      `UPDATE reminders
       SET status = 'cancelled'
       WHERE booking_id IN (
         SELECT id FROM visit_bookings WHERE lead_id = $1
       ) AND status = 'pending'`,
      [leadId],
    );
  }

  /**
   * Set first response timestamp if not already set.
   */
  async setFirstResponseAt(leadId: string): Promise<void> {
    await query(
      `UPDATE leads
       SET first_response_at = NOW()
       WHERE id = $1 AND first_response_at IS NULL`,
      [leadId],
    );
  }
}

export const chatRepository = new ChatRepository();
