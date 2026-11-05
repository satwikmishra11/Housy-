import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { LeadSource, MonthSpendRecord } from '@housy/shared';

interface DbAdSpendRow extends QueryResultRow {
  id: string;
  month: string;
  source: LeadSource;
  amount_inr: string | number;
  created_at: Date;
}

export class AdSpendRepository {
  async getSpendForMonth(normalizedMonthDate: string): Promise<MonthSpendRecord[]> {
    const res = await query<DbAdSpendRow>(
      `SELECT id, month::text as month, source, amount_inr, created_at
       FROM ad_spend
       WHERE month = $1
       ORDER BY source ASC`,
      [normalizedMonthDate],
    );

    return res.rows.map((r) => ({
      id: r.id,
      month: r.month,
      source: r.source,
      amountInr: Number(r.amount_inr),
      createdAt: r.created_at.toISOString(),
    }));
  }

  async listRecordedMonths(): Promise<string[]> {
    const res = await query<{ month: string }>(
      `SELECT DISTINCT month::text as month FROM ad_spend ORDER BY month DESC`,
    );
    return res.rows.map((r) => r.month);
  }

  async upsertSpend(
    normalizedMonthDate: string,
    source: LeadSource,
    amountInr: number,
  ): Promise<MonthSpendRecord> {
    const res = await query<DbAdSpendRow>(
      `INSERT INTO ad_spend (month, source, amount_inr)
       VALUES ($1, $2, $3)
       ON CONFLICT (month, source) DO UPDATE SET amount_inr = EXCLUDED.amount_inr
       RETURNING id, month::text as month, source, amount_inr, created_at`,
      [normalizedMonthDate, source, amountInr],
    );

    const r = res.rows[0]!;
    return {
      id: r.id,
      month: r.month,
      source: r.source,
      amountInr: Number(r.amount_inr),
      createdAt: r.created_at.toISOString(),
    };
  }
}

export const adSpendRepository = new AdSpendRepository();
