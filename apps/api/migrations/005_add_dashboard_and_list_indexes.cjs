/**
 * Migration 005: Add High-Performance Indexes for Dashboard Analytics and Leads List
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Accelerates dashboard time-window range scans with optional project and executive filters
    CREATE INDEX IF NOT EXISTS idx_leads_dashboard_perf
      ON leads(first_touch_at DESC, project_id, assigned_to);

    -- 2. Accelerates 48h SLA breach detection for untouched leads
    CREATE INDEX IF NOT EXISTS idx_leads_sla_untouched
      ON leads(first_touch_at)
      WHERE first_response_at IS NULL;

    -- 3. Accelerates leads list view default ordering and status filtering
    CREATE INDEX IF NOT EXISTS idx_leads_activity_status
      ON leads(last_activity_at DESC, status);

    -- 4. Accelerates source breakdown aggregations and first-touch attribution
    CREATE INDEX IF NOT EXISTS idx_leads_source_time
      ON leads(source, first_touch_at);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_leads_dashboard_perf;
    DROP INDEX IF EXISTS idx_leads_sla_untouched;
    DROP INDEX IF EXISTS idx_leads_activity_status;
    DROP INDEX IF EXISTS idx_leads_source_time;
  `);
};

