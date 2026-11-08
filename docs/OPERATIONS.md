# Production Operations, Deployment & Background Workers

This document details the production deployment topology, Vercel multi-service configuration, background jobs, asynchronous channel outbox, regulatory compliance engines, and observability for the Housy platform.

- **System Architecture**: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Data Model**: [`docs/DATA_MODEL.md`](./DATA_MODEL.md)
- **AI Pipeline**: [`docs/AI_PIPELINE.md`](./AI_PIPELINE.md)

---

## 1. Production Topology & Multi-Service Architecture

```
                    Internet / Homebuyers / Staff
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     Vercel Edge       │
                     │  (Unified Ingress)    │
                     └──────────┬────────────┘
                                │
          ┌─────────────────────┴─────────────────────┐
          │ Path: /api/*                              │ Path: /*
          ▼                                           ▼
┌──────────────────┐                        ┌──────────────────┐
│   Service: api   │                        │   Service: web   │
│ Express Backend  │                        │  Vite React SPA  │
│ (Node 20 Server) │                        │ (Static Assets)  │
└─────────┬────────┘                        └──────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│                  Managed PostgreSQL 16                       │
│    (Neon / Supabase / Docker with SSL & Connection Pool)     │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Vercel Multi-Service Project Configuration (`vercel.json`)

The platform deploys as a single unified Vercel project with two independent services:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "api": {
      "root": "apps/api",
      "framework": "express",
      "installCommand": "cd ../.. && npm install",
      "buildCommand": "cd ../.. && npm run build:shared && cd apps/api && npm run build"
    },
    "web": {
      "root": "apps/web",
      "framework": "vite",
      "installCommand": "cd ../.. && npm install",
      "buildCommand": "cd ../.. && npm run build:shared && cd apps/web && npm run build",
      "outputDirectory": "dist",
      "rewrites": [
        {
          "source": "/(.*)",
          "destination": "/index.html"
        }
      ]
    }
  },
  "rewrites": [
    {
      "source": "/api",
      "destination": {
        "service": "api"
      }
    },
    {
      "source": "/api/(.*)",
      "destination": {
        "service": "api"
      }
    },
    {
      "source": "/(.*)",
      "destination": {
        "service": "web"
      }
    }
  ]
}
```

### Routing & Packaging Principles
- **Public Service Ingress**: Web requests originate directly from the buyer's browser. Both `api` and `web` are routed via top-level rewrites (`/api/(.*)` to `api`, `/(.*)` to `web`), enabling same-origin cookie exchange without complex cross-domain setup.
- **Serverless Compatibility**:
  - `apps/api/src/server.ts` and `apps/api/src/index.ts` export `app` as default without calling `app.listen()` when `process.env.VERCEL` is detected.
  - Express routes are mounted at both `/api` and `/` so endpoints match regardless of whether path prefixes are stripped by reverse proxies.
  - Non-localhost database pools configure `ssl: { rejectUnauthorized: false }` with `max: 10` pool connections to prevent connection exhaustion.
  - Builds bundle cleanly into `apps/api/dist/server.js` and `apps/api/dist/index.js`, referenced by `apps/api/package.json` `"main"`.

---

## 3. Background Jobs, Cron Telemetry & Master Runner (`apps/api/src/jobs/`)

### Unified Master Runner: `POST /api/internal/run-jobs`
All recurring background tasks are unified into `POST /api/internal/run-jobs`:
- **Strict Authentication Boundary**:
  - Authenticated **strictly via `X-Internal-Key` HTTP header**.
  - Compared in constant time via `crypto.timingSafeEqual` to prevent timing attacks.
  - Query parameters (`?key=`, `?apiKey=`) and staff JWT cookies are rejected, preventing secret leakage into proxy access logs.
- **Fault-Isolated Execution**: Each routine executes inside an independent `try/catch` block, recording per-job metrics (`ok`, `durationMs`, `counts`, and sanitized `error` strings with zero stack traces) to the `job_runs` table.

```
External Cron (cron-job.org, every 5m)
                 │
                 ▼
      POST /api/internal/run-jobs
    (Header: X-Internal-Key: <SECRET>)
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌──────────────┐     ┌──────────────┐
│  Reminders   │     │ Slot Top-Up  │
│  (limit 100) │     │ (to 28 days) │
└──────────────┘     └──────────────┘
      │                     │
      ▼                     ▼
┌──────────────┐     ┌──────────────┐
│   Handoff    │     │Stale Sessions│
│  Escalation  │     │   Cleanup    │
└──────────────┘     └──────────────┘
                 │
                 ▼
       Persist to job_runs
```

### 1. Site-Visit Reminder Worker (`reminders`)
- **Schedule**: Evaluates for due reminders (`scheduled_at <= NOW()` with status `pending`) with a batch limit of 100.
- **Pessimistic Concurrency**: Claims records using `SELECT id FROM reminders WHERE ... FOR UPDATE SKIP LOCKED`, allowing safe concurrent execution without double-dispatch.
- **Pre-Dispatch Verification**:
  - Confirms the associated booking is still `confirmed` (aborts if cancelled or rescheduled).
  - Evaluates DPDP `canContact(lead, channel)`. If the buyer has opted out, marks reminder `skipped`.
- **Timing Logic**:
  - `24h` reminder: Scheduled for `starts_at - 24 hours`. Gracefully marked `skipped` if appointment is booked less than 24h before visit.
  - `2h` reminder: Scheduled for `starts_at - 2 hours`.
- **Retry Strategy**: Failed dispatches are retried up to 3 times before transitioning to status `'failed'`.

### 2. Slot Top-Up Routine (`slot_top_up`)
- **Rolling 28-Day Window**: Slices executive working shifts into 60-minute visit intervals up to 28 days ahead (extended from 21 days), preventing slot exhaustion during periods without admin availability edits.
- **Timezone Precision**: Working hours (`start_time`, `end_time`) and blackout dates are defined in `Asia/Kolkata` (IST, UTC+05:30) and projected into UTC `starts_at`/`ends_at` timestamps.
- **Idempotency**: Executes `INSERT INTO visit_slots (...) ON CONFLICT (executive_id, starts_at) DO NOTHING`. Repeat calls insert 0 slots.

### 3. Handoff SLA Escalation Routine (`handoff_escalation`)
- **Schedule**: Evaluates for unaccepted buyer handoffs in status `new` older than 15 minutes (`created_at <= NOW() - INTERVAL '15 minutes'`).
- **Escalation**: Flags `is_escalated = true` and elevates priority to `urgent`.
- **Alerting**: Creates a high-priority notification for the Sales Head in `staff_notifications` and mirrors the dispatch to `outbound_messages` with `channel = 'internal'`.

### 4. Stale Session Cleanup Routine (`stale_session_cleanup`)
- **Data Minimization**: Identifies anonymous chat sessions older than 24 hours without lead conversion (`lead_id IS NULL`).
- **State Reconciliation**: Updates `chat_sessions.status = 'abandoned'` and closes associated AI conversations (`conversations.status = 'closed'`).

### 5. Execution Topology & 10-Minute SLA Health Monitor
- **Vercel Multi-Service + External Cron (cron-job.org)**: Serverless function instances on Vercel freeze between requests, rendering in-process `setInterval` inactive. Because Vercel Hobby scheduled crons are limited to once-daily execution (too coarse for 2-hour pre-visit alerts), recurring automation is driven by an external HTTPS cron scheduler (e.g. cron-job.org or GitHub Actions) invoking `POST /api/internal/run-jobs` every 5 minutes.
- **`job_runs` Table**: Stores audit history (`job`, `started_at`, `finished_at`, `ok`, `counts`, `error`).
- **Health Diagnostic SLA (`/health`)**: The health check endpoint (`GET /api/health`) and UI dashboard monitor reminder freshness. If visit reminders have not completed a successful run within the last 10 minutes, the dashboard turns **RED** (`Overdue (>10m)`), alerting operators to external cron failures.

---

## 4. Asynchronous Outbox Pattern & Regulatory Compliance

In adherence to Architectural Assumption **A5**, all external communications (WhatsApp, SMS, Email) are routed through the `outbound_messages` outbox table.

```
Domain Event (Booking / Reminder)
              │
              ▼
   canContact(lead, channel)?
         ├── NO  ──► Mark Skipped / Cancel Reminders (DPDP 2023)
         │
         └── YES ──► Write to outbound_messages (Pending)
                            │
                            ▼
                     Channel Dispatcher
            (WhatsApp / SMS / Email Adapter)
```

### Statutory Compliance Standards
1. **RERA Advertising Compliance (Section 11(2))**:
   - Every promotional, reminder, and transactional communication must display the project's official registration number:
     `PR/GJ/AHMEDABAD/AUDA/RAA01234/011126` (Project 1) or `PR/GJ/AHMEDABAD/AUDA/RAA05678/011126` (Project 2).
   - Unregistered amenities or speculative financial claims are strictly prohibited.
2. **DPDP Act 2023 Personal Data Protection**:
   - **Consent Verification**: Automated outbound messages are dispatched only when `consent_status === 'granted'` and `opted_out_at IS NULL`. Inbound buyer chat remains open so buyers can still interact.
   - **Immediate Opt-Out**: Buyers can opt out via chat keyword (`STOP`, `unsubscribe`, `don't message me`), self-service visit portal, or staff action.
   - **Removals**: Opting out immediately sets `opted_out_at = NOW()`, logs revocation in `consents`, and marks all pending visit reminders for the lead as `cancelled`.
   - **Re-Consent**: Buyers who previously opted out can re-grant affirmative consent via the self-service visit portal (`POST /api/visits/manage/:token/re-consent`) or when submitting contact details for a site-visit booking, clearing `opted_out_at` and restoring `consent_status = 'granted'`.
3. **WhatsApp Template Registry**:
   - Free-form text dispatches over WhatsApp are rejected with `ValidationError`.
   - All dispatches must use pre-approved templates: `visit_confirmation`, `reminder_24h`, `reminder_2h`, and `first_response_link`.

---

## 5. Security Architecture, CORS & Cookie Policies

- **Content-Security-Policy (CSP)**:
  - Configured via Helmet and `<meta>` headers:
    `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' <allowedOrigins>; frame-ancestors 'none'`.
- **CSRF Protection**:
  - Mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a custom header (`X-Requested-With`, `X-CSRF-Token`, or `X-Housy-Client`).
- **Cookie Security**:
  - `staff_token` and `buyer_session` cookies enforce `HttpOnly: true`, `SameSite: 'lax'`, and dynamic `Secure: true` in production.
  - Dual token transport: client API calls forward `X-Buyer-Session` tokens from `sessionStorage`, ensuring authentication even when third-party cookies are blocked.
- **Multi-Tier Rate Limiting**:
  - Staff Login: 5 attempts per 15 minutes per IP.
  - Chat Assistant: 30 requests per minute per IP / buyer session.
  - Lead Ingestion Webhooks: 120 requests per minute per API key.
  - General API: 100 requests per minute.

---

## 6. Cold-Start Mitigation & Resilience

When hosted on free-tier container infrastructure (such as Render or Railway idle spindown):
1. **Client Latency Watchdog**: `apiFetch` in `apps/web/src/lib/api.ts` monitors in-flight HTTP requests. If a request is pending for > 3.5 seconds or returns HTTP 502/504 Bad Gateway, it emits a `housy:backend-waking-up` custom DOM event.
2. **Floating Notification Banner (`ServerColdStartBanner.tsx`)**: Displays an ambient, non-blocking notification informing the user that the server is waking up.
3. **Auto-Dismissal**: Once the backend responds, the banner displays a success checkmark and auto-dismisses after 2.5 seconds.
4. **Buyer Chat Reassurance**: Inline loading text provides calm feedback during assistant session initialization.

---

## 7. Observability, Logging & Health Checks

- **Health Check Endpoint (`GET /api/health`)**:
  - Queries PostgreSQL with `SELECT 1`.
  - Returns HTTP 200 with `{ status: "ok", timestamp, db: "connected" }` when healthy.
  - Returns HTTP 503 with `{ status: "degraded", error }` if the database is unreachable.
- **Structured Pino Logging**:
  - JSON format with request correlation UUIDs (`X-Request-Id`).
  - Automated redaction of sensitive fields: `password`, `email`, `phone`, `token`, and `cookie` are replaced with `[REDACTED]`.
- **Administrative Audit Log (`audit_log`)**:
  - Immutable record of all administrative changes: actor user ID, action, entity type, entity ID, JSON diff, and client IP.
- **LLM Cost & Telemetry Tracking (`llm_calls`)**:
  - Records model, latency in milliseconds, token counts (input/output), cost in USD, and fact citation density.

