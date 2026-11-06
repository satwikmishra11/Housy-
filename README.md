# Housy — AI Sales & Site-Visit Booking Platform

[![CI](https://github.com/satwikmishra11/Housy-/actions/workflows/ci.yml/badge.svg)](https://github.com/satwikmishra11/Housy-/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)]()
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%202023%20%7C%20RERA%20Gujarat-emerald.svg)]()

> Production-quality full-stack AI residence advisor and site-visit scheduling engine designed specifically for luxury real estate developers in Ahmedabad, Gujarat.

---

## Overview

Housy automates high-intent lead qualification, multilingual conversational inquiry handling, and conflict-free site-visit booking across multi-channel buyer touchpoints (Property Portals, Social Media Ads, Websites, and Hoardings).

### Core Capabilities
1. **Multilingual AI Residence Advisor**: Answers buyer queries in English, Hindi, and Gujarati, strictly grounded in authoritative project fact sheets with zero hallucination.
2. **Deterministic Pre-Filters & Guardrails**: Automatically catches price/discount haggling, human agent requests, and opt-out keywords (`STOP`) without calling LLM endpoints.
3. **Idempotent Real-Time Slot Booking**: Guarantees zero double-booking under high concurrency using PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` and database constraints.
4. **DPDP Act 2023 Compliance**: Enforces explicit opt-in consent before booking or dispatching communications; immediate opt-out halting for automated reminders.
5. **Executive & Sales Head Portals**: Full-featured workspaces for unified lead triage, handoff acceptance, audit-logged fact sheet editing, and executive conversion analytics.

---

## Architecture & Monorepo Structure

```
Housy-/
├── packages/
│   └── shared/                 # Shared domain types, Zod schemas, utilities & formatting
├── apps/
│   ├── api/                    # Node.js + Express 3-tier API backend (PostgreSQL, Pino, Argon2id)
│   └── web/                    # React 18 + Vite + Tailwind CSS + TanStack Query frontend
├── e2e/                        # Playwright end-to-end user journeys & axe-core accessibility
├── docs/                       # Architectural specifications, hardening reports, assumptions
└── scripts/                    # Automation utilities (dev launcher, secret scanners)
```

---

## Quickstart

### Prerequisites
- Node.js 20+ (managed via NVM)
- PostgreSQL 16+ (or Docker)

### Setup & Run Locally
```bash
# 1. Install dependencies
npm ci

# 2. Build shared workspace
npm run build --workspace=@housy/shared

# 3. Configure environment
cp apps/api/.env.example apps/api/.env

# 4. Migrate and seed deterministic database
npm run db:migrate
npm run db:seed

# 5. Start development servers (API on 3001, Web on 5173)
npm run dev
```

---

## Testing & Quality Assurance

Housy enforces strict automated verification across unit, integration, end-to-end, and accessibility layers:

```bash
# Run unit & integration test suites
npm test

# Run Playwright E2E user journeys & Axe accessibility audits
npm run test:e2e

# Run linter & strict typecheck
npm run lint
npm run typecheck

# Run secret scanning
npm run scan:secrets
```

### End-to-End User Journeys (`e2e/housy-e2e.spec.ts`)
1. **Buyer AI Chat Journey**: Multilingual inquiry in Hindi, DPDP contact collection, slot selection, and confirmation card with map pin link.
2. **Sales Executive Workflow**: Staff authentication, attribution source tag verification, handoff transcript review, and visit attendance outcome tracking.
3. **Sales Head Fact Management & Analytics**: Fact editing, version recording, assistant preview synchronization, and executive conversion dashboard review.
4. **Concurrency Defense**: Isolated browser contexts booking the same last slot; first confirms, second receives "just taken" notice with nearest alternatives.
5. **DPDP 2023 Opt-Out**: Immediate communication revocation on `STOP`, ensuring pre-visit reminders are cleanly skipped.
6. **Axe-Core Audits**: Automated WCAG 2.1 AA accessibility checks across Buyer Chat, Staff Login, and Sales Analytics pages.

---

## Regulatory Compliance
- **Digital Personal Data Protection (DPDP) Act 2023**: Granular consent recording, affirmative purpose notices, and `canContact` enforcement.
- **Real Estate (Regulation and Development) Act (RERA)**: Registered Gujarat AUDA numbers embedded in headers, calendar `.ics` files, and message outbox templates.
