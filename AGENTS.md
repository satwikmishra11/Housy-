# Engineering Rules & Guidelines for Agents and Contributors

This codebase adheres to strict engineering rules. Every contributor and agent working in this repository must comply with these guidelines without exception.

---

## 1. Commit Discipline
- Use **Conventional Commits** format for all commits:
  - `feat: <description>` for new capabilities/features
  - `fix: <description>` for bug fixes
  - `test: <description>` for adding or updating tests
  - `docs: <description>` for documentation updates
  - `chore: <description>` for tooling, config, dependencies, or maintenance
- Make **several small, focused commits** rather than one massive commit.
- Each commit should be atomic, build cleanly, and pass all checks.

---

## 2. Code Quality & Modularity
- **Small Functions**: Keep functions focused, cohesive, and small (single responsibility). Break complex operations into well-named helper functions.
- **Strict TypeScript Everywhere**:
  - `noImplicitAny: true`, `strict: true` across all packages and apps.
  - **Never use `any`**. Use explicit types, generics, `unknown` with type guards, or Zod-inferred types (`z.infer<typeof schema>`).
- **No Secrets in Code**:
  - Never commit passwords, tokens, API keys, or credentials.
  - Manage all configuration via environment variables validated with Zod schemas at startup (`apps/api/src/config/`).
  - Keep `.env.example` in each application with safe placeholder values.

---

## 3. Data Integrity & Boundaries
- **Zod Validation at Every Boundary**:
  - Validate all incoming HTTP request bodies, params, and queries with Zod schemas in route handlers.
  - Validate all environment variables at application startup.
  - Use shared schemas from `@housy/shared` for consistency across web and api.
- **Timestamps**:
  - **Storage**: All timestamps must be stored in UTC (`TIMESTAMPTZ` in PostgreSQL, ISO 8601 strings in JSON / APIs).
  - **Presentation**: All timestamps presented to the user must be formatted in the `Asia/Kolkata` time zone (IST, UTC+05:30).
- **Assumptions Tracking**:
  - Never invent facts silently.
  - Any product, data, or technical assumption must be recorded in `docs/ASSUMPTIONS.md` as `A<n>: ...`.

---

## 4. Architectural Boundaries (3-Tier Architecture)
In `apps/api`:
- **Routes (`src/routes/`)**:
  - Only responsible for parsing/validating incoming requests (using Zod) and delegating to services.
  - Must not contain business logic or database queries directly.
  - Return HTTP response status codes and serialized payloads.
- **Services (`src/services/`)**:
  - Hold all business logic, orchestration, and domain rules.
  - Throw typed domain error classes on failures.
- **Repositories (`src/repositories/`)**:
  - Hold all database interactions (`pg`).
  - **Parameterized queries ONLY**. Never interpolate strings or concatenate user input into SQL queries.
- **Specialized Folders**:
  - `src/llm/`: Interfaces and adapters for LLM integrations, chat assistance, and prompt engineering.
  - `src/jobs/`: Background job processors, slot cleanup, reminders, and scheduled routines.
  - `src/channels/`: Channel adapters (WhatsApp, SMS, Email) backed by an outbox pattern.
  - `src/errors/`: Shared typed error classes mapped to HTTP status codes (`AppError`, `NotFoundError`, `ValidationError`, `ConflictError`, `DatabaseError`, etc.) and centralized error handling middleware.

---

## 5. Frontend Rules (`apps/web`)
- **React 18 + Vite + TypeScript + Tailwind CSS + React Router + TanStack Query**.
- **Every list screen or data-fetching view MUST explicitly handle three states**:
  1. **Loading state**: Skeleton loader or spinner during data fetch.
  2. **Empty state**: Clear, actionable message when no records are present.
  3. **Error state**: User-friendly error message with a retry mechanism.
- Clean, minimal, and premium aesthetic adhering to the client brief: restrained palette, clear typography, and intentional spacing.

---

## 6. Verification and Acceptance
Before completing any task:
1. Run `npm run lint` — must report 0 errors.
2. Run `npm run typecheck` — must report 0 errors across all workspaces.
3. Run `npm test` — all unit and integration tests must pass.
4. Update `docs/ARCHITECTURE.md` with any additions or modifications.
5. Provide an explicit acceptance checklist marking each requirement PASS/FAIL with evidence.
