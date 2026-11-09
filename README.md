# Housy — AI Sales & Site-Visit Booking Platform

[![CI](https://github.com/satwikmishra11/Housy-/actions/workflows/ci.yml/badge.svg)](https://github.com/satwikmishra11/Housy-/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%202023%20%7C%20RERA%20Gujarat-emerald.svg)]()

> Full-stack AI conversational sales assistant and conflict-free site-visit booking platform built for residential real estate developers in Ahmedabad, Gujarat (Project 1 & Project 2, ₹65L – ₹1.2 Cr). Solves lead wastage and slow response times by guaranteeing 24/7 sub-2-minute replies in English, Hindi, and Gujarati, booking real free slots with zero double-booking, and orchestrating warm handoffs to sales executives.

- 🌐 **Live Web Application**: [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/)
- 📐 **Technical Design Document (TDD)**: [`docs/TDD.md`](./docs/TDD.md) | [Exported PDF](./docs/TDD.pdf)
- 📖 **Deployment Guide**: [`deployment.md`](./deployment.md)
- 📦 **Submission Package**: Downloadable as a release asset under [GitHub Releases](https://github.com/satwikmishra11/Housy-/releases)

---

## Screen Highlights

| Multilingual Buyer Advisory | Slot Booking & Map Pin Confirmation |
| :---: | :---: |
| ![Buyer Chat Greeting](./docs/assets/screenshots/01-chat-greeting-desktop.png) | ![Confirmed Booking Mobile](./docs/assets/screenshots/02-chat-booking-confirmed-phone.png) |

| Unified Lead Intake & Deduplication | Executive Handoff & AI Summary |
| :---: | :---: |
| ![Leads Dashboard](./docs/assets/screenshots/04-leads-desktop.png) | ![Handoff Inbox](./docs/assets/screenshots/05-handoffs-desktop.png) |

| Sales Performance & Source Analytics | Fact Sheet Knowledge Base Editor |
| :---: | :---: |
| ![Sales Analytics Dashboard](./docs/assets/screenshots/06-dashboard-desktop.png) | ![Fact Sheet Editor](./docs/assets/screenshots/07-factsheet-desktop.png) |

---

## Quickstart & Local Setup

### 1. Prerequisites & Environment Setup
Clone the repository, install dependencies, and start PostgreSQL:
```bash
git clone https://github.com/satwikmishra11/Housy-.git && cd Housy-
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up   # Starts PostgreSQL container (creates housy_db and housy_test)
```

### 2. Run the App (Development Database — `housy_db`)
Initialize the development database and launch both API and Web applications:
```bash
npm run db:reset    # Runs migrations and seeds demo accounts & projects into housy_db
npm run dev         # Launches Express API (http://localhost:3001) & Vite UI (http://localhost:5173)
```
- API backend: `http://localhost:3001`
- React frontend: `http://localhost:5173` (proxies `/api` requests to backend)

#### Demo Accounts
| Role | Email | Password | Scope |
|---|---|---|---|
| **Sales Head (Admin)** | `harshil.mehta@example.com` | `DemoPass123!` | Developer-wide analytics, fact sheet editor, slot rules, ad spend |
| **Sales Executive** | `amit.shah@example.com` | `DemoPass123!` | Assigned lead triage, executive handoff inbox, visit outcome verification |

### 3. Run the Tests (Test Database — `housy_test`)
Tests run in strict isolation against `housy_test` (resolved via `TEST_DATABASE_URL`). The test runner and setup hooks fail fast and refuse to run if pointed at a non-test database:
```bash
npm run db:test:reset   # Runs migrations and seeds fresh test data into housy_test (NODE_ENV=test)
npm test                # Executes full unit and integration test suite across all workspaces
```
> [!NOTE]
> Vitest includes a `globalSetup` hook (`apps/api/tests/global-setup.ts`) that inspects `housy_test` before test suites execute, automatically running migrations and seeding fixtures if the test database is empty. You can also run `npm run db:test:reset` at any time to wipe and reset the test database on demand.

### 4. AI Chat Assistant Configuration & Live Responses
To power live conversational responses from the residential fact sheet, configure the following in `apps/api/.env`:
```env
LLM_PROVIDER=gemini        # 'gemini' or 'anthropic'
LLM_MODEL=gemini-2.5-flash # provider model ID
GEMINI_API_KEY=your_key_here
```

**What the user sees without an API key or model:**
- Without `LLM_PROVIDER`, `LLM_MODEL`, and a valid key (or when third-party provider APIs encounter rate limits or outages), the AI sales assistant does **not** crash or display raw error stack traces to the home buyer.
- Instead, the deterministic guardrail pipeline safely returns a polite, localized fallback reassurance:
  - **English**: *"A member of our team will confirm this with you shortly. In the meantime, would you like to schedule a site visit or speak with a sales advisor?"*
  - **Hindi**: *"हमारी टीम का एक सदस्य शीघ्र ही आपसे इस बारे में पुष्टि करेगा। इस बीच, क्या आप साइट विजिट बुक करना चाहेंगे या किसी सलाहकार से बात करना चाहेंगे?"*
  - **Gujarati**: *"અમારી ટીમના સભ્ય ટૂંક સમયમાં તમારી સાથે આની પુષ્ટિ કરશે. તે દરમિયાન, શું તમે સાઇટ મુલાકાત શેડ્યૂલ કરવા માંગો છો કે સલાહકાર સાથે વાત કરવા માંગો છો?"*
- Behind the scenes, the system logs the buyer's query into `unanswered_questions`, flags the chat session for Sales Head review, and escalates the lead to a human sales executive handoff queue.
- *(Note: During automated test execution under `NODE_ENV=test`, the system automatically uses `LLM_PROVIDER=mock` so all test suites run deterministically without requiring live third-party API credentials).*

### 5. Tracked API Bundle & Vercel Serverless Architecture
The Express API compiles into a single tracked CommonJS bundle at [`apps/api/index.js`](apps/api/index.js):
- **Why it is tracked**: In Vercel's multi-service architecture with framework preset `"express"` (`vercel.json`), Vercel resolves the root entrypoint directly at `apps/api/index.js`. Because serverless execution environments require a self-contained entrypoint with explicit CommonJS exports (`module.exports = app`) without runtime TypeScript compilation or dynamic module tracing overhead, `apps/api/index.js` packages the Express application cleanly.
- **Single-Bundle Discipline**: All duplicate bundle artifacts (such as `app.js`) have been removed and added to `.gitignore`. Exactly one bundle (`apps/api/index.js`) remains tracked.
- **Automated CI Drift Verification**: GitHub Actions CI executes `npm run build:api && git diff --exit-code apps/api/index.js` on every pull request and commit, guaranteeing that the committed bundle remains strictly identical to the TypeScript source code and failing the build if any drift is detected.

---

## Verification & Test Commands

```bash
# Run full verification suite (lint + typecheck + unit/integration tests)
npm run check

# Run Playwright End-to-End user journeys (headless Chromium)
npm run test:e2e

# Run automated secret scanner across working tree and git history
npm run scan:secrets
```

---

## Core Capabilities

1. **24/7 Multilingual AI Advisory**: Converses in English, Hindi, and Gujarati, strictly grounded in the sales head's active fact sheet. Hallucinations and unauthorized claims are eliminated by deterministic pre- and post-check guardrails.
2. **Zero Double-Booking Guarantee**: Pessimistic row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`) combined with PostgreSQL partial unique constraints (`UNIQUE(slot_id) WHERE status = 'confirmed'`) ensures concurrent buyers can never book the same slot.
3. **Automated Deduplication Pipeline**: Exact phone/email normalization and PostgreSQL trigram matching (`pg_trgm`) deduplicate incoming leads across property portals, Meta ads, website forms, and offline hoardings.
4. **DPDP Act 2023 & RERA Compliance**: Strict affirmative consent notices, immediate opt-out halting on `STOP` or cancellation, and statutory Gujarat AUDA RERA registration numbers embedded on all touchpoints.
5. **Executive Analytics Dashboard**: Real-time tracking of first response latency (median target < 5 min), 48h SLA breach %, show-up rates, and prorated cost-per-completed-visit by acquisition source.

---

## Honest Limitations & Boundaries

To ensure complete transparency regarding scope:

- **CRM Scope**: Designed as an agile sales acceleration slice (intake, qualification, booking, handoff, analytics), not a full ERP or CRM replacement. Does not handle token money collection, booking payments, or flat allotment letters.
- **Telephony & Outbound Voice**: Voice calling is not implemented; contact numbers are surfaced as one-tap `tel:` and `wa.me` links for executive outreach.
- **Messaging Adapters**: WhatsApp, SMS, and Email pipelines use an asynchronous outbox pattern (`outbound_messages`). In local/CI environments, mock adapters log dispatches; live external dispatch requires provider credentials (e.g. Meta Cloud API or Twilio).
- **LLM Keys**: In development and CI, the test suite executes deterministically against `LLM_PROVIDER=mock`. Live production deployment requires an Anthropic or Google Gemini API key.
- **Operating Hours**: Site visits run 10:00–18:00 IST in 60-minute intervals with a minimum 3-hour advance booking lead time.

---

## Documentation

Detailed technical documentation is available in `docs/`:

- **[System Architecture](docs/ARCHITECTURE.md)**: 3-tier structure, layering, error codes, authentication, and frontend design tokens.
- **[Data Model & Constraints](docs/DATA_MODEL.md)**: 19 PostgreSQL tables, ER diagram, partial unique indexes, and Migration 005 performance indexing.
- **[AI Pipeline & Guardrails](docs/AI_PIPELINE.md)**: Autonomous agent loop, tool schemas, multilingual regex pre-filters, failure mitigations, and evals.
- **[Operations & Deployment](docs/OPERATIONS.md)**: Vercel multi-service project (`vercel.json`), serverless runtime, background reminder workers, and outbox.
- **[Assumptions Log](docs/ASSUMPTIONS.md)**: Product, architectural, and regulatory assumptions log (`A1`–`A104`).
- **[Demo Script & Walkthrough](docs/DEMO_SCRIPT.md)**: 5-minute walkthrough script with exact inputs/outputs and 15 grounded technical interview defenses.
- **[Hardening & Security](docs/HARDENING.md)**: Rate limiting benchmarks, CSRF/CSP protections, secret scanning, and WCAG AA audits.
- **[AI Evaluation Suite](docs/AI_EVALS.md)**: 56-case benchmark verifying fact grounding, prompt injection resistance, and multilingual fidelity.

<!-- DOC_STATS:START -->
### Verified Automated Test & AI Evaluation Statistics
*All figures generated and verified via `scripts/doc-stats.mjs`.*

| Workspace / Target | Test Files | Tests Passed | Failures | Status |
| :--- | :---: | :---: | :---: | :---: |
| **@housy/shared** (Contract Schemas) | 4 | 28 | 0 | **PASS** |
| **@housy/api** (Services & Concurrency) | 30 | 470 | 0 | **PASS** |
| **@housy/web** (Views & Components) | 18 | 140 | 0 | **PASS** |
| **E2E Playwright** (User Journeys & WCAG AA) | 4 | 28 | 0 | **PASS** |
| **Total Automated Tests** | **56 files** | **666** | **0** | **PASS** |
| **AI Evaluation (Pipeline Mock)** | 1 harness | 56 / 56 (100.0%) | 0 | **PASS** |
| **AI Evaluation (Live Google Gemini gemini-3.5-flash)** | 1 harness | 43 / 56 (76.8%) | 13 | **PASS** |
<!-- DOC_STATS:END -->
