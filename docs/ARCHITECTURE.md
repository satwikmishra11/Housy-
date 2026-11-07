# System Architecture & Technical Overview

Housy is a production-quality full-stack TypeScript platform built for Company A (Ahmedabad). The platform unifies inbound lead intake, automated deduplication, an AI-powered conversational sales assistant, site-visit booking with calendar conflict prevention, executive handoff, and an executive analytics dashboard.

- **Live Application**: [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/)
- **GitHub Repository**: [https://github.com/satwikmishra11/Housy-](https://github.com/satwikmishra11/Housy-)
- **Technical Design Document (TDD)**: [`docs/TDD.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/TDD.md) (Exported PDF: [`docs/TDD.pdf`](file:///Users/satwik/Documents/GitHub/Housy-/docs/TDD.pdf))

---

## Architecture Documentation Map

To keep documentation modular, maintainable, and cohesive, technical specifications are split into focused guides:

| Document | Scope & Contents |
|---|---|
| **[`docs/ARCHITECTURE.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/ARCHITECTURE.md)** (This document) | System overview, monorepo workspaces, 3-tier layering, error hierarchy, authentication, RBAC, frontend design system, and testing strategy. |
| **[`docs/DATA_MODEL.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/DATA_MODEL.md)** | PostgreSQL relational schema, 19 entity catalog, ER diagram, constraints, zero double-booking indexes, and Migration 005 performance indexes. |
| **[`docs/AI_PIPELINE.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/AI_PIPELINE.md)** | AI chat assistant architecture, LLM provider adapters, `detectIntent` pre-filters, script-first language detection, numeral normalization, token-boundary grounding, verifier, failure modes, and evals. |
| **[`docs/OPERATIONS.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/OPERATIONS.md)** | Production topology, Vercel multi-service project (`vercel.json`), background reminder workers, channel outbox, DPDP 2023 opt-out & re-consent, and observability. |
| **[`docs/ASSUMPTIONS.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/ASSUMPTIONS.md)** | Complete product, legal, technical, and operational assumptions log (`A1`–`A76`). |
| **[`docs/HARDENING.md`](file:///Users/satwik/Documents/GitHub/Housy-/docs/HARDENING.md)** | Security audits, rate limit enforcement, automated secret scanning, and WCAG AA accessibility verification. |

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
- **`StaffLayout`**: Desktop persistent sidebar with developer branding, active role badge, navigation links (`Leads`, `Visits`, `Fact Sheet`, `Analytics`, `Handoffs`), authenticated user profile, and responsive drawer navigation on mobile viewports.

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
