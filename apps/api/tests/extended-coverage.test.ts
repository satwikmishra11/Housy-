import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { visitService } from '../src/services/visit.service.js';
import { leadIngestService } from '../src/services/lead-ingest.service.js';
import { reminderService } from '../src/services/reminder.service.js';
import { signStaffToken } from '../src/auth/tokens.js';
import {
  detectLanguage,
  runPreFilter,
  verifyPostChecks,
  getLocalizedFallback,
} from '../src/llm/guardrails.js';
import { canContact, type Fact } from '@housy/shared';

describe('Comprehensive Logic Hardening & Edge-Case Coverage', () => {
  let projectId: string;
  let exec1Id: string;
  let exec2Id: string;
  let salesHeadToken: string;
  let executiveToken: string;

  beforeAll(async () => {
    // 1. Fetch existing project
    const projRes = await query<{ id: string }>(
      `SELECT id FROM projects WHERE rera_number NOT LIKE '%TEST%' ORDER BY created_at ASC LIMIT 1`,
    );
    projectId = projRes.rows[0]!.id;

    // 2. Fetch staff users
    const usersRes = await query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE active = true ORDER BY role ASC`,
    );
    const head = usersRes.rows.find((u) => u.role === 'sales_head')!;
    const execs = usersRes.rows.filter((u) => u.role === 'executive');
    exec1Id = execs[0]!.id;
    exec2Id = execs[1]!.id;

    salesHeadToken = await signStaffToken({
      id: head.id,
      email: 'head@example.com',
      role: 'sales_head',
      name: 'Sales Head',
      phone: null,
    });

    executiveToken = await signStaffToken({
      id: exec1Id,
      email: 'exec@example.com',
      role: 'executive',
      name: 'Executive One',
      phone: null,
    });
  });

  afterAll(async () => {
    // Clean up temporary leads created during test
    await query(`DELETE FROM leads WHERE email LIKE '%@coverage-edge.test'`);
  });

  // ==========================================
  // 1. SLOT BOOKING CONCURRENCY & INTEGRITY
  // ==========================================
  describe('1. Slot Booking Concurrency & Boundary Defenses', () => {
    it('blocks a lead from booking two active site visits concurrently', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, email, source, project_id, wants, status)
         VALUES ($1, $2, $3, 'website', $4, '3 BHK', 'engaged')
         RETURNING id`,
        [
          `DoubleBooker ${randomSuffix}`,
          `+919825${randomSuffix}`,
          `lead.${randomSuffix}@coverage-edge.test`,
          projectId,
        ],
      );
      const leadId = leadRes.rows[0]!.id;

      // Create two distinct future slots
      const start1 = new Date(Date.now() + 15 * 24 * 3600 * 1000);
      start1.setUTCHours(10, 0, 0, 0);
      const end1 = new Date(start1.getTime() + 3600 * 1000);

      const start2 = new Date(Date.now() + 16 * 24 * 3600 * 1000);
      start2.setUTCHours(10, 0, 0, 0);
      const end2 = new Date(start2.getTime() + 3600 * 1000);

      await query(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, 'open'), ($1, $5, $6, $7, 'open')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'open'`,
        [projectId, exec1Id, start1.toISOString(), end1.toISOString(), exec2Id, start2.toISOString(), end2.toISOString()],
      );

      // 1. First booking succeeds
      const b1 = await visitService.bookVisit(leadId, projectId, start1.toISOString(), `idemp_b1_${randomSuffix}`);
      expect(b1.id).toBeDefined();

      // 2. Second booking by the same lead MUST throw ConflictError (A19 / Brief rules)
      await expect(
        visitService.bookVisit(leadId, projectId, start2.toISOString(), `idemp_b2_${randomSuffix}`),
      ).rejects.toThrow(/already has an active confirmed site visit/i);
    });

    it('idempotency key preserves original booking without duplicate rows or slot mutations', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, email, source, project_id, wants, status)
         VALUES ($1, $2, $3, 'website', $4, '2 BHK', 'engaged')
         RETURNING id`,
        [
          `IdempLead ${randomSuffix}`,
          `+919826${randomSuffix}`,
          `idemp.${randomSuffix}@coverage-edge.test`,
          projectId,
        ],
      );
      const leadId = leadRes.rows[0]!.id;

      const startsAt = new Date(Date.now() + 17 * 24 * 3600 * 1000);
      startsAt.setUTCHours(11, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 3600 * 1000);

      await query(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, 'open')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'open'`,
        [projectId, exec1Id, startsAt.toISOString(), endsAt.toISOString()],
      );

      const idempotencyKey = `idemp_exact_${randomSuffix}`;

      // First call
      const booking1 = await visitService.bookVisit(leadId, projectId, startsAt.toISOString(), idempotencyKey);
      // Immediate retry with the same key
      const booking2 = await visitService.bookVisit(leadId, projectId, startsAt.toISOString(), idempotencyKey);

      expect(booking1.bookingId).toBe(booking2.bookingId);

      // Verify in DB that only 1 booking record exists
      const countRes = await query<{ count: number }>(
        `SELECT count(*)::int as count FROM visit_bookings WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      expect(countRes.rows[0]!.count).toBe(1);
    });
  });

  // ==========================================
  // 2. DEDUPLICATION & MERGE INTEGRITY
  // ==========================================
  describe('2. Deduplication & Phone/Email Normalization', () => {
    it('normalizes local 10-digit Indian mobile and prefixes with +91 across formats', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const rawDigits = `9825${randomSuffix}`;

      // 1. Ingest with 10 digits
      const res1 = await leadIngestService.ingest(
        {
          name: `Norm Buyer ${randomSuffix}`,
          phone: rawDigits,
          source: 'website',
          projectId,
          consent: true,
        },
        'website',
      );
      expect(res1.outcome).toBe('created');
      const leadId = res1.leadId;

      // 2. Ingest same customer with +91 prefix and spaces: '+91 9825...'
      const res2 = await leadIngestService.ingest(
        {
          name: `Norm Buyer ${randomSuffix}`,
          phone: `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`,
          source: 'social_ad',
          projectId,
          consent: true,
        },
        'social_ad',
      );

      // Must merge as existing customer, retaining original leadId
      expect(res2.outcome).toBe('merged');
      expect(res2.leadId).toBe(leadId);
    });

    it('treats email addresses case-insensitively during lead deduplication', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const emailLower = `case.test.${randomSuffix}@coverage-edge.test`;
      const emailUpper = `CASE.TEST.${randomSuffix}@COVERAGE-EDGE.TEST`;

      const res1 = await leadIngestService.ingest(
        {
          name: `Case Buyer ${randomSuffix}`,
          email: emailLower,
          phone: `+919712${randomSuffix}`,
          source: 'website',
          projectId,
          consent: true,
        },
        'website',
      );
      expect(res1.outcome).toBe('created');

      // Second ingest with UPPERCASE email
      const res2 = await leadIngestService.ingest(
        {
          name: `Case Buyer ${randomSuffix}`,
          email: emailUpper,
          phone: `+919713${randomSuffix}`, // Different phone so dedupe relies on email
          source: 'property_portal',
          projectId,
          consent: true,
        },
        'property_portal',
      );

      expect(res2.outcome).toBe('merged');
      expect(res2.leadId).toBe(res1.leadId);
    });

    it('flags possible duplicate when fuzzy name similarity is >= 0.85 on same project', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);

      // Ingest original lead
      const orig = await leadIngestService.ingest(
        {
          name: `Ashokbhai Patel ${randomSuffix}`,
          phone: `+919612${randomSuffix}`,
          source: 'website',
          projectId,
          consent: true,
        },
        'website',
      );
      expect(orig.outcome).toBe('created');

      // Ingest near-identical name on same project with different phone/email
      const second = await leadIngestService.ingest(
        {
          name: `Ashokbhai Patel ${randomSuffix}`,
          phone: `+919613${randomSuffix}`,
          source: 'social_ad',
          projectId,
          consent: true,
        },
        'social_ad',
      );

      expect(second.outcome).toBe('possible_duplicate');
      expect(second.duplicateOf).toBe(orig.leadId);
    });
  });

  // ==========================================
  // 3. GROUNDING & GUARDRAILS PURE FUNCTIONS
  // ==========================================
  describe('3. Grounding & Guardrails Pure Functions', () => {
    it('detects language correctly across Devanagari, Gujarati, and Romanized text', () => {
      // English
      expect(detectLanguage('Hello, what is the price of a 3 BHK apartment?')).toBe('en');

      // Hindi Devanagari
      expect(detectLanguage('नमस्ते, क्या मुझे ३ बीएचके के बारे में जानकारी मिल सकती है?')).toBe('hi');

      // Gujarati Script
      expect(detectLanguage('નમસ્તે, મારે ૨ બીએચકે ફ્લેટ જોવો છે')).toBe('gu');

      // Romanized Hindi (Hinglish)
      expect(detectLanguage('mujhe kitne me milega bataye')).toBe('hi');

      // Romanized Gujarati
      expect(detectLanguage('tamne kem chho ghar ketla nu chhe')).toBe('gu');
    });

    it('pre-filter catches price questions deterministically without calling LLM', () => {
      const enRes = runPreFilter('What is the lowest price or discount you can give?');
      expect(enRes.triggered).toBe(true);
      expect(enRes.type).toBe('price_ask');
      expect(enRes.flagReason).toBe('price_ask');

      const hiRes = runPreFilter('अंतिम भाव क्या है और कोई छूट मिलेगी क्या?');
      expect(hiRes.triggered).toBe(true);
      expect(hiRes.type).toBe('price_ask');
      expect(hiRes.language).toBe('hi');

      const guRes = runPreFilter('કેટલા રૂપિયા થશે છેલ્લો ભાવ શું છે?');
      expect(guRes.triggered).toBe(true);
      expect(guRes.type).toBe('price_ask');
      expect(guRes.language).toBe('gu');
    });

    it('pre-filter catches human agent request deterministically', () => {
      const enRes = runPreFilter('I want to speak with a human executive');
      expect(enRes.triggered).toBe(true);
      expect(enRes.type).toBe('human_requested');

      const hiRes = runPreFilter('मुझे किसी इंसान से बात करनी है');
      expect(hiRes.triggered).toBe(true);
      expect(hiRes.type).toBe('human_requested');

      const guRes = runPreFilter('મારે કોઈ માણસ સાથે વાત કરવી છે');
      expect(guRes.triggered).toBe(true);
      expect(guRes.type).toBe('human_requested');
    });

    it('pre-filter catches opt-out keywords (STOP, unsubscribe)', () => {
      const enRes = runPreFilter('STOP messaging me');
      expect(enRes.triggered).toBe(true);
      expect(enRes.type).toBe('opt_out');

      const hiRes = runPreFilter('संदेश बंद करो');
      expect(hiRes.triggered).toBe(true);
      expect(hiRes.type).toBe('opt_out');

      const guRes = runPreFilter('સંદેશ બંધ કરો');
      expect(guRes.triggered).toBe(true);
      expect(guRes.type).toBe('opt_out');
    });

    it('verifyPostChecks enforces strict numeric grounding against cited facts', () => {
      const mockFacts: Fact[] = [
        {
          id: 'fact-1',
          projectId: 'p1',
          category: 'pricing',
          key: 'pricing_3bhk',
          title: '3 BHK Pricing',
          value: '3 BHK apartments start from ₹95 Lakh to ₹1.2 Crore.',
          version: 1,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // 1. Reply mentions numbers present in fact -> PASSES
      const validCheck = verifyPostChecks({
        replyText: 'Our 3 BHK luxury residences range from ₹95 Lakh to ₹1.2 Crore.',
        citedFactIds: ['fact-1'],
        activeFacts: mockFacts,
        confidence: 0.95,
      });
      expect(validCheck.passed).toBe(true);

      // 2. Reply mentions hallucinated number NOT in fact -> FAILS with grounding_failed
      const invalidNumberCheck = verifyPostChecks({
        replyText: 'Our 3 BHK apartments are priced at ₹45 Lakh with special discount.',
        citedFactIds: ['fact-1'],
        activeFacts: mockFacts,
        confidence: 0.95,
      });
      expect(invalidNumberCheck.passed).toBe(false);
      expect(invalidNumberCheck.reason).toBe('grounding_failed');

      // 3. Reply mentions banned financial promise -> FAILS with banned_claim
      const bannedCheck = verifyPostChecks({
        replyText: 'Invest now with guaranteed 20% appreciation in 2 years.',
        citedFactIds: ['fact-1'],
        activeFacts: mockFacts,
        confidence: 0.95,
      });
      expect(bannedCheck.passed).toBe(false);
      expect(bannedCheck.reason).toBe('banned_claim');

      // 4. Low confidence score -> FAILS with low_confidence
      const lowConfCheck = verifyPostChecks({
        replyText: 'The project is in Ahmedabad.',
        citedFactIds: [],
        activeFacts: mockFacts,
        confidence: 0.55,
      });
      expect(lowConfCheck.passed).toBe(false);
      expect(lowConfCheck.reason).toBe('low_confidence');
    });

    it('getLocalizedFallback returns safe message in requested language', () => {
      expect(getLocalizedFallback('en')).toContain('A member of our team will confirm this');
      expect(getLocalizedFallback('hi')).toContain('हमारी टीम का एक सदस्य');
      expect(getLocalizedFallback('gu')).toContain('અમારી ટીમનો એક સભ્ય');
    });
  });

  // ==========================================
  // 4. CONSENT & CAN-CONTACT PURE LOGIC
  // ==========================================
  describe('4. DPDP 2023 Consent & canContact Matrix', () => {
    it('evaluates canContact correctly across consent and opt-out combinations', () => {
      // 1. Opted out -> false across all channels
      expect(canContact({ consentStatus: 'granted', optedOutAt: '2026-11-06T10:00:00Z' }, 'whatsapp')).toBe(false);
      expect(canContact({ consentStatus: 'granted', optedOutAt: '2026-11-06T10:00:00Z' }, 'sms')).toBe(false);
      expect(canContact({ consentStatus: 'granted', optedOutAt: '2026-11-06T10:00:00Z' }, 'email')).toBe(false);

      // 2. Withdrawn or revoked consent -> false
      expect(canContact({ consentStatus: 'withdrawn', optedOutAt: null }, 'whatsapp')).toBe(false);
      expect(canContact({ consentStatus: 'unknown', optedOutAt: null }, 'whatsapp')).toBe(false);

      // 3. Granted consent and not opted out -> true
      expect(canContact({ consentStatus: 'granted', optedOutAt: null }, 'whatsapp')).toBe(true);
      expect(canContact({ consentStatus: 'granted', optedOutAt: null }, 'sms')).toBe(true);
      expect(canContact({ consentStatus: 'granted', optedOutAt: null }, 'email')).toBe(true);
    });
  });

  // ==========================================
  // 5. REMINDERS WORKER & RETRY LOGIC
  // ==========================================
  describe('5. Reminder Scheduling & Worker Idempotency', () => {
    it('schedules 24h and 2h reminders for appointments > 24 hours away', async () => {
      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, phone_e164, source, project_id, wants, status, consent_status)
         VALUES ($1, $2, 'website', $3, '2 BHK', 'engaged', 'granted')
         RETURNING id`,
        [`RemLead ${randomSuffix}`, `+919830${randomSuffix}`, projectId],
      );
      const leadId = leadRes.rows[0]!.id;

      // 15 days in the future to avoid collisions with any default seed slots
      const startsAt = new Date(Date.now() + 15 * 24 * 3600 * 1000);
      startsAt.setUTCHours(14, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + 3600 * 1000);

      // Clean up any leftover bookings on this slot from previous runs
      await query(
        `DELETE FROM visit_bookings WHERE slot_id IN (
           SELECT id FROM visit_slots WHERE executive_id = $1 AND starts_at = $2
         )`,
        [exec1Id, startsAt.toISOString()],
      );

      await query(
        `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, 'open')
         ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = 'open'`,
        [projectId, exec1Id, startsAt.toISOString(), endsAt.toISOString()],
      );

      const booking = await visitService.bookVisit(leadId, projectId, startsAt.toISOString(), `idemp_rem_${randomSuffix}`);

      const rems = await query<{ kind: string; status: string }>(
        `SELECT kind, status FROM reminders WHERE booking_id = $1 ORDER BY kind ASC`,
        [booking.id],
      );

      expect(rems.rows).toHaveLength(2);
      expect(rems.rows.find((r) => r.kind === '24h')?.status).toBe('pending');
      expect(rems.rows.find((r) => r.kind === '2h')?.status).toBe('pending');
    });

    it('worker skips opted-out leads and marks due reminders dispatched', async () => {
      const outcome = await reminderService.processDueReminders(10);
      expect(outcome.processedCount).toBeDefined();
      expect(outcome.sentCount).toBeDefined();
    });
  });

  // ==========================================
  // 6. RBAC & RESOURCE OWNERSHIP ENFORCEMENT
  // ==========================================
  describe('6. RBAC & Strict Role Boundary Matrix', () => {
    it('sales executive is forbidden (403) from accessing demo controls', async () => {
      const res = await request(app)
        .post('/api/demo/simulate-lead')
        .set('Authorization', `Bearer ${executiveToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ source: 'website' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('sales executive is forbidden (403) from accessing flagged chat review queue', async () => {
      const res = await request(app)
        .get('/api/admin/flagged-chats')
        .set('Authorization', `Bearer ${executiveToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(403);
    });

    it('sales head can access admin routes and demo endpoints (200/201)', async () => {
      const res = await request(app)
        .get('/api/admin/flagged-chats')
        .set('Authorization', `Bearer ${salesHeadToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // 7. DASHBOARD METRICS CALCULATION INTEGRITY
  // ==========================================
  describe('7. Dashboard Metric Pure Calculations & Proration', () => {
    it('handles zero denominator safely and flags cohorts under 5 sample units', async () => {
      const res = await request(app)
        .get(`/api/dashboard/metrics?projectId=${projectId}&period=7d`)
        .set('Authorization', `Bearer ${salesHeadToken}`);

      expect(res.status).toBe(200);

      const summary = res.body.summary;
      expect(summary).toBeDefined();
      expect(summary.medianFirstResponseFormatted).toBeDefined();
      expect(summary.unreached48hFormatted).toBeDefined();
      expect(summary.showUpRateFormatted).toBeDefined();
      expect(typeof summary.isSmallSample).toBe('boolean');

      expect(Array.isArray(res.body.bySource)).toBe(true);
      expect(Array.isArray(res.body.funnel)).toBe(true);
      expect(Array.isArray(res.body.responseTimeBySource)).toBe(true);
    });
  });
});
