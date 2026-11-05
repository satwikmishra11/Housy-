import type { PoolClient, QueryResultRow } from 'pg';
import { pool, query } from '../db/index.js';
import type {
  FactStatus,
  FactEntry,
  FactEntryVersion,
  CreateFactPayload,
  UpdateFactPayload,
  UnansweredQuestion,
  UnansweredQuestionStatus,
} from '@housy/shared';

interface DbFactRow extends QueryResultRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  key: string;
  title: string;
  value: string;
  category: string;
  status: FactStatus;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: Date;
  created_at: Date;
}

interface DbFactVersionRow extends QueryResultRow {
  id: string;
  fact_entry_id: string;
  version_number: number;
  title: string;
  value: string;
  category: string;
  status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: Date;
}

interface DbUnansweredRow extends QueryResultRow {
  id: string;
  question: string;
  buyer_language: string;
  project_id: string | null;
  project_name: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  status: UnansweredQuestionStatus;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface FactFilters {
  projectId?: string | null;
  category?: string;
  status?: FactStatus;
  search?: string;
}

export class FactRepository {
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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

  async findFacts(filters: FactFilters = {}, client?: PoolClient): Promise<FactEntry[]> {
    const q = client ? client.query.bind(client) : query;
    let sql = `
      SELECT f.id, f.project_id, p.name as project_name, f.key, f.title, f.value,
             f.category, f.status, f.updated_by, u.name as updated_by_name,
             f.updated_at, f.created_at
      FROM fact_entries f
      LEFT JOIN projects p ON p.id = f.project_id
      LEFT JOIN users u ON u.id = f.updated_by
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters.projectId !== undefined) {
      if (filters.projectId === null) {
        sql += ` AND f.project_id IS NULL`;
      } else {
        params.push(filters.projectId);
        sql += ` AND (f.project_id = $${params.length} OR f.project_id IS NULL)`;
      }
    }

    if (filters.category) {
      params.push(filters.category.trim());
      sql += ` AND LOWER(f.category) = LOWER($${params.length})`;
    }

    if (filters.status) {
      params.push(filters.status);
      sql += ` AND f.status = $${params.length}`;
    }

    if (filters.search) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` AND (f.title ILIKE $${params.length} OR f.value ILIKE $${params.length} OR f.key ILIKE $${params.length})`;
    }

    sql += ` ORDER BY f.category ASC, f.title ASC`;

    const res = await q<DbFactRow>(sql, params);
    return res.rows.map(this.mapDbFactRowToFactEntry);
  }

  async findFactById(id: string, client?: PoolClient): Promise<FactEntry | null> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbFactRow>(
      `SELECT f.id, f.project_id, p.name as project_name, f.key, f.title, f.value,
              f.category, f.status, f.updated_by, u.name as updated_by_name,
              f.updated_at, f.created_at
       FROM fact_entries f
       LEFT JOIN projects p ON p.id = f.project_id
       LEFT JOIN users u ON u.id = f.updated_by
       WHERE f.id = $1
       LIMIT 1`,
      [id],
    );
    if (!res.rows[0]) return null;
    return this.mapDbFactRowToFactEntry(res.rows[0]);
  }

  async findFactByKeyAndProject(
    key: string,
    projectId: string | null = null,
    client?: PoolClient,
  ): Promise<FactEntry | null> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbFactRow>(
      `SELECT f.id, f.project_id, p.name as project_name, f.key, f.title, f.value,
              f.category, f.status, f.updated_by, u.name as updated_by_name,
              f.updated_at, f.created_at
       FROM fact_entries f
       LEFT JOIN projects p ON p.id = f.project_id
       LEFT JOIN users u ON u.id = f.updated_by
       WHERE LOWER(f.key) = LOWER($1)
         AND COALESCE(f.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
       LIMIT 1`,
      [key.trim(), projectId],
    );
    if (!res.rows[0]) return null;
    return this.mapDbFactRowToFactEntry(res.rows[0]);
  }

  async insertFact(
    client: PoolClient,
    payload: CreateFactPayload,
    userId: string,
  ): Promise<FactEntry> {
    const res = await client.query<DbFactRow>(
      `INSERT INTO fact_entries (project_id, key, title, value, category, status, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
       RETURNING id, project_id, NULL as project_name, key, title, value, category, status,
                 updated_by, NULL as updated_by_name, updated_at, created_at`,
      [
        payload.projectId || null,
        payload.key.trim(),
        payload.title.trim(),
        payload.value.trim(),
        payload.category.trim().toLowerCase(),
        userId,
      ],
    );
    return this.mapDbFactRowToFactEntry(res.rows[0]!);
  }

  async updateFact(
    client: PoolClient,
    id: string,
    payload: UpdateFactPayload,
    userId: string,
  ): Promise<FactEntry> {
    const res = await client.query<DbFactRow>(
      `UPDATE fact_entries
       SET title = COALESCE($1, title),
           value = COALESCE($2, value),
           category = COALESCE($3, category),
           status = COALESCE($4, status),
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, project_id, NULL as project_name, key, title, value, category, status,
                 updated_by, NULL as updated_by_name, updated_at, created_at`,
      [
        payload.title ? payload.title.trim() : null,
        payload.value ? payload.value.trim() : null,
        payload.category ? payload.category.trim().toLowerCase() : null,
        payload.status ?? null,
        userId,
        id,
      ],
    );
    return this.mapDbFactRowToFactEntry(res.rows[0]!);
  }

  async getNextVersionNumber(client: PoolClient, factEntryId: string): Promise<number> {
    const res = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM fact_entry_versions
       WHERE fact_entry_id = $1`,
      [factEntryId],
    );
    return Number(res.rows[0]?.next_version || 1);
  }

  async insertFactVersion(
    client: PoolClient,
    fact: FactEntry,
    versionNumber: number,
    userId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO fact_entry_versions (
         fact_entry_id, version_number, title, value, category, status, changed_by, changed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        fact.id,
        versionNumber,
        fact.title,
        fact.value,
        fact.category,
        fact.status,
        userId,
      ],
    );
  }

  async getFactVersions(factEntryId: string, client?: PoolClient): Promise<FactEntryVersion[]> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbFactVersionRow>(
      `SELECT v.id, v.fact_entry_id, v.version_number, v.title, v.value,
              v.category, v.status, v.changed_by, u.name as changed_by_name, v.changed_at
       FROM fact_entry_versions v
       LEFT JOIN users u ON u.id = v.changed_by
       WHERE v.fact_entry_id = $1
       ORDER BY v.version_number DESC`,
      [factEntryId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      factEntryId: r.fact_entry_id,
      versionNumber: r.version_number,
      title: r.title,
      value: r.value,
      category: r.category,
      status: r.status,
      changedBy: r.changed_by,
      changedByName: r.changed_by_name,
      changedAt: r.changed_at.toISOString(),
    }));
  }

  async insertAuditLog(
    client: PoolClient,
    actorId: string | null,
    action: string,
    entity: string,
    entityId: string,
    diff: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, diff, at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [actorId, action, entity, entityId, JSON.stringify(diff)],
    );
  }

  async findUnansweredQuestions(
    status?: UnansweredQuestionStatus,
    client?: PoolClient,
  ): Promise<UnansweredQuestion[]> {
    const q = client ? client.query.bind(client) : query;
    let sql = `
      SELECT q.id, q.question, q.buyer_language, q.project_id, p.name as project_name,
             q.conversation_id, q.lead_id, q.status, q.resolved_by, u.name as resolved_by_name,
             q.resolved_at, q.created_at
      FROM unanswered_questions q
      LEFT JOIN projects p ON p.id = q.project_id
      LEFT JOIN users u ON u.id = q.resolved_by
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      sql += ` AND q.status = $1`;
    }
    sql += ` ORDER BY q.created_at DESC`;

    const res = await q<DbUnansweredRow>(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      question: r.question,
      buyerLanguage: r.buyer_language,
      projectId: r.project_id,
      projectName: r.project_name,
      conversationId: r.conversation_id,
      leadId: r.lead_id,
      status: r.status,
      resolvedBy: r.resolved_by,
      resolvedByName: r.resolved_by_name,
      resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async resolveUnansweredQuestion(
    id: string,
    status: 'resolved' | 'dismissed',
    userId: string,
    client?: PoolClient,
  ): Promise<UnansweredQuestion | null> {
    const q = client ? client.query.bind(client) : query;
    const res = await q<DbUnansweredRow>(
      `UPDATE unanswered_questions
       SET status = $1, resolved_by = $2, resolved_at = NOW()
       WHERE id = $3
       RETURNING id, question, buyer_language, project_id, NULL as project_name,
                 conversation_id, lead_id, status, resolved_by, NULL as resolved_by_name,
                 resolved_at, created_at`,
      [status, userId, id],
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      question: r.question,
      buyerLanguage: r.buyer_language,
      projectId: r.project_id,
      projectName: r.project_name,
      conversationId: r.conversation_id,
      leadId: r.lead_id,
      status: r.status,
      resolvedBy: r.resolved_by,
      resolvedByName: r.resolved_by_name,
      resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapDbFactRowToFactEntry(row: DbFactRow): FactEntry {
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      key: row.key,
      title: row.title,
      value: row.value,
      category: row.category,
      status: row.status,
      updatedBy: row.updated_by,
      updatedByName: row.updated_by_name,
      updatedAt: row.updated_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }
}

export const factRepository = new FactRepository();
