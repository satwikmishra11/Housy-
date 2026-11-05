/**
 * Migration 004: Create unanswered_questions table for assistant knowledge gap tracking
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE unanswered_questions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      question TEXT NOT NULL,
      buyer_language TEXT NOT NULL DEFAULT 'en',
      project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
      conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
      lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'dismissed')),
      resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_unanswered_questions_status ON unanswered_questions(status, created_at DESC);
    CREATE INDEX idx_unanswered_questions_project ON unanswered_questions(project_id);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS unanswered_questions CASCADE;
  `);
};

