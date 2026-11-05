# Architecture Overview

## 1. Overview
Housy is a production-quality full-stack TypeScript platform built for Company A (Ahmedabad). The platform provides unified lead intake, duplicate detection, an AI-powered conversational sales assistant, site-visit slot booking with calendar conflict prevention, executive handoff, and an executive analytics dashboard.

---

## 2. Monorepo Layout & Workspaces
The repository is structured as an npm workspaces monorepo:

```
Housy-/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI running lint, typecheck, tests with Postgres 16
├── apps/
│   ├── api/                     # Express + Node 20 backend
│   │   ├── migrations/          # node-pg-migrate SQL migrations
│   │   ├── src/
│   │   │   ├── channels/        # Channel adapters (WhatsApp, SMS, Email outbox)
│   │   │   ├── config/          # Environment configuration validated with Zod
│   │   │   ├── db/              # pg Pool and database connection utilities
│   │   │   ├── errors/          # Typed error hierarchy mapped to HTTP status codes
│   │   │   ├── jobs/            # Scheduled tasks and reminder jobs
│   │   │   ├── llm/             # LLM client adapters and tool definitions
│   │   │   ├── repositories/    # Data layer with parameterized SQL only
│   │   │   ├── routes/          # Express route controllers with Zod input validation
│   │   │   ├── services/        # Domain business logic layer
│   │   │   ├── utils/           # Structured pino logger
│   │   │   ├── app.ts           # Express application setup, middleware, and error handling
│   │   │   └── server.ts        # Server entrypoint and graceful shutdown
│   │   ├── tests/               # Vitest + supertest integration & unit tests
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                     # React 18 + Vite + Tailwind CSS frontend
│       ├── src/
│       │   ├── components/      # UI primitives and domain design system components
│       │   ├── i18n/            # react-i18next setup and en, hi, gu translation bundles
│       │   ├── layouts/         # BuyerLayout (single-column) and StaffLayout (sidebar/drawer)
│       │   ├── lib/             # API client, date formatters (Asia/Kolkata), QueryClient
│       │   ├── pages/           # HealthPage diagnostic dashboard, StyleguidePage
│       │   ├── App.tsx          # Router, ToastProvider, and QueryClientProvider
│       │   └── main.tsx         # React root
│       ├── tests/               # Vitest + React Testing Library component and layout tests
│       ├── .env.example
│       └── package.json
├── packages/
│   └── shared/                  # Common TypeScript types and Zod schemas
│       ├── src/
│       │   ├── errors.ts        # Common error interfaces and schemas
│       │   ├── health.ts        # Health check schema and types
│       │   └── index.ts         # Main package exports
│       ├── tests/               # Unit tests for shared validation contracts
│       └── package.json
├── docs/
│   ├── ARCHITECTURE.md          # System architecture and technical documentation
│   ├── ASSUMPTIONS.md           # Product and technical assumptions log
│   └── BRIEF.md                 # Verbatim client brief
├── docker-compose.yml           # PostgreSQL 16 container definition with health check
├── package.json                 # Monorepo root workspaces and scripts
├── tsconfig.base.json           # Base strict TypeScript compiler options
├── eslint.config.js             # Modern ESLint flat configuration
└── AGENTS.md                    # Contributor rules and guidelines
```

---

## 3. Layering & Design Principles
- **Route Layer (`apps/api/src/routes/`)**: Validates incoming payloads (body, query, params) via Zod schemas and delegates directly to services. Contains zero business logic and zero SQL queries. Returns HTTP response status codes (200 for healthy, 503 for degraded, 4xx for client errors).
- **Service Layer (`apps/api/src/services/`)**: Implements domain business logic, state machines, transactions, and orchestrates repositories. Throws typed `AppError` subclasses.
- **Repository Layer (`apps/api/src/repositories/`)**: Executes parameterized SQL queries using `pg.Pool`. Prevents SQL injection and encapsulates database schema knowledge. All queries pass inputs as positional `$1, $2` parameters.
- **Shared Package (`packages/shared` - `@housy/shared`)**: Single source of truth for contract types and validation schemas shared across web and api.
- **Strict TypeScript Everywhere**: Configured with `strict: true`, `noImplicitAny: true`, and zero tolerance for `any`.

---

## 4. Error Handling Hierarchy (`apps/api/src/errors/`)
Centralized error handling middleware converts errors into structured, predictable JSON payloads matching `ApiErrorResponseSchema`:

| Error Class | HTTP Status | Error Code | Description |
|---|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` | Malformed request syntax |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Request payload fails Zod schema validation |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| `ForbiddenError` | 403 | `FORBIDDEN` | Authenticated user lacks permission |
| `NotFoundError` | 404 | `NOT_FOUND` | Requested resource does not exist |
| `ConflictError` | 409 | `CONFLICT` | Resource conflict (e.g., slot already booked) |
| `DatabaseError` | 500 | `DATABASE_ERROR` | Unrecoverable database failure |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | External dependency or database down |

---

## 5. Asynchronous Messaging & Channel Outbox (`apps/api/src/channels/`)
In adherence to Assumption **A5**, all promotional, notification, and reminder messages (WhatsApp, SMS, Email) are routed through an outbox pattern:
- `ChannelSender` interface with pluggable channel adapters (`OutboxChannelAdapter`).
- Prepares for RERA compliance (displaying project registration numbers) and DPDP Act 2023 consent validation prior to delivery.

---

## 6. Scheduled Jobs (`apps/api/src/jobs/`)
- `ScheduledJob` contract providing structured job execution telemetry (`JobExecutionResult`).
- `ReminderJob`: Scheduled runner designed to evaluate site visit slots requiring 1-day and 2-hour advance reminders.

---

## 7. LLM Assistant Layer (`apps/api/src/llm/`)
- Typed schemas for chat messages (`role`, `content`), tool definitions, and completions.
- `LlmProvider` contract enabling pluggable LLM integrations (e.g. Gemini / OpenAI / Anthropic) with strict fact-sheet grounding.

---

## 8. Database & Persistence
- **Engine**: PostgreSQL 16 Alpine containerized in `docker-compose.yml` with automated `pg_isready` healthcheck.
- **Connection Management**: Connection pooling via `pg.Pool` (`apps/api/src/db/index.ts`) with connection timeouts, parameterized query enforcement, and graceful shutdown hooks (`SIGINT`/`SIGTERM`).
- **Migrations**: Managed via `node-pg-migrate` in `apps/api/migrations/`:
  - `001_initial_schema.cjs`: Installs the `uuid-ossp` PostgreSQL extension.
  - `002_create_core_schema.cjs`: Creates all 19 relational entities, 14 enums, constraints, sequences, and partial unique indexes.
- **Zero Double-Booking Guarantee**:
  - `visit_slots`: Enforces `UNIQUE(executive_id, starts_at)` to prevent scheduling overlaps for a single sales executive.
  - `visit_bookings`: Enforces partial unique index `idx_visit_bookings_unique_active_slot` on `(slot_id) WHERE status = 'confirmed'`, mathematically guaranteeing zero concurrent active bookings on any slot.
  - Lead visit concurrency: Enforces partial unique index `idx_visit_bookings_unique_active_lead` on `(lead_id) WHERE status = 'confirmed'`, preventing a single buyer from holding multiple conflicting active site visit appointments simultaneously.
- **Database Reset & Deterministic Seeding**:
  - Script: `npm run db:reset` runs programmatic downward migrations, migrates upward, and seeds realistic test data.
  - Engine (`apps/api/src/db/seed.ts`): Uses a deterministic Pseudo-Random Number Generator (LCG, seed `42`) to guarantee identical, idempotent fixtures across local machines and CI.

---

## 9. Time Zone Standard
- **Storage**: All database timestamps are persisted as UTC (`TIMESTAMPTZ` in PostgreSQL, ISO 8601 strings in JSON / APIs).
- **Presentation**: All timestamps presented to the user are formatted in the `Asia/Kolkata` time zone (IST, UTC+05:30) using `apps/web/src/lib/date.ts`.

---

## 10. Database Schema Entity Catalog
The 19 relational entities in PostgreSQL:

| Entity | Primary Key | Key Attributes & Foreign Keys | Purpose |
|---|---|---|---|
| `users` | `UUID` | `email` (unique), `password_hash`, `role` (`executive`, `sales_head`), `phone`, `active` | Staff authentication, executive assignment, and role-based access. |
| `projects` | `UUID` | `name`, `rera_number`, `address`, `lat`, `lng`, `bhk_types` | Developer residential projects (Project 1 & Project 2). |
| `fact_entries` | `UUID` | `project_id` (FK projects, nullable), `key`, `title`, `value`, `category`, `status` (`active`, `archived`) | Ground truth facts for AI assistant answers and admin overrides. |
| `fact_entry_versions` | `UUID` | `fact_entry_id` (FK fact_entries), `value`, `changed_by` (FK users), `changed_at` | Audit trail of edits to knowledge base facts. |
| `leads` | `UUID` | `public_id` (e.g. `LD-58210`), `phone_e164`, `email`, `source`, `project_id`, `assigned_to` (FK users), `status`, `possible_duplicate_of` (FK leads) | Ingested buyer records across property portals, ads, web, and hoardings. |
| `lead_touchpoints` | `UUID` | `lead_id` (FK leads), `source`, `channel`, `occurred_at`, `external_id`, `raw` (`jsonb`) | Omnichannel interaction event stream and raw intake payloads. |
| `consents` | `UUID` | `lead_id` (FK leads), `purpose`, `granted`, `notice_version`, `channel`, `at` | DPDP Act 2023 compliance audit trail for digital personal data processing. |
| `conversations` | `UUID` | `lead_id` (FK leads), `language`, `status` (`ai`, `human`, `closed`), `flagged`, `flag_reasons`, `reviewed_by` (FK users) | Buyer-assistant conversational threads with AI safety review flagging. |
| `messages` | `UUID` | `conversation_id` (FK conversations), `role`, `content`, `cited_fact_ids` (`uuid[]`), `meta` (`jsonb`) | Verbatim transcript messages grounded in cited fact entry UUIDs. |
| `availability_rules` | `UUID` | `project_id` (FK projects), `executive_id` (FK users), `weekday`, `start_time`, `end_time`, `slot_minutes` | Weekly operating hours and recurring availability rules (10:00–18:00 IST). |
| `blackout_dates` | `UUID` | `project_id` (FK projects, nullable), `executive_id` (FK users, nullable), `date`, `reason` | Public holidays, developer office closures, or executive leave dates. |
| `visit_slots` | `UUID` | `project_id` (FK projects), `executive_id` (FK users), `starts_at`, `ends_at`, `status` (`open`, `booked`, `blocked`) | Calendar time slots (60 minutes each); unique on `(executive_id, starts_at)`. |
| `visit_bookings` | `UUID` | `lead_id` (FK leads), `slot_id` (FK visit_slots), `status`, `idempotency_key` | Confirmed site visit reservations protected by partial unique indexes. |
| `handoffs` | `UUID` | `lead_id` (FK leads), `conversation_id`, `executive_id`, `reason`, `summary` (`jsonb`), `status` | Warm transfer transitions from AI assistant to assigned sales executive. |
| `reminders` | `UUID` | `booking_id` (FK visit_bookings), `kind` (`24h`, `2h`), `scheduled_at`, `status`, `attempt_count` | Automated pre-visit alerts scheduled 1 day and 2 hours prior to visit. |
| `outbound_messages` | `UUID` | `channel`, `recipient`, `template_id`, `variables` (`jsonb`), `status`, `sent_at`, `error_message` | Outbox table backing mock delivery for WhatsApp, SMS, and Email. |
| `ad_spend` | `UUID` | `month` (`DATE`), `source`, `amount_inr` | Monthly acquisition marketing spend tracking (₹30 Lakh/month across 4 sources). |
| `audit_log` | `UUID` | `actor_id` (FK users, nullable), `action`, `entity_type`, `entity_id`, `changes` (`jsonb`), `ip_address` | Immutable administrative audit log tracking data modifications. |
| `llm_calls` | `UUID` | `conversation_id`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`, `model`, `grounded_facts_count` | AI telemetry tracking token usage, latency, and fact citation density. |

---

## 11. Design Tokens & Styling (`apps/web`)
The client requested a calm, minimal, and premium aesthetic fitting ₹65L – ₹1.2 Cr residences:
- **Palette**:
  - `background`: `#FBFAF8`
  - `surface`: `#FFFFFF`
  - `ink`: `#16181D`
  - `muted`: `#6B6F76`
  - `hairline`: `#E7E4DE`
  - `accent`: `#1F4D45` (deep green; exactly one accent color across the app)
  - `accent-soft`: `#E8EFEC`
  - `success`: `#2F6B4F`
  - `warning`: `#A8741A`
  - `danger`: `#A33A3A`
  - Zero gradients, zero emojis, and zero heavy shadows.
- **Typography**:
  - Headings: `Cormorant Garamond` (refined serif).
  - Body: `Inter` (geometric sans-serif).
  - Fallbacks: `Noto Sans Devanagari` and `Noto Sans Gujarati`.
  - Self-hosted locally via `@fontsource/*` (zero external network font requests).
- **Spatial Geometry & Accessibility**:
  - 8px spacing grid.
  - 12px border radius (`rounded-xl`).
  - 44px minimum touch targets on interactive controls (`min-h-[44px]`, `min-w-[44px]`).
  - Explicit focus ring styling: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`.
  - `prefers-reduced-motion` media query compliance disabling animations and transitions for sensitive users.

---

## 12. Component Catalog (`apps/web/src/components/`)
A comprehensive set of accessible, strictly typed React components:
- **`Button`**: Primary, secondary, outline, ghost, danger variants; sm/md/lg sizes; loading & disabled states; 44px min touch target.
- **`Input`**: Text, number, tel, email; label, helper text, error state, left/right icons, disabled.
- **`Select`**: Dropdown with custom chevron, label, error state, options.
- **`Textarea`**: Multi-line input with label, error state, rows.
- **`Checkbox`**: Custom checkmark with label, description, error state, 44px touch area.
- **`Card`**: Surface card with hairline border, subtle shadow, compound header/title/description/content/footer.
- **`Badge`**: Source tags as subtle outlined chips (`Property Portal`, `Social Media`, `Hoarding Call`, `Website`), plus neutral, accent, success, warning, danger chips.
- **`Tabs`**: Underline and pill variants, keyboard accessible (ArrowLeft/Right, Home/End), badge support.
- **`Modal`**: Centered dialog or slide-over drawer/sheet with backdrop blur, focus handling, Escape key listener.
- **`Toast`**: Context-driven notification provider with auto-dismiss and accessible polite live regions.
- **`Skeleton`**: Subtle pulsing placeholders (text, circular, rectangular).
- **`EmptyState`**: Purposeful empty view with icon, description, and useful next action button.
- **`ErrorState`**: Error view with retry action button and optional technical details disclosure.
- **`StatTile`**: Executive metric tile with serif value, trend delta indicator, and subtitle.
- **`ChatBubble`**: Buyer (user), assistant, executive, and system chat bubbles with timestamps and status indicators.
- **`SlotChip`**: 60-minute site visit slot chip (available, selected, booked/disabled) with 44px touch target.
- **`ResponsiveTable`**: Full table view on desktop (`>= md`), stacked mobile card view on phones (`< md`).
- **`PageHeader`**: Serif page title, description, optional badge, and responsive action button toolbar.
- **`LanguageSwitcher`**: Pill component to toggle between English, Hindi, and Gujarati.

---

## 13. Application Shell Layouts (`apps/web/src/layouts/`)
- **`BuyerLayout`**: Single centered column (`max-w-2xl`), mobile-first design, clean top bar with language switcher, and regulatory footer displaying RERA registration (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) and DPDP Act 2023 privacy consent notice.
- **`StaffLayout`**: Desktop persistent sidebar with company identity, role badges (`Sales Head (Admin)` vs `Sales Executive`), navigation links (`Leads`, `Visits`, `Fact Sheet`, `Analytics`, `Design System`), and mobile responsive top bar with drawer navigation.

---

## 14. Internationalization (i18n) (`apps/web/src/i18n/`)
- Configured via `react-i18next` with three language bundles:
  - English (`en`): default
  - Hindi (`hi`): हिन्दी
  - Gujarati (`gu`): ગુજરાતી
- Covers all buyer-facing strings, greeting messages, project details, legal statements, and slot booking interactions.
- Selected language is persisted in `localStorage`.

---

## 15. Styleguide Route (`/styleguide`)
- Route accessible at `/styleguide` showcasing every design system token, atomic primitive, domain component, and state (default, active, loading, disabled, error) in both Staff and Buyer layouts.
