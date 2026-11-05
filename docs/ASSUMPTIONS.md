# Assumptions Log

This document records all architectural and product assumptions made during the design and development of the system. Any newly introduced assumptions must be appended here sequentially as `A<n>: ...`.

- **A1**: Project 1 / Project 2 names are kept from the brief. Locations, amenities, possession dates, RERA numbers, map coordinates and ad spend per source are invented demo data, not client facts.
- **A2**: A site visit lasts 60 minutes, one buyer per executive per slot, visits run 10:00-18:00 IST.
- **A3**: "Visit" in cost-per-visit and lead-to-visit means a completed visit; booked visits are reported separately.
- **A4**: The sales head is an admin role that is also an executive.
- **A5**: WhatsApp, SMS and email are mocked through an outbox table behind a channel adapter.
- **A6**: Buyers have no password; they get a session at chat start and a signed magic link to manage a visit.
- **A7**: Monthly spend of Rs 30 lakh is split across sources by an admin-editable table.
- **A8**: The health check endpoint `GET /api/health` queries PostgreSQL with `SELECT 1` to verify database connectivity and returns HTTP 200 with status `ok` or HTTP 503 with status `degraded`/`error` if the database is unreachable.
- **A9**: API server defaults to port 3001 in development, and the web Vite dev server runs on port 5173 with proxy configured to route `/api/*` requests to the API server.
- **A10**: The serif font family chosen for headings is Cormorant Garamond, self-hosted via `@fontsource/cormorant-garamond`, paired with `@fontsource/inter`, `@fontsource/noto-sans-devanagari`, and `@fontsource/noto-sans-gujarati`.
- **A11**: The `/styleguide` route is accessible in development and preview environments to showcase all design system tokens, states, layouts, and components.
- **A12**: Buyer-facing i18n namespace covers English (`en`), Hindi (`hi`), and Gujarati (`gu`) with default language initialized to English and stored in localStorage.
- **A13**: Fictional developer staff (Sales Head Harshil Mehta, 5 executives) and RERA numbers (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126` and `PR/GJ/AHMEDABAD/AUDA/RAA05678/011126`) are demo placeholders for Ahmedabad.
- **A14**: All fact entries (pricing ranges ₹65L–₹85L for 2 BHK, ₹95L–₹1.2Cr for 3 BHK, possession Dec 2026/Mar 2027, amenities, bank loan approvals, and parking specifications) are simulated data for evaluation and testing.
- **A15**: Seed script generates deterministic pseudo-random sequences using a linear congruential generator (LCG) with a fixed seed to guarantee idempotent database resets.
- **A16**: Hardik Patel's visit (LD-58210) was booked for 2026-11-01 11:00 IST (in the past relative to current date 2026-11-05), and is recorded in `visit_bookings` with status `'confirmed'` and flagged as awaiting outcome.


