/**
 * Migration 002: Core Schema for Housy Platform
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    -- ENUM TYPES
    CREATE TYPE user_role AS ENUM ('executive', 'sales_head');
    CREATE TYPE fact_status AS ENUM ('active', 'archived');
    CREATE TYPE lead_source AS ENUM ('property_portal', 'social_ad', 'website', 'hoarding_call');
    CREATE TYPE lead_status AS ENUM ('new', 'engaged', 'visit_booked', 'visited', 'no_show', 'lost');
    CREATE TYPE consent_status AS ENUM ('granted', 'withdrawn', 'unknown');
    CREATE TYPE conversation_status AS ENUM ('ai', 'human', 'closed');
    CREATE TYPE message_role AS ENUM ('buyer', 'assistant', 'executive', 'system');
    CREATE TYPE slot_status AS ENUM ('open', 'booked', 'blocked');
    CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
    CREATE TYPE handoff_status AS ENUM ('new', 'accepted', 'done');
    CREATE TYPE reminder_kind AS ENUM ('24h', '2h');
    CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'skipped', 'cancelled', 'failed');
    CREATE TYPE channel_type AS ENUM ('whatsapp', 'sms', 'email');
    CREATE TYPE outbound_status AS ENUM ('pending', 'sent', 'failed');

    -- SEQUENCES
    CREATE SEQUENCE lead_public_id_seq START WITH 58210;

    -- 1. USERS
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role user_role NOT NULL,
      phone TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_users_role_active ON users(role, active);

    -- 2. PROJECTS
    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      rera_number TEXT NOT NULL,
      address TEXT NOT NULL,
      lat NUMERIC(10, 7) NOT NULL,
      lng NUMERIC(10, 7) NOT NULL,
      bhk_types TEXT[] NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 3. FACT ENTRIES
    CREATE TABLE fact_entries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      status fact_status NOT NULL DEFAULT 'active',
      updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX idx_fact_entries_project_key ON fact_entries(COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
    CREATE INDEX idx_fact_entries_category ON fact_entries(category, status);

    -- 4. FACT ENTRY VERSIONS
    CREATE TABLE fact_entry_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      fact_entry_id UUID NOT NULL REFERENCES fact_entries(id) ON DELETE CASCADE,
      version_number INT NOT NULL,
      title TEXT NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      changed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_fact_versions_entry ON fact_entry_versions(fact_entry_id, version_number DESC);

    -- 5. LEADS
    CREATE TABLE leads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      public_id TEXT UNIQUE NOT NULL DEFAULT ('LD-' || nextval('lead_public_id_seq')),
      name TEXT NOT NULL,
      phone_e164 TEXT UNIQUE NULL,
      email TEXT NULL,
      source lead_source NOT NULL,
      project_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL,
      wants TEXT NOT NULL,
      budget_min BIGINT NULL,
      budget_max BIGINT NULL,
      timeline TEXT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      status lead_status NOT NULL DEFAULT 'new',
      assigned_to UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      possible_duplicate_of UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
      first_touch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_response_at TIMESTAMPTZ NULL,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consent_status consent_status NOT NULL DEFAULT 'unknown',
      opted_out_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_leads_source ON leads(source);
    CREATE INDEX idx_leads_status ON leads(status);
    CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
    CREATE INDEX idx_leads_project_id ON leads(project_id);
    CREATE INDEX idx_leads_possible_dup ON leads(possible_duplicate_of);
    CREATE INDEX idx_leads_first_touch_at ON leads(first_touch_at DESC);

    -- 6. LEAD TOUCHPOINTS
    CREATE TABLE lead_touchpoints (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      channel TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      external_id TEXT NULL,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX idx_touchpoints_lead ON lead_touchpoints(lead_id, occurred_at DESC);

    -- 7. CONSENTS
    CREATE TABLE consents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      granted BOOLEAN NOT NULL,
      notice_version TEXT NOT NULL,
      channel TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_consents_lead_at ON consents(lead_id, at DESC);

    -- 8. CONVERSATIONS
    CREATE TABLE conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT 'en',
      status conversation_status NOT NULL DEFAULT 'ai',
      flagged BOOLEAN NOT NULL DEFAULT false,
      flag_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      reviewed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ NULL,
      review_note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_conversations_lead ON conversations(lead_id);
    CREATE INDEX idx_conversations_status ON conversations(status);
    CREATE INDEX idx_conversations_flagged ON conversations(flagged) WHERE flagged = true;

    -- 9. MESSAGES
    CREATE TABLE messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role message_role NOT NULL,
      content TEXT NOT NULL,
      cited_fact_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

    -- 10. AVAILABILITY RULES
    CREATE TABLE availability_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      executive_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL CHECK (end_time > start_time),
      slot_minutes INT NOT NULL DEFAULT 60 CHECK (slot_minutes > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_avail_rules_exec ON availability_rules(executive_id, weekday);

    -- 11. BLACKOUT DATES
    CREATE TABLE blackout_dates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
      executive_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
      blackout_date DATE NOT NULL,
      reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_blackout_dates ON blackout_dates(blackout_date);

    -- 12. VISIT SLOTS
    CREATE TABLE visit_slots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      executive_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
      status slot_status NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_executive_slot UNIQUE(executive_id, starts_at)
    );
    CREATE INDEX idx_slots_project_time ON visit_slots(project_id, starts_at, status);

    -- 13. VISIT BOOKINGS
    CREATE TABLE visit_bookings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      slot_id UUID NOT NULL REFERENCES visit_slots(id) ON DELETE CASCADE,
      status booking_status NOT NULL DEFAULT 'confirmed',
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX idx_visit_bookings_unique_active_slot ON visit_bookings(slot_id) WHERE status = 'confirmed';
    CREATE UNIQUE INDEX idx_visit_bookings_unique_active_lead ON visit_bookings(lead_id) WHERE status = 'confirmed';
    CREATE INDEX idx_visit_bookings_lead_status ON visit_bookings(lead_id, status);

    -- 14. HANDOFFS
    CREATE TABLE handoffs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      executive_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      status handoff_status NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_handoffs_executive_status ON handoffs(executive_id, status);

    -- 15. REMINDERS
    CREATE TABLE reminders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      booking_id UUID NOT NULL REFERENCES visit_bookings(id) ON DELETE CASCADE,
      kind reminder_kind NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status reminder_status NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_attempt_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_reminders_scheduled_status ON reminders(scheduled_at, status);

    -- 16. OUTBOUND MESSAGES (Outbox Pattern)
    CREATE TABLE outbound_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      channel channel_type NOT NULL,
      template_key TEXT NOT NULL,
      body TEXT NOT NULL,
      status outbound_status NOT NULL DEFAULT 'pending',
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ NULL
    );
    CREATE INDEX idx_outbound_status_created ON outbound_messages(status, created_at ASC);

    -- 17. AD SPEND
    CREATE TABLE ad_spend (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      month DATE NOT NULL,
      source lead_source NOT NULL,
      amount_inr NUMERIC(12, 2) NOT NULL CHECK (amount_inr >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_month_source UNIQUE(month, source)
    );
    CREATE INDEX idx_ad_spend_month ON ad_spend(month);

    -- 18. AUDIT LOG
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      diff JSONB NOT NULL DEFAULT '{}'::jsonb,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id, at DESC);

    -- 19. LLM CALLS
    CREATE TABLE llm_calls (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      latency_ms INT NOT NULL CHECK (latency_ms >= 0),
      input_tokens INT NOT NULL CHECK (input_tokens >= 0),
      output_tokens INT NOT NULL CHECK (output_tokens >= 0),
      outcome TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_llm_calls_conversation ON llm_calls(conversation_id, created_at DESC);
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS llm_calls CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS ad_spend CASCADE;
    DROP TABLE IF EXISTS outbound_messages CASCADE;
    DROP TABLE IF EXISTS reminders CASCADE;
    DROP TABLE IF EXISTS handoffs CASCADE;
    DROP TABLE IF EXISTS visit_bookings CASCADE;
    DROP TABLE IF EXISTS visit_slots CASCADE;
    DROP TABLE IF EXISTS blackout_dates CASCADE;
    DROP TABLE IF EXISTS availability_rules CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS consents CASCADE;
    DROP TABLE IF EXISTS lead_touchpoints CASCADE;
    DROP TABLE IF EXISTS leads CASCADE;
    DROP TABLE IF EXISTS fact_entry_versions CASCADE;
    DROP TABLE IF EXISTS fact_entries CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS users CASCADE;

    DROP SEQUENCE IF EXISTS lead_public_id_seq CASCADE;

    DROP TYPE IF EXISTS outbound_status CASCADE;
    DROP TYPE IF EXISTS channel_type CASCADE;
    DROP TYPE IF EXISTS reminder_status CASCADE;
    DROP TYPE IF EXISTS reminder_kind CASCADE;
    DROP TYPE IF EXISTS handoff_status CASCADE;
    DROP TYPE IF EXISTS booking_status CASCADE;
    DROP TYPE IF EXISTS slot_status CASCADE;
    DROP TYPE IF EXISTS message_role CASCADE;
    DROP TYPE IF EXISTS conversation_status CASCADE;
    DROP TYPE IF EXISTS consent_status CASCADE;
    DROP TYPE IF EXISTS lead_status CASCADE;
    DROP TYPE IF EXISTS lead_source CASCADE;
    DROP TYPE IF EXISTS fact_status CASCADE;
    DROP TYPE IF EXISTS user_role CASCADE;
  `);
};
