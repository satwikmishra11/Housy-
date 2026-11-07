import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { LeadSource } from '@housy/shared';

export interface ChatSessionRow extends QueryResultRow {
  id: string;
  lead_id: string | null;
  source: LeadSource;
  project_id: string | null;
  language: string;
  first_touch_at: string;
  buyer_first_message_at: string | null;
  first_response_at: string | null;
  buyer_message_count: number;
  has_project_interest: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

export class ChatSessionRepository {
  /**
   * Initializes a new anonymous chat session with no PII.
   */
  async createSession(data: {
    source?: LeadSource;
    projectId?: string | null;
    language?: string;
  }): Promise<ChatSessionRow> {
    const res = await query<ChatSessionRow>(
      `INSERT INTO chat_sessions (source, project_id, language, first_touch_at, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW())
       RETURNING *`,
      [data.source ?? 'website', data.projectId ?? null, data.language ?? 'en'],
    );
    return res.rows[0]!;
  }

  /**
   * Finds a chat session by ID.
   */
  async findById(id: string): Promise<ChatSessionRow | null> {
    const res = await query<ChatSessionRow>(
      `SELECT * FROM chat_sessions WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Finds a chat session by conversation ID.
   */
  async findByConversationId(conversationId: string): Promise<ChatSessionRow | null> {
    const res = await query<ChatSessionRow>(
      `SELECT cs.*
       FROM chat_sessions cs
       JOIN conversations c ON c.chat_session_id = cs.id
       WHERE c.id = $1`,
      [conversationId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Records a buyer message in this session:
   * Increments message count, sets buyer_first_message_at on first message,
   * and updates has_project_interest if detected.
   */
  async recordBuyerMessage(
    sessionId: string,
    hasProjectInterest: boolean,
  ): Promise<ChatSessionRow | null> {
    const res = await query<ChatSessionRow>(
      `UPDATE chat_sessions
       SET buyer_message_count = buyer_message_count + 1,
           buyer_first_message_at = COALESCE(buyer_first_message_at, NOW()),
           has_project_interest = has_project_interest OR $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId, hasProjectInterest],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Links a newly created lead to the anonymous chat session.
   */
  async linkLead(sessionId: string, leadId: string): Promise<void> {
    await query(
      `UPDATE chat_sessions
       SET lead_id = $1, status = 'converted', updated_at = NOW()
       WHERE id = $2`,
      [leadId, sessionId],
    );
  }

  /**
   * Sets first substantive response time on the session.
   */
  async setFirstResponseAt(sessionId: string, responseAt: Date = new Date()): Promise<void> {
    await query(
      `UPDATE chat_sessions
       SET first_response_at = COALESCE(first_response_at, $2), updated_at = NOW()
       WHERE id = $1`,
      [sessionId, responseAt.toISOString()],
    );
  }
}

export const chatSessionRepository = new ChatSessionRepository();

