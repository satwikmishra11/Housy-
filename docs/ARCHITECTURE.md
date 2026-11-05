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
- **Connection Management**: Connection pooling via `pg.Pool` with connection timeouts and graceful shutdown hooks (`SIGINT`/`SIGTERM`).
- **Migrations**: Managed via `node-pg-migrate` in `apps/api/migrations/`.

---

## 9. Time Zone Standard
- **Storage**: All database timestamps are persisted as UTC (`TIMESTAMPTZ` in PostgreSQL, ISO 8601 strings in JSON / APIs).
- **Presentation**: All timestamps presented to the user are formatted in the `Asia/Kolkata` time zone (IST, UTC+05:30) using `apps/web/src/lib/date.ts`.

---

## 10. Design Tokens & Styling (`apps/web`)
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

## 11. Component Catalog (`apps/web/src/components/`)
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

## 12. Application Shell Layouts (`apps/web/src/layouts/`)
- **`BuyerLayout`**: Single centered column (`max-w-2xl`), mobile-first design, clean top bar with language switcher, and regulatory footer displaying RERA registration (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) and DPDP Act 2023 privacy consent notice.
- **`StaffLayout`**: Desktop persistent sidebar with company identity, role badges (`Sales Head (Admin)` vs `Sales Executive`), navigation links (`Leads`, `Visits`, `Fact Sheet`, `Analytics`, `Design System`), and mobile responsive top bar with drawer navigation.

---

## 13. Internationalization (i18n) (`apps/web/src/i18n/`)
- Configured via `react-i18next` with three language bundles:
  - English (`en`): default
  - Hindi (`hi`): हिन्दी
  - Gujarati (`gu`): ગુજરાતી
- Covers all buyer-facing strings, greeting messages, project details, legal statements, and slot booking interactions.
- Selected language is persisted in `localStorage`.

---

## 14. Styleguide Route (`/styleguide`)
- Route accessible at `/styleguide` showcasing every design system token, atomic primitive, domain component, and state (default, active, loading, disabled, error) in both Staff and Buyer layouts.
