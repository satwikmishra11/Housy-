import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { LeadSource } from '@housy/shared';

export interface DashboardFilterDbOptions {
  fromUtc: Date;
  toUtc: Date;
  projectId?: string;
  executiveId?: string;
}

export interface RawSummaryMetricsRow extends QueryResultRow {
  total_leads: number;
  chats_started: number;
  contactable_leads_count: number;
  not_contactable_count: number;
  engaged_leads: number;
  visits_booked: number;
  visits_completed: number;
  visits_no_show: number;
  median_response_seconds: number | null;
  unreached_48h_count: number;
}

export interface RawSourceMetricsRow extends QueryResultRow {
  source: LeadSource;
  total_leads: number;
  chats_started: number;
  contactable_leads_count: number;
  not_contactable_count: number;
  engaged_leads: number;
  visits_booked: number;
  visits_completed: number;
  visits_no_show: number;
  median_response_seconds: number | null;
  unreached_48h_count: number;
}

export interface RawAdSpendRow extends QueryResultRow {
  month: string;
  source: LeadSource;
  amount_inr: string | number;
}

export interface RawBeforeAfterCohortRow extends QueryResultRow {
  cohort: 'before' | 'after';
  total_leads: number;
  contactable_leads: number;
  visits_completed: number;
  median_response_seconds: number | null;
  unreached_48h_count: number;
}

/**
 * Repository layer for Sales Dashboard analytics.
 *
 * All queries are strictly parameterized ($1, $2, ...) and adhere to 3-tier architecture.
 *
 * Documented Metric Definitions:
 * 1. Median First Response Time:
 *    50th percentile (PERCENTILE_CONT(0.5)) of EXTRACT(EPOCH FROM (first_response_at - first_touch_at))
 *    for leads where first_response_at IS NOT NULL. Target SLA: < 5 minutes (300 seconds).
 *    For chat: time from buyer's first message to first substantive answer (greeting stored separately).
 *    For ingested leads: time to first outbound dispatch.
 * 2. Leads Not Reached Within 48 Hours:
 *    Count of contactable leads (consent_status = 'granted' and opted_out_at IS NULL) where
 *    (first_response_at IS NULL AND NOW() - first_touch_at > INTERVAL '48 hours')
 *    OR (first_response_at IS NOT NULL AND first_response_at - first_touch_at > INTERVAL '48 hours').
 *    Non-consented leads are excluded from SLA denominator and shown as "not contactable".
 * 3. Engaged Leads:
 *    Leads where status != 'new' (or touchpoints/messages exchanged).
 * 4. Visits Booked (Single Source of Truth):
 *    Leads where status IN ('visit_booked', 'visited', 'no_show').
 * 5. Visits Completed (Single Source of Truth):
 *    Leads where status = 'visited'.
 * 6. Visits No-Show (Single Source of Truth):
 *    Leads where status = 'no_show'.
 * 7. Show-up Rate:
 *    visits_completed / (visits_completed + visits_no_show).
 * 8. Lead-to-Visit Rate:
 *    visits_completed / total_leads (target 8%, baseline 6%).
 * 9. First-Touch Attribution:
 *    All metrics group by the lead's immutable first-touch source recorded in leads.source.
 */
export class DashboardRepository {
  /**
   * Computes aggregate summary metrics across all matching leads for the period.
   */
  async getSummaryMetrics(options: DashboardFilterDbOptions): Promise<RawSummaryMetricsRow> {
    const params: unknown[] = [options.fromUtc, options.toUtc];
    const whereClauses: string[] = ['l.first_touch_at >= $1', 'l.first_touch_at <= $2'];

    if (options.projectId) {
      params.push(options.projectId);
      whereClauses.push(`l.project_id = $${params.length}`);
    }

    if (options.executiveId) {
      params.push(options.executiveId);
      whereClauses.push(`l.assigned_to = $${params.length}`);
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)::int AS contactable_leads_count,
        COUNT(*) FILTER (WHERE l.consent_status = 'withdrawn' OR l.opted_out_at IS NOT NULL)::int AS not_contactable_count,
        COUNT(*) FILTER (WHERE l.status NOT IN ('new'))::int AS engaged_leads,
        COUNT(*) FILTER (WHERE l.status IN ('visit_booked', 'visited', 'no_show'))::int AS visits_booked,
        COUNT(*) FILTER (WHERE l.status = 'visited')::int AS visits_completed,
        COUNT(*) FILTER (WHERE l.status = 'no_show')::int AS visits_no_show,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_response_at - l.first_touch_at))
        ) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_at >= l.first_touch_at) AS median_response_seconds,
        COUNT(*) FILTER (
          WHERE (l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)
            AND (
              (l.first_response_at IS NULL AND (NOW() - l.first_touch_at > INTERVAL '48 hours'))
              OR (l.first_response_at IS NOT NULL AND (l.first_response_at - l.first_touch_at > INTERVAL '48 hours'))
            )
        )::int AS unreached_48h_count
      FROM leads l
      WHERE ${whereClauses.join(' AND ')}
    `;

    const chatsParams: unknown[] = [options.fromUtc, options.toUtc];
    let chatsSql = `SELECT COUNT(*)::int AS count FROM chat_sessions cs WHERE cs.created_at >= $1 AND cs.created_at <= $2`;
    if (options.projectId) {
      chatsParams.push(options.projectId);
      chatsSql += ` AND cs.project_id = $3`;
    }

    const [leadsRes, chatsRes] = await Promise.all([
      query<RawSummaryMetricsRow>(sql, params),
      query<{ count: number }>(chatsSql, chatsParams),
    ]);

    const row = leadsRes.rows[0];
    const chatsStarted = Number(chatsRes.rows[0]?.count ?? 0);

    return {
      total_leads: Number(row?.total_leads ?? 0),
      chats_started: chatsStarted,
      contactable_leads_count: Number(row?.contactable_leads_count ?? 0),
      not_contactable_count: Number(row?.not_contactable_count ?? 0),
      engaged_leads: Number(row?.engaged_leads ?? 0),
      visits_booked: Number(row?.visits_booked ?? 0),
      visits_completed: Number(row?.visits_completed ?? 0),
      visits_no_show: Number(row?.visits_no_show ?? 0),
      median_response_seconds:
        row?.median_response_seconds !== null && row?.median_response_seconds !== undefined
          ? Number(row.median_response_seconds)
          : null,
      unreached_48h_count: Number(row?.unreached_48h_count ?? 0),
    };
  }

  /**
   * Computes metrics grouped by first-touch marketing source.
   */
  async getBySourceMetrics(options: DashboardFilterDbOptions): Promise<RawSourceMetricsRow[]> {
    const params: unknown[] = [options.fromUtc, options.toUtc];
    const whereClauses: string[] = ['l.first_touch_at >= $1', 'l.first_touch_at <= $2'];

    if (options.projectId) {
      params.push(options.projectId);
      whereClauses.push(`l.project_id = $${params.length}`);
    }

    if (options.executiveId) {
      params.push(options.executiveId);
      whereClauses.push(`l.assigned_to = $${params.length}`);
    }

    const sql = `
      SELECT
        l.source,
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)::int AS contactable_leads_count,
        COUNT(*) FILTER (WHERE l.consent_status = 'withdrawn' OR l.opted_out_at IS NOT NULL)::int AS not_contactable_count,
        COUNT(*) FILTER (WHERE l.status NOT IN ('new'))::int AS engaged_leads,
        COUNT(*) FILTER (WHERE l.status IN ('visit_booked', 'visited', 'no_show'))::int AS visits_booked,
        COUNT(*) FILTER (WHERE l.status = 'visited')::int AS visits_completed,
        COUNT(*) FILTER (WHERE l.status = 'no_show')::int AS visits_no_show,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_response_at - l.first_touch_at))
        ) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_at >= l.first_touch_at) AS median_response_seconds,
        COUNT(*) FILTER (
          WHERE (l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)
            AND (
              (l.first_response_at IS NULL AND (NOW() - l.first_touch_at > INTERVAL '48 hours'))
              OR (l.first_response_at IS NOT NULL AND (l.first_response_at - l.first_touch_at > INTERVAL '48 hours'))
            )
        )::int AS unreached_48h_count
      FROM leads l
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY l.source
      ORDER BY total_leads DESC
    `;

    const chatsParams: unknown[] = [options.fromUtc, options.toUtc];
    let chatsSql = `
      SELECT cs.source, COUNT(*)::int AS count
      FROM chat_sessions cs
      WHERE cs.created_at >= $1 AND cs.created_at <= $2
    `;
    if (options.projectId) {
      chatsParams.push(options.projectId);
      chatsSql += ` AND cs.project_id = $3`;
    }
    chatsSql += ` GROUP BY cs.source`;

    const [res, chatsBySourceRes] = await Promise.all([
      query<RawSourceMetricsRow>(sql, params),
      query<{ source: LeadSource; count: number }>(chatsSql, chatsParams),
    ]);

    const chatsMap = new Map<LeadSource, number>();
    for (const c of chatsBySourceRes.rows) {
      chatsMap.set(c.source, Number(c.count));
    }

    return res.rows.map((row) => ({
      source: row.source,
      total_leads: Number(row.total_leads ?? 0),
      chats_started: chatsMap.get(row.source) ?? 0,
      contactable_leads_count: Number(row.contactable_leads_count ?? 0),
      not_contactable_count: Number(row.not_contactable_count ?? 0),
      engaged_leads: Number(row.engaged_leads ?? 0),
      visits_booked: Number(row.visits_booked ?? 0),
      visits_completed: Number(row.visits_completed ?? 0),
      visits_no_show: Number(row.visits_no_show ?? 0),
      median_response_seconds:
        row.median_response_seconds !== null && row.median_response_seconds !== undefined
          ? Number(row.median_response_seconds)
          : null,
      unreached_48h_count: Number(row.unreached_48h_count ?? 0),
    }));
  }

  /**
   * Computes Before vs After go-live cohort metrics to evaluate AI assistant impact.
   */
  async getBeforeAfterCohortMetrics(
    goLiveDateIso: string,
    options: { projectId?: string; executiveId?: string } = {},
  ): Promise<RawBeforeAfterCohortRow[]> {
    const params: unknown[] = [goLiveDateIso];
    const whereClauses: string[] = ['1=1'];

    if (options.projectId) {
      params.push(options.projectId);
      whereClauses.push(`l.project_id = $${params.length}`);
    }

    if (options.executiveId) {
      params.push(options.executiveId);
      whereClauses.push(`l.assigned_to = $${params.length}`);
    }

    const sql = `
      SELECT
        CASE WHEN l.first_touch_at < $1 THEN 'before' ELSE 'after' END AS cohort,
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)::int AS contactable_leads,
        COUNT(*) FILTER (WHERE l.status = 'visited')::int AS visits_completed,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_response_at - l.first_touch_at))
        ) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_at >= l.first_touch_at) AS median_response_seconds,
        COUNT(*) FILTER (
          WHERE (l.consent_status != 'withdrawn' AND l.opted_out_at IS NULL)
            AND (
              (l.first_response_at IS NULL AND (NOW() - l.first_touch_at > INTERVAL '48 hours'))
              OR (l.first_response_at IS NOT NULL AND (l.first_response_at - l.first_touch_at > INTERVAL '48 hours'))
            )
        )::int AS unreached_48h_count
      FROM leads l
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY cohort
    `;

    const res = await query<RawBeforeAfterCohortRow>(sql, params);
    return res.rows;
  }

  /**
   * Retrieves ad spend records for the given normalized month strings (YYYY-MM-01).
   */
  async getAdSpendForMonths(months: string[]): Promise<Map<string, number>> {
    const spendMap = new Map<string, number>();
    if (months.length === 0) return spendMap;

    const res = await query<RawAdSpendRow>(
      `SELECT month::text as month, source, amount_inr
       FROM ad_spend
       WHERE month = ANY($1::date[])`,
      [months],
    );

    for (const r of res.rows) {
      // Key format: "YYYY-MM-01:source"
      const key = `${r.month.slice(0, 10)}:${r.source}`;
      spendMap.set(key, Number(r.amount_inr));
    }

    return spendMap;
  }
}

export const dashboardRepository = new DashboardRepository();

