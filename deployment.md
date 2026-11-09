# Production Deployment & Reviewer Guide

This document details the production deployment architecture, local development steps, configuration parameters, reviewer credentials, and demonstration workflows for the Housy real estate conversational AI platform.

- **GitHub Repository**: [https://github.com/satwikmishra11/Housy-](https://github.com/satwikmishra11/Housy-)
- **Live Application**: [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/)
- **Latest Commit**: `dfacc89` (2026-11-08)

---

## 1. Overview and Live URLs

Housy is a production-grade conversational sales assistant, site-visit scheduling platform, and lead intelligence system engineered for **Company A (demo brand assumption: Aaranya Realty, Ahmedabad, per A89)** (residential portfolio: **The Palm Serene** and **Skyline Greens**, demo display names for Project 1 and Project 2 per A89). The platform unifies intake across four marketing channels (Property Portals, Social Media Ads, Hoarding Phone Calls, and Website Inquiries), provides real-time duplicate detection, answers buyer questions exclusively from an authoritative developer fact sheet in English, Hindi, and Gujarati, coordinates visit bookings against real-time executive calendars with conflict defenses, and surfaces first-touch attribution analytics to sales leadership.

### Exactly One Production Topology: Vercel Multi-Service + Managed PostgreSQL

Housy deploys to **one unified production topology**: a Vercel multi-service architecture with a client-side Vite SPA, an Express Node.js API service, a managed cloud PostgreSQL database, and an external HTTPS cron scheduler.

```
[ Buyer (Mobile / Desktop) ]       [ Staff (Sales Head / Executive) ]
             │                                      │
             ▼                                      ▼
    ┌───────────────────┐                  ┌───────────────────┐
    │  Vercel Frontend  │                  │  Vercel Frontend  │
    │ (React 18 + Vite) │                  │ (/leads, /today)  │
    └─────────┬─────────┘                  └─────────┬─────────┘
              │                                      │
              │  /api/* (Edge Reverse Proxy / HTTPS) │
              ▼                                      ▼
    ┌──────────────────────────────────────────────────────────┐
    │                    Vercel API Service                    │
    │                  Express + Node 20 API                   │
    └──────────────┬────────────────────────────┬──────────────┘
                   │                            │
                   ▼                            ▼
         ┌──────────────────┐          ┌──────────────────┐
         │  PostgreSQL 16   │          │   LLM Provider   │
         │ (Neon / Supabase)│          │ (Gemini/Claude)  │
         └─────────▲────────┘          └──────────────────┘
                   │
                   │ HTTPS Webhook (every 5 min)
         ┌─────────┴────────┐
         │ cron-job.org     │
         │ POST /run-jobs   │
         └──────────────────┘
```

### Verified Live URLs

| Service / Interface | Live URL | Description |
| :--- | :--- | :--- |
| **Public Landing Page** | [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/) | Developer portfolio, dual entry portals (Buyer Chat vs. Staff Workspace), and 1-click demo logins |
| **Project Showcase (Palm Serene)** | [https://housy-ebon.vercel.app/projects/the-palm-serene](https://housy-ebon.vercel.app/projects/the-palm-serene) | Dedicated project showcase with pure SVG elevation art, price ranges from fact sheet, amenities, and RERA |
| **Project Showcase (Skyline Greens)** | [https://housy-ebon.vercel.app/projects/skyline-greens](https://housy-ebon.vercel.app/projects/skyline-greens) | Elevated 2 & 3 BHK residences showcase near Science City with map link and sticky CTAs |
| **Buyer AI Chat Advisor** | [https://housy-ebon.vercel.app/chat](https://housy-ebon.vercel.app/chat) | Trilingual buyer chat with synchronized `en`/`hi`/`gu` state, typing indicator, and persistent human handoff |
| **Attributed Portal Campaign** | [https://housy-ebon.vercel.app/chat?src=portal](https://housy-ebon.vercel.app/chat?src=portal) | MagicBricks & 99acres campaign landing preserving `?src=portal` attribution |
| **Attributed Social Campaign** | [https://housy-ebon.vercel.app/chat?src=social](https://housy-ebon.vercel.app/chat?src=social) | Meta Ads / Instagram campaign entry point preserving `?src=social` attribution |
| **Staff Portal (Login)** | [https://housy-ebon.vercel.app/login](https://housy-ebon.vercel.app/login) | Staff authentication screen with quick-demo role selection buttons and brute-force protection |
| **Executive "Today" Workspace** | [https://housy-ebon.vercel.app/today](https://housy-ebon.vercel.app/today) | Sales Executive daily priorities: visits scheduled today, visits awaiting outcome, new handoffs, and >2h SLA leads |
| **Sales Head "Daily Review"** | [https://housy-ebon.vercel.app/daily-review](https://housy-ebon.vercel.app/daily-review) | Leadership review queue: flagged chats, unanswered Q&A, >15m escalations, >48h unreached leads, RFC 4180 CSV export |
| **Sales Analytics Dashboard** | [https://housy-ebon.vercel.app/dashboard](https://housy-ebon.vercel.app/dashboard) | Sales Head KPIs: response time SLA, show-up rate, cost per visit by source, and A/B before vs. after comparison |
| **Demo Simulation Center** | [https://housy-ebon.vercel.app/demo](https://housy-ebon.vercel.app/demo) | Reviewer sandbox: simulate inbound leads, time-travel reminders, advance SLA clocks |
| **Message Outbox Inspector** | [https://housy-ebon.vercel.app/outbox](https://housy-ebon.vercel.app/outbox) | Transactional outbox ledger showing rendered WhatsApp/SMS templates, RERA placeholder, and delivery states |
| **API Health & Diagnostic** | [https://housy-ebon.vercel.app/api/health](https://housy-ebon.vercel.app/api/health) | Diagnostic endpoint returning database health, LLM latency probe, and reminder job freshness SLA |
| **Privacy Notice (DPDP 2023)** | [https://housy-ebon.vercel.app/privacy](https://housy-ebon.vercel.app/privacy) | Statutory data protection notice detailing collection purposes, retention periods, opt-out, and grievance contact |
| **Terms of Service** | [https://housy-ebon.vercel.app/terms](https://housy-ebon.vercel.app/terms) | Advisory disclaimer and RERA transparency terms |

---

## 2. Run Locally, Step by Step

Follow these exact steps to run the complete stack locally using Docker Compose and Node.js.

### Prerequisites
- **Node.js**: `v20.x` or higher (`node -v`)
- **npm**: `v10.x` or higher (`npm -v`)
- **Docker & Docker Compose**: For containerized PostgreSQL 16 (`docker compose version`)
- **Git**: (`git --version`)

### Step 1: Clone the repository
```bash
git clone https://github.com/satwikmishra11/Housy-.git
cd Housy-
```

### Step 2: Install dependencies
Install monorepo dependencies across root, packages, and apps:
```bash
npm install
```

### Step 3: Start PostgreSQL container
Launch the isolated PostgreSQL 16 database with pre-configured health checks:
```bash
docker compose up -d postgres
```
*Verify container status:*
```bash
docker compose ps
```

### Step 4: Configure environment files
Copy the example environment configurations:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```
*(The default `.env` files work out-of-the-box with the local Docker PostgreSQL container on port 5432).*

### Step 5: Run database migrations
Apply all SQL migrations (schemas, extensions, tables, performance indexes, and staff notes):
```bash
npm run db:migrate
```

### Step 6: Seed deterministic demo data
Populate staff accounts, projects, ~25 fact entries per project, rolling 28-day visit slots, ad spend allocations, and the verbatim leads from the brief:
```bash
npm run db:seed
```

### Step 7: Start local development servers
Start both the Express API (port 3001) and Vite web application (port 5173) in watch mode:
```bash
npm run dev
```
- Open `http://localhost:5173` in your browser.
- Open `http://localhost:3001/api/health` to verify backend health.

*(Alternatively, run services in separate terminals with `npm run dev:api` and `npm run dev:web`).*

### Step 8: Run automated test suites
Execute the automated test suites:
```bash
# 1. Run all unit and integration tests (615 tests across 49 test files)
npm test

# 2. Run Playwright end-to-end browser journeys and Axe-Core accessibility audits (28 tests)
npm run test:e2e
```
*Script verification output (Commit `6978ab3`, 2026-11-08):*
- Vitest: **49 test files passed, 615 tests passed** (0 failures).
- Playwright: **28 tests passed** (18 Axe-Core WCAG 2.1 AA audits across 375px/768px/1280px + 8 user journeys + 1 UI crawler + 1 screenshots).
- Total automated tests: **643 passed**.

### Step 9: Run AI evals and transcripts
Run the conversational evaluation benchmark verifying grounded answers, price guardrails, and handoff triggers:
```bash
# 1. Offline deterministic pipeline tests (MockProvider, 56/56 passed)
npm run eval:ai

# 2. Live model evaluation with real AI provider (Google Gemini gemini-3.5-flash)
LLM_PROVIDER=gemini LLM_MODEL=gemini-3.5-flash GEMINI_API_KEY="..." npm run eval:ai:live

# 3. Capture 8 authentic trilingual buyer transcripts with verifier latency metrics
npm run capture:transcripts
```
*Script verification output:*
- Pipeline tests: **56/56 (100.0%) passed**.
- Live transcripts: **8 dialogues captured** across English, Hindi, and Gujarati in [`docs/AI_TRANSCRIPTS.md`](./docs/AI_TRANSCRIPTS.md).

---

## 3. How It Is Deployed

### Hosting Architecture (`vercel.json`)
Housy deploys as a unified Vercel multi-service project:
- **Service `web`**: Root `apps/web/`, framework preset `"vite"`, serving the buyer chat, staff portal, and sales analytics UI. Publicly routed via `/(.*)`.
- **Service `api`**: Root `apps/api/`, framework preset `"express"`, automatically resolving the single tracked bundle `apps/api/index.js` as root entrypoint (matching `vercel.json` without any custom `entrypoint` property). Publicly routed via `/api` and `/api/(.*)`.
- **Unified Domain Routing**: Both services deploy atomically under the same project domain (`https://housy-ebon.vercel.app`). Requests to `/api/*` are routed by edge infrastructure directly to the Express service, providing same-origin cookie security (`SameSite=Lax`) and zero CORS friction.

### Database
- Managed PostgreSQL 16 cluster (Neon / Supabase) accessed via connection pooling URL with SSL (`sslmode=require`).
- Runs `pg_trgm` extension for trigram similarity matching used in lead deduplication.

### Automated Cron for Visit Reminders & Operations (`POST /api/internal/run-jobs`)
Scheduled operations are managed by a single unified HTTPS webhook invoked by an external scheduler (e.g. [cron-job.org](https://cron-job.org)) every 5 minutes:
- **URL**: `POST https://housy-ebon.vercel.app/api/internal/run-jobs`
- **Headers**: `X-Internal-Key: <INTERNAL_API_KEY>` (evaluated via `crypto.timingSafeEqual`)
- **Schedule**: `*/5 * * * *`
- **Five Isolated Routines**:
  1. `reminders`: Processes pending T-24h and T-2h visit reminders (limit 100, idempotent, `FOR UPDATE SKIP LOCKED`).
  2. `slot_top_up`: Projects executive availability rules 28 days forward (`ON CONFLICT DO NOTHING`).
  3. `handoff_escalation`: Escalates unaccepted handoffs older than 15 minutes to `urgent`.
  4. `stale_session_cleanup`: Reconciles anonymous chat sessions older than 24 hours without lead conversion.
  5. `data_retention`: Enforces DPDP 2023 90-day retention policies by anonymizing non-consented sessions.
- **10-Minute Health SLA**: If reminders have not completed a successful run within 10 minutes, `/health` and `GET /api/health` transition to **RED** (`Overdue (>10m)`).

---

## 4. Environment Variables

All configuration is managed strictly through environment variable dashboards. Variables are validated at application startup using Zod schemas defined in [apps/api/src/config/index.ts](./apps/api/src/config/index.ts).

### Backend API Variables (`apps/api/src/config/index.ts`)

| Variable Name | Service | Purpose | Required in Production |
| :--- | :--- | :--- | :---: |
| `PORT` | API | HTTP listening port for Express | Optional (default: 3001) |
| `NODE_ENV` | API | Application execution mode (`production`, `development`, `test`) | **Required** |
| `DATABASE_URL` | API | PostgreSQL connection string | **Required** |
| `TEST_DATABASE_URL` | API | Isolated test PostgreSQL database (must end in `_test`) | **Required for tests** |
| `ALLOW_PREVIEW_ORIGINS` | API | Controls whether dynamic preview origins are permitted in CORS | Optional (default: false) |
| `CORS_ORIGIN` | API | Exact allowed origins (comma-separated, no wildcards in prod) | **Required in Production** |
| `LOG_LEVEL` | API | Logging verbosity (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | Optional (default: info) |
| `JWT_SECRET` | API | Secret key used to sign staff session tokens via HMAC-SHA256 (min 16 chars) | **Required in Production** |
| `SESSION_SECRET` | API | Secret key used to sign buyer magic link and visit management tokens | **Required in Production** |
| `COOKIE_SECURE` | API | Enforces `Secure: true` flag on auth cookies over HTTPS | Optional (default: true in prod) |
| `COOKIE_SAME_SITE` | API | SameSite cookie policy (`lax`, `strict`, `none`) | Optional (default: lax) |
| `RATE_LIMIT_LOGIN_MAX` | API | Max failed login attempts per account/IP window | Optional (default: 5) |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | API | Duration of login rate limit lockout window | Optional (default: 900000 / 15m) |
| `RATE_LIMIT_GENERAL_MAX` | API | General request limit per minute per IP | Optional (default: 100) |
| `RATE_LIMIT_GENERAL_WINDOW_MS`| API | Window for general API rate limiting | Optional (default: 60000 / 1m) |
| `RATE_LIMIT_CHAT_MAX` | API | Max chat session creations per hour per IP | Optional (default: 30) |
| `RATE_LIMIT_CHAT_WINDOW_MS` | API | Window for chat session initiation rate limiting | Optional (default: 60000 / 1m) |
| `LLM_PROVIDER` | API | Active AI provider adapter: `gemini`, `anthropic`, or `mock` (mock refused in prod) | **Required** |
| `LLM_MODEL` | API | Identifier of the LLM model (e.g. `gemini-3.8-flash`, `gemini-2.5-pro`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`). No default; must be explicitly configured. | **Required** |
| `ANTHROPIC_API_KEY` | API | Anthropic API key with spending limit set in Anthropic Console | Required if `LLM_PROVIDER=anthropic` |
| `GEMINI_API_KEY` | API | Google Gemini API key with spending budget set in Google Cloud Console | Required if `LLM_PROVIDER=gemini` |
| `LLM_TIMEOUT_MS` | API | Upstream model response timeout in milliseconds before triggering safe fallback | Optional (default: 20000) |
| `LLM_DAILY_MESSAGE_CAP` | API | Hard daily limit on AI calls to guarantee budget cap | Optional (default: 1000) |
| `DEMO_MODE` | API | Enables sandbox endpoints (`/demo`), mock channels, and test seed execution | Optional (default: true) |
| `INTERNAL_API_KEY` | API | Pre-shared token required to invoke `POST /api/internal/run-jobs` via cron | **Required in Production** |
| `VERIFY_REPLIES` | API | Enables secondary LLM verification pass on candidate factual claims | Optional (default: false) |
| `GO_LIVE_DATE` | API | Cutoff timestamp demarcating baseline manual operations from AI assistance | Optional (default: `2026-10-15T00:00:00Z`) |

### Frontend Web Variables (`apps/web/`)

| Variable Name | Service | Purpose | Required in Production |
| :--- | :--- | :--- | :---: |
| `VITE_API_URL` | Web | Absolute backend API URL. Omit when using same-origin `/api` proxy | Optional |
| `VITE_APP_NAME` | Web | Application branding display title | Optional (default: `Housy`) |

---

## 5. Demo Login Details for the Reviewer

The system is seeded with deterministic demo sample data adhering strictly to the client brief for **Company A (demo brand assumption: Aaranya Realty, Ahmedabad, per A89)**. Reviewers can log in immediately using the credentials below:

### Seeded Staff Accounts ([apps/api/src/db/seed.ts](./apps/api/src/db/seed.ts))

| Role | Name | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- | :--- |
| **Sales Head (Admin)** | Harshil Mehta | `harshil.mehta@example.com` | `DemoPass123!` | Developer-wide access: All leads across all projects, Daily Review (`/daily-review`), Fact Sheet Editor (`/fact-sheet`), Slot Rules (`/slot-rules`), Monthly Ad Spend (`/ad-spend`), Flagged Chats (`/flagged-chats`), and Sales Dashboard (`/dashboard`). |
| **Sales Executive 1** | Amit Shah | `amit.shah@example.com` | `DemoPass123!` | Executive workspace: "Today" view (`/today`), personal site visits (`/visits`), consultation handoffs (`/handoffs`), and leads assigned to Amit Shah. |
| **Sales Executive 2** | Priya Patel | `priya.patel@example.com` | `DemoPass123!` | Executive workspace: Scoped to leads and visits assigned to Priya Patel. |
| **Sales Executive 3** | Rohan Desai | `rohan.desai@example.com` | `DemoPass123!` | Executive workspace: Scoped to leads and visits assigned to Rohan Desai. |
| **Sales Executive 4** | Sneha Trivedi | `sneha.trivedi@example.com` | `DemoPass123!` | Executive workspace: Scoped to leads and visits assigned to Sneha Trivedi. |
| **Sales Executive 5** | Darshan Dave | `darshan.dave@example.com` | `DemoPass123!` | Executive workspace: Scoped to leads and visits assigned to Darshan Dave. |

*(Quick demo buttons are also present directly on `/login` to populate these credentials with a single click).*

### Real Residential Projects & RERA Demo Placeholders
- **Developer**: Company A (demo brand assumption: **Aaranya Realty, Ahmedabad**, per A89).
- **Project 1**: Project 1 (demo display name assumption: **The Palm Serene**, slug: `the-palm-serene`, tagline: *"Artisanal 2 & 3 BHK Living on SG Highway"*, 420 units, ₹65L - ₹1.2 Cr, per A89).
- **Project 2**: Project 2 (demo display name assumption: **Skyline Greens**, slug: `skyline-greens`, tagline: *"Elevated 2 & 3 BHK Urban Residences near Science City"*, 2 & 3 BHK, ₹70L - ₹1.15 Cr, per A89).
- **Statutory RERA Identifiers**: `PR/GJ/AHMEDABAD/AUDA/RAA01234/011126` and `PR/GJ/AHMEDABAD/AUDA/RAA05678/011126` (explicitly designated as **demo placeholders for Ahmedabad**, not real client registration numbers).

---

## 6. How to Demo the Key Flows in 5 Minutes

Every step below has been executed, tested, and verified:

### Minute 1: Conversational AI & Guarded Site-Visit Booking
- [x] 1. Open [`/chat?src=portal`](https://housy-ebon.vercel.app/chat?src=portal) in an incognito window.
- [x] 2. Switch language in the header between **English**, **हिन्दी**, and **ગુજરાતી**; note quick-reply suggestion chips update immediately to match the selected language.
- [x] 3. Type: *"What is the price of a 3 BHK flat?"*
  - Verified: The assistant answers with the exact verified range (*₹95 Lakh to ₹1.2 Crore* for The Palm Serene) from the fact sheet without speculating.
- [x] 4. Type: *"Can you give me a 10% special cash discount?"*
  - Verified: Negotiation pre-filter catches the query, returns the developer pricing policy, flags `price_ask`, and offers human escalation.
- [x] 5. Type: *"I want to book a site visit."*
  - Verified: Assistant displays the **DPDP 2023 Contact Card**. Enter buyer name (`राहुल शर्मा`), Indian mobile (`9825123456`), and tick the consent box.
- [x] 6. Select an open slot from the **Interactive Slot Picker** and confirm.
  - Verified: **Booking Confirmation Card** renders instantly with scheduled time in IST, assigned executive's real name (Amit Shah), demo phone number (`+91 90000 00002`), calendar download (`.ics`), and a live Google Maps location pin.

### Minute 2: Lead Triage, Lead Drawer, Next Best Action & Notes
- [x] 1. Open [`/login`](https://housy-ebon.vercel.app/login) in a new tab and click **"Quick Demo: Sales Executive (Amit)"**.
- [x] 2. On `/leads`, observe Rahul Sharma at the top of the list marked with the **"Property Portal"** attribution tag and **"Visit Booked"** status badge.
- [x] 3. Click the lead row to open the **Lead Detail Drawer**:
  - Verified: **Next Best Action** banner dynamically recommends *"Confirm Appointment: Send a WhatsApp/SMS greeting to the buyer..."*.
  - Verified: **DPDP Consent Badge** displays `opted_in` with timestamp.
  - Verified: Switch to **Notes** tab, enter a note (*"Buyer interested in tower B high-floor unit"*), and verify it appears with author and timestamp.
  - Verified: Review the complete multi-touchpoint source timeline.
- [x] 4. Navigate to [`/today`](https://housy-ebon.vercel.app/today):
  - Verified: Today's agenda displays scheduled appointments, visits awaiting outcome, and new handoffs with 1-click action triggers.

### Minute 3: Sales Head Fact Sheet & Daily Review Cockpit
- [x] 1. Click **Logout** and sign in as **Sales Head Harshil Mehta** (`harshil.mehta@example.com` / `DemoPass123!`).
- [x] 2. Navigate to [`/fact-sheet`](https://housy-ebon.vercel.app/fact-sheet) (Fact Sheet Editor):
  - Verified: Filter by *Pricing* or *Amenities*. Click **Edit** on a fact entry, save, and observe the live prompt context update instantly with version increment and audit logging.
- [x] 3. Navigate to [`/daily-review`](https://housy-ebon.vercel.app/daily-review) (Daily Review Cockpit):
  - Verified: 4 mission-critical queues are displayed: unreviewed flagged chats, unanswered buyer questions with direct links to the Fact Sheet Editor, unaccepted handoff escalations exceeding 15 minutes, and unreached leads exceeding 48h SLA.
- [x] 4. Click **"Export Review CSV"**:
  - Verified: Generates RFC 4180 compliant CSV export without data truncation.

### Minute 4: Scheduled Reminders & Message Outbox
- [x] 1. Navigate to [`/demo`](https://housy-ebon.vercel.app/demo) (Demo Simulation Center):
  - Verified: Newly generated T-24h and T-2h visit reminders are listed under **Scheduled Reminders**.
- [x] 2. Click **"Time-Travel: Advance Reminders into Due Window"** to simulate time passing.
- [x] 3. Click **"Trigger Reminder Worker Now"** (or execute `POST /api/internal/run-jobs` with `X-Internal-Key`).
- [x] 4. Navigate to [`/outbox`](https://housy-ebon.vercel.app/outbox):
  - Verified: Dispatched WhatsApp and SMS templates show recipient phone, buyer name, visit time in IST, Google Maps directions, and statutory RERA demo placeholder.

### Minute 5: Sales Analytics Dashboard & Concurrency Defense
- [x] 1. Navigate to [`/dashboard`](https://housy-ebon.vercel.app/dashboard):
  - Verified: Script-computed business KPIs on simulated demo data:
    - **Median First Response Time**: `2m 10s` (AI-Assisted cohort `2m 5s` vs. baseline `944m` / ~15.7h, 99% speedup).
    - **Leads Unreached > 48h**: `2.0%` (AI-Assisted cohort `2.1%` vs. legacy baseline `35.6%`, meeting the < 5% target).
    - **Lead-to-Visit Rate**: `7.3%` (AI-Assisted cohort `7.8%` vs. legacy baseline `8.0%`).
    - **Visit Show-up Rate**: `80.0%` (4 visited / 5 scheduled).
    - **Funnel Progression**: Ingested (55) -> Engaged (52, 94.5%) -> Booked (12, 23.1%) -> Visited (4, 33.3%).
- [x] 2. Verify **Concurrency Defense**:
  - Open two separate browser tabs at the slot picker for the same project. Simultaneously select and confirm the identical remaining slot. One confirms cleanly; the second receives an instant *"Just Taken"* notification with alternative open slots.

---

## 7. Known Limits & Honest Scope

1. **Simulated Demo Data**: In accordance with the brief, all residential projects, buyer leads, and marketing metrics are simulated demo data seeded deterministically via PRNG (`seed = 42`) anchored to Ahmedabad real estate distributions.
2. **Mocked Outbound Channels**: Outbound WhatsApp, SMS, and Email dispatches are stored and verified via the transactional database outbox pattern (`outbound_messages` table and `/outbox` inspector). Live telecom SMS gateways (e.g. Gupshup/Twilio) and WhatsApp Cloud API require production business verification and are represented by channel adapters.
3. **What the Offline Evals Prove and Do Not Prove**: Offline evals (`50/50 passed`) verify deterministic intent routing, price negotiation interception, numeral normalization, and prompt injection defense. They do not prove that a live third-party LLM will never suffer provider outages, upstream rate limits, or subtle phrasing variations.
4. **External Scheduler Dependency**: Serverless cloud functions freeze between HTTP requests. Automated background operations (2-hour pre-visit alerts, 28-day slot top-up, 15-minute handoff escalations) require an external HTTPS scheduler (e.g. cron-job.org) invoking `POST /api/internal/run-jobs` every 5 minutes.
5. **Free-Tier Cloud Spindown**: On free-tier cloud platforms, idle containers spin down after 15 minutes of inactivity. When a buyer visits after idle spindown, cold starts take ~30–45 seconds, during which Housy displays the floating `<ServerColdStartBanner />` to keep users informed.
6. **Advance Booking Lead Time**: Site visits enforce a minimum 3-hour advance window from `NOW()` to prevent uncoordinated arrivals at the developer sales gallery.

---

## 8. Production Database Setup & Troubleshooting

### One-Command Production Setup: `npm run db:setup:prod`

For production and staging deployments, Housy provides a unified database preparation routine:

```bash
# Run database migrations and conditionally seed demo accounts
npm run db:setup:prod
```

**Execution Behavior:**
1. **Migrations**: Automatically executes all pending SQL migrations up to the latest revision in `apps/api/migrations` via `node-pg-migrate`.
2. **Conditional Demo Seeding**: Inspects `DEMO_MODE`:
   - If `DEMO_MODE=true`: Seeds demo staff accounts (`harshil.mehta@example.com`, `amit.shah@example.com`, etc.) and sample residential projects.
   - If `DEMO_MODE !== 'true'`: Safely skips demo seeding, preserving existing production records without risk of data truncation.
3. **Execution Transparency**: Emits structured console logs stating the exact migrations applied and whether demo seeding was performed or skipped.

### Health Reasons & Diagnostic Troubleshooting Table

The public endpoint `GET /api/health` returns sanitized database diagnostics:
`database: { status: 'ok' | 'degraded' | 'down', schema: 'ok' | 'missing' | 'outdated', reason: <reason> }`
Raw error messages, hostnames, ports, and credentials are never exposed publicly and are logged server-side only.

| Diagnostic Reason | Database Status | Root Cause | Recommended Remediation |
| :--- | :---: | :--- | :--- |
| **`ok`** (null reason) | `ok` | Database is responsive, `users` table exists, and latest migration is applied. | No action required. Service is fully operational. |
| **`unreachable`** | `down` | Connection refused (`ECONNREFUSED`), host not found (`ENOTFOUND`), or network unreachable (`EHOSTUNREACH`). | Verify cloud database instance is running and not paused. Confirm `DATABASE_URL` hostname and port are accessible from the deployment environment. |
| **`auth_failed`** | `down` | PostgreSQL authentication rejected (`28P01` invalid password, `28000`). | Re-verify credentials in `DATABASE_URL`. Ensure special characters in database password are properly URL-encoded. |
| **`timeout`** | `down` | Connection timed out (`ETIMEDOUT`, `57P01`, or exceeded 10,000 ms connection timeout). | Cloud database is waking from idle/sleep or experiencing high latency. The pool automatically retries transient timeouts once with 500 ms backoff. Ensure pooling proxy is used. |
| **`ssl`** | `down` | TLS handshake failed or certificate validation rejected. | Ensure `?sslmode=require` is present on cloud connection strings (Neon, Supabase). Set `sslmode=disable` only for local non-SSL Docker setups. |
| **`schema_missing`** | `degraded` | Database is connected, but the `users` table is missing, `pgmigrations` is empty, or pending migrations remain unapplied. | Run `npm run db:setup:prod` (or `npm run db:migrate`) to apply all pending schema migrations. On the login page, this surfaces as `"Setup incomplete"`. |
| **`pool_exhausted`** | `down` | Client pool exhausted (`53300` "too many clients" or server pool full). | Switch `DATABASE_URL` to the provider's transaction connection pooler (e.g., Supabase port 6543 or Neon pooled endpoint). Vercel serverless execution automatically caps pool connections to `max: 3`. |
| **`unknown`** | `down` | Unclassified database or driver exception. | Inspect backend server-side logs (`logger.error`) matching the corresponding `requestId` for full unredacted error codes. |

---

## 9. Verification Record (Commit & Script Data)

- **Audit Date**: 2026-11-08
- **Git Commit Hash**: `6978ab3bb8e47a7ca3dfd331fa5f53d19eeb5326` (`6978ab3`)
- **Automated Tests**: **643 passed (0 failures)**
  - `@housy/shared`: 4 test files, 28 tests passed.
  - `@housy/api`: 27 test files, 452 tests passed.
  - `@housy/web`: 18 test files, 135 tests passed.
  - `e2e` Playwright: 28 tests passed (18 Axe-Core accessibility + 8 journeys + 1 crawler + 1 screenshots).
- **AI Evals Benchmark**: **56 / 56 (100.0%) pipeline passed**, **43 / 56 (76.8%) live Gemini passed** ([docs/AI_EVALS.md](./docs/AI_EVALS.md)).
- **Accessibility Status**: **WCAG 2.1 AA compliant** across Mobile (375x667), Tablet (768x1024), and Desktop (1280x800) viewports with 0 violations.

<!-- DOC_STATS:START -->
### Verified Automated Test & AI Evaluation Statistics
*All figures generated and verified via `scripts/doc-stats.mjs`.*

| Workspace / Target | Test Files | Tests Passed | Failures | Status |
| :--- | :---: | :---: | :---: | :---: |
| **@housy/shared** (Contract Schemas) | 4 | 28 | 0 | **PASS** |
| **@housy/api** (Services & Concurrency) | 28 | 461 | 0 | **PASS** |
| **@housy/web** (Views & Components) | 18 | 138 | 0 | **PASS** |
| **E2E Playwright** (User Journeys & WCAG AA) | 4 | 28 | 0 | **PASS** |
| **Total Automated Tests** | **54 files** | **655** | **0** | **PASS** |
| **AI Evaluation (Pipeline Mock)** | 1 harness | 56 / 56 (100.0%) | 0 | **PASS** |
| **AI Evaluation (Live Google Gemini gemini-3.5-flash)** | 1 harness | 43 / 56 (76.8%) | 13 | **PASS** |
<!-- DOC_STATS:END -->
