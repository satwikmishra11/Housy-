import type { QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import type { JobRunItem, JobsHealth } from '@housy/shared';

export interface JobRunRow extends QueryResultRow {
  id: string;
  job: string;
  started_at: Date;
  finished_at: Date;
  ok: boolean;
  counts: Record<string, unknown>;
  error: string | null;
  created_at: Date;
}

export class JobRunRepository {
  /**
   * Logs a completed or failed background job execution.
   */
  async createRun(data: {
    job: string;
    startedAt: Date;
    finishedAt: Date;
    ok: boolean;
    counts?: Record<string, unknown>;
    error?: string | null;
  }): Promise<JobRunRow> {
    const res = await query<JobRunRow>(
      `INSERT INTO job_runs (job, started_at, finished_at, ok, counts, error, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        data.job,
        data.startedAt,
        data.finishedAt,
        data.ok,
        JSON.stringify(data.counts ?? {}),
        data.error ?? null,
      ],
    );
    return res.rows[0]!;
  }

  /**
   * Retrieves recent job runs across all background jobs.
   */
  async getRecentRuns(limit = 10): Promise<JobRunItem[]> {
    const res = await query<JobRunRow>(
      `SELECT id, job, started_at, finished_at, ok, counts, error, created_at
       FROM job_runs
       ORDER BY finished_at DESC
       LIMIT $1`,
      [limit],
    );

    return res.rows.map((row) => ({
      id: row.id,
      job: row.job,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: new Date(row.finished_at).toISOString(),
      ok: row.ok,
      counts: (typeof row.counts === 'object' && row.counts !== null ? row.counts : {}) as Record<string, unknown>,
      error: row.error,
      durationMs: Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()),
    }));
  }

  /**
   * Retrieves the most recent execution record for a specific job name.
   */
  async getLatestRun(job: string): Promise<JobRunRow | null> {
    const res = await query<JobRunRow>(
      `SELECT * FROM job_runs
       WHERE job = $1
       ORDER BY finished_at DESC
       LIMIT 1`,
      [job],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Checks the health and freshness of background jobs.
   * Reminders are flagged overdue if no run has completed in the last 10 minutes.
   */
  async getJobsHealth(recentLimit = 10): Promise<JobsHealth> {
    const [latestReminder, recentRuns] = await Promise.all([
      this.getLatestRun('reminders'),
      this.getRecentRuns(recentLimit),
    ]);

    const now = Date.now();
    const tenMinutesMs = 10 * 60 * 1000;

    let remindersStatus: 'ok' | 'overdue' | 'never_run' = 'never_run';
    let remindersOverdue = true;
    let remindersLastRunAt: string | null = null;

    if (latestReminder) {
      remindersLastRunAt = new Date(latestReminder.finished_at).toISOString();
      const elapsedMs = now - new Date(latestReminder.finished_at).getTime();
      if (elapsedMs <= tenMinutesMs && latestReminder.ok) {
        remindersStatus = 'ok';
        remindersOverdue = false;
      } else {
        remindersStatus = 'overdue';
        remindersOverdue = true;
      }
    }

    return {
      remindersStatus,
      remindersLastRunAt,
      remindersOverdue,
      recentRuns,
    };
  }
}

export const jobRunRepository = new JobRunRepository();

