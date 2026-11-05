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

/**
 * Repository layer for Sales Dashboard analytics.
 *
 * All queries are strictly parameterized ($1, $2, ...) and adhere to 3-tier architecture.
 *
 * Documented Metric Definitions:
 * 1. Median First Response Time:
 *    50th percentile (PERCENTILE_CONT(0.5)) of EXTRACT(EPOCH FROM (first_response_at - first_touch_at))
 *    for leads where first_response_at IS NOT NULL. Target SLA: < 5 minutes (300 seconds).
 * 2. Leads Not Reached Within 48 Hours:
 *    Count of leads in period where (first_response_at IS NULL AND NOW() - first_touch_at > INTERVAL '48 hours')
 *    OR (first_response_at IS NOT NULL AND first_response_at - first_touch_at > INTERVAL '48 hours').
 *    Target SLA: < 5% of period leads.
 * 3. Engaged Leads:
 *    Leads where status != 'new' (or touchpoints/messages exchanged).
 * 4. Visits Booked:
 *    Leads where status IN ('visit_booked', 'visited', 'no_show') or active/completed booking exists in visit_bookings.
 * 5. Visits Completed:
 *    Leads where status = 'visited' or booking status = 'completed'.
 * 6. Visits No-Show:
 *    Leads where status = 'no_show' or booking status = 'no_show'.
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
        COUNT(*) FILTER (WHERE l.status NOT IN ('new'))::int AS engaged_leads,
        COUNT(*) FILTER (
          WHERE l.status IN ('visit_booked', 'visited', 'no_show')
             OR EXISTS (
               SELECT 1 FROM visit_bookings vb
               WHERE vb.lead_id = l.id AND vb.status IN ('confirmed', 'completed', 'no_show')
             )
        )::int AS visits_booked,
        COUNT(*) FILTER (
          WHERE l.status = 'visited'
             OR EXISTS (
               SELECT 1 FROM visit_bookings vb
               WHERE vb.lead_id = l.id AND vb.status = 'completed'
             )
        )::int AS visits_completed,
        COUNT(*) FILTER (
          WHERE l.status = 'no_show'
             OR (
               EXISTS (
                 SELECT 1 FROM visit_bookings vb
                 WHERE vb.lead_id = l.id AND vb.status = 'no_show'
               ) AND l.status != 'visited'
             )
        )::int AS visits_no_show,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_response_at - l.first_touch_at))
        ) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_at >= l.first_touch_at) AS median_response_seconds,
        COUNT(*) FILTER (
          WHERE (l.first_response_at IS NULL AND (NOW() - l.first_touch_at > INTERVAL '48 hours'))
             OR (l.first_response_at IS NOT NULL AND (l.first_response_at - l.first_touch_at > INTERVAL '48 hours'))
        )::int AS unreached_48h_count
      FROM leads l
      WHERE ${whereClauses.join(' AND ')}
    `;

    const res = await query<RawSummaryMetricsRow>(sql, params);
    const row = res.rows[0];

    return {
      total_leads: Number(row?.total_leads ?? 0),
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
        COUNT(*) FILTER (WHERE l.status NOT IN ('new'))::int AS engaged_leads,
        COUNT(*) FILTER (
          WHERE l.status IN ('visit_booked', 'visited', 'no_show')
             OR EXISTS (
               SELECT 1 FROM visit_bookings vb
               WHERE vb.lead_id = l.id AND vb.status IN ('confirmed', 'completed', 'no_show')
             )
        )::int AS visits_booked,
        COUNT(*) FILTER (
          WHERE l.status = 'visited'
             OR EXISTS (
               SELECT 1 FROM visit_bookings vb
               WHERE vb.lead_id = l.id AND vb.status = 'completed'
             )
        )::int AS visits_completed,
        COUNT(*) FILTER (
          WHERE l.status = 'no_show'
             OR (
               EXISTS (
                 SELECT 1 FROM visit_bookings vb
                 WHERE vb.lead_id = l.id AND vb.status = 'no_show'
               ) AND l.status != 'visited'
             )
        )::int AS visits_no_show,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l.first_response_at - l.first_touch_at))
        ) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_at >= l.first_touch_at) AS median_response_seconds,
        COUNT(*) FILTER (
          WHERE (l.first_response_at IS NULL AND (NOW() - l.first_touch_at > INTERVAL '48 hours'))
             OR (l.first_response_at IS NOT NULL AND (l.first_response_at - l.first_touch_at > INTERVAL '48 hours'))
        )::int AS unreached_48h_count
      FROM leads l
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY l.source
      ORDER BY total_leads DESC
    `;

    const res = await query<RawSourceMetricsRow>(sql, params);
    return res.rows.map((row) => ({
      source: row.source,
      total_leads: Number(row.total_leads ?? 0),
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
