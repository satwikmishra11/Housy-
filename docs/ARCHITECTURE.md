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
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| `DatabaseError` | 500 | `DATABASE_ERROR` | Unrecoverable database failure |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | External dependency or database down |

---

## 5. Authentication, Authorization (RBAC) & API Hygiene

### Staff Authentication & Password Security
- **Hashing**: Passwords are saved with Argon2id (`argon2` module) with OWASP-recommended memory (19 MiB) and time costs. Passwords come strictly from seed scripts or user registration, never hard-coded in app code paths.
- **JWT Session Tokens**: Encoded via `jose` with HMAC-SHA256 and signed with `JWT_SECRET`. Stored in an `httpOnly`, `SameSite=Lax`, `Secure` (production) cookie named `staff_token` with a 24-hour lifetime.
- **CSRF Protection**: Mutating HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) require a custom header (`X-Requested-With`, `X-CSRF-Token`, or `X-Housy-Client`). Browser-enforced preflight requirements prevent cross-origin HTML form exploits.
- **Session Introspection**: `GET /api/auth/me` returns authenticated profile. `POST /api/auth/logout` clears auth cookies.

### Role-Based Access Control (RBAC) & Resource Ownership
- **Roles**: `executive` and `sales_head` (admin).
- **Middleware**:
  - `authenticateStaff`: Extracts and validates JWT from cookie or `Authorization: Bearer <token>` header.
  - `requireAuth`: Enforces that an authenticated staff session is present (returns 401).
  - `requireRole(...roles)`: Enforces allowed roles for the target action (returns 403).
- **Ownership Enforcement**:
  - `assertLeadOwnership(leadId, user)`: Sales Executives see and edit **only leads assigned to them**. Sales Head has global organizational visibility.
  - Forbidden lead access explicitly returns **HTTP 403 Forbidden** (not 404), distinguishing unassigned resources from non-existent resources.

### Buyer Sessions & Magic Link Tokens
- **Buyer Sessions**: Signed `buyer_session` cookie tied to an active chat conversation (`conversationId`), enabling continuous dialogue across page visits without passwords.
- **Single-Purpose Magic Links**: Signed JWTs with `purpose: 'manage_visit'` and 48-hour expiration for the self-serve visit management page.

### API Hygiene & Protection
- **Security Headers**: Configured via `helmet()` for defense-in-depth HTTP response protection.
- **Strict CORS Allowlist**: Reads allowed origins from `CORS_ORIGIN` env, blocking unauthorized cross-origin requests with 403.
- **Rate Limiting (`express-rate-limit`)**:
  - General API: 100 req/min per IP.
  - Staff Login: 5 attempts per 15-minute window per IP to eliminate brute-force password cracking.
  - Chat Assistant: 30 req/min tracked per IP and buyer session token.
- **Pino Telemetry & Redaction**: Request correlation via `X-Request-Id` UUIDs. Built-in pino redaction replaces `password`, `email`, `phone`, `token`, and `cookie` fields with `[REDACTED]` across logs.
- **Payload Limits**: Ingestion bodies restricted to `100kb` to protect against Denial of Service memory exhaustion.

---

## 6. Asynchronous Messaging & Channel Outbox (`apps/api/src/channels/`)
In adherence to Assumption **A5**, all promotional, notification, and reminder messages (WhatsApp, SMS, Email) are routed through an outbox pattern:
- `ChannelSender` interface with pluggable channel adapters (`OutboxChannelAdapter`).
- Prepares for RERA compliance (displaying project registration numbers) and DPDP Act 2023 consent validation prior to delivery.

---

## 7. Scheduled Jobs (`apps/api/src/jobs/`)
- `ScheduledJob` contract providing structured job execution telemetry (`JobExecutionResult`).
- `ReminderJob`: Scheduled runner designed to evaluate site visit slots requiring 1-day and 2-hour advance reminders.

---

## 8. LLM Assistant Layer (`apps/api/src/llm/`)
- Typed schemas for chat messages (`role`, `content`), tool definitions, and completions.
- `LlmProvider` contract enabling pluggable LLM integrations (e.g. Gemini / OpenAI / Anthropic) with strict fact-sheet grounding.

---

## 9. Database & Persistence
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

## 10. Time Zone Standard
- **Storage**: All database timestamps are persisted as UTC (`TIMESTAMPTZ` in PostgreSQL, ISO 8601 strings in JSON / APIs).
- **Presentation**: All timestamps presented to the user are formatted in the `Asia/Kolkata` time zone (IST, UTC+05:30) using `apps/web/src/lib/date.ts`.

---

## 11. Database Schema Entity Catalog
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

## 12. Design Tokens & Styling (`apps/web`)
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

## 13. Component Catalog (`apps/web/src/components/`)
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

## 14. Application Shell Layouts (`apps/web/src/layouts/`)
- **`BuyerLayout`**: Single centered column (`max-w-2xl`), mobile-first design, clean top bar with language switcher, and regulatory footer displaying RERA registration (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) and DPDP Act 2023 privacy consent notice.
- **`StaffLayout`**: Desktop persistent sidebar with company identity, role badges (`Sales Head (Admin)` vs `Sales Executive`), navigation links (`Leads`, `Visits`, `Fact Sheet`, `Analytics`, `Design System`), and mobile responsive top bar with drawer navigation. Includes authenticated user indicator, logout trigger, and role-based link indicators.

---

## 15. Internationalization (i18n) (`apps/web/src/i18n/`)
- Configured via `react-i18next` with three language bundles:
  - English (`en`): default
  - Hindi (`hi`): हिन्दी
  - Gujarati (`gu`): ગુજરાતી
- Covers all buyer-facing strings, greeting messages, project details, legal statements, and slot booking interactions.
- Selected language is persisted in `localStorage`.

---

## 16. Styleguide Route (`/styleguide`)
- Route accessible at `/styleguide` showcasing every design system token, atomic primitive, domain component, and state (default, active, loading, disabled, error) in both Staff and Buyer layouts.

---

## 14. Internationalization (i18n) (`apps/web/src/i18n/`)
- Configured via `react-i18next` with three language bundles:
  - English (`en`): default
  - Hindi (`hi`): हिन्दी
  - Gujarati (`gu`): ગુજરાતી
- Covers all buyer-facing strings, greeting messages, project details, legal statements, and slot booking interactions.
- Selected language is persisted in `localStorage`.

---

## 16. Unified Lead Intake, Deduplication & Staff UI

### Overview
The lead intake pipeline unifies inbound leads across property portals (`MagicBricks`, `99acres`), social ads (`Meta Ads`), website chat forms, and offline hoarding phone calls. It provides automated multi-tier deduplication, idempotency, consent-based first response automation, and a rich staff management interface.

### Deduplication Pipeline (`apps/api/src/services/lead-ingest.service.ts`)
1. **Idempotency Check**: If an `external_id` is supplied, `lead_touchpoints(source, external_id)` is checked. If found, returns `{ outcome: 'idempotent', leadId }` without duplicating data.
2. **Exact Phone / Email Match**:
   - `normalizePhone`: Parses spaces, dashes, `+91`, `91`, leading `0`, validating 10-digit Indian mobile numbers starting with 6–9 and converting to E.164 (`+91XXXXXXXXXX`).
   - `normalizeEmail`: Trims and converts to lower case with RFC format validation.
   - Exact match on phone or email updates `last_activity_at`, records a new `lead_touchpoints` row, preserves original first-touch attribution, and returns `{ outcome: 'merged', leadId }`.
3. **Fuzzy Trigram Deduplication (PostgreSQL `pg_trgm`)**:
   - If no exact match is found, queries PostgreSQL using the GIN trigram index:
     `SELECT id FROM leads WHERE project_id = $1 AND similarity(name, $2) >= 0.85`
   - If matched, creates the lead with `possible_duplicate_of` pointing to the matched lead for human review (`{ outcome: 'possible_duplicate', leadId, duplicateOf }`).
4. **Late Phone Arrival**:
   - Anonymous web chat leads are created without phone numbers.
   - When the buyer provides a phone number later in the conversation (`POST /api/conversations/:id/phone`), deduplication evaluates the phone. If an existing lead matches, the conversation is moved to the existing lead and the anonymous stub lead is deleted.
5. **Consent & First-Response Automation (DPDP Act 2023)**:
   - If consent is granted (`consent === true`), records a row in `consents`, sets `consent_status = 'granted'`, queues a template message (`first_response_link`) in `outbound_messages`, and sets `first_response_at = NOW()`.
   - If consent is denied or withdrawn, sets `consent_status = 'withdrawn'`, displays a "Cannot Contact" warning badge in the UI, and prevents automated messaging.
6. **Atomic Lead Merge**:
   - `leadRepository.mergeLeadsTransaction(primaryId, secondaryId)` runs inside a single database transaction (`BEGIN ... COMMIT`): moves all touchpoints, conversations, bookings, handoffs, and consents to the primary lead, re-parents existing possible duplicate links, updates `last_activity_at`, and deletes the secondary lead.
   - "Keep separate" clears `possible_duplicate_of` to NULL.

### Staff Frontend (`apps/web/src/pages/LeadsPage.tsx`)
- **Three-State Rule Compliance**: Explicitly handles Loading (skeletons), Empty (custom illustration & action), and Error (retry trigger).
- **Desktop Table & Mobile Cards**: Responsive layout showing Lead ID, Buyer Name, Source tags, Touchpoint count badges, Duplicate flags, Status badges, and Cannot Contact indicators.
- **Review Duplicates Tab**: Dedicated tab filtered to pending possible duplicates with one-click "Merge" or "Keep Separate" operations.
- **CSV Import Modal (`apps/web/src/components/CsvImportModal.tsx`)**: Two-step upload / text paste with full row-level preview classifying rows into `New Lead`, `Matches Existing`, `Possible Duplicate`, and `Invalid` with actionable reason pills.
- **Lead Detail Drawer (`apps/web/src/components/LeadDetailDrawer.tsx`)**: Modal drawer presenting buyer profile, touchpoint timeline with raw metadata, conversation history, site visits, and handoffs.

---

## 17. Site-Visit Booking, Concurrency Control & Reminders

### Overview
The site-visit booking subsystem guarantees that the platform only ever books real free slots and strictly prevents double-booking across concurrent buyers and executives. It implements strict PostgreSQL row-level locks, partial unique constraints, idempotent slot generation, automated reminder scheduling, and responsive buyer and executive interfaces.

### 1. Pure Slot Generation (`apps/api/src/services/slot-generator.ts`)
- **Timezone Precision**: All recurring executive availability rules (`start_time`, `end_time`, `weekday`) and blackout dates are defined in `Asia/Kolkata` (IST, UTC+05:30) and deterministically projected into UTC `Date` timestamps.
- **Pure Function `generateSlots(rules, blackoutDates, fromDate, days = 21)`**:
  - Iterates over each day in the 21-day projection window.
  - Skips global blackout dates and executive-specific blackout dates.
  - Slices executive working shifts into discrete 60-minute visit intervals.
  - Never mutates existing slots or alters booked appointments.
- **Idempotent Batch Insertion**: `slotRepository.insertSlotsBatch` executes batched `INSERT INTO visit_slots (...) ON CONFLICT (executive_id, starts_at) DO NOTHING`.
- **Slot Generator Job (`apps/api/src/jobs/slot-generator.job.ts`)**: Runs on application startup, nightly via scheduled cron, and immediately upon availability rule or blackout updates by an admin.

### 2. Real-Time Availability (`GET /api/projects/:id/slots`)
- Queries all slots for the requested project where `status = 'open'` and `starts_at >= NOW() + INTERVAL '3 hours'` (enforcing the minimum 3-hour advance booking rule).
- Groups matching slots by local calendar day in `Asia/Kolkata`.
- Collapses multiple executives available at the exact same hour into a single slot chip with an `availableCount` badge.
- If no slots are open in the current window, returns the `nextAvailableDate`.

### 3. Concurrency Control & Zero Double-Booking (`apps/api/src/services/visit.service.ts`)
- **Single Transaction Guarantee**: `bookVisit` runs inside a single database transaction (`BEGIN ... COMMIT`).
- **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE OF s SKIP LOCKED`)**:
  - Queries open slots matching the requested `startsAt` and `projectId`.
  - Orders candidates by the executive's current active booking load (`COUNT(b.id) ASC`), ensuring equitable round-robin load balancing among sales staff.
  - Locks exactly one slot row using `FOR UPDATE OF s SKIP LOCKED`. If two concurrent requests arrive simultaneously for the last remaining slot, exactly one thread secures the lock; the other immediately skips locked rows and observes zero available slots.
- **Slot Unavailable & Alternatives**:
  - When no slot is available, the transaction immediately rolls back and throws `SlotUnavailableError` (HTTP 409 Conflict).
  - Automatically queries the nearest 3 open alternative slots relative to the requested time (`ORDER BY ABS(EXTRACT(EPOCH FROM (starts_at - $target))) ASC LIMIT 3`) and serializes them in the response.
- **Partial Unique Indexes (PostgreSQL Integrity)**:
  - `idx_visit_bookings_unique_active_slot`: `UNIQUE (slot_id) WHERE status = 'confirmed'` ensures a physical slot can never hold more than one active booking.
  - `idx_visit_bookings_unique_active_lead`: `UNIQUE (lead_id) WHERE status = 'confirmed'` prevents a single lead from holding multiple overlapping active visits.
- **Idempotency**:
  - `bookVisit` checks `visit_bookings.idempotency_key`. If the same key is retransmitted (e.g. buyer network retry or double-click), it returns the existing confirmed booking payload without creating a duplicate booking.

### 4. Atomic Rescheduling & Cancellation
- **`rescheduleVisit`**: Executes within an atomic transaction. Locks the newly chosen open slot with `FOR UPDATE OF s SKIP LOCKED`, marks the old slot `open`, marks the new slot `booked`, updates `visit_bookings.slot_id`, and reschedules pending reminders to match the new visit time.
- **`cancelVisit`**: Runs within an atomic transaction. Updates `visit_bookings.status = 'cancelled'`, sets `visit_slots.status = 'open'`, updates `leads.status = 'engaged'`, and cancels all pending reminders.

### 5. Automated Reminder Engine
- **T-24h and T-2h Reminders**:
  - Every confirmed booking inserts reminders into `visit_reminders`:
    - `24h`: Scheduled for `starts_at - INTERVAL '24 hours'`.
    - `2h`: Scheduled for `starts_at - INTERVAL '2 hours'`.
  - **Graceful Skip**: If an appointment is scheduled less than 24 hours in advance (`startsAt < NOW() + 24 hours`), the 24-hour reminder is recorded with status `'skipped'` while the 2-hour reminder is scheduled normally.

### 6. Visit Outcome Verification (`POST /api/visits/:id/outcome`)
- Executives record customer attendance (`visited` or `no_show`).
- **Strict Time Gate**: Outcome recording is strictly forbidden prior to the scheduled start time (`starts_at > NOW()`). Premature requests are rejected with `BadRequestError` (HTTP 400).
- Recording an outcome updates `visit_bookings.status` (`completed` or `no_show`), updates `leads.status` (`visited` or `no_show`), and appends a verified visit record to `lead_touchpoints`.

### 7. Frontend User Experience
- **`SlotPicker` Component (`apps/web/src/components/SlotPicker.tsx`)**:
  - Horizontal scrollable date strip with day name, date number, month, and open slot count.
  - 44px touch target time chips with collapsed multi-executive count badges.
  - "Slot just taken" warning banner rendering selectable alternative slot chips.
  - Fully compliant three-state handling: Loading skeletons, Empty states with next-available-date action, and Error state with retry trigger.
- **Buyer Visit Management Page (`apps/web/src/pages/VisitManagePage.tsx`)**:
  - Public route `/visit/:token` authenticated via signed magic link token.
  - Displays project information, formatted date and time in `Asia/Kolkata`, and assigned host representative.
  - Direct "Open in Google Maps" pin link using project latitude and longitude coordinates.
  - "Add to Calendar" button generating RFC 5545 compliant `.ics` iCalendar download.
  - Reschedule modal with embedded `SlotPicker` and cancel modal with confirmation.
- **Executive "My Visits" Page (`apps/web/src/pages/VisitsPage.tsx`)**:
  - Protected staff route `/visits` integrated into `StaffLayout`.
  - **Awaiting Outcome**: Highlights past visits requiring attendance verification with quick "Mark Visited" and "Mark No-Show" actions.
  - **Upcoming Visits**: Chronological listing of confirmed future visits with project address and representative assignment.

---

## 18. Sales Head Admin Area (Fact Sheet, Slot Rules & Ad Spend)

### Overview
The Sales Head Admin Area provides executive-level operational control over the AI conversational assistant's knowledge base, executive site-visit working schedules, and marketing acquisition budgets. All administration endpoints strictly enforce the `sales_head` role, returning HTTP 403 Forbidden for standard sales executives and HTTP 401 Unauthorized for unauthenticated requests.

### 1. Fact Sheet Editor (`/fact-sheet`)
- **Authoritative Fact Management**:
  - Full CRUD operations supporting project-scoped or global (all projects) factual knowledge entries.
  - Strict validation: Title (2–200 chars), Value (2–2000 chars), Category (2–50 chars), and unique alphanumeric Key per project (`^[a-z0-9_-]+$`).
- **Immutable Versioning & Audit Trail**:
  - Every create, update, or archive mutation writes an incremental record to `fact_entry_versions` tracking version number, diff, and acting user.
  - Appends an immutable audit log entry to `audit_log` detailing `action`, `entity_type`, `entity_id`, `actor_id`, and payload changes.
- **"Preview as Assistant Sees It" Panel**:
  - Real-time preview drawer displaying the exact serialized prompt text and fact IDs injected into the AI model:
    `[FACT ID: <uuid>] [<CATEGORY>] <title>: <value>`
  - Includes full text copy-to-clipboard functionality and project scope filtering.
- **Unanswered Questions Inbox (`unanswered_questions`)**:
  - Captures buyer questions when the conversational assistant cannot find factual answers in the active fact sheet.
  - Displays pending questions with language tags, project scope, and timestamps.
  - "Add as fact" button immediately opens the Add Fact editor prefilled with the buyer's query, atomically resolving the question upon fact publication.
  - Grounding banner explicitly warns that the assistant is strictly restricted to active fact sheet entries.

### 2. Slot Availability & Rules Editor (`/slot-rules`)
- **Weekly Working Rules**:
  - Configures weekly availability rules per executive and project: `weekday` (0–6), `start_time` (HH:MM), `end_time` (HH:MM), and `slot_minutes` (default 60).
  - Creating or removing a rule automatically triggers the slot generation job for the next 21 days and reports the count of newly generated slots.
- **Blackout Dates Management**:
  - Defines full-day closures (public holidays, office offsites, or executive leaves) for global or project/executive scopes.
  - Blocked slots on blackout dates are prevented from generation or booking.
- **Calendar Slot Preview & Single-Slot Blocking**:
  - Displays all visit slots for the rolling 21-day window grouped by local day in `Asia/Kolkata`.
  - Open slots can be individually blocked (`status = 'blocked'`) or unblocked by the sales head.
- **Booked Slot Conflict Guard**:
  - Slots with an active booking (`status = 'booked'`) are strictly protected against modification or deletion.
  - Attempting to block a booked slot returns HTTP 409 Conflict with the visitor name and lead ID, directing the staff member to reschedule or cancel the visit first.

### 3. Marketing Ad Spend Editor (`/analytics` / `/ad-spend`)
- **Channel Budget Allocation**:
  - Configures monthly acquisition budgets across the 4 primary channels: Property Portals (`property_portal`), Social Media Ads (`social_ad`), Hoarding & Outdoor (`hoarding_call`), and Website (`website`).
- **Default ₹30 Lakh Baseline (Assumption A7)**:
  - If no custom allocation exists for a month, the system seamlessly falls back to the ₹30 Lakh / month benchmark:
    - Property Portals: ₹12,00,000 (40.0%)
    - Social Media Ads: ₹10,00,000 (33.3%)
    - Hoarding Calls: ₹5,00,000 (16.7%)
    - Website: ₹3,00,000 (10.0%)
- **Visual Budget Analytics**:
  - Multi-channel stacked proportion bar and delta comparison against the ₹30 Lakh benchmark.
  - Persisted in the `ad_spend` table via idempotent upserts per `(month, source)`.

### 4. Frontend Compliance (`apps/web`)
- **Three-State Rule Compliance**: Every view explicitly implements:
  1. **Loading State**: Pulse skeletons during data fetching.
  2. **Empty State**: Tailored messages with action buttons (e.g. "Add First Fact", "Generate Slots").
  3. **Error State**: Friendly error messages with retry callbacks.
- **Strict Role-Based Routing**: Protected by `ProtectedRoute allowedRoles={['sales_head']}` with access-denied fallback for sales executives.
- **Timezone Integrity**: All presentation timestamps formatted in `Asia/Kolkata` (IST) via `formatInKolkataTime`.

---

## 19. AI Chat Assistant Server-Side Architecture & Strict Guardrails

### Overview
The AI Chat Assistant provides an intelligent, luxury-grade conversational advisor for prospective homebuyers exploring Company A's residential portfolio. It is architected as an autonomous agent operating under deterministic guardrails: the model is strictly grounded in the sales head's active fact sheet, forbidden from quoting unauthorized prices or discounts, shielded against prompt injections, and prohibited from inventing site visit reservations.

```
+------------------------------------------------------------------------------------------------+
|                                    BUYER WEB INTERACTION                                       |
+------------------------------------------------------------------------------------------------+
                                                 │
                                                 ▼
+------------------------------------------------------------------------------------------------+
| PRE-FILTER PIPELINE (Zero LLM Tokens, Zero Latency)                                            |
|   • Opt-Out Check ("STOP", "unsubscribe", "band karo")       -> Lead opted_out_at, stop contact   |
|   • Human Escalation ("talk to person", "insan se baat")      -> Flag human_requested, handoff  |
|   • Price / Negotiation ("discount", "best price", "bhav")    -> Canned policy reply, price_ask |
+------------------------------------------------------------------------------------------------+
                                                 │ (clean)
                                                 ▼
+------------------------------------------------------------------------------------------------+
| AGENT LOOP (Max 4 Tool Execution Rounds)                                                        |
|   • Injects active fact sheet with stable IDs: [FACT ID: <uuid>]                               |
|   • Tools: update_lead_profile, get_open_slots, request_human, send_reply                      |
|   • If phone/consent missing on visit intent -> emits ui_action: collect_contact               |
+------------------------------------------------------------------------------------------------+
                                                 │ (model send_reply)
                                                 ▼
+------------------------------------------------------------------------------------------------+
| POST-CHECK GUARDRAIL (Deterministic Verification)                                               |
|   • Fact ID Verification: Cited fact IDs must exist and be active                             |
|   • Grounding Check: Every number, amount, or date must appear in cited facts                   |
|   • Banned Claims: Prohibits "guarantee", "assured returns", "appreciation", "best price"     |
|   • Confidence Check: Rejects replies with confidence score < 0.70                              |
+------------------------------------------------------------------------------------------------+
                                ├── FAILED ──► Localized safe fallback ("Team will confirm shortly")
                                │              + Log unanswered_questions + Flag conversation + Handoff
                                │
                                └── PASSED ──► Persist message + Return ChatReply to buyer
```

### 1. Provider Adapter Layer (`apps/api/src/llm/`)
- **Unified Interface**:
  ```ts
  interface LLMProvider {
    chat(params: {
      system?: string;
      messages: LLMMessage[];
      tools?: LLMToolDefinition[];
      maxTokens?: number;
      signal?: AbortSignal;
    }): Promise<LLMChatResult>;
  }
  ```
- **Implementations**:
  - `AnthropicProvider`: Implements Anthropic `/v1/messages` with tool-use blocks and system instruction formatting via native `fetch`.
  - `GeminiProvider`: Implements Google Gemini `generateContent` with function declarations and candidates parsing.
  - `MockProvider`: Scriptable test double supporting queued responses, simulated tool execution, timeout injection, and call introspection.
- **Safety Enforcement**:
  - Refuses startup in production if `LLM_PROVIDER=mock`, enforced by Zod configuration refinement and `LLMService` runtime guards.
  - 20-second timeout per call with exactly 1 retry on transient network drops or timeouts.
  - Daily message cap enforced via `LLM_DAILY_MESSAGE_CAP` (default 1000 calls / day).
  - Telemetry written to `llm_calls` table (`provider`, `model`, `latency_ms`, `input_tokens`, `output_tokens`, `outcome`), strictly omitting message contents for privacy.

### 2. Deterministic Guardrail Pipeline
- **Pre-Filter**:
  - Multi-lingual regex scanning covering English, Hindi (Devanagari and Hinglish), and Gujarati (Gujarati script and Latin).
  - Canned localized responses for price negotiations ("Final pricing is confirmed by our sales team"), human requests ("I have connected you with our sales team"), and opt-outs ("You have been unsubscribed").
- **Post-Check**:
  - Regex extraction of all numeric and date tokens from the model reply. Every token is verified against the concatenated text of cited active facts.
  - Rejection of financial guarantees and speculative investment claims.
  - Low confidence or missing facts instantly route to the safe localized fallback ("A member of our team will confirm this with you shortly"), insert a row into `unanswered_questions`, flag the conversation, and create a `handoffs` ticket.
- **Preserved SLA on Outage**:
  - In the event of an upstream LLM timeout or outage, the assistant responds instantly with the safe fallback, preserving the developer's 2-minute response guarantee.

### 3. Agent Tooling & Visit Booking Integration
- **Lead Profile Qualification**:
  - `update_lead_profile`: Updates `budget_min`, `budget_max`, `wants`, `timeline`, and `language` directly on the lead record.
- **Real-Time Availability**:
  - `get_open_slots`: Queries real open slots from `visitService.getSlotsForProject`.
- **Site Visit Booking Workflow**:
  - The model **never** reserves slots via text. It emits `ui_action: 'show_slots'` to present interactive slot chips.
  - If the buyer's phone or DPDP consent is missing, the action is coerced to `ui_action: 'collect_contact'`.
  - Direct booking is executed via `POST /api/chat/book`, validating phone format and recording consent in the `consents` table.
  - The booking confirmation is generated from a deterministic template in the `Asia/Kolkata` time zone, eliminating booking hallucinations.

### 4. API Endpoints & Buyer Session Security
- `POST /api/chat/start`: Initializes buyer conversation, creates anonymous lead, records greeting, and sets httpOnly `buyer_session` cookie signed with HMAC-SHA256 (30-day expiry).
- `POST /api/chat/message`: Verifies buyer session ownership of `conversationId`, passes message through guardrail pipeline, and returns `ChatReply`.
- `POST /api/chat/book`: Enforces phone and consent verification, runs atomic booking transaction via `visitService.bookVisit`, and records template confirmation.
- `GET /api/chat/history`: Returns full conversation history for the verified buyer session.

---

## Phase 7b: Buyer Chat UI & Interactive In-Stream Flow

### 1. Architectural Overview & Design System Adherence
The Buyer Chat interface (`apps/web/src/pages/BuyerChatPage.tsx`) provides a mobile-first, calm, and premium digital residence advisory experience built in accordance with Phase 1 design tokens:
- **Routes**: Exposed at `/chat` and at `/` for incoming ad and QR-code traffic carrying attribution parameters (`/?src=portal|social|website|hoarding`) or unauthenticated visitors. Authenticated staff members navigating to `/` are directed to `/leads`.
- **Aesthetic**: Restrained luxury palette (warm background `#FBFAF8`, crisp white cards `#FFFFFF`, deep forest accent `#1F4D45`, hair-thin borders `#E7E4DE`), Cormorant Garamond display headings, and Inter body text with full native font support for Noto Sans Devanagari and Noto Sans Gujarati.
- **Accessibility**: Strict 4.5:1 text contrast ratios, minimum 44px interactive touch targets, keyboard navigation with focus management, and `aria-live="polite"` conversational region announcements.

### 2. Header & Conversation Controls
- **Project Identity**: Displays active project name, verified fact sheet badge, and Ahmedabad location details.
- **Multilingual Switcher**: Persistent header controls for immediate switching between English (`EN`), Hindi (`हिन्दी`), and Gujarati (`ગુજરાતી`).
- **Persistent Escalation**: Always-visible "Talk to a person" action button allowing immediate human escalation.

### 3. Interactive In-Stream Components
- **`CollectContactCard`**:
  - Validates 10-digit Indian mobile numbers (+91 prefix, digits starting with 6–9).
  - Enforces explicit DPDP Act 2023 consent checkbox before proceeding to slot selection.
  - Interactive Privacy & Data Protection modal detailing purpose limitation, opt-out mechanisms, and GujRERA registration.
- **`InlineSlotPickerCard`**:
  - Embedded slot picker querying real-time open slots via `fetchProjectSlots()`.
  - Day selector tabs and collapsed time chips. Selecting a time chip displays IST appointment summary and a "Confirm Site Visit" action.
- **`BookingConfirmationCard`**:
  - Displays confirmed appointment formatted in `Asia/Kolkata` time zone (IST, UTC+05:30).
  - Renders assigned host executive, project location, and Sales Gallery address.
  - Interactive actions: direct Google Maps navigation link and Add to Calendar (`.ics` calendar download).
  - Direct appointment management link (`/visit/:token`) for rescheduling.

### 4. Message Streaming & Resilience
- **Typing Indicator**: Gentle 3-dot pulsating animation during active LLM generation.
- **Quick-Reply Suggestions**: Dynamic suggestion chips streamed from assistant replies for 1-tap inquiries.
- **Session Resume**: Stored conversation and lead identifiers in `sessionStorage` allow seamless page reloads, retrieving full chat history from `/api/chat/history`.
- **Fallback & Rate Limit Handling**:
  - 429 rate limit errors surface an alert advising a brief pause before sending further messages.
  - Network interruptions or upstream failures trigger in-stream fallback messaging reassuring the buyer of human executive follow-up, keeping response SLA under 2 minutes.
- **Regulatory Footing**: Persistent footer displaying project GujRERA registration number (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) and DPDP compliance notice.

---

## Phase 8: Human Workflow, Flagged Chat Review, DPDP 2023 Consent & Messaging Engine

### 1. Human Handoff Workflow (`createHandoff`)
The human handoff subsystem coordinates the transition from automated AI assistance to human sales consultation:
- **Trigger Mechanisms**:
  - `request_human`: Direct escalation from the buyer or deterministic pre-filter.
  - `visit_booked`: Automated handoff when a site visit appointment is confirmed.
  - `serious_intent`: Explicit interest with budget range and BHK preference captured.
  - `flagged_conversation`: Flagged security, policy, or unanswered query escalations.
- **Executive Assignment Engine**:
  - Preferred host assignment: When a confirmed visit exists, assigns the executive who owns the booked slot.
  - Least-loaded fallback: In the absence of a booked slot, assigns the active executive with the fewest open leads (`leads.status NOT IN ('visited', 'lost')`).
- **Multilingual Buyer Notification**:
  - Immediately notifies the buyer in their language:
    - English: `<Executive name> from our sales team will contact you. I have connected you with our sales team.`
    - Hindi: `<Executive name> हमारी सेल्स टीम से जल्द ही आपसे संपर्क करेंगे। मैंने आपकी बात हमारी सेल्स टीम से जोड़ दी है।`
    - Gujarati: `<Executive name> અમારી સેલ્સ ટીમમાંથી ટૂંક સમયમાં તમારો સંપર્ક કરશે. મેં તમને અમારી સેલ્સ ટીમ સાથે જોડી દીધા છે.`
- **Strict JSON Summary & Deterministic Fallback**:
  - Summary structure conforming to `HandoffSummarySchema` (`name`, `phone`, `language`, `project`, `wants`, `budgetRange`, `timeline`, `keyQuestionsAsked`, `openQuestions`, `visitTime`, `sentiment`).
  - Generated via active LLM provider; on model timeout, API failure, or schema invalidation, automatically uses a profile-derived deterministic template fallback so handoffs never fail.
- **Executive Inbox & Live Conversation Takeover**:
  - Inbox view at `/handoffs` with summary cards, sentiment badges, transcript viewer, and call/WhatsApp links (`tel:` and `wa.me`).
  - Executive thread reply (`POST /api/handoffs/:id/message`) transitions `conversations.status = 'human'`, pausing the AI assistant.
  - The buyer chat interface polls `/api/chat/history` every 5 seconds when in human mode to display executive messages in real-time.

### 2. Flagged Chat Daily Review Queue (Sales Head)
- **Review Queue Endpoint**: `GET /api/admin/flagged-chats` and `POST /api/admin/flagged-chats/:id/review` (restricted to `sales_head`).
- **Dashboard Banner**: Prominent count indicator `"N flagged chats to review today"` tracking pending audits.
- **Filter by Reason**: Immediate filtering by flag reason (`price_ask`, `human_requested`, `missing_fact`, `banned_claim`, `low_confidence`).
- **Citation Inspection**: Full conversational transcript viewer highlighting cited fact IDs (e.g. `[F12]`).
- **Audit Trails**: Recording reviewer ID, timestamp, and audit notes. "Convert to Fact" action pre-routes to the Fact Sheet Editor (`/fact-sheet`) to patch knowledge gaps.

### 3. DPDP Act 2023 Consent & Immediate Opt-Out
- **Compliance Matrix (`canContact`)**:
  - Pure function evaluating `consent_status === 'granted'` and `opted_out_at === null`.
  - Enforced across all communication pipelines (first response links, promotional dispatches, visit reminders).
- **Opt-Out Pathways**:
  - Conversational keyword: `STOP`, `unsubscribe`, or natural language opt-out caught by `opt_out` pre-filter.
  - Self-service portal: "Opt out of updates" button on the visit management page (`/visit/:token`).
  - Staff administrative action: Staff opt-out action (`POST /api/leads/:id/opt-out`).
- **Immediate Cancellation**:
  - Opting out sets `leads.opted_out_at = NOW()`, updates `consent_status = 'withdrawn'`, logs negative consent in `consents`, and immediately marks all pending visit reminders for the lead as `cancelled`.

### 4. WhatsApp Channel Rules & Outbox Logging
- **Channel Architecture**: `OutboxChannelAdapter` writing to the `outbound_messages` table.
- **Approved Template Registry**:
  - `visit_confirmation`: Appointment time in IST, host executive, location pin, and RERA number.
  - `reminder_24h` & `reminder_2h`: Timed visit reminders with management link.
  - `first_response_link`: Welcome message, brochure link, and opt-out notice.
- **Template-Only WhatsApp Enforcement**: Free-form text dispatches over WhatsApp are strictly rejected with `ValidationError`.
- **Statutory RERA Inclusion**: Every promotional, reminder, and transactional body prominently includes the project GujRERA registration number (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`).
- **Outbox Audit View**: Staff screen at `/outbox` tracking recipient, channel, template key, rendered body, dispatch status, and IST timestamps.

### 5. Reminder Background Worker & Concurrency Control
- **Worker Execution**: `ReminderService.processDueReminders()` runs periodically and on internal cron triggers.
- **Concurrency Safety**: Claims due reminders (`scheduled_at <= NOW()`, status `pending`) using `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Pre-Dispatch Checks**: Re-verifies that the associated booking is still `confirmed` and `canContact` is true.
- **Retry Policy**: Retries failed dispatches up to 3 attempts with exponential backoff before marking status `failed`.
- **Internal Cron Endpoint**: Authenticated `POST /api/internal/run-reminders` accepting `X-Internal-Key` or staff JWT for external serverless cron triggers (e.g., GitHub Actions, Cloud Scheduler).

### 6. Interactive Demo Controls (`/demo`)
- **Dashboard**: Available at `/demo` for sales head users when `DEMO_MODE=true`.
- **Multi-Source Ingestion Simulation**: Simulates incoming leads from 9 marketing channels (`social_ad`, `portal_housing`, `portal_99acres`, `portal_magicbricks`, `qr_outdoor`, `qr_print`, `hoarding_call`, `website`, `walk_in`) with custom name, phone, and wants.
- **Time Fast-Forwarding**: `POST /api/demo/fast-forward-reminders` shifts pending reminders into the past (NOW - 5 minutes), simulating the passage of 24h/2h intervals.
- **On-Demand Worker Execution**: `POST /api/demo/run-reminders` triggers worker processing immediately, rendering processed/sent/failed outcome statistics.

---

## Phase 9: Sales Analytics & Executive Performance Dashboard

### 1. Architectural Scope & Role Scoping
The Sales Analytics Dashboard provides real-time visibility into marketing efficiency, executive response SLAs, and sales conversion velocity.
- **Role-Based Access Control (RBAC)**:
  - `sales_head`: Views developer-wide aggregate performance across all sales executives, marketing channels, and projects. Can filter by individual project.
  - `executive`: Automatically scoped to leads assigned to the authenticated user (`assigned_to = userId`), empowering executives to track their own response times and visit outcomes.
- **First-Touch Attribution**: All metrics attribute leads, visits, and conversions to the initial discovery channel (`leads.first_touch_source`).

### 2. Metrics & Mathematical Definitions
| Metric | Mathematical Formula | Target Benchmark | Divide-by-Zero Handling |
| :--- | :--- | :--- | :--- |
| **Median First Response Time** | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_response_at - first_touch_at)))` | `< 5 minutes` (300 seconds) | Returns `"-"` if 0 responded leads |
| **Unreached Within 48 Hours %** | `(unreached_48h / total_leads_older_than_48h) * 100` where unreached = `first_touch_at <= NOW() - 48h AND (first_response_at IS NULL OR first_response_at > first_touch_at + 48h)` | `< 5.0%` | Returns `"-"` if 0 eligible leads |
| **Visit Show-up Rate** | `completed_visits / (completed_visits + no_show_visits)` | `> 70.0%` | Returns `"-"` if completed + no-show = 0 |
| **Lead-to-Visit Conversion Rate** | `completed_visits / total_leads` | `8.0%` (Baseline `6.0%`) | Returns `"-"` if total leads = 0 |
| **Cost Per Completed Visit** | `prorated_spend_inr / completed_visits` | Based on channel CAC | Returns `"-"` if completed visits = 0 |
| **Conversion Funnel** | 4 Stages: `Total Ingested Leads -> Engaged Leads -> Site Visits Booked -> Visits Completed` | Tracks drop-off at each stage | Safely clamps to 0% |

### 3. Ad Spend Proration & Cost Attribution
- **Ad Spend Storage (`ad_spend`)**: Stores monthly allocations per marketing channel (`property_portal`, `social_ad`, `hoarding_call`, `website`), defaulting to ₹30 Lakh / month (Assumption A7 & A33).
- **Prorated Daily Allocation**: For custom date ranges or partial months, spend is calculated dynamically:
  $$\text{Prorated Spend} = \sum_{\text{months}} \left( \frac{\text{Monthly Spend}}{\text{Days in Month}} \times \text{Days Overlapping Filter Window} \right)$$
- **Sample Significance Guard**: Any source breakdown or aggregate cohort with fewer than 5 observations (`totalLeads < 5` or `visitsBooked < 5`) is flagged with `isSmallSample: true` and annotated with a "Small Sample" badge to prevent misleading statistical conclusions.

### 4. API Endpoints (`/api/dashboard`)
- `GET /api/dashboard/metrics`:
  - Validated by `DashboardFilterQuerySchema` (`period`: `'7d' | '30d' | '90d' | 'custom'`, `from`: `YYYY-MM-DD`, `to`: `YYYY-MM-DD`, `projectId`: `UUID`).
  - Returns `SalesDashboardData` containing summary KPIs, by-source breakdowns, funnel metrics, and chart series.
- `GET /api/dashboard/export-csv`:
  - Generates RFC 4180 compliant CSV export containing Summary Metrics and By-Source Breakdowns.
  - Streams with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="sales-analytics-<timestamp>.csv"`.

### 5. Frontend Visualizations & Accessibility (`apps/web`)
- **Route Mounting**: Accessible via `/analytics` and `/dashboard` in `App.tsx` and navigation sidebar in `StaffLayout.tsx`.
- **Three Explicit States**:
  1. **Loading State**: Pulse skeleton tiles mimicking the layout during fetch.
  2. **Empty State**: Tailored empty screen when 0 leads are recorded in the selected window with a 1-click "Reset to Last 30 Days" action.
  3. **Error State**: Actionable error card displaying root cause with a "Retry Request" action.
- **Charts & Visualizations**:
  - Accessible Recharts BarChart comparing median response times by source with a reference line at the 5-minute target. Includes an aria-hidden visual chart accompanied by a screen-reader data table alternative.
  - Conversion Funnel volume bars with step-by-step conversion percentages.
- **"How We Calculate" Modal**: Accessible popover dialog explaining the 6 core metric formulas, SLA conditions, and attribution methodology.
- **Mobile Responsive Design**: Grid transforms to stacked vertical cards on small screens; tables utilize horizontal scrolling (`overflow-x-auto`) with minimum cell widths.

---

## Phase 10: System Hardening, Security Safeguards & Database Optimization

### 1. Security Architecture & Boundary Defenses
- **Content-Security-Policy (CSP)**:
  - Enforced via Helmet middleware and `<meta>` element with `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https:`, `font-src 'self' data: https:`, `connect-src 'self' <allowedOrigins>`, and `frame-ancestors 'none'`.
- **CSRF & Cookie Protection**:
  - `csrfProtection` middleware validates modern custom headers (`X-Requested-With`, `X-CSRF-Token`, or `X-Housy-Client`) across all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Authentication cookies (`staff_token`, `buyer_session`) enforce `HttpOnly: true`, `SameSite: 'lax'`, and dynamic `Secure: true` in production environments.
- **Multi-Tiered Rate Limiting**:
  - `loginRateLimiter`: 5 failed attempts per 15 minutes per IP.
  - `chatRateLimiter`: 30 requests per minute per IP/buyer session across `/start`, `/message`, `/book`, and `/history`.
  - `ingestRateLimiter`: 120 requests per minute per source API key/IP for portal webhook ingestion.
  - `generalRateLimiter`: 100 requests per minute across general endpoints.
- **Information Disclosure Prevention**:
  - Error messages are sanitized by `errorHandler` to ensure raw SQL syntax or schema fragments are never returned to clients.
  - Log redaction in Pino masks passwords, auth cookies, bearer tokens, API keys, phone numbers, emails, visitor names, and lead names.
- **Automated Secret Scanning**:
  - Automated local scanning script (`npm run scan:secrets`) and Gitleaks CI action scan all source files and commit history.

### 2. High-Performance Database Indexing (Migration 005)
PostgreSQL query execution plans were analyzed with `EXPLAIN ANALYZE`, adding four targeted indexes:
1. `idx_leads_dashboard_perf` on `leads(first_touch_at DESC, project_id, assigned_to)`: Optimizes time-window range scans and role/project scoping in analytics calculations.
2. `idx_leads_sla_untouched` on `leads(first_touch_at) WHERE first_response_at IS NULL`: High-selectivity partial index for immediate 48h SLA breach identification.
3. `idx_leads_activity_status` on `leads(last_activity_at DESC, status)`: Converts paginated lead queries from a full sequential table scan and heapsort into an index-only scan, delivering a **25x execution speedup** (from 0.804 ms to 0.032 ms).
4. `idx_leads_source_time` on `leads(source, first_touch_at)`: Accelerates marketing attribution and by-source conversion aggregations.

### 3. Frontend Bundle Optimization & Accessibility
- **Rollup Chunk Splitting**: Configured manual chunks in Vite separating `vendor` (React, Router, TanStack Query), `recharts`, and `icons`, bringing all production JavaScript assets below 400 kB.
- **Accessibility Compliance (WCAG AA)**:
  - Visible focus indicators via `focus-visible:ring-2 focus-visible:ring-accent` across all interactive elements.
  - Accessible screen-reader tables accompany all visual data charts.
  - `role="log"` and `aria-live="polite"` stream assistant messages to assistive technologies.
  - Minimum 44px touch targets across mobile viewports.

---

## Phase 11: Comprehensive Test Hardening, Code Coverage & Playwright End-to-End Suite

### 1. Architectural Strategy & Test Pyramid
The platform test architecture enforces a multi-layered pyramid combining pure function unit tests, PostgreSQL integration tests, and deterministic browser-level end-to-end user journeys:
1. **Pure Functions & Schemas (`@housy/shared`)**: Fast Vitest execution validating Zod schemas, date transformations, currency formatting, and DPDP consent evaluations (`canContact`).
2. **Integration & Concurrency Tests (`@housy/api`)**: Direct PostgreSQL integration covering atomic transactions, row-level slot locking (`SELECT ... FOR UPDATE SKIP LOCKED`), deduplication logic, RBAC matrix, and reminder background workers.
3. **Component & View Tests (`@housy/web`)**: Testing Library + Vitest verifying loading, empty, and error states across all staff and buyer views.
4. **Playwright E2E Suite (`e2e/housy-e2e.spec.ts`)**: End-to-end browser journeys running in Chromium against an isolated test server using `MockProvider` and a seeded database.

### 2. Playwright E2E User Journeys
The E2E suite (`playwright.config.ts`, `e2e/housy-e2e.spec.ts`) automates five critical business workflows:
- **Journey 1 (Buyer Multilingual Chat & Site-Visit Booking)**:
  - Navigates to `/chat?src=portal`.
  - Buyer converses in Hindi asking for a site visit.
  - Assistant responds with `ui_action: collect_contact`, rendering the DPDP Collect Contact Form.
  - Buyer inputs name, 10-digit Indian mobile number, grants DPDP consent, and proceeds to the slot picker.
  - Buyer selects an open slot, clicks "Confirm Site Visit", and receives the Booking Confirmation Card featuring the scheduled appointment time, assigned host, and Google Maps pin link.
- **Journey 2 (Sales Executive Lead Workflow & Visit Completion)**:
  - Sales Executive logs in via Quick Demo credentials (`amit.shah@example.com` / `DemoPass123!`).
  - Verifies the assigned lead appears on `/leads` with source attribution tag (`Property Portal` / `Social Media Ad`).
  - Navigates to `/handoffs` (Executive Inbox), reviews the AI-generated consultation summary card, and opens the conversation transcript modal.
  - Navigates to `/visits` (Site Visits Schedule) and marks a scheduled visit as "Visited", recording the customer attendance outcome in real time.
- **Journey 3 (Sales Head Fact Sheet Management & Dashboard Analytics)**:
  - Sales Head logs in (`harshil.mehta@example.com` / `DemoPass123!`).
  - Navigates to `/fact-sheet`, edits an authoritative project fact value, and commits changes.
  - Verifies that `fact_entry_versions` increments and an audit log row is recorded.
  - Opens the "Assistant Preview" panel to verify that the updated fact text is immediately reflected in the injected prompt context.
  - Navigates to `/dashboard` and reviews Sales Analytics KPIs (Median First Response, 48h SLA breach %, Show-Up Rate, Lead-to-Visit Rate), confirming all figures render safely without `NaN` or unhandled errors.
- **Journey 4 (Concurrency Defenses & "Just-Taken" Alternatives)**:
  - Two isolated browser contexts (Buyer 1 and Buyer 2) concurrently attempt to reserve the last open visit slot for a given date and time.
  - Context 1 successfully locks the slot with `SELECT ... FOR UPDATE SKIP LOCKED` and receives "Visit Confirmed".
  - Context 2 simultaneously submits for the same slot; the API rejects the request with HTTP 409 `SLOT_UNAVAILABLE` and nearest available times.
  - Context 2 receives the "just taken" notification banner alongside alternative slot chips, keeping the slot picker active for immediate alternative selection.
- **Journey 5 (DPDP 2023 Opt-Out Stops Reminders)**:
  - Buyer sends opt-out keyword (`STOP`) in chat.
  - Pre-filter catches the command without calling an LLM endpoint, marking `opted_out_at = NOW()` and `consent_status = 'revoked'`.
  - Validates that `canContact` evaluates to false, causing the reminder background worker to mark all pending appointment reminders as `skipped` without dispatching messages.

### 3. Automated WCAG 2.1 AA Accessibility Audits
- Integrated `@axe-core/playwright` across primary application views (`/chat`, `/login`, `/dashboard`).
- Resolved all ARIA structural requirements: generic chart container elements declare explicit ARIA roles (`role="img"` or `role="region"`), achieving 0 violations under WCAG 2.1 AA and Section 508.

### 4. Continuous Integration Pipeline (`.github/workflows/ci.yml`)
- Automates Gitleaks secret scanning, local secret verification, ESLint, TypeScript typecheck, unit/integration tests with Vitest, and Playwright Chromium E2E execution against a containerized PostgreSQL service.
- **E2E Test Hardening & Backdrop Click Defense**: Modal dialogs (`Modal.tsx`) enforce mousedown origin tracking (`isMouseDownOnBackdrop`) to guarantee that browser automation clicks do not trigger backdrop dismissals when dialog overlays mount in-flight. E2E journey triggers utilize `toPass` retry encapsulation and target discrete `data-testid` attributes (`data-testid="transcript-modal"`, `data-testid="view-transcript-btn"`).
- Status badge prominently displayed in `README.md`.

---

## Phase 12: Production Deployment Architecture, Multi-Origin Strategy & Release Automation

### 1. Production Topology & Platform Split
The production infrastructure separates static presentation assets from stateful application services and managed database storage:
- **Frontend Layer (Vercel)**:
  - Globally distributed edge deployment of the React 18 + Vite SPA bundle.
  - SPA routing is managed via `vercel.json` rewrites with fallback to `/index.html`.
  - Supports reverse-proxying `/api/*` to eliminate third-party cookie restrictions in Safari, Chrome, and iOS.
- **Application Layer (Render / Railway)**:
  - Containerized Node.js 20 environment executing compiled TypeScript (`apps/api/dist/server.js`).
  - Pre-deploy release command executes `npm run release` (`node-pg-migrate up`) to apply schema updates before routing live traffic.
  - Safe seed utility (`npm run db:seed:demo`) enforces `DEMO_MODE=true` in production to prevent data loss.
- **Persistence Layer (Neon / Supabase)**:
  - Managed PostgreSQL 16 cluster accessed over TLS (`sslmode=require`) with connection pooling.
  - Uses `pg_trgm` extension for trigram similarity matching in lead deduplication.

### 2. Multi-Origin CORS & Cookie Authentication
Authentication tokens are secured across cross-origin boundaries via a dual strategy:
1. **Configurable SameSite & Secure Cookies**:
   - Authentication cookies (`staff_token` and `buyer_session`) enforce `secure: config.COOKIE_SECURE` (`true` in production) and `sameSite: config.COOKIE_SAME_SITE` (`lax` when proxied, `none` for direct cross-origin calls).
   - Strict CORS allowlist supports comma-separated origins and wildcards (e.g. `https://*.vercel.app`).
2. **Resilient Header Fallback**:
   - `apps/web/src/lib/api.ts` automatically forwards `X-Buyer-Session` tokens persisted in `sessionStorage` alongside standard cookies.
   - The API layer prioritizes the explicit request header, ensuring full functionality even in privacy-hardened browsers that block cross-site cookies.

### 3. Graceful Free-Tier Cold-Start Handling
Free-tier containers on Render spin down after 15 minutes of inactivity, requiring ~30–45 seconds to boot on subsequent requests. Housy shields end-users from confusion via proactive UI feedback:
1. **Client Latency Watchdog**: `apiFetch` monitors in-flight HTTP requests. If a request is pending for > 3.5 seconds or returns HTTP 502/504 Bad Gateway, it dispatches a `housy:backend-waking-up` custom event.
2. **Floating Notification Banner (`ServerColdStartBanner.tsx`)**: Renders a calm, non-blocking notification bar informing the user that the free-tier service is waking from sleep.
3. **Smooth Dismissal**: When the backend responds, the banner displays a success checkmark and auto-dismisses after 2.5 seconds.
4. **Buyer Chat Context**: Dedicated slow-start reassurance messaging renders beneath skeleton loaders to prevent premature drop-offs during initial assistant handshake.

### 4. Background Reminder Jobs & Cron Strategy
Site-visit appointment reminders (T-24h and T-2h) operate reliably across both serverless and long-lived hosting environments:
- **Long-Lived Process Daemon**: `server.ts` maintains a background interval (`setInterval(..., 60000)`) claiming pending reminders using row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`).
- **External Cron Trigger**: Endpoint `POST/GET /api/internal/run-reminders` authenticated via `X-Internal-Key` header, query parameter `?key=`, or staff JWT, enabling scheduled execution from external cron providers (e.g. cron-job.org).
- **DPDP Safety**: Reminders evaluate `canContact(lead, channel)`: if a buyer has revoked consent or texted `STOP`, reminders are marked `skipped` and omitted from outbound queues.

### 5. LLM Cost Containment & Spending Caps
- Production API keys configure hard monthly spend limits in developer consoles (Anthropic Console / Google Cloud Budgets & Alerts).
- Runtime safeguards enforce `LLM_DAILY_MESSAGE_CAP` (default: 1000 requests/day). Daily message counts are evaluated against the database; upon exceeding the cap, calls are intercepted with outcome `cap_exceeded` before invoking external provider endpoints.

---

## Phase 13: Vercel Services Multi-Service Architecture & Unified Project Routing

### 1. Multi-Service Configuration (`vercel.json`)
The repository is structured to deploy on Vercel as a single project with multiple services:
- **`services.api`**:
  - `root`: `apps/api`
  - `framework`: `express`
  - Executes the Express 3-tier backend with full database connectivity, Zod validation, and AI agent loop.
- **`services.web`**:
  - `root`: `apps/web`
  - `framework`: `vite`
  - Builds and serves the React 18 SPA assets with responsive design and WCAG 2.1 AA accessibility.

### 2. Unified Public Routing
Top-level rewrites route traffic cleanly across both services on a shared domain:
- `/api` and `/api/(.*)` -> `{ "service": "api" }`: Forwards all API endpoints directly to Express with full path preservation.
- `/(.*)` -> `{ "service": "web" }`: Serves the frontend application with SPA fallback.

### 3. Service Bindings Architecture
- In client SPA architectures (React/Vite), network requests to `/api/*` originate client-side in the user's browser; therefore, `api` is exposed via top-level public rewrites.
- Internal service-to-service bindings (which inject private internal URLs at runtime into serverless functions) are reserved for server-to-server microservice communication and are omitted here as all API communication occurs via the public `/api/*` path.

### 4. Serverless Express Entrypoint & Runtime Hardening
- **Handler Export**: `apps/api/src/server.ts` and `apps/api/src/index.ts` export `default app` and named `app`, omitting `app.listen()` and background `setInterval` workers when `process.env.VERCEL` is active.
- **Prefix Agnostic Routing**: The Express app mounts `apiRouter` at both `/api` and `/` so routes match seamlessly regardless of whether the ingress proxy rewrites paths.
- **CORS & CSP Integration**: Automatically admits `*.vercel.app` and `https://vercel.live` in CORS validators and Helmet CSP `connect-src`.
- **Database & Serverless Connection Limits**: Non-localhost PostgreSQL connections enable SSL (`ssl: { rejectUnauthorized: false }`) with `max: 10` pool size on serverless to prevent database connection exhaustion.
- **Demo Mode Production Fallback**: Permits `LLM_PROVIDER=mock` when `DEMO_MODE=true` in production, ensuring resilient boot without failing Zod startup schema validations.








