/**
 * Migration 007: Add anonymous chat_sessions, decouple startChat from lead creation,
 * track first_response_kind and separate greeting storage.
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Create anonymous chat_sessions table (no PII)
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
      source lead_source NOT NULL DEFAULT 'website',
      project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
      language TEXT NOT NULL DEFAULT 'en',
      first_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      buyer_first_message_at TIMESTAMPTZ NULL,
      first_response_at TIMESTAMPTZ NULL,
      buyer_message_count INT NOT NULL DEFAULT 0,
      has_project_interest BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_lead ON chat_sessions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_source ON chat_sessions(source);

    -- 2. Make conversations.lead_id nullable so anonymous chat can start before lead creation
    ALTER TABLE conversations ALTER COLUMN lead_id DROP NOT NULL;

    -- 3. Link conversations to chat_sessions
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_session_id UUID NULL REFERENCES chat_sessions(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_conversations_chat_session ON conversations(chat_session_id);

    -- 4. Add first_response_kind to leads table
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_kind TEXT NULL;

    -- 5. Add is_greeting flag to messages table
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_greeting BOOLEAN NOT NULL DEFAULT false;

    -- 6. Migrate existing 'Guest Buyer' rows:
    -- For any conversations attached to a 'Guest Buyer' lead, generate a chat_session, link it,
    -- and detach the anonymous conversation from the ghost lead.
    DO $$
    DECLARE
      g_rec RECORD;
      new_session_id UUID;
    BEGIN
      FOR g_rec IN
        SELECT l.id AS lead_id, l.source, l.project_id, l.language, l.first_touch_at, c.id AS conv_id
        FROM leads l
        JOIN conversations c ON c.lead_id = l.id
        WHERE l.name = 'Guest Buyer' AND l.phone_e164 IS NULL
      LOOP
        INSERT INTO chat_sessions (lead_id, source, project_id, language, first_touch_at, created_at, updated_at)
        VALUES (NULL, g_rec.source, g_rec.project_id, COALESCE(g_rec.language, 'en'), g_rec.first_touch_at, g_rec.first_touch_at, g_rec.first_touch_at)
        RETURNING id INTO new_session_id;

        UPDATE conversations
        SET chat_session_id = new_session_id, lead_id = NULL
        WHERE id = g_rec.conv_id;

        -- Remove orphaned Guest Buyer lead if no touchpoints or bookings remain
        DELETE FROM leads
        WHERE id = g_rec.lead_id
          AND NOT EXISTS (SELECT 1 FROM visit_bookings WHERE lead_id = g_rec.lead_id)
          AND NOT EXISTS (SELECT 1 FROM conversations WHERE lead_id = g_rec.lead_id);
      END LOOP;
    END $$;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE messages DROP COLUMN IF EXISTS is_greeting;
    ALTER TABLE leads DROP COLUMN IF EXISTS first_response_kind;
    ALTER TABLE conversations DROP COLUMN IF EXISTS chat_session_id;
    DROP TABLE IF EXISTS chat_sessions CASCADE;
  `);
};

