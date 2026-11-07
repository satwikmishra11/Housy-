# Security Policy and Architecture

## 1. Overview and Security Objectives
Housy is an enterprise-grade AI-assisted real estate advisory and sales enablement platform developed for residential property developers in India. Handling prospective homebuyer data and enterprise sales intelligence requires strict adherence to security best practices and compliance with India's **Digital Personal Data Protection (DPDP) Act, 2023**.

This document outlines the security architecture, threat model, active security controls, and vulnerability disclosure procedures.

---

## 2. Threat Model and Active Controls

### 2.1 Cross-Origin Resource Sharing (CORS)
- **Origin Allowlist**: Origin access is strictly checked against an explicit allowlist specified via the `CORS_ORIGIN` environment variable.
- **Wildcard Policy**: Blanket allowances for `*.vercel.app` and `vercel.live` are strictly disallowed. Wildcard preview deployments are only permitted when `ALLOW_PREVIEW_ORIGINS=true` is explicitly enabled in preview environments.
- **Credentials Enforcement**: Requests carrying credentials (`credentials: 'include'`) from disallowed or unauthorized origins are rejected with HTTP 403 Forbidden.

### 2.2 Cross-Site Request Forgery (CSRF)
- **Cookie-Authenticated Mutating Requests**: Every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) carrying authentication cookies (`staff_token`) MUST supply custom headers (`X-Requested-With: XMLHttpRequest` or `X-CSRF-Token`).
- **Exemptions**: Unauthenticated requests are only exempted if they hit exact public paths (`/api/auth/login`, `/api/chat/*`, `/api/visits/manage/*`) or have their API key cryptographically verified beforehand (`/api/internal/*`, `/api/ingest/*`).
- **Elimination of Path-Based Bypass**: Blanket exemptions matching substrings like `/book` or the mere unverified presence of header names have been eliminated.

### 2.3 HTTP Security Headers and CSP
- **Content Security Policy (CSP)**:
  - `script-src 'self'`: No `'unsafe-inline'` in script tags.
  - `connect-src 'self' <allowed-origins>`: Tightened to trusted API origins only.
  - `object-src 'none'`: Prevents legacy plugin exploitation.
  - `frame-ancestors 'none'`: Completely blocks clickjacking and framing attacks.
- **Referrer-Policy**: Set to `strict-origin-when-cross-origin`.
- **Permissions-Policy**: Restricted to `camera=(), microphone=(), geolocation=()`.
- **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains` enforced in production.
- **Header Mirroring**: Headers are duplicated across Express Helmet middleware and static edge routing in `apps/web/vercel.json`.

### 2.4 Authentication, RBAC & Brute-Force Lockout
- **Password Storage**: Passwords are saved as one-way salted hashes using **Argon2id**.
- **Brute-Force Defense**: Failed login attempts are tracked per `account:IP`. Five consecutive failed attempts trigger an automatic 15-minute account lockout.
- **Session Tokens**: Staff tokens are short-lived signed JWTs (HS256) stored in `httpOnly`, `sameSite=lax`, and `secure` cookies. Token expiry (`exp`) is strictly verified with zero clock skew tolerance.
- **Dynamic Role Verification**: Sensitive administrative operations (`sales_head`) re-query the PostgreSQL database at request time (`SELECT role, active FROM users WHERE id = $1`) to immediately invalidate stale tokens if a user account is deactivated or role demoted.
- **Safe Logout**: `POST /api/auth/logout` explicitly clears the `staff_token` cookie with matching scope and domain options.

### 2.5 Chat Abuse Protection & LLM Guardrails
- **Session Throttling**: Chat session initialization (`POST /api/chat/start`) is limited to 10 sessions per hour per IP.
- **Payload Limits**: Inbound buyer messages are capped at 1,000 characters via strict Zod validation. Express body parsing is limited to `100kb`.
- **Prompt Token Flooding Defense**: The agent loop truncates message history, sending at most the last 20 conversation turns to LLM prompts.
- **Conversation Budget**: A per-conversation LLM call budget (30 calls) prevents runaway token usage and denial-of-wallet attacks, triggering a graceful handoff to a sales executive when exhausted.

### 2.6 Data Privacy, Retention & DPDP Act 2023 Compliance
- **PII Log Redaction**: Pino loggers redact phone numbers, emails, passwords, auth tokens, and message contents (`req.body.message`, `*.message`, `content`).
- **Data Minimization**: Inbound chats begin anonymously without recording PII in the `leads` table until explicit buyer conversion triggers occur.
- **Retention Job**: Automated background jobs run periodic data retention routines, anonymizing chat sessions and conversation content older than 90 days.
- **Right to Erasure & Audit Trail**: DPDP deletion and opt-out requests (`DELETE /api/leads/:id`, `POST /api/leads/:id/opt-out`) permanently remove buyer records and record an audit log in the `audit_log` table.

### 2.7 Test Database Isolation
- **Environment Invariant**: All test execution requires `TEST_DATABASE_URL` (or test fallback) pointing to a PostgreSQL database whose name strictly ends in `_test`.
- **Failsafe**: Application configuration fails startup immediately if `NODE_ENV === 'test'` and the database does not end in `_test`, ensuring test suites never touch development or production data.

---

## 3. CI/CD Security Controls
The GitHub Actions workflow (`.github/workflows/ci.yml`) enforces the following gates on every pull request and push to `main`:
1. **Secret Scanning**: Both `gitleaks/gitleaks-action` and custom script `scripts/scan-secrets.mjs` scan git history and working trees for leaked credentials.
2. **High/Critical Dependency Audit**: `npm audit --audit-level=high` runs during CI validation and fails the build if high or critical vulnerabilities exist.
3. **Database Test Isolation**: Tests run in an isolated `housy_test` database container.

---

## 4. Vulnerability Disclosure & Reporting
If you discover a security vulnerability or weakness within this codebase, please do NOT file a public GitHub issue.

Please report vulnerabilities privately:
- **Email**: security@developer.company.internal
- **PGP Key**: Available upon request
- **Response SLA**: The security team acknowledges incoming vulnerability reports within 24 hours and aims to release remediations within 7 business days.
