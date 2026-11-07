import type { QueryResultRow, PoolClient } from 'pg';
import { query, pool } from '../db/index.js';
import type { LeadSource, LeadStatus, ConsentStatus } from '@housy/shared';

export interface LeadDbRow extends QueryResultRow {
  id: string;
  public_id: string;
  name: string;
  phone_e164: string | null;
  email: string | null;
  source: LeadSource;
  project_id: string | null;
  wants: string;
  budget_min: number | null;
  budget_max: number | null;
  timeline: string | null;
  language: string;
  status: LeadStatus;
  assigned_to: string | null;
  possible_duplicate_of: string | null;
  first_touch_at: Date;
  first_response_at: Date | null;
  last_activity_at: Date;
  consent_status: ConsentStatus;
  opted_out_at: Date | null;
  created_at: Date;
  project_name?: string | null;
  assigned_to_name?: string | null;
  possible_duplicate_name?: string | null;
  touchpoints_count?: number;
}

export interface LeadTouchpointDbRow extends QueryResultRow {
  id: string;
  lead_id: string;
  source: string;
  channel: string;
  occurred_at: Date;
  external_id: string | null;
  raw: Record<string, unknown>;
}

export interface SourceApiKeyDbRow extends QueryResultRow {
  id: string;
  source: LeadSource;
  key_hash: string;
  name: string;
  active: boolean;
  created_at: Date;
  last_used_at: Date | null;
}

export interface CreateLeadParams {
  name: string;
  phoneE164: string | null;
  email: string | null;
  source: LeadSource;
  projectId?: string | null;
  wants?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeline?: string | null;
  language?: string;
  status?: LeadStatus;
  possibleDuplicateOf?: string | null;
  consentStatus?: ConsentStatus;
  firstResponseAt?: Date | null;
}

export interface AddTouchpointParams {
  leadId: string;
  source: string;
  channel: string;
  occurredAt?: Date;
  externalId?: string | null;
  raw?: Record<string, unknown>;
}

export interface ListLeadsParams {
  assignedTo?: string | null; // For executive role scoping
  source?: LeadSource;
  projectId?: string;
  status?: LeadStatus;
  duplicatesOnly?: boolean;
  unassignedOnly?: boolean;
  search?: string;
  sortBy?: 'last_activity_at' | 'first_touch_at' | 'name';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export class LeadRepository {
  /**
   * Find a lead by exact phone number (E.164).
   */
  async findExactByPhone(phoneE164: string): Promise<LeadDbRow | null> {
    const res = await query<LeadDbRow>(
      `SELECT * FROM leads WHERE phone_e164 = $1 LIMIT 1`,
      [phoneE164],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Find a lead by exact email (case-insensitive).
   */
  async findExactByEmail(email: string): Promise<LeadDbRow | null> {
    const res = await query<LeadDbRow>(
      `SELECT * FROM leads WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email.trim()],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Find a lead on the same project with name similarity >= 0.85 using pg_trgm.
   */
  async findFuzzyByNameAndProject(name: string, projectId: string | null): Promise<LeadDbRow | null> {
    if (projectId) {
      const res = await query<LeadDbRow>(
        `SELECT l.*, similarity(l.name, $1) as sim
         FROM leads l
         WHERE l.project_id = $2
           AND similarity(l.name, $1) >= 0.85
         ORDER BY sim DESC
         LIMIT 1`,
        [name.trim(), projectId],
      );
      return res.rows[0] ?? null;
    } else {
      const res = await query<LeadDbRow>(
        `SELECT l.*, similarity(l.name, $1) as sim
         FROM leads l
         WHERE l.project_id IS NULL
           AND similarity(l.name, $1) >= 0.85
         ORDER BY sim DESC
         LIMIT 1`,
        [name.trim()],
      );
      return res.rows[0] ?? null;
    }
  }

  /**
   * Find touchpoint by source and external_id for idempotency.
   */
  async findTouchpointBySourceAndExternalId(
    source: string,
    externalId: string,
  ): Promise<LeadTouchpointDbRow | null> {
    const res = await query<LeadTouchpointDbRow>(
      `SELECT * FROM lead_touchpoints WHERE source = $1 AND external_id = $2 LIMIT 1`,
      [source, externalId],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Insert a new lead record.
   */
  async createLead(params: CreateLeadParams): Promise<LeadDbRow> {
    const res = await query<LeadDbRow>(
      `INSERT INTO leads (
         name, phone_e164, email, source, project_id, wants,
         budget_min, budget_max, timeline, language, status,
         possible_duplicate_of, consent_status, first_response_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        params.name.trim(),
        params.phoneE164,
        params.email,
        params.source,
        params.projectId ?? null,
        params.wants ?? '2 BHK',
        params.budgetMin ?? null,
        params.budgetMax ?? null,
        params.timeline ?? null,
        params.language ?? 'en',
        params.status ?? 'new',
        params.possibleDuplicateOf ?? null,
        params.consentStatus ?? 'unknown',
        params.firstResponseAt ?? null,
      ],
    );
    return res.rows[0]!;
  }

  /**
   * Insert a touchpoint for a lead.
   */
  async addTouchpoint(params: AddTouchpointParams): Promise<LeadTouchpointDbRow> {
    const res = await query<LeadTouchpointDbRow>(
      `INSERT INTO lead_touchpoints (lead_id, source, channel, occurred_at, external_id, raw)
       VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6)
       RETURNING *`,
      [
        params.leadId,
        params.source,
        params.channel,
        params.occurredAt ?? null,
        params.externalId ?? null,
        JSON.stringify(params.raw ?? {}),
      ],
    );
    return res.rows[0]!;
  }

  /**
   * Update last_activity_at timestamp.
   */
  async updateLastActivity(leadId: string): Promise<void> {
    await query(`UPDATE leads SET last_activity_at = NOW() WHERE id = $1`, [leadId]);
  }

  /**
   * Update phone_e164 for late phone binding.
   */
  async updatePhone(leadId: string, phoneE164: string): Promise<void> {
    await query(
      `UPDATE leads SET phone_e164 = $1, last_activity_at = NOW() WHERE id = $2`,
      [phoneE164, leadId],
    );
  }

  /**
   * Record consent entry in consents table and update lead's consent status.
   */
  async recordConsent(
    leadId: string,
    granted: boolean,
    channel: string,
    purpose = 'lead_followup',
    noticeVersion = 'v1.0',
  ): Promise<void> {
    const status: ConsentStatus = granted ? 'granted' : 'withdrawn';
    await query(
      `INSERT INTO consents (lead_id, purpose, granted, notice_version, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [leadId, purpose, granted, noticeVersion, channel],
    );
    await query(
      `UPDATE leads SET consent_status = $1, last_activity_at = NOW() WHERE id = $2`,
      [status, leadId],
    );
  }

  /**
   * Queue outbound message in outbound_messages table and set first_response_at on lead.
   */
  async queueOutboundFirstResponse(
    leadId: string,
    channel: 'whatsapp' | 'sms' | 'email',
    templateKey: string,
    body: string,
  ): Promise<void> {
    await query(
      `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [leadId, channel, templateKey, body],
    );
    await query(
      `UPDATE leads
       SET first_response_at = NOW(),
           first_response_kind = COALESCE(first_response_kind, 'outbound_message'),
           last_activity_at = NOW()
       WHERE id = $1 AND first_response_at IS NULL`,
      [leadId],
    );
  }

  /**
   * Clear possible duplicate link ("Keep separate").
   */
  async clearPossibleDuplicate(leadId: string): Promise<void> {
    await query(
      `UPDATE leads SET possible_duplicate_of = NULL, last_activity_at = NOW() WHERE id = $1`,
      [leadId],
    );
  }

  /**
   * Find lead by ID with project and assigned user names.
   */
  async findById(id: string): Promise<LeadDbRow | null> {
    const res = await query<LeadDbRow>(
      `SELECT l.*,
              p.name as project_name,
              u.name as assigned_to_name,
              dup.name as possible_duplicate_name,
              (SELECT COUNT(*)::int FROM lead_touchpoints WHERE lead_id = l.id) as touchpoints_count
       FROM leads l
       LEFT JOIN projects p ON l.project_id = p.id
       LEFT JOIN users u ON l.assigned_to = u.id
       LEFT JOIN leads dup ON l.possible_duplicate_of = dup.id
       WHERE l.id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Find full lead details including touchpoints, conversations, bookings, and handoffs.
   */
  async findDetailsById(id: string) {
    const lead = await this.findById(id);
    if (!lead) return null;

    const [tpRes, convRes, bookRes, handoffRes] = await Promise.all([
      query<LeadTouchpointDbRow>(
        `SELECT id, lead_id, source, channel, occurred_at, external_id, raw
         FROM lead_touchpoints
         WHERE lead_id = $1
         ORDER BY occurred_at DESC`,
        [id],
      ),
      query<{
        id: string;
        status: 'ai' | 'human' | 'closed';
        language: string;
        flagged: boolean;
        flag_reasons: string[];
        created_at: Date;
        messages_count: number;
      }>(
        `SELECT c.id, c.status, c.language, c.flagged, c.flag_reasons, c.created_at,
                (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id) as messages_count
         FROM conversations c
         WHERE c.lead_id = $1
         ORDER BY c.created_at DESC`,
        [id],
      ),
      query<{
        id: string;
        status: string;
        starts_at: Date;
        ends_at: Date;
        project_name: string;
        executive_name: string;
      }>(
        `SELECT b.id, b.status, s.starts_at, s.ends_at, p.name as project_name, u.name as executive_name
         FROM visit_bookings b
         JOIN visit_slots s ON b.slot_id = s.id
         JOIN projects p ON s.project_id = p.id
         JOIN users u ON s.executive_id = u.id
         WHERE b.lead_id = $1
         ORDER BY s.starts_at DESC`,
        [id],
      ),
      query<{
        id: string;
        reason: string;
        summary: Record<string, unknown>;
        status: string;
        executive_name: string;
        created_at: Date;
      }>(
        `SELECT h.id, h.reason, h.summary, h.status, u.name as executive_name, h.created_at
         FROM handoffs h
         JOIN users u ON h.executive_id = u.id
         WHERE h.lead_id = $1
         ORDER BY h.created_at DESC`,
        [id],
      ),
    ]);

    return {
      lead,
      touchpoints: tpRes.rows,
      conversations: convRes.rows,
      bookings: bookRes.rows,
      handoffs: handoffRes.rows,
    };
  }

  /**
   * Filtered, paginated lead listing. Parameterized queries only.
   */
  async listLeads(params: ListLeadsParams): Promise<{ leads: LeadDbRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.assignedTo) {
      conditions.push(`l.assigned_to = $${paramIndex++}`);
      values.push(params.assignedTo);
    }

    if (params.source) {
      conditions.push(`l.source = $${paramIndex++}`);
      values.push(params.source);
    }

    if (params.projectId) {
      conditions.push(`l.project_id = $${paramIndex++}`);
      values.push(params.projectId);
    }

    if (params.status) {
      conditions.push(`l.status = $${paramIndex++}`);
      values.push(params.status);
    }

    if (params.duplicatesOnly) {
      conditions.push(`l.possible_duplicate_of IS NOT NULL`);
    }

    if (params.unassignedOnly) {
      conditions.push(`l.assigned_to IS NULL`);
    }

    if (params.search && params.search.trim().length > 0) {
      const searchPattern = `%${params.search.trim()}%`;
      conditions.push(
        `(l.name ILIKE $${paramIndex} OR l.phone_e164 ILIKE $${paramIndex} OR l.email ILIKE $${paramIndex} OR l.public_id ILIKE $${paramIndex})`,
      );
      values.push(searchPattern);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countQuery = `SELECT COUNT(*)::int as total FROM leads l ${whereClause}`;
    const countRes = await query<{ total: number }>(countQuery, values);
    const total = countRes.rows[0]?.total ?? 0;

    // Sorting column validation (strict whitelist)
    const validSortCols: Record<string, string> = {
      last_activity_at: 'l.last_activity_at',
      first_touch_at: 'l.first_touch_at',
      name: 'l.name',
    };
    const sortCol = validSortCols[params.sortBy ?? 'last_activity_at'] ?? 'l.last_activity_at';
    const sortDirection = params.order === 'asc' ? 'ASC' : 'DESC';

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const dataValues = [...values, limit, offset];
    const dataQuery = `
      SELECT l.*,
             p.name as project_name,
             u.name as assigned_to_name,
             dup.name as possible_duplicate_name,
             (SELECT COUNT(*)::int FROM lead_touchpoints WHERE lead_id = l.id) as touchpoints_count
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN leads dup ON l.possible_duplicate_of = dup.id
      ${whereClause}
      ORDER BY ${sortCol} ${sortDirection}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataRes = await query<LeadDbRow>(dataQuery, dataValues);
    return { leads: dataRes.rows, total };
  }

  /**
   * Execute manual lead merge in a single database transaction.
   * Moves touchpoints, conversations, bookings, consents, outbound messages, handoffs,
   * re-parents possible_duplicate_of references, and deletes the secondary lead.
   */
  async mergeLeadsTransaction(primaryLeadId: string, secondaryLeadId: string): Promise<void> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Move lead touchpoints
      await client.query(
        `UPDATE lead_touchpoints SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 2. Move conversations
      await client.query(
        `UPDATE conversations SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 3. Move visit bookings
      await client.query(
        `UPDATE visit_bookings SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 4. Move consents
      await client.query(
        `UPDATE consents SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 5. Move outbound messages
      await client.query(
        `UPDATE outbound_messages SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 6. Move handoffs
      await client.query(
        `UPDATE handoffs SET lead_id = $1 WHERE lead_id = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 7. Re-parent any third lead that had possible_duplicate_of pointing to secondary
      await client.query(
        `UPDATE leads SET possible_duplicate_of = $1 WHERE possible_duplicate_of = $2`,
        [primaryLeadId, secondaryLeadId],
      );

      // 8. Delete the secondary lead
      await client.query(`DELETE FROM leads WHERE id = $1`, [secondaryLeadId]);

      // 9. Update primary lead's last_activity_at and clear possible_duplicate_of if it pointed to secondary
      await client.query(
        `UPDATE leads
         SET last_activity_at = NOW(),
             possible_duplicate_of = CASE WHEN possible_duplicate_of = $2 THEN NULL ELSE possible_duplicate_of END
         WHERE id = $1`,
        [primaryLeadId, secondaryLeadId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Move a conversation from an anonymous lead to an identified lead, moving touchpoints
   * and removing the anonymous stub lead.
   */
  async mergeAnonymousConversation(
    anonLeadId: string,
    existingLeadId: string,
    conversationId: string,
  ): Promise<void> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update conversation's lead_id
      await client.query(
        `UPDATE conversations SET lead_id = $1 WHERE id = $2`,
        [existingLeadId, conversationId],
      );

      // Move any touchpoints recorded under anon lead
      await client.query(
        `UPDATE lead_touchpoints SET lead_id = $1 WHERE lead_id = $2`,
        [existingLeadId, anonLeadId],
      );

      // Delete the anonymous lead stub
      await client.query(`DELETE FROM leads WHERE id = $1`, [anonLeadId]);

      // Touch existing lead
      await client.query(
        `UPDATE leads SET last_activity_at = NOW() WHERE id = $1`,
        [existingLeadId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Verify source API key and record last_used_at.
   */
  async findActiveSourceKey(source: LeadSource, keyHash: string): Promise<SourceApiKeyDbRow | null> {
    const res = await query<SourceApiKeyDbRow>(
      `SELECT * FROM source_api_keys WHERE source = $1 AND key_hash = $2 AND active = true LIMIT 1`,
      [source, keyHash],
    );
    const row = res.rows[0];
    if (row) {
      await query(`UPDATE source_api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id]);
    }
    return row ?? null;
  }
}

export const leadRepository = new LeadRepository();
