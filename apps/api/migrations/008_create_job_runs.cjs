/**
 * Migration 008: Create job_runs table for background job execution tracking,
 * failure isolation, and health check SLA monitoring.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job VARCHAR(64) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL,
      ok BOOLEAN NOT NULL,
      counts JSONB NOT NULL DEFAULT '{}',
      error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_job_runs_job_finished ON job_runs (job, finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_runs_created_at ON job_runs (created_at DESC);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS job_runs;
  `);
};

