/**
 * Migration 006: Add user languages, handoff events, open handoff constraint, internal outbox channel, and staff notifications
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Add languages array to users table for language-matched routing
    ALTER TABLE users ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT ARRAY['en']::text[];
    CREATE INDEX IF NOT EXISTS idx_users_languages ON users USING GIN (languages);

    -- 2. Add priority and escalation fields to handoffs table
    ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT false;

    -- Clean up any legacy duplicate open handoffs prior to index creation (keep most recent)
    UPDATE handoffs h1
    SET status = 'done', updated_at = NOW()
    WHERE status IN ('new', 'accepted')
      AND EXISTS (
        SELECT 1 FROM handoffs h2
        WHERE h2.conversation_id = h1.conversation_id
          AND h2.status IN ('new', 'accepted')
          AND (h2.created_at > h1.created_at OR (h2.created_at = h1.created_at AND h2.id > h1.id))
      );

    -- 3. Enforce exactly one open handoff per conversation with a partial unique index
    CREATE UNIQUE INDEX IF NOT EXISTS idx_handoffs_open_conversation ON handoffs(conversation_id) WHERE status IN ('new', 'accepted');

    -- 4. Create handoff_events table to log recurring triggers, notes, and priority escalations
    CREATE TABLE IF NOT EXISTS handoff_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      handoff_id UUID NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_handoff_events_handoff ON handoff_events(handoff_id, created_at ASC);

    -- 5. Add 'internal' channel to channel_type enum for internal executive notification mirroring
    ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'internal';

    -- 6. Create staff_notifications table for in-app notification bell
    CREATE TABLE IF NOT EXISTS staff_notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staff_notifications_user ON staff_notifications(user_id, is_read, created_at DESC);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS staff_notifications;
    DROP TABLE IF EXISTS handoff_events;
    DROP INDEX IF EXISTS idx_handoffs_open_conversation;
    ALTER TABLE handoffs DROP COLUMN IF EXISTS is_escalated;
    ALTER TABLE handoffs DROP COLUMN IF EXISTS priority;
    DROP INDEX IF EXISTS idx_users_languages;
    ALTER TABLE users DROP COLUMN IF EXISTS languages;
  `);
};
