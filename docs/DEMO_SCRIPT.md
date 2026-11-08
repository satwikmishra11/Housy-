# Housy Platform Walkthrough & Technical Interview Defense Guide

This document provides a concise **5-minute live demonstration script** showcasing Company A's core buyer and executive journeys, followed by **15 hard architectural interview questions** with concise technical answers directly grounded in the codebase.

---

## Part 1: The 5-Minute Live Walkthrough Script

This script walks through an end-to-end prospective home buyer and executive workflow in **8 chronological steps**, using authentic demo credentials and realistic multilingual inputs in Ahmedabad, Gujarat.

### Demonstration Prerequisites
- **Web UI**: [http://localhost:5173](http://localhost:5173) (or live production URL [https://housy-ebon.vercel.app/](https://housy-ebon.vercel.app/))
- **Demo Seed State**: Populated via `npm run db:reset` or `npm run db:test:reset` (PRNG `seed = 42`)
- **Demo Credentials**:
  - **Sales Head (Admin)**: `harshil.mehta@example.com` / `DemoPass123!`
  - **Sales Executive**: `amit.shah@example.com` / `DemoPass123!`

---

### Step 1: Multilingual Buyer Onboarding & Language Selection (Hindi)
- **Actor**: Prospective Home Buyer (Anonymous)
- **Target URL**: `/` or `/chat?src=social` (simulating incoming Meta/Instagram ad click with attribution)
- **Action**:
  1. Open `/chat?src=social`.
  2. Click the language selector in the top-right header and select **`हिन्दी` (Hindi)**.
  3. Enter the initial greeting in the chat composer:
     ```text
     नमस्ते, मुझे 3 BHK फ्लैट्स के बारे में जानकारी चाहिए
     ```
- **Exact Expected Result**:
  - Script-first language analyzer (`detectLanguage`) identifies Devanagari script, setting `conversations.detected_language = 'hi'`.
  - Assistant greets the buyer in natural, polite Hindi:
    > "नमस्ते! Aaranya Realty के The Palm Serene (SG Highway) में आपका स्वागत है। हमारे यहाँ लग्जरी 3 BHK अपार्टमेंट्स उपलब्ध हैं। क्या आप कारपेट एरिया, कीमत या क्लब हाउस सुविधाओं के बारे में जानना चाहते हैं?"
  - Renders dynamic quick-reply recommendation chips translated via client i18n locale (`buyer.quickReplies`):
    - `[3 BHK की कीमत?]`
    - `[सुविधाएं क्या हैं?]`
    - `[साइट विजिट बुक करें]`
  - An anonymous chat session is created in `chat_sessions` (`housy_chat_conversation_id`), strictly respecting DPDP data minimization without generating phantom unconsented leads.

---

### Step 2: Grounded Fact-Sheet Price-Range Answer
- **Actor**: Prospective Home Buyer
- **Action**: Click the `[3 BHK की कीमत?]` quick chip or type:
  ```text
  3 BHK की कीमत और साइज क्या है?
  ```
- **Exact Expected Result**:
  - LLM triggers tool `send_reply` with `answer_type: 'fact'` citing authoritative fact IDs (`p1_3bhk_pricing`, `p1_3bhk_carpet`).
  - Server-side guardrails (`verifyPostChecks` and `detectNumberCategoryAt`) match numeric claims against cited fact values:
    - Carpet Area: `1,450 sq.ft`
    - Indicative Pricing: `₹95 Lakh – ₹1.2 Crore`
  - Assistant answers with zero hallucination:
    > "The Palm Serene में 3 BHK लग्जरी यूनिट का कारपेट एरिया 1,450 sq.ft है। इसकी शुरुआती कीमत ₹95 लाख से ₹1.2 करोड़ के बीच है (अंतिम मूल्य चयनित फ्लोर और ओरिएंटेशन पर निर्भर करता है)।"
  - Mandatory Gujarat RERA registration number (`PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`) remains visible in the chat context.

---

### Step 3: Discount Request & Negotiation Interception
- **Actor**: Prospective Home Buyer
- **Action**: Buyer attempts to negotiate a cash discount:
  ```text
  थोड़ा डिस्काउंट मिलेगा क्या? 90 लाख में फाइनल करो, आज ही टोकन देता हूँ
  ```
- **Exact Expected Result**:
  - Deterministic pre-filter regex in `detectIntent(message, 'hi')` catches negotiation keywords (`डिस्काउंट`, `फाइनल करो`, `टोकन`) with sub-millisecond execution prior to token generation.
  - Returns standardized developer pricing policy without consuming LLM tokens:
    > "कीमतें सांकेतिक हैं और डेवलपर की अनुमोदित मूल्य सूची के अनुसार हैं। अंतिम दरों या विशेष प्रस्तावों पर चर्चा केवल हमारे वरिष्ठ बिक्री सलाहकार के साथ व्यक्तिगत बैठक या साइट विजिट के दौरान ही संभव है। क्या आप एक निजी साइट विजिट बुक करना चाहेंगे?"
  - Database updates:
    - `conversations.is_flagged = true`
    - `conversations.flag_reason = 'price_ask'`
    - Inserts a new handoff in `handoffs` with `priority = 'normal'`, `status = 'new'`, routing to executive queue.

---

### Step 4: Missing Project Fact & Safe Fallback Reassurance
- **Actor**: Prospective Home Buyer
- **Action**: Buyer asks an ungrounded or out-of-scope question:
  ```text
  क्या जनवरी में स्विमिंग पूल का पानी गर्म रहता है और उसका तापमान क्या होगा?
  ```
- **Exact Expected Result**:
  - The model queries `fact_entries`; no active entry defines January heated water temperatures.
  - The agent invokes safe fallback handling rather than fabricating an answer:
    > "हमारी टीम का एक सदस्य शीघ्र ही आपसे इस बारे में पुष्टि करेगा। इस बीच, क्या आप साइट विजिट बुक करना चाहेंगे या किसी सलाहकार से बात करना चाहेंगे?"
  - Backend actions:
    - Persists the exact buyer question into `unanswered_questions` table for Sales Head review.
    - Escalates existing handoff priority to `high` (`handoff_events` audit row appended).

---

### Step 5: Frictionless Site-Visit Booking & Real-Time Availability
- **Actor**: Prospective Home Buyer
- **Action**:
  1. Click `[साइट विजिट बुक करें]` or type `"हाँ, मुझे साइट विजिट बुक करनी है"`.
  2. Because the buyer is currently anonymous, the chat presents the contact capture prompt (`ui_action: collect_contact`).
  3. Enter buyer details:
     - **Name**: `राहुल शर्मा`
     - **Phone**: `9876543210`
     - **DPDP Consent**: Check the affirmative consent checkbox (*"I agree to receive site visit updates via WhatsApp/SMS per DPDP Act 2023"*).
     - Click **`पुष्टि करें और स्लॉट चुनें` (Confirm & Pick Slot)**.
  4. Select tomorrow's `11:00 AM – 12:00 PM` slot chip (enforcing the minimum 3-hour lead time from `NOW()`).
- **Exact Expected Result**:
  - Lead record lazily materialized in `leads` table with `consent_status = 'granted'`, `dpdp_consent = true`, and linked to `chat_sessions`.
  - Atomic booking executes `SELECT ... FOR UPDATE SKIP LOCKED` on `visit_slots`, safely committing `visit_bookings` under partial unique index `uq_visit_bookings_slot`.
  - Chat displays `BookingConfirmationCard`:
    - Project Brand: **The Palm Serene** (SG Highway, Ahmedabad)
    - Host Executive: **Amit Shah** (`+91 90000 00002`)
    - Scheduled Time: Tomorrow `11:00 AM IST` (`Asia/Kolkata`)
    - One-click actions: Interactive Google Maps Pin, `.ics` calendar download, and self-service cancellation/reschedule link (`/visit/:token`).

---

### Step 6: Outbound Outbox & Scheduled Reminders Inspection
- **Actor**: Reviewer / Sales Head
- **Target URL**: `/outbox` (or inspect `outbound_messages` and `visit_reminders` tables)
- **Action**:
  1. Log in as Sales Head (`harshil.mehta@example.com` / `DemoPass123!`).
  2. Navigate to `/outbox`.
- **Exact Expected Result**:
  - Immediate transactional WhatsApp confirmation message queued in `outbound_messages`:
    - Recipient: `+919876543210`
    - Template: `visit_confirmation`
    - Body includes: Project display name ("The Palm Serene"), host executive ("Amit Shah"), Google Maps location pin, and statutory RERA number `PR/GJ/AHMEDABAD/AUDA/RAA01234/011126`.
  - Two reminder rows created in `visit_reminders`:
    - `reminder_24h`: Status `pending` (or `skipped` if booking is $< 24$h away).
    - `reminder_2h`: Status `pending` (scheduled for 2 hours before 11:00 AM IST).
  - Demonstrates DPDP compliance: If Rahul replies `"STOP"` or cancels via `/visit/:token`, `opted_out_at` updates to `NOW()` and all pending reminders immediately transition to `cancelled`.

---

### Step 7: Sales Executive Workspace & Live Human Takeover
- **Actor**: Sales Executive (`amit.shah@example.com`)
- **Target URL**: `/today` and `/handoffs`
- **Action**:
  1. Log in as Amit Shah (`amit.shah@example.com` / `DemoPass123!`).
  2. Open `/today`: Rahul Sharma's booking appears in the top queue under "Today's Schedule & Handoffs".
  3. Open `/handoffs`: Open Rahul Sharma's card.
  4. Review the AI Consultation Summary:
     - Configuration: 3 BHK
     - Budget: ₹95L – ₹1.2Cr
     - Flags: `price_ask` (asked for ₹90L token deal), `unanswered_question` (pool temperature).
  5. Click **"Accept & Take Over Chat"**.
  6. Type an executive response into the takeover composer:
     ```text
     नमस्ते राहुल जी, मैं अमित शाह बोल रहा हूँ। आपका साइट विजिट कल सुबह 11:00 बजे कन्फर्म है। मैं खुद आपको 3 BHK का सैंपल फ्लैट दिखाऊंगा और स्पेशल पेमेंट प्लान पर चर्चा करेंगे।
     ```
- **Exact Expected Result**:
  - `conversations.status` transitions from `'assistant'` to `'human'`.
  - AI autonomous answering is immediately paused.
  - In the Buyer Chat interface (polling every 5 seconds while in human status), the message appears instantly with a distinctive **"Sales team"** badge and executive name **"Amit"**.
  - Executive retains one-click control to `"Hand back to assistant"` when consultation finishes.

---

### Step 8: Sales Analytics Cockpit & Cohort Impact
- **Actor**: Sales Head (`harshil.mehta@example.com`)
- **Target URL**: `/dashboard`
- **Action**:
  1. Navigate to `/dashboard`.
  2. Switch the Cohort Filter from `All Leads` to `Before Go-Live Baseline (< 2026-10-15)` and then to `After Go-Live AI-Assisted (>= 2026-10-15)`.
- **Exact Expected Result**:
  - **Before Go-Live Baseline**:
    - Median First Response Time: **~14 hours (944 min)**.
    - Leads Unreached in 48 Hours: **35.6%** (high lead drop-off / ad spend waste).
    - Lead-to-Visit Conversion: **6.0%**.
    - Show-Up Rate: Unrecorded / manual tracking.
  - **After Go-Live AI-Assisted**:
    - Median First Response Time: **2m 5s** (99% reduction, beating the 5-minute SLA target).
    - Leads Unreached in 48 Hours: **2.1%** (down from 35.6%, beating the 5% target).
    - Lead-to-Visit Conversion: **7.8%** (progressing toward 8–10% target).
    - Show-Up Rate: **80.0%** (systematic outcome recording).
    - Attributed Cost per Completed Visit: Clearly displayed by source with sample threshold badges (`isSmallSample: true` for $n < 5$).
  - A persistent visual label denotes: `"Simulated demo data"` (A81).

---

## Part 2: 15 Hard Technical Interview Questions & Grounded Answers

### 1. Booking Concurrency & Double-Booking Prevention
**Q: How does Housy mathematically prevent concurrent buyers from double-booking the same sales executive at the same time?**  
**A:**  
Collision prevention is enforced across two complementary database layers:
1. **Pessimistic Row-Level Locking (`visit.repository.ts:312`)**: When booking, the transaction executes:
   ```sql
   SELECT id, status FROM visit_slots 
   WHERE id = $1 AND status = 'open' 
   FOR UPDATE SKIP LOCKED;
   ```
   If a competing transaction has locked the slot, concurrent callers skip or wait and find 0 rows returned, immediately throwing `SlotUnavailableError` (`SLOT_UNAVAILABLE`, HTTP 409).
2. **PostgreSQL Partial Unique Index (`migrations/002_slots_and_visits.sql:24`)**:
   ```sql
   CREATE UNIQUE INDEX uq_visit_bookings_slot ON visit_bookings(slot_id) 
   WHERE status = 'confirmed';
   ```
   Even under network retries or connection resets, the database physically rejects a second active booking for the same slot. Verified in `apps/api/tests/visit-booking.test.ts` where 20 parallel requests via `Promise.all` yield exactly 1 success and 19 `SlotUnavailableError` exceptions.

---

### 2. Guardrail Pre-Filters vs LLM Execution
**Q: Why doesn't Housy stream LLM tokens directly to the buyer using Server-Sent Events (SSE)?**  
**A:**  
Under RERA and the DPDP Act 2023, real estate developers face statutory liabilities for ungrounded claims, unauthorized discount promises, or hallucinated possession timelines. Streaming tokens to a web socket can display a fabricated price (e.g. ₹70L instead of ₹95L) before a post-check filter can intervene.  
Instead, Housy implements **validate-before-display**:
1. **Sub-millisecond Pre-Filters (`apps/api/src/llm/intent-lexicon.ts`)**: Word-order resilient regexes evaluate price negotiations, cancellations, and opt-outs in < 2ms, returning deterministic policy responses with zero token expenditure.
2. **Post-Generation Validation (`apps/api/src/llm/guardrails.ts`)**: The complete tool payload is validated against active fact IDs, contextual units, and numeral boundaries before serializing HTTP response JSON.

---

### 3. Contextual Numeric & Indic Numeral Grounding
**Q: How does the system prevent numeral cross-clause hallucination (e.g., claiming a 795 sq.ft carpet area as ₹795 Lakhs, or confusing Gujarati/Devanagari digits)?**  
**A:**  
Implemented in `detectNumberCategoryAt()` and `normalizeIndicDigits()` inside `apps/api/src/llm/guardrails.ts`:
1. Devanagari (`०-९`) and Gujarati (`૦-૯`) numerals are converted to Hindu-Arabic digits while preserving character positions.
2. Every number token in candidate replies is categorized directionally into `bhk`, `currency`, `area`, `floor`, `percentage`, `distance_time`, or `possession_launch` based on surrounding lexical context (e.g., `sq.ft`, `लाख`, `crore`, `માળ`).
3. The validator requires that the **exact numeric value AND its matching contextual category** exist within the **same cited fact sheet entry**. A fact mentioning `795 sq ft` carpet area will reject an answer asserting `₹795 Lakh` price with `grounding_failed`.

---

### 4. Secondary Reply Verifier (`VERIFY_REPLIES=true`)
**Q: What is the independent verifier, when does it run, and what is its measured production latency impact?**  
**A:**  
Defined in `apps/api/src/llm/verifier.ts` (`verifyReplyClaims`):
- When enabled in production (`VERIFY_REPLIES=true`), any assistant response containing factual assertions is submitted to a secondary fast LLM verification prompt alongside the exact text of cited facts.
- It returns `{ supported: boolean, unsupportedClaims: string[] }`. If unsupported claims exist, the response is replaced with the safe team reassurance template and escalated to an executive handoff.
- Purely conversational greetings and clarifying questions are exempt.
- **Latency impact**: Measured at an average of **+650ms overhead** (+32–35%) on grounded turns, while pre-filtered queries execute in < 5ms (recorded in `docs/AI_TRANSCRIPTS.md`).

---

### 5. DPDP Act 2023 Consent & Opt-Out Halting
**Q: How does Housy enforce the Digital Personal Data Protection Act 2023 when a user requests to stop receiving communications?**  
**A:**  
Governed by `packages/shared/src/can-contact.ts` and `apps/api/src/services/chat.service.ts`:
1. `canContact(lead, channel)` returns `false` if `consent_status !== 'granted'` or if `opted_out_at !== null`.
2. When a buyer says `"STOP"`, `"unsubscribe"`, or `"મને કોઈ મેસેજ ન મોકલો"`, `detectIntent()` categorizes the message as `opt_out`.
3. The handler executes `handleOptOut()`:
   - Sets `leads.opted_out_at = NOW()`.
   - Inserts a revocation audit row into `consents`.
   - Atomically updates all `pending` visit reminders in `visit_reminders` to `cancelled`.
   - Excludes opted-out leads from the 48-hour response SLA denominator (`notContactableCount`) so compliance does not penalize staff metrics.

---

### 6. Anonymous Sessions & Lazy Lead Creation
**Q: Why doesn't starting a chat immediately create a lead record in the `leads` table?**  
**A:**  
Per DPDP data minimization principles (Assumption **A78**):
- Anonymous browsers visiting the website or clicking ads must not generate phantom leads containing empty or synthetic personal data.
- Chat begins by creating a row in `chat_sessions` with a secure random session token.
- A lead record in `leads` is **lazily materialized or linked** only when explicit conversion events occur:
  1. The buyer provides their mobile number and checks the DPDP affirmative consent box.
  2. The buyer requests a site visit booking.
  3. The buyer asks for human executive escalation.
  4. The buyer exchanges $\ge 2$ substantive project enquiries.

---

### 7. Lead Ingestion & Deduplication Pipeline
**Q: How does the lead ingestion hub detect and resolve duplicate leads originating from external property portals and social ads?**  
**A:**  
Located in `apps/api/src/services/lead.service.ts`:
1. Inbound webhooks authenticate via SHA-256 hashed source keys in the `X-Source-Key` header against `source_api_keys`.
2. **Idempotency Check**: Exact match on `(source, external_id)` in `lead_touchpoints` returns `{ outcome: 'idempotent' }` without creating duplicate records.
3. **Exact Matching**: Normalizes phone numbers to E.164 (`+91...`) and emails to lowercased trims; matching records link as new touchpoints on the existing lead.
4. **Fuzzy Matching**: PostgreSQL trigram similarity (`pg_trgm`) checks buyer names (`similarity(name, $1) > 0.6`). If matched, the incoming lead is ingested with `possible_duplicate_of = existingLeadId`, displaying a "Duplicate Suspect" badge and offering a 1-click atomic merge transaction (`mergeLeadsTransaction`).

---

### 8. First Response SLA Semantics
**Q: How is Median First Response Time calculated, and why are greetings and non-consented leads handled differently?**  
**A:**  
Defined in `apps/api/src/services/dashboard.service.ts` (Assumption **A79**):
- **Web Chat**: Clock starts from the buyer's first inbound query (`conversations.buyer_first_message_at`) to the first substantive assistant answer (`first_response_at`). The initial automated greeting message has `is_greeting = true` and is strictly excluded from the clock.
- **Ingested External Leads**: Clock measures from intake timestamp (`first_touch_at`) to the first outbound message dispatched (`first_response_kind = 'outbound_message'`).
- **DPDP Non-Contactable Leads**: Leads with withdrawn consent or opt-outs cannot legally receive outbound communications. They are excluded from the 48-hour response SLA denominator and tracked separately under `notContactableCount`.

---

### 9. Show-Up Rate & Cost-Per-Visit Statistical Integrity
**Q: What are the exact mathematical formulas for Show-Up Rate and Cost Per Completed Visit, and how does the UI prevent misleading metrics?**  
**A:**  
Implemented in `apps/api/src/services/dashboard.service.ts`:
- **Show-Up Rate**:
  $$\text{Show-Up Rate} = \frac{\text{Completed Site Visits}}{\text{Completed Visits} + \text{No-Show Visits}}$$
  If denominator is 0, returns `null` rendered safely as `"—"` (em dash) to avoid `NaN%`.
- **Cost Per Completed Visit**:
  $$\text{Cost Per Visit} = \frac{\text{Allocated Marketing Source Spend}}{\text{Completed Site Visits}}$$
- **Sample Integrity Threshold**: If completed visits $< 5$, the metric returns `isSmallSample: true`, causing the UI to render a "Small Sample" warning badge rather than asserting statistically unsubstantiated unit economics (Assumption **A82**).

---

### 10. Deterministic Cohort Demarcation
**Q: How are the Before and After Go-Live cohorts generated, and what is the exact boundary?**  
**A:**  
Configured in `apps/api/src/db/seed.ts` via Linear Congruential Generator PRNG (`seed = 42`) and Assumption **A81**:
- Cutoff Date: `GO_LIVE_DATE = '2026-10-15T00:00:00Z'`.
- **Before Cohort (`< 2026-10-15`)**: Simulates Ahmedabad developer baseline operations with manual spreadsheet logging: median first response ~14 hours, 35.6% leads unreached >48h, 6% visit conversion rate.
- **After Cohort (`>= 2026-10-15`)**: Reflects autonomous AI advisory performance: 2m 5s median response time, 2.1% unreached leads, 7.8% visit rate, 80% show-up rate.
- Seed data runs deterministically across all environments, ensuring identical, verifiable test metrics.

---

### 11. Serverless Background Job Execution
**Q: How do recurring tasks (2-hour pre-visit alerts, 28-day slot top-up, 15-minute handoff escalations) run reliably in serverless environments like Vercel?**  
**A:**  
In serverless functions, in-memory Node daemon loops (`setInterval`) freeze when requests complete (Assumption **A86**):
1. Background processing is consolidated into a single unified HTTPS endpoint: `POST /api/internal/run-jobs`.
2. Authenticated exclusively via constant-time token comparison (`crypto.timingSafeEqual`) on the `X-Internal-Key` header, rejecting query parameter tokens to keep credentials out of server logs.
3. An external HTTPS cron scheduler ([cron-job.org](https://cron-job.org)) invokes this endpoint every 5 minutes.
4. Every job run logs audit telemetry into the `job_runs` table (`job`, `started_at`, `finished_at`, `counts`, `ok`). The `/health` endpoint inspects `job_runs` and turns degraded if reminder workers have not reported in > 10 minutes.

---

### 12. Executive Routing & Handoff Priority Escalation
**Q: How does Housy assign leads to sales executives, and how are unanswered handoffs escalated?**  
**A:**  
Managed in `apps/api/src/services/handoff.service.ts`:
1. **Routing Preference (A73)**:
   - Priority 1: The executive hosting an existing confirmed site-visit slot for the lead.
   - Priority 2: An active executive speaking the lead's preferred language (`users.languages @> ARRAY[leadLang]`).
   - Tie-Breaker: The executive with the fewest open assigned leads (`leads.status NOT IN ('visited', 'lost')`).
2. **Escalation Routine (A74)**:
   - When background jobs execute `escalateStaleHandoffs()`, any handoff in `status = 'new'` older than 15 minutes is escalated: `priority = 'urgent'`, `is_escalated = true`.
   - Dispatches an internal notification bell alert to the Sales Head with direct drawer link.

---

### 13. Single Tracked Bundle Discipline
**Q: Why does `apps/api` track a single CommonJS bundle (`apps/api/index.js`), and how is source code drift prevented?**  
**A:**  
Per Assumption **A60** and Vercel Multi-Service topology (`vercel.json`):
1. In Vercel's multi-service architecture with framework preset `"express"`, Vercel resolves the root entrypoint at `apps/api/index.js`.
2. A single compiled CommonJS bundle eliminates runtime TypeScript compilation overhead (`tsx`) and cold-start latency in serverless containers.
3. Duplicate legacy bundles (`app.js`, `server.js`) have been deleted and gitignored.
4. **CI Enforcement**: GitHub Actions CI executes:
   ```bash
   npm run build:api && git diff --exit-code apps/api/index.js
   ```
   If any contributor modifies TypeScript backend files without rebuilding the committed bundle, CI fails immediately.

---

### 14. Test Database Safety Invariant
**Q: How does the codebase ensure that running test suites will never accidentally wipe or modify the development or demo database?**  
**A:**  
Implemented in `apps/api/tests/global-setup.ts` and `apps/api/src/config/index.ts` (Assumption **A97**):
1. Under `NODE_ENV === 'test'`, application configuration enforces `TEST_DATABASE_URL` (defaulting to `postgres://.../housy_test`).
2. The config validator executes a strict safety check:
   ```typescript
   if (process.env.NODE_ENV === 'test') {
     const dbName = extractDatabaseName(config.DATABASE_URL);
     if (!dbName.endsWith('_test')) {
       throw new FatalError(`Test database name must end in '_test'. Target was '${dbName}'.`);
     }
   }
   ```
3. Before executing any test suites, Vitest's `globalSetup` inspects `housy_test`. If empty, it migrates and seeds automatically, guaranteeing isolated, fail-fast test execution.

---

### 15. Real Core Slice vs Simulated Demo Data
**Q: What parts of Housy represent production-ready engineering versus simulated demo data or mocks?**  
**A:**  
- **Real Production Code**:
  - Full PostgreSQL ACID transactional engine with row locks (`SKIP LOCKED`) and partial unique indexes.
  - Express 3-tier REST architecture with typed domain errors and strict Zod boundary validation.
  - React 18 SPA with Tailwind CSS, Lucide icons, TanStack Query, and react-i18next trilingual synchronization.
  - Multi-provider LLM adapters for Google Gemini and Anthropic Claude with tool use schemas and model family rollover.
  - Regex pre-filter lexicons, Indic numeral normalizers, token boundary matching, and independent verifiers.
  - WCAG 2.1 AA accessibility compliance across mobile (375px), tablet (768px), and desktop (1280px) viewports.
  - Monorepo test suite comprising 643 automated tests across 53 files.
- **Simulated Demo Data & Mocks**:
  - Real estate projects ("The Palm Serene", "Skyline Greens") and fact sheets are demo property descriptions anchored to Ahmedabad market standards.
  - Synthetic buyer leads and historical cohorts generated deterministically via PRNG (`seed = 42`).
  - Outbound WhatsApp, SMS, and Email dispatches are stored and verified via the database outbox pattern (`outbound_messages`), with channel adapters ready for live API keys (Meta Cloud API, Twilio).

---
*Authored by Satwik Mishra — Full Stack & AI Systems Engineer*
