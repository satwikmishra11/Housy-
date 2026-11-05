/**
 * Migration 003: Enable pg_trgm, add source_api_keys, and touchpoint deduplication index
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Enable pg_trgm for fuzzy string similarity search
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- 2. GIN trigram index on leads.name for similarity matching
    CREATE INDEX idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);

    -- 3. Unique index on source + external_id for idempotent ingest
    CREATE UNIQUE INDEX idx_touchpoints_source_external_id ON lead_touchpoints(source, external_id) WHERE external_id IS NOT NULL;

    -- 4. Source API Keys table for webhook/ingest authentication
    CREATE TABLE source_api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      source lead_source NOT NULL UNIQUE,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NULL
    );
    CREATE INDEX idx_source_api_keys_lookup ON source_api_keys(source, active);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS source_api_keys;
    DROP INDEX IF EXISTS idx_touchpoints_source_external_id;
    DROP INDEX IF EXISTS idx_leads_name_trgm;
    DROP EXTENSION IF EXISTS pg_trgm;
  `);
};

