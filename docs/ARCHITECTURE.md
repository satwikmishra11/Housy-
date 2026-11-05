# Architecture Overview

## 1. Overview
Housy is a production-quality full-stack TypeScript platform built for Company A (Ahmedabad). The platform provides lead intake, duplicate detection, an AI-powered conversational sales assistant, site-visit slot booking with calendar conflicts prevention, executive handoff, and an executive analytics dashboard.

---

## 2. Monorepo Layout
The repository is structured as an npm workspaces monorepo:

```
Housy-/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI running lint, typecheck, tests with Postgres
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
│   │   │   ├── app.ts           # Express application setup and middleware
│   │   │   └── server.ts        # Server entrypoint and graceful shutdown
│   │   ├── tests/               # Vitest + supertest integration & unit tests
│   │   ├── .env.example
│   │   └── package.json
│   └── web/                     # React 18 + Vite + Tailwind CSS frontend
│       ├── src/
│       │   ├── components/      # UI components (State views: Loading, Empty, Error)
│       │   ├── lib/             # API client, date formatters (Asia/Kolkata), QueryClient
│       │   ├── pages/           # Page routes (HealthStatus, etc.)
│       │   ├── App.tsx          # Router and QueryClientProvider
│       │   └── main.tsx         # React root
│       ├── tests/               # Vitest component tests
│       ├── .env.example
│       └── package.json
├── packages/
│   └── shared/                  # Common TypeScript types and Zod schemas
│       ├── src/
│       │   ├── errors.ts        # Common error interfaces
│       │   ├── health.ts        # Health check schema and types
│       │   └── index.ts         # Main package exports
│       ├── tests/
│       └── package.json
├── docs/
│   ├── ARCHITECTURE.md          # System architecture and technical documentation
│   ├── ASSUMPTIONS.md           # Product and technical assumptions log
│   └── BRIEF.md                 # Verbatim client brief
├── docker-compose.yml           # PostgreSQL 16 container definition
├── package.json                 # Monorepo root workspaces and scripts
└── AGENTS.md                    # Contributor rules and guidelines
```

---

## 3. Layering & Design Principles
- **Route Layer**: Validates incoming payloads (body, query, params) via Zod schemas and calls the corresponding service method. Does not contain business logic or raw SQL.
- **Service Layer**: Implements domain business logic, state machines, transactions, and throws typed `AppError` subclasses.
- **Repository Layer**: Executes parameterized SQL queries using `pg.Pool`. Prevents SQL injection and encapsulates database schema knowledge.
- **Shared Package (`@housy/shared`)**: Single source of truth for contract types and validation schemas shared across the frontend and backend.
- **Strict TypeScript**: Configured with `strict: true` and `noImplicitAny: true`. Zero `any` policy.

---

## 4. Database & Persistence
- **Engine**: PostgreSQL 16
- **Migrations**: Managed via `node-pg-migrate`.
- **Querying**: Native `pg` client with parameterized queries.

---

## 5. Time Zone Standard
- All database timestamps are persisted as UTC `TIMESTAMPTZ`.
- All user-facing displays format timestamps into `Asia/Kolkata` (IST) using ISO 8601 strings and Intl/date-fns formatters.
