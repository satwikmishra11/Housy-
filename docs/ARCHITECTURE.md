# System Architecture & Technical Overview

Housy is a production-quality full-stack TypeScript platform built for Company A (Ahmedabad). The platform unifies inbound lead intake, automated deduplication, an AI-powered conversational sales assistant, site-visit booking with calendar conflict prevention, executive handoff, and an executive analytics dashboard.

- **Live Application**: [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/)
- **GitHub Repository**: [https://github.com/satwikmishra11/Housy-](https://github.com/satwikmishra11/Housy-)
- **Technical Design Document (TDD)**: [`docs/TDD.md`](./TDD.md) (Exported PDF: [`docs/TDD.pdf`](./TDD.pdf))

---

## Architecture Documentation Map

To keep documentation modular, maintainable, and cohesive, technical specifications are split into focused guides:

| Document | Scope & Contents |
|---|---|
| **[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)** (This document) | System overview, monorepo workspaces, 3-tier layering, error hierarchy, authentication, RBAC, frontend design system, and testing strategy. |
| **[`docs/DATA_MODEL.md`](./DATA_MODEL.md)** | PostgreSQL relational schema, 19 entity catalog, ER diagram, constraints, zero double-booking indexes, and Migration 005 performance indexes. |
| **[`docs/AI_PIPELINE.md`](./AI_PIPELINE.md)** | AI chat assistant architecture, LLM provider adapters, `detectIntent` pre-filters, script-first language detection, numeral normalization, token-boundary grounding, verifier, failure modes, and evals. |
| **[`docs/AI_TRANSCRIPTS.md`](./AI_TRANSCRIPTS.md)** | 8 real buyer conversation transcripts across English, Hindi, and Gujarati with live model, cited facts, and independent verifier latency. |
| **[`docs/OPERATIONS.md`](./OPERATIONS.md)** | Production topology, Vercel multi-service project (`vercel.json`), background reminder workers, channel outbox, DPDP 2023 opt-out & re-consent, and observability. |
| **[`docs/ASSUMPTIONS.md`](./ASSUMPTIONS.md)** | Complete product, legal, technical, and operational assumptions log (`A1`–`A104`). |
| **[`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md)** | 5-minute end-to-end walkthrough script and 15 technical interview questions with grounded answers. |
| **[`docs/HARDENING.md`](./HARDENING.md)** | Security audits, rate limit enforcement, automated secret scanning, and WCAG AA accessibility verification. |
| **[`docs/VERIFICATION.md`](./VERIFICATION.md)** | Fresh-clone test execution logs, comprehensive test counts (643 tests), and live AI model evaluation matrix. |

---

## 1. Monorepo Layout & Workspaces

The repository is organized as an npm workspaces monorepo:

```
Housy-/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI (lint, typecheck, tests, Postgres 16, Playwright)
├── apps/
│   ├── api/                     # Express + Node 20 backend (3-Tier Architecture)
│   │   ├── migrations/          # node-pg-migrate SQL migrations (001–005)
│   │   ├── src/
│   │   │   ├── channels/        # Channel adapters (WhatsApp, SMS, Email outbox)
│   │   │   ├── config/          # Environment configuration validated with Zod
│   │   │   ├── db/              # pg Pool, connection management, seed and reset
│   │   │   ├── errors/          # Typed error hierarchy mapped to HTTP status codes
│   │   │   ├── jobs/            # Scheduled tasks and reminder jobs
│   │   │   ├── llm/             # LLM client adapters and tool definitions
│   │   │   ├── repositories/    # Data layer with parameterized SQL only
│   │   │   ├── routes/          # Express route controllers with Zod input validation
│   │   │   ├── services/        # Domain business logic layer
│   │   │   ├── utils/           # Structured pino logger and telemetry
│   │   │   ├── app.ts           # Express application setup, middleware, and error handling
│   │   │   └── server.ts        # Server entrypoint and graceful shutdown hooks
│   │   ├── tests/               # Vitest + supertest integration & unit tests
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                     # React 18 + Vite + Tailwind CSS frontend
│       ├── src/
│       │   ├── components/      # UI primitives and domain design system components
│       │   ├── i18n/            # react-i18next setup and en, hi, gu translation bundles
│       │   ├── layouts/         # BuyerLayout (single-column) and StaffLayout (sidebar/drawer)
│       │   ├── lib/             # API client, date formatters (Asia/Kolkata), QueryClient
│       │   ├── pages/           # LeadsPage, VisitsPage, FactSheetPage, AnalyticsPage, etc.
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
├── docs/                        # Modular architecture and operational documentation
├── scripts/                     # Developer tooling, dev runner, secret scanner
├── vercel.json                  # Multi-service project configuration (api + web)
├── docker-compose.yml           # PostgreSQL 16 container definition with health check
├── package.json                 # Monorepo root workspaces and scripts
├── tsconfig.base.json           # Base strict TypeScript compiler options
└── eslint.config.js             # Modern ESLint flat configuration
```

---

## 2. Layering & Design Principles (3-Tier Architecture)

The backend (`apps/api`) strictly maintains three architectural tiers:

```
Incoming Request
      │
      ▼
┌──────────────┐
│ Route Layer  │  • Validates inputs (params, query, body) via Zod schemas
│  src/routes/ │  • Maps HTTP status codes; zero business logic, zero SQL
└──────┬───────┘
       │
       ▼
┌──────────────┐
│Service Layer │  • Implements domain rules, orchestrates transactions, calls LLM
│src/services/ │  • Throws typed domain error classes (AppError subclasses)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│Repository    │  • Executes parameterized SQL queries using pg.Pool
│src/repos/    │  • Strict parameterized queries ($1, $2) to eliminate SQL injection
└──────┬───────┘
       │
       ▼
PostgreSQL 16
```

- **Zero Business Logic in Routes**: Handlers only parse input, call the corresponding service method, and format the HTTP response.
- **Shared Contracts (`packages/shared`)**: Single source of truth for contract types, entity schemas, and Zod validators shared across frontend and backend.
- **Strict TypeScript Everywhere**: `strict: true`, `noImplicitAny: true`, and complete elimination of `any` across the monorepo.

---

## 3. Error Handling Hierarchy (`apps/api/src/errors/`)

Centralized error handling middleware converts errors into predictable, typed JSON responses:

| Error Class | HTTP Status | Error Code | Description |
|---|---|---|---|
| `BadRequestError` | 400 | `BAD_REQUEST` | Malformed request syntax or invalid state transition |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Request payload fails Zod schema validation |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| `ForbiddenError` | 403 | `FORBIDDEN` | Authenticated user lacks permission for the resource |
| `NotFoundError` | 404 | `NOT_FOUND` | Requested entity does not exist |
| `ConflictError` | 409 | `CONFLICT` | Resource conflict (e.g., slot already booked) |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS` | Rate limit threshold exceeded |
| `DatabaseError` | 500 | `DATABASE_ERROR` | Unrecoverable database failure |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE` | External service or database unreachable |

---

## 4. Authentication, Authorization (RBAC) & Ownership

### Staff Authentication
- **Argon2id Hashing**: Passwords stored using OWASP-recommended memory (19 MiB) and time costs. Passwords come from seed scripts or user registration, never hard-coded in code paths.
- **JWT Cookies**: HMAC-SHA256 tokens signed with `JWT_SECRET`, stored in an `httpOnly`, `SameSite=Lax`, `Secure` (production) cookie named `staff_token` with 24-hour expiration.
- **CSRF Protection**: All mutating HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a custom header (`X-Requested-With`, `X-CSRF-Token`, or `X-Housy-Client`).

### Role-Based Access Control (RBAC)
- **Roles**: `executive` (Sales Executive) and `sales_head` (Admin).
- **Ownership Enforcement**:
  - `assertLeadOwnership(leadId, user)`: Sales Executives see and edit **only leads assigned to them**. The Sales Head has developer-wide visibility.
  - Access to an unassigned lead returns **HTTP 403 Forbidden** (not 404), distinguishing unassigned resources from non-existent resources.
- **Navigation & Feature Guarding**:
  - **Admin-Only Features**: Daily Review (`/daily-review`), Flagged Chats (`/flagged-chats`), Fact Sheet Editor (`/fact-sheet`), Slot Availability Rules (`/slot-rules`), Monthly Ad Spend (`/ad-spend`), Demo Simulation Controls (`/demo`), System Health Diagnostics (`/health`), and CSV Lead Ingestion (`POST /api/leads/csv-preview`, `POST /api/leads/csv-commit`) require `sales_head` role.
  - **Executive Scoping**: In `StaffLayout`, all administrative navigation items and ambient AI telemetry chips are strictly omitted from rendering for `executive` users (e.g. Amit Shah), presenting only relevant executive workspace views (`Today`, `Unified Leads`, `Handoffs`, `Site Visits`, `Sales Dashboard`, `Message Outbox`).
  - **Route Protection**: Direct URL navigation to restricted paths is intercepted by `<ProtectedRoute allowedRoles={['sales_head']}>`, rendering an informative `Access Restricted` state with navigation back to the executive workspace. CSV lead ingestion endpoints enforce `requireRole('sales_head')`, rejecting unauthorized executive requests with 403 Forbidden.
  - **Executive Priority Cockpit (`GET /api/executive/today`)**: Morning briefing aggregating visits scheduled for today (Asia/Kolkata date = today), visits awaiting attendance outcome, new handoffs, and leads unanswered for > 2 hours. Automatically scoped to `req.user.id` for executives; sales heads can query developer-wide or filter by specific `executiveId` UUID. Columns strictly adhere to the relational database schema with defensive timestamp parsing.

### Buyer Sessions & Magic Links
- **Buyer Sessions**: Signed `buyer_session` cookie and `X-Buyer-Session` header tied to an active conversation UUID, preserving dialogue continuity across page refreshes without passwords.
- **Single-Purpose Magic Links**: Signed JWTs (`purpose: 'manage_visit'`) with 48-hour expiration allowing buyers to view, reschedule, or cancel their site visits at `/visit/:token`.

---

## 5. Frontend Architecture & Design System (`apps/web`)

The client brief values clean, minimal, and premium design fitting ₹65L – ₹1.2 Cr residences:

### Design Tokens
- **Palette**:
  - Warm Background: `#FBFAF8`
  - Crisp Surface: `#FFFFFF`
  - Primary Ink: `#16181D`
  - Muted Text: `#6B6F76`
  - Hairline Border: `#E7E4DE`
  - Forest Accent: `#1F4D45` (exactly one accent color throughout the UI)
  - Soft Accent: `#E8EFEC`
  - Status Colors: Success `#2F6B4F`, Warning `#A8741A`, Danger `#A33A3A`
  - Zero gradients, zero emojis, zero heavy shadows.
- **Typography**:
  - Headings: `Cormorant Garamond` (classical serif).
  - Body & UI: `Inter` (geometric sans-serif).
  - Fallbacks: `Noto Sans Devanagari` and `Noto Sans Gujarati`.
  - Self-hosted locally via `@fontsource/*` (zero external Google Fonts network calls).
- **Spatial Geometry & Accessibility**:
  - 8px spacing grid, 12px border radius (`rounded-xl`).
  - 44px minimum touch targets on all interactive controls (`min-h-[44px]`).
  - Explicit focus ring styling (`focus-visible:ring-2 focus-visible:ring-accent`).
  - Media query support for `prefers-reduced-motion`.

### Application Shell Layouts
- **`BuyerLayout`**: Centered single-column container (`max-w-2xl`), top navigation bar with language switcher, and regulatory footer displaying GujRERA registration (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) and DPDP privacy notice.
- **`StaffLayout`**: Desktop persistent sidebar with developer branding, active role badge, navigation links (`Leads`, `Visits`, `Fact Sheet`, `Analytics`, `Handoffs`), authenticated user profile, and responsive drawer navigation on mobile viewports. The sidebar container uses `overflow-visible z-30` with internal `<nav className="flex-1 overflow-y-auto min-h-0">` scrollability, allowing header popovers (such as `NotificationBell align="left"`) to open cleanly to the right into the main viewport without horizontal clipping or off-screen truncation. In the mobile header, `NotificationBell align="right"` aligns rightward with viewport boundary constraints (`max-w-[calc(100vw-2rem)]`).

### Routing & Public Entrypoints
- **`/` (Root Route)**: Evaluates user authentication and inbound attribution:
  - Unauthenticated visitors without query parameters land on the **`LandingPage`**, featuring Company A's portfolio, dual entry portals (Buyer AI Chat vs. Staff Workspace), and 1-click demo logins.
  - Inbound marketing traffic with attribution (`?src=portal|social|website|hoarding`) routes directly to **`BuyerChatPage`** to preserve acquisition conversions.
  - Authenticated staff visiting `/` are automatically redirected to **`/leads`**.
- **`/chat`**: Multilingual AI Residence Advisor chat page with top-bar navigation back to Home (`/`) and a direct link to Staff Sign In (`/login`).
- **`/login`**: Staff Workspace portal with back-to-home navigation (`/`), demo account quick-fill buttons, and cross-navigation to the Buyer AI Chat (`/chat`).
- **`/landing`**: Explicit direct route to the Landing Page.

### Three-State Data Rule
Every list screen, dashboard tile, or data-fetching view strictly handles three distinct states:
1. **Loading State**: Pulse skeletons mimicking the target layout.
2. **Empty State**: Purposeful, actionable empty view with an informative message and a next action button.
3. **Error State**: Actionable error banner displaying the root cause with a "Retry" trigger.

### Multilingual Internationalization (i18n)
Configured via `react-i18next` with complete translation bundles for:
- **English (`en`)**: Default
- **Hindi (`hi`)**: हिन्दी
- **Gujarati (`gu`)**: ગુજરાતી
Persisted across user visits in `localStorage`.

---

## 6. Time Zone Standard

- **Storage**: All timestamps are persisted in UTC (`TIMESTAMPTZ` in PostgreSQL, ISO 8601 strings in JSON APIs).
- **Presentation**: All timestamps presented to buyers and staff are formatted in the `Asia/Kolkata` time zone (IST, UTC+05:30) using `apps/web/src/lib/date.ts`.

---

## 7. Testing Strategy & Pyramid

The test suite enforces a rigorous multi-tier pyramid:
1. **Shared Contract Unit Tests (`packages/shared/tests/`)**: Fast Vitest execution validating Zod schemas, date math, currency formatting, and DPDP rules.
2. **Backend Integration & Concurrency Tests (`apps/api/tests/`)**: Direct PostgreSQL integration tests covering atomic booking transactions, pessimistic row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`), deduplication logic, RBAC rules, and reminder workers.
3. **Frontend Component & View Tests (`apps/web/tests/`)**: Vitest + React Testing Library tests verifying loading, empty, and error states across all screens.
4. **Playwright End-to-End Suite (`e2e/housy-e2e.spec.ts`)**: Automated Chromium user journeys covering multilingual buyer chat, staff lead management, double-booking prevention, and DPDP opt-outs.
5. **Accessibility Audits**: Automated WCAG 2.1 AA audits via `@axe-core/playwright` on all primary routes (`/chat`, `/login`, `/dashboard`).

---

## 8. Anonymous Chat Sessions & Lazy Lead Creation

To protect user privacy and avoid polluting the sales CRM with spurious "Guest Buyer" records upon every page refresh:
- **`chat_sessions` Table**: Tracks anonymous chat browsing without storing any personally identifiable information (PII). Each session records a UUID, `created_at`, `last_activity_at`, and optional non-PII `metadata` (such as project affinity and UTM attribution).
- **Decoupled Conversations**: `conversations.lead_id` is nullable and references `chat_sessions.id` via `conversations.chat_session_id`.
- **Lazy Lead Promotion**: A lead record is created and linked to the active session **only when an explicit conversion trigger occurs**:
  1. The buyer provides verified contact information and grants DPDP consent via the contact drawer.
  2. The buyer exchanges $\ge 2$ chat turns expressing project intent (project interest).
  3. The buyer explicitly requests human sales executive intervention (`detectIntent` resolves to `human`).
  4. The buyer books a site visit appointment.
- **Migration of Legacy Guest Leads**: Existing anonymous guest rows are cleanly reconciled into `chat_sessions`, decoupling raw chats from CRM lead counts.
- **Metric Distinction**: The analytics dashboard distinctly tracks **"Chats Started"** (all initiated web sessions) alongside **"Total Ingested Leads"** (CRM records qualified by contact or intent).

---

## 9. First Response SLA & DPDP Compliance Semantics

Response speed is critical for real estate conversion; the system establishes unambiguous, legally-grounded mathematical definitions:

### Web Chat vs. Ingested Channels
- **Web Chat Conversations**: First response latency is measured from the buyer's first inbound message (`buyer_first_message_at`) to the assistant's first substantive factual answer (`first_response_at`).
  - **Greeting Exclusion**: The initial automated system greeting is flagged with `messages.is_greeting = true` and is explicitly excluded from the response timer, eliminating artificial 0-second SLA gaming.
  - **Audit Stamp**: `leads.first_response_kind` is recorded as `'chat_substantive_answer'`.
- **Ingested Omnichannel Leads (Portal / Social / Hoarding)**: Measured from initial ingestion (`first_touch_at`) to the dispatch of the first outbound notification (`first_response_at`) with `first_response_kind = 'outbound_message'`.

### DPDP Non-Consented Lead Exclusion
Under the Digital Personal Data Protection (DPDP) Act 2023, contacting an individual who has not consented or who has withdrawn consent is prohibited.
- **Contactable Leads (`contactable_leads_count`)**: Leads where `consent_status != 'withdrawn' AND opted_out_at IS NULL`.
- **Not Contactable Leads (`not_contactable_count`)**: Leads without valid consent or with active opt-outs.
- **SLA Invariant**: Non-contactable leads are **excluded from the 48-hour SLA response rate denominator**, ensuring sales teams are evaluated exclusively on legally contactable leads without penalizing regulatory compliance. The dashboard explicitly presents the contactable breakdown in the metric popover.

---

## 10. Single Source of Truth: Visit Bookings & Lead Status

To prevent desynchronization between calendar appointment records and CRM pipeline stages:
- **Atomic Transactions (`VisitService`)**: Any state transition in a visit booking (`confirmed`, `completed`, `no_show`, `cancelled`) updates both `visit_bookings` and `leads.status` inside a single PostgreSQL database transaction.
- **Elimination of Fragile SQL Fallbacks**: Removed fragile `OR` / `EXISTS` query fallbacks in reporting queries; lead status is guaranteed authoritative and coherent.
- **Mathematical Invariants**:
  $$\text{leads.status} = \text{'visited'} \iff \exists\, \text{visit\_bookings.status} = \text{'completed'}$$
  $$\text{leads.status} = \text{'visit\_booked'} \iff \exists\, \text{visit\_bookings.status} = \text{'confirmed'}$$
  $$\text{leads.status} = \text{'no\_show'} \iff \exists\, \text{visit\_bookings.status} = \text{'no\_show'}$$
  Strict regression fixtures guarantee 0 orphaned records or cross-state inconsistencies across the database.

---

## 11. Executive Analytics: Before vs. After Transformation & Cost per Visit

### Before vs. After Cohort Comparison
To quantify the operational impact of the AI sales assistant against Company A's pre-launch baseline:
- **Configurable Cutoff**: `GO_LIVE_DATE` (defaults to `2026-10-15T00:00:00Z`).
- **Pre-Launch Baseline Cohort (Before)**: Leads ingested prior to go-live reflect traditional manual broker workflows:
  - Median first response: $\approx 14\text{ hours}$.
  - Leads unreached in 48h: $\approx 35.5\%$.
  - Visit booking rate: $\approx 6.0\%$.
- **AI-Assisted Cohort (After)**: Leads ingested post go-live assisted by Housy:
  - Median first response: $< 5\text{ minutes}$ ($> 99\%$ reduction).
  - Leads unreached in 48h: $< 5\%$.
  - Visit booking rate: $\ge 8.0\%$.
- **PRNG Deterministic Simulation**: Demo seed data is generated using a seeded pseudo-random number generator (PRNG) anchored to realistic distributions (never hard-coded KPI numbers).
- **UI Transparency**: Displayed prominently in the Executive Dashboard with a clear "Simulated demo data" chip and explicit mathematical calculation popovers.

### Cost Per Completed Visit Attribution
Acquisition marketing spend (₹30 Lakh/month across portals, social, Google search, and physical hoardings) is attributed dynamically:
- **Dual Denominators**: Displays both **Booked Visits** and **Completed Visits** side-by-side.
- **Cost per Completed Visit**: Calculated as $\frac{\text{Attributed Ad Spend}}{\text{Completed Site Visits}}$.
- **Statistical Significance Threshold**: If an acquisition channel has fewer than 5 completed visits in the reporting period, the cost is displayed as `"—"` to avoid distorted outliers from small sample sizes.
- **Explicit Spend Note**: Labeled with the exact allocation basis (`Ad Spend Allocation (₹30L/mo)`).

---

## 12. Automated Job Scheduling, Fault Isolation & Cron Health

In cloud serverless topologies (such as Vercel multi-service), in-memory daemons (`setInterval`) freeze between requests, and free-tier platform crons execute too infrequently (once daily) to guarantee 2-hour pre-visit alerts. The system implements a robust automated operations architecture:

### Unified Master Runner (`POST /api/internal/run-jobs`)
A single HTTPS webhook invoked by an external scheduler (e.g. cron-job.org) every 5 minutes:
1. **Timing-Safe Authentication**: Authenticated strictly via the `X-Internal-Key` HTTP header evaluated via `crypto.timingSafeEqual` in constant time. Disallows query parameter keys (`?key=`, `?apiKey=`) and staff cookie sessions, preventing credential leakage in proxy and server access logs.
2. **Four Fault-Isolated Routines**:
   - **Reminders (`reminders`)**: Processes pending due visit reminders (batch limit 100) using PostgreSQL row-level pessimistic locking (`FOR UPDATE SKIP LOCKED`). Confirms confirmed booking state and DPDP consent before dispatching. Strictly idempotent on repeat invocations.
   - **Slot Top-Up (`slot_top_up`)**: Projects executive availability rules 28 days forward (increased from 21 days), preventing slot exhaustion during periods without admin intervention. Uses `ON CONFLICT (executive_id, starts_at) DO NOTHING`.
   - **Handoff Escalation (`handoff_escalation`)**: Identifies unaccepted handoffs in `new` status older than 15 minutes, escalating priority to `urgent` and alerting the Sales Head.
   - **Stale Session Cleanup (`stale_session_cleanup`)**: Identifies anonymous chat sessions older than 24 hours without lead conversion, reconciling status to `abandoned` and closing inactive conversations.
3. **Audit Trail (`job_runs`)**: Every routine execution logs an immutable record with job identifier, start/finish timestamps in UTC, boolean success flag, JSON execution counts, and sanitized error messages with zero stack trace leakage.
4. **10-Minute Health SLA**: The health check endpoint (`GET /api/health`) and the diagnostics page (`/health`) evaluate reminder execution freshness. If reminders have not completed a successful run within the last 10 minutes, the health chip transitions to **RED** (`Overdue (>10m)`), alerting operators to external cron interruptions.

---

## 13. Security Architecture, Boundary Hardening & Defensive Invariants

Housy adheres to a defense-in-depth, zero-trust security architecture across client boundaries, network transport, authentication, privacy, and automated verification:

### 1. Exact CORS Origin Allowlist
- Inbound HTTP cross-origin requests are checked against an exact origin allowlist defined via `CORS_ORIGIN` (e.g. `https://housy.in`, `http://localhost:5173`).
- Blanket wildcard allowances for `*.vercel.app` and `vercel.live` have been eliminated.
- Dynamic preview environments are supported only when `ALLOW_PREVIEW_ORIGINS=true` is explicitly configured. Disallowed cross-origin requests with credentials are terminated with HTTP `403 Forbidden`.

### 2. Cookie-Authenticated CSRF Protection
- Mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) carrying ambient cookie credentials (`staff_token`) strictly require a custom client-side header (`X-Requested-With`, `X-CSRF-Token`, or `X-Housy-Client`).
- Blanket path bypasses (such as substring `/book` matches) and unverified header checks have been removed.
- Public anonymous chat routes (`/api/chat/start`, `/api/chat/message`, `/api/chat/book`, `/api/chat/contact`, `/api/chat/human`, `/api/chat/escalate`), magic links (`/api/visits/manage/*`), and API key routes (`/api/internal/*`, `/api/ingest/*`) are strictly scoped.

### 3. Strict API Routing & Content Security Policy (CSP)
- The entire API router is mounted strictly at `/api`, preventing unintended routing overlap with frontend assets.
- Production HTTP response headers enforce:
  - **Content-Security-Policy (CSP)**: `default-src 'self'`, `script-src 'self'` (dropping `'unsafe-inline'`), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `connect-src 'self' https:`, `frame-ancestors 'none'`, and `object-src 'none'`.
  - **HTTP Strict Transport Security (HSTS)**: `max-age=31536000; includeSubDomains; preload` in production.
  - **Referrer-Policy**: `strict-origin-when-cross-origin`.
  - **Permissions-Policy**: `camera=(), microphone=(), geolocation=()`.
  - Equivalent security headers are mirrored in `apps/web/vercel.json` for frontend assets.

### 4. Chat Abuse & Cost Defense
- **Session Initiation Rate Limiting**: `/api/chat/start` is rate-limited to 10 chat session creations per hour per IP.
- **Message Length Limitation**: Inbound chat messages are capped at 1,000 characters via Zod validation, preventing memory exhaustion.
- **Context Window Truncation**: The AI assistant pipeline sends only the most recent 20 turns (`messageHistory.slice(-20)`) to the LLM, preventing context window inflation and high token costs.
- **Per-Conversation LLM Call Budget**: Each conversation is limited to at most 30 LLM calls. If the budget is exhausted, the conversation automatically initiates an executive handoff.

### 5. Authentication, RBAC & Brute-Force Lockout
- **Per-Account+IP Brute-Force Lockout**: Five consecutive failed login attempts for a specific email + IP address combination lock out the user for 15 minutes with HTTP `429 Too Many Requests`.
- **JWT Clock Expiry**: Staff JWTs enforce explicit expiration (`exp`) with `clockTolerance: 0`.
- **Secure Cookie Clearing**: `POST /api/auth/logout` explicitly clears both `staff_token` and `buyer_session` cookies.
- **Dynamic Role Re-Verification**: Sensitive administrative endpoints query the database (`SELECT role, active FROM users WHERE id = $1`) to confirm the user has not been deactivated or demoted since token issuance.

### 6. DPDP 2023 Privacy, PII Redaction & Data Retention
- **Structured PII Redaction**: Pino logging configuration redacts passwords, phone numbers, emails, visitor names, and buyer message text from server logs.
- **Automated Data Retention Job (`data_retention`)**: Background routines purge or anonymize chat sessions and conversations older than 90 days.
- **Audit Logging**: Deletion requests (`DELETE /api/leads/:id`) and opt-out actions (`POST /api/leads/:id/opt-out`) are logged to the `audit_log` table with timestamp and actor attribution.

### 7. Test Database Isolation & Automated Attack Suite
- **Test Database Isolation**: Tests enforce `TEST_DATABASE_URL` and throw fatal errors unless the database name ends in `_test`.
- **Comprehensive Attack Suite (`apps/api/tests/security-attacks.test.ts`)**: Automated test suite executing realistic adversarial attacks:
  1. Forged JWTs signed with unauthorized secrets rejected with `401 Unauthorized`.
  2. Expired JWTs rejected with `401 Unauthorized`.
  3. Mutating cookie requests without custom headers rejected with `403 Forbidden`.
  4. Disallowed cross-origin requests rejected with `403 Forbidden`.
  5. Cross-executive lead reading blocked with `403 Forbidden`.
  6. Cross-conversation buyer token replay blocked with `403 Forbidden`.
  7. Oversized payloads (>1,000 chars) rejected with `400 Bad Request`.
  8. SQL injection strings across all search parameters safely handled via parameterized queries.
  9. Brute-force login attempts locked out with `429 Too Many Requests`.
  10. Stale JWT roles dynamically blocked when the database role is demoted or deactivated.

---

## 14. Buyer Experience & Staff Operational Workspaces

### 1. Buyer Showcase Landing & Portfolio Presentation (`/projects/:slug`)
- **Branded Elevation Art**: High-fidelity architectural elevation heroes rendered entirely via SVG and CSS gradients, eliminating stock photography.
- **Price Range Integrity**: Prices displayed exclusively as ranges derived directly from verified entries in the project fact sheet, avoiding speculative figures.
- **Regulatory Transparency & Accessibility**: Permanent display of Gujarat RERA registration numbers, location links via Google Maps, amenities grids, and sticky "Chat with our advisor" / "Book a visit" triggers that persist inbound attribution (`?src`).
- **Trilingual Localization (`en`, `hi`, `gu`)**: Full localization across buyer chat, quick reply chips, slot pickers, and visit management pages. The language state remains synchronized across components, ensuring prompt recommendations and UI copy match the user's selected language.
- **Static Pages & Error Resilience**: Public `/privacy` notice adhering to DPDP 2023 specifications, `/terms` of service, responsive `NotFoundPage` (404), and top-level React `ErrorBoundary`.

### 2. Executive "Today" Workspace (`/today`)
A dedicated priority-driven operational workspace tailored for sales executives:
1. **Visits Scheduled Today**: Physical site tours booked for the current date in Asia/Kolkata timezone, complete with buyer contact details and direct phone call triggers.
2. **Visits Awaiting Outcome**: Completed visits requiring outcome logging (`visited`, `deal_closed`, `lost`, `no_show`) with one-click action buttons.
3. **New Handoffs Queue**: Live buyer handoffs awaiting executive claim, with one-click "Accept Handoff" action.
4. **Unanswered Inquiries (>2h SLA)**: High-priority leads awaiting first response exceeding 2 hours, with one-click deep link to the lead detail drawer.

### 3. Lead Detail Drawer & Intelligent Next Best Action (`LeadDetailDrawer.tsx`)
- **Deterministic Next Best Action Engine**: Recommends immediate operational tasks based on lead stage, DPDP consent, and visit status (e.g. "Record Visit Outcome", "Confirm Appointment", "Initiate First Outreach", "Secure Consent").
- **Direct Status Management**: Allows staff to adjust lead lifecycle stage (`new`, `contacted`, `qualified`, `visit_booked`, `visited`, `negotiating`, `won`, `lost`, `disqualified`) via `PATCH /api/leads/:id/status` with centralized audit logging.
- **DPDP Consent Badge**: Explicit visual indicator of buyer consent state (`opted_in`, `pending`, `withdrawn`).
- **Persistent Staff Notes History**: Reverse-chronological feed of staff notes backed by the `lead_notes` table (`POST /api/leads/:id/notes`), recording author identity, timestamp, and note content.
- **Multi-Touchpoint Attribution Timeline**: Comprehensive chronological ledger showing first touch, channel transitions, chat sessions, handoffs, and booking events.

### 4. Sales Head "Daily Review" Cockpit (`/daily-review` & `/dashboard`)
- **Four Critical Review Queues**: Unreviewed flagged chats, unanswered buyer questions with direct links to the Fact Sheet Editor, unaccepted handoff escalations exceeding 15 minutes, and unreached leads exceeding the 48-hour SLA.
- **One-Click RFC 4180 CSV Export**: Dedicated endpoint `GET /api/admin/daily-review/export-csv` streaming fully compliant CSV exports with proper escaping and quote delimiters.
- **Cockpit Summary Banner**: Real-time KPI banner on the primary Sales Dashboard alerting leadership to outstanding operational items.

### 5. Automated Accessibility Standards & Verification
- **Axe-Core Automated Testing (`e2e/accessibility.spec.ts`)**: Full WCAG 2.1 AA audit suite executing across Mobile (375x667), Tablet (768x1024), and Desktop (1280x800) viewports.
- **WCAG 2.5.3 (Label in Name)**: Button accessible names strictly incorporate all visible text labels.
- **Responsive Discernible Link Names**: Responsive links with icon-only mobile presentations maintain explicit `aria-label` attributes.
- **Live Regions & Error Boundaries**: Screen reader live regions announce incoming assistant responses, ensuring full accessibility for assistive technology users.

### 6. Multilingual Negotiation Guardrails, Brand Integrity & Dynamic Quick-Replies
- **Word-Order Invariant Negotiation Detection**: Full support for arbitrary word order permutations and morphological inflections across Hindi, Gujarati, Hinglish, and English without brittle single-clause regexes. Evaluates bidirectional contextual relationships between price nouns (`भाव`, `दाम`, `कीमत`, `रेट`, `દર`, `કિંમત`) and reduction/discount terms (`कम`, `घटा`, `सस्ता`, `छूट`, `रियायत`, `ગુજાયશ`, `ઓછું`, `ઘટાડો`, `સસ્તું`, `બાંધછોડ`, `ડિસ્કાઉન્ટ`, `waive`, `concession`).
- **Low-Token LLM Intent Fallback**: When deterministic lexicons classify Indic queries containing price stems as `'other'`, a specialized high-speed classifier (`classifyIntentWithLLM`) categorizes the user intent with minimal token overhead ($\le 10$ tokens), routing confirmed negotiations to deterministic canned responses and flagging `price_ask` while safeguarding informational queries (maintenance fees, loan interest rates, per-person charges).
- **Universal Project Display Name Propagation**: Strict server-side `COALESCE(p.display_name, p.name)` resolution across booking confirmation cards (`BookingConfirmationCard`), downloadable iCalendar files (`.ics`), outbound communication templates (WhatsApp confirmations, reschedules, cancellations), executive handoffs, and the appointment management portal (`VisitManagePage`), backed by automated test assertions ensuring generic placeholders (`Project 1`, `Project 2`) never render in buyer-facing UI.
- **Dynamic Client-Side I18n Quick Replies**: Recommendation chips are dynamically localized directly from client i18n locale definitions (`en.json`, `hi.json`, `gu.json`) rather than static server maps, reactively recomputing across English, Hindi, and Gujarati whenever the user toggles the interface language.

### 7. Database Health Diagnostics, Coarse Reason Mapping & Production Resilience
- **Dual Connection & Schema Verification**: `GET /api/health` queries both basic connection ping (`SELECT 1`) and schema readiness (`to_regclass('public.users')`, `to_regclass('public.pgmigrations')`, and latest migration name verified against disk). Returns `{ status: 'ok' | 'degraded' | 'down', schema: 'ok' | 'missing' | 'outdated', reason: 'unreachable' | 'auth_failed' | 'timeout' | 'ssl' | 'schema_missing' | 'pool_exhausted' | 'unknown' }`.
- **Public Credential & Hostname Redaction**: All raw database exception text, hostnames, and ports are strictly scrubbed from the public endpoint and recorded server-side only in structured logs (`logger.error`).
- **Traceable Staff Authentication Failures**: On database errors during staff login, `AuthService.login` logs `err.code`, `err.message`, and `requestId`, returning HTTP 503 with a generic safe message and the request trace ID, which surfaces on the login screen as `"Reference: <id>"`.
- **Pre-Login Ambient Health State**: The login view (`LoginPage.tsx`) fetches `/api/health` once on initial mount and renders a non-intrusive status pill when database health is compromised: `"Setup incomplete"` when `reason === 'schema_missing'` or `"Service is starting up"` for transient network/idle timeouts.
- **Serverless PostgreSQL Pool & Transient Retry**: The database pool enforces `connectionTimeoutMillis: 10000`, caps connections at `max: 3` when running under serverless runtimes (`process.env.VERCEL`), honours explicit `sslmode` parameters from `DATABASE_URL`, and automatically retries transient connection errors (`ECONNRESET`, timeouts, `57P01`) once with 500 ms backoff. Production deployments execute `npm run db:setup:prod` to apply pending migrations and conditionally seed demo accounts only when `DEMO_MODE=true`.
