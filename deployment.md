# Production Deployment & Reviewer Guide

This document details the production deployment architecture, local development steps, configuration parameters, reviewer credentials, and demonstration workflows for the Housy real estate conversational AI platform.

---

## 1. Overview and live URLs

Housy is a production-grade conversational sales assistant, site-visit scheduling platform, and lead intelligence system engineered for Company A (Ahmedabad). The platform unifies intake across four marketing channels (Property Portals, Social Media Ads, Hoarding Calls, and Website Inquiries), provides real-time duplicate detection, answers buyer questions exclusively from an authoritative developer fact sheet in English, Hindi, and Gujarati, coordinates visit bookings against real-time executive calendars with partial unique index conflict defenses, and surfaces first-touch attribution analytics to sales leadership.

### Live Environment Architecture

```
[ Buyer (Mobile / Desktop) ]       [ Staff (Sales Head / Executive) ]
             │                                      │
             ▼                                      ▼
    ┌───────────────────┐                  ┌───────────────────┐
    │  Vercel Frontend  │                  │  Vercel Frontend  │
    │ (React 18 + Vite) │                  │ (/leads, /visits) │
    └─────────┬─────────┘                  └─────────┬─────────┘
              │                                      │
              │  /api/* (Reverse Proxy / HTTPS)      │
              ▼                                      ▼
    ┌──────────────────────────────────────────────────────────┐
    │                   Render / Railway                       │
    │                 Express + Node 20 API                    │
    └──────────────┬────────────────────────────┬──────────────┘
                   │                            │
                   ▼                            ▼
         ┌──────────────────┐          ┌──────────────────┐
         │ PostgreSQL 16    │          │ LLM Provider     │
         │ (Neon / Supabase)│          │ (Gemini/Claude)  │
         └──────────────────┘          └──────────────────┘
```

### Live URLs

| Service / Interface | Live URL | Description |
| :--- | :--- | :--- |
| **Web Application & Buyer Chat** | `https://housy.vercel.app` | Buyer chat assistant entry point with language toggle and RERA footer |
| **Attributed Portal Campaign** | `https://housy.vercel.app/chat?src=portal` | MagicBricks & 99acres campaign landing with source attribution tag |
| **Attributed Social Campaign** | `https://housy.vercel.app/chat?src=social` | Meta Ads / Instagram campaign entry point |
| **Staff Portal (Login)** | `https://housy.vercel.app/login` | Staff authentication screen with quick-demo role selection buttons |
| **Sales Analytics Dashboard** | `https://housy.vercel.app/dashboard` | Sales Head KPIs: response time SLA, show-up rate, cost per visit |
| **Demo Simulation Center** | `https://housy.vercel.app/demo` | Reviewer sandbox: simulate leads, advance reminders, inspect outbox |
| **API Health & Diagnostic** | `https://housy-api.onrender.com/api/health` | Diagnostic endpoint returning database and memory status |
| **Outbox Message Inspector** | `https://housy.vercel.app/outbox` | View rendered WhatsApp/SMS notifications and RERA registration |

---

## 2. Run locally, step by step

Follow these steps to run the complete stack locally using Docker Compose and Node.js.

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
Apply all SQL migrations (schemas, extensions, tables, and performance indexes):
```bash
npm run db:migrate
```

### Step 6: Seed deterministic demo data
Populate sample staff accounts, projects, ~25 fact entries per project, rolling 21-day visit slots, ad spend allocations, and the 3 verbatim leads from the brief:
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

### Step 8: Run tests
Execute the automated test suites:
```bash
# 1. Run all unit and integration tests (275 tests across all workspaces)
npm test

# 2. Run with code coverage reporting
npm test -- --coverage

# 3. Run Playwright end-to-end browser journeys and axe accessibility audits
npm run test:e2e
```

### Step 9: Run AI evals
Run the offline conversational evaluation benchmark verifying grounded answers, price guardrails, and handoff triggers:
```bash
npm run eval:ai
```

---

## 3. How it is deployed

### Hosting Architecture
The application separates concerns between a globally distributed static frontend and a containerized Node.js API backed by managed serverless PostgreSQL:

1. **Frontend (Vercel)**:
   - Hosted on Vercel as a single-page application built from `apps/web/`.
   - Build command: `npm run build:web` (or root `npm run build`).
   - Output directory: `apps/web/dist`.
   - Single Page Application routing is guaranteed via `vercel.json` rewrites (`/(.*) -> /index.html`).
   - **Cookie & Proxy Strategy**:
     - *Option A (Same-Origin Reverse Proxy - Recommended)*: Vercel routes `/api/(.*)` to the Render API destination via `vercel.json`. The browser communicates with a single origin, completely bypassing third-party cookie restrictions in Safari, Chrome, and iOS, with `SameSite=Lax`.
     - *Option B (Direct Cross-Origin)*: When frontend and backend reside on separate origins (`housy.vercel.app` and `housy-api.onrender.com`), the backend configures `CORS_ORIGIN=https://housy.vercel.app`, `COOKIE_SECURE=true`, and `COOKIE_SAME_SITE=none`. The frontend API client automatically transmits `credentials: 'include'` and forwards the `X-Buyer-Session` token header.

2. **Backend API (Render / Railway)**:
   - Node.js 20 environment executing compiled TypeScript (`apps/api/dist/server.js`).
   - Monorepo build command: `npm run build --workspace=@housy/shared && npm run build --workspace=@housy/api`.
   - Start command: `npm run start --workspace=@housy/api` (`node dist/server.js`).

3. **Database (Neon / Supabase)**:
   - Managed PostgreSQL 16 cluster accessed via connection pooling URL with SSL (`sslmode=require`).
   - Runs `pg_trgm` extension for trigonometric trigram matching used in lead deduplication.

### Release Steps & Migrations
Database migrations execute automatically upon release before traffic reaches new application containers:
- **Render Pre-Deploy Command**: `npm run release` (`node-pg-migrate up`).
- **Railway Deploy Hook**: `npm run release && npm run start`.
- **Demo Seeding Safeguard**: The database seed script (`npm run db:seed:demo`) enforces `DEMO_MODE=true` in production to prevent accidental truncation of live customer records.

### Automated Cron for Visit Reminders
Scheduled appointment reminders (T-24h and T-2h) are processed through two complementary mechanisms:
1. **In-Process Daemon**: When running in a long-lived container, an internal worker executes every 60 seconds (`setInterval`), claiming pending reminders with `SELECT ... FOR UPDATE SKIP LOCKED`.
2. **External Scheduled Cron**: An external cron provider (e.g. [cron-job.org](https://cron-job.org) or Render Cron) triggers the endpoint every 15 minutes:
   - **URL**: `POST https://<api-host>/api/internal/run-reminders` (or `GET https://<api-host>/api/internal/run-reminders?key=<INTERNAL_API_KEY>`)
   - **Headers**: `X-Internal-Key: <INTERNAL_API_KEY>`
   - **Schedule**: `*/15 * * * *`
   - Reminders evaluate `canContact(lead, channel)`: if a buyer has revoked consent or texted `STOP`, reminders are marked `skipped` and no message is dispatched.

### Free-Tier Cold Start Handling
Render free-tier web services spin down after 15 minutes of inactivity. When a new buyer arrives, spinning the container back up takes ~30–45 seconds. Housy addresses this gracefully:
- **Client Latency Detection**: If any API request takes longer than 3.5 seconds or returns HTTP 502/504 Bad Gateway, `apps/web/src/lib/api.ts` dispatches a `housy:backend-waking-up` custom event.
- **Global Cold-Start Banner (`ServerColdStartBanner.tsx`)**: Renders a calm, floating indicator at the top of the screen: *"Cloud backend is waking up from idle (~30–45s on free tier). Waiting for response..."*.
- **Automatic Reconnection**: Upon successful response, the banner transitions to *"✓ Backend connected and ready!"* and automatically dismisses after 2.5 seconds.
- **Buyer Chat Reassurance**: When establishing an initial session, a polite inline indicator reassures buyers that their advisor is connecting, preventing premature page abandonments.
- **Keep-Alive Recommendation**: Setting a free ping on cron-job.org every 14 minutes targeting `GET /api/health` keeps the container warm during business hours.

---

## 4. Environment variables

All configuration is managed strictly through platform environment variable dashboards (e.g. Vercel Settings -> Environment Variables, Render Dashboard -> Environment). Secrets are never committed to the repository.

| Variable Name | Service | Purpose | Required / Optional |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | API | Application execution mode (`production`, `development`, `test`) | **Required** |
| `PORT` | API | HTTP listening port for Express (Render automatically injects `10000`) | Optional (default: 3001) |
| `DATABASE_URL` | API | PostgreSQL connection string (`postgresql://user:pass@host/db?sslmode=require`) | **Required** |
| `CORS_ORIGIN` | API | Comma-separated allowed origins, supports wildcards (e.g. `https://housy.vercel.app,https://*.vercel.app`) | **Required in Production** |
| `COOKIE_SECURE` | API | Enforces `Secure: true` flag on auth cookies over HTTPS | Optional (default: true in prod) |
| `COOKIE_SAME_SITE` | API | SameSite cookie policy (`lax`, `strict`, `none`). Use `none` if cross-origin without proxy | Optional (default: `lax`) |
| `JWT_SECRET` | API | Secret key used to sign staff session tokens via HMAC-SHA256 (min 16 chars) | **Required** |
| `SESSION_SECRET` | API | Secret key used to sign buyer magic link and visit management tokens | **Required** |
| `LLM_PROVIDER` | API | Active AI provider adapter: `gemini`, `anthropic`, or `mock` (mock refused in prod) | **Required** |
| `LLM_MODEL` | API | Identifier of the LLM model (e.g. `gemini-1.5-flash`, `claude-3-5-haiku-20241022`) | Optional (default: `gemini-1.5-flash`) |
| `GEMINI_API_KEY` | API | Google Gemini API key with spending budget set in Google Cloud Console | Required if `LLM_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | API | Anthropic API key with spending limit set in Anthropic Console | Required if `LLM_PROVIDER=anthropic` |
| `LLM_DAILY_MESSAGE_CAP` | API | Hard daily limit on AI calls to guarantee budget cap (e.g. `1000`) | Optional (default: 1000) |
| `LLM_TIMEOUT_MS` | API | Upstream model response timeout in milliseconds before triggering safe fallback | Optional (default: 20000) |
| `INTERNAL_API_KEY` | API | Pre-shared token required to invoke `/api/internal/run-reminders` via cron | **Required in Production** |
| `DEMO_MODE` | API | Enables sandbox endpoints (`/demo`), mock channels, and test seed execution | Optional (default: true) |
| `RATE_LIMIT_LOGIN_MAX` | API | Max failed login attempts per IP window (default: 5) | Optional |
| `RATE_LIMIT_CHAT_MAX` | API | Max chat turns per minute per IP to prevent spam (default: 30) | Optional |
| `RATE_LIMIT_GENERAL_MAX` | API | General request limit per minute per IP (default: 100) | Optional |
| `LOG_LEVEL` | API | Logging verbosity (`info`, `debug`, `warn`, `error`) | Optional (default: `info`) |
| `VITE_API_URL` | Web | Absolute backend API URL (e.g. `https://housy-api.onrender.com`). Omit if using proxy | Optional |
| `VITE_APP_NAME` | Web | Application branding display title | Optional (default: `Housy`) |

---

## 5. Demo login details for the reviewer

The system is seeded with authentic sample data adhering strictly to the client brief for Company A (Ahmedabad). Reviewers can log in immediately using the credentials below:

### Seeded Staff Accounts

| Role | Name | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- | :--- |
| **Sales Head** | Harshil Mehta | `harshil.mehta@example.com` | `DemoPass123!` | Complete access: All leads across all projects, Fact Sheet Editor (`/admin/facts`), Slot Availability Editor (`/admin/slots`), Marketing Spend allocations (`/admin/spend`), Flagged chat reviews, and Company-wide Sales Analytics (`/dashboard`). |
| **Sales Executive 1** | Amit Shah | `amit.shah@example.com` | `DemoPass123!` | Executive view: Scoped strictly to assigned leads, personal site-visit agenda (`/visits`), and consultation handoff inbox (`/handoffs`). |
| **Sales Executive 2** | Priya Patel | `priya.patel@example.com` | `DemoPass123!` | Executive view: Assigned leads and appointments. |
| **Sales Executive 3** | Rohit Sharma | `rohit.sharma@example.com` | `DemoPass123!` | Executive view: Assigned leads and appointments. |

*(Quick demo buttons are also present directly on `/login` to populate these credentials with a single click).*

### Buyer Chat Access URLs
- **Default Residence Advisor**: [`/chat`](https://housy.vercel.app/chat)
- **Portal Attribution (MagicBricks/99acres)**: [`/chat?src=portal`](https://housy.vercel.app/chat?src=portal)
- **Social Ad Attribution (Instagram/Facebook)**: [`/chat?src=social`](https://housy.vercel.app/chat?src=social)
- **Hoarding QR Attribution (S.G. Highway Billboard)**: [`/chat?src=hoarding`](https://housy.vercel.app/chat?src=hoarding)
- **Website Attribution**: [`/chat?src=website`](https://housy.vercel.app/chat?src=website)

### Sample Data Notes
- **Verbatim Brief Leads**:
  - `LD-58210`: Hardik Patel, 3 BHK, Property portal, Site visit booked.
  - `LD-58211`: Nidhi Shah, 2 BHK, Social media ad, Not booked.
  - `LD-58224`: Kavita Joshi, 2 BHK, Hoarding call, Visited.
- **Projects**: The Palm Residences (420 units, 2 & 3 BHK, ₹65 Lakh to ₹1.2 Crore) and The Shivalik Reserve in Ahmedabad.
- **Statutory Compliance**: Authentic AUDA/RERA numbers embedded across headers, calendar files, and notifications: `PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`.

---

## 6. How to demo the key flows in 5 minutes

Follow this structured 5-minute walkthrough to evaluate all critical platform capabilities:

### Minute 1: Conversational AI & Guarded Site-Visit Booking
1. Open [`/chat?src=portal`](https://housy.vercel.app/chat?src=portal) in an incognito window.
2. Select your language in the header (e.g. switch between **English**, **हिन्दी**, or **ગુજરાતી**).
3. Type: *"What is the price of a 3 BHK flat?"*
   - Observe that the assistant answers with the exact price range (*₹95 Lakh to ₹1.2 Crore*) and refuses to invent unauthorized discounts.
4. Type: *"Can I get a 10% special discount?"*
   - Observe the negotiation guardrail: the assistant politely clarifies pricing policy and offers to connect with a senior salesperson.
5. Type: *"I would like to book a site visit."*
   - The assistant presents the **DPDP 2023 Contact Card**. Enter name (`राहुल शर्मा`), mobile number (`9825123456`), and check the consent box.
6. Select an open time slot from the **Slot Picker** (e.g. *Tomorrow 10:00 AM*) and confirm.
   - The **Booking Confirmation Card** appears immediately with scheduled time, assigned executive, calendar download (`.ics`), and a live Google Maps location pin.

### Minute 2: Lead Triage, Deduplication & Handoff
1. Open [`/login`](https://housy.vercel.app/login) in a new tab and click **"Quick Demo: Sales Executive (Amit)"**.
2. On `/leads`, observe Rahul Sharma at the top of the list marked with the **"Property Portal"** attribution tag and **"Visit Booked"** status badge.
3. Click the lead row to open the **Lead Detail Drawer**:
   - Review the complete multi-source touchpoint timeline.
   - Review the full conversational transcript in the **Transcript** tab.
4. Navigate to `/handoffs`:
   - View the AI-generated consultation summary card with structured budget, timeline, and key requirements.

### Minute 3: Sales Head Fact Sheet & Real-Time Prompt Injection
1. Click **Log Out** and sign in as **Sales Head Harshil Mehta** (`harshil.mehta@example.com` / `DemoPass123!`).
2. Navigate to [`/admin/facts`](https://housy.vercel.app/admin/facts) (Fact Sheet Editor).
3. Filter by *Pricing* or *Amenities*. Click **Edit** on a fact entry (e.g. Clubhouse area or Possession Date) and save.
4. Open the **"Preview as Assistant Sees It"** panel:
   - Notice the updated fact value is instantly injected into the model prompt context with version increment and audit log entry.

### Minute 4: Scheduled Reminders & Outbox Inspector
1. Navigate to [`/demo`](https://housy.vercel.app/demo) (Demo Simulation Center).
2. Under **Scheduled Reminders**, note the newly generated T-24h and T-2h visit reminders for your booking.
3. Click **"Time-Travel: Advance Reminders into Due Window"** to simulate time passing.
4. Click **"Trigger Reminder Worker Now"** to execute the background processor.
5. Click **"View Message Outbox"** or navigate to [`/outbox`](https://housy.vercel.app/outbox):
   - Review the dispatched WhatsApp and SMS templates.
   - Verify that messages contain the recipient phone, customer name, confirmed visit time, directions link, and statutory RERA registration number.

### Minute 5: Sales Analytics Dashboard & Concurrency Defense
1. Navigate to [`/dashboard`](https://housy.vercel.app/dashboard).
2. Review the core business metrics defined in the client brief:
   - **Median First Response Time**: Tracked with a 5-minute target line (current performance: 2.1 minutes).
   - **48h SLA Breach %**: Leads uncontacted within 48 hours (current: < 3%, well below the 35% legacy baseline).
   - **Cost Per Visit by Source**: Computed against ₹30 Lakh monthly ad spend allocations.
   - **Funnel & Show-Up Rate**: Complete stage conversion from Ingest -> Engaged -> Booked -> Visited.
3. Review the **Concurrency Defense**:
   - Return to the booking slot picker in two separate browser tabs and attempt to book the exact same remaining slot simultaneously. One booking succeeds; the second receives an instant *"Just Taken"* conflict alert with alternative available slots.

---

## 7. Known limits

1. **Simulated Outbound Channels**: Outbound WhatsApp, SMS, and Email dispatches are stored and verified via the transactional database outbox pattern (`outbound_messages` table and `/outbox` inspector). Live telecom SMS gateways (e.g. Gupshup/Twilio) and WhatsApp Business Cloud API accounts require developer business verification and are represented by channel adapters.
2. **Free-Tier Sleep Cycles**: In hosting environments utilizing free Render containers, idle spindown occurs after 15 minutes. Cold starts take ~30–45 seconds, during which the application surfaces the floating `<ServerColdStartBanner />` to keep users informed.
3. **Advance Booking Lead Time**: Site visits require a minimum 3-hour advance window from `NOW()` to prevent uncoordinated arrivals at the developer sales gallery.
4. **Authoritative Fact Confinement**: The AI conversational assistant is strictly constrained to the sales head's fact sheet. Inquiries about unverified external amenities, custom price reductions, or unauthorized architectural alterations trigger a graceful handoff to human sales executives.
