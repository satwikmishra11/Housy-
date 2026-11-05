import crypto from 'node:crypto';
import { pool, query } from './index.js';
import { logger } from '../utils/logger.js';
import { hashPassword } from '../auth/password.js';

// Deterministic PRNG using Linear Congruential Generator (LCG)
class LcgPrng {
  private s: number;
  constructor(seed = 123456789) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
  choice<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }
  boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

export async function runSeed(): Promise<void> {
  const prng = new LcgPrng(42);
  const now = new Date('2026-11-05T15:40:00+05:30'); // Anchor timestamp for deterministic test runs

  logger.info('Starting deterministic database reset and seed...');

  // 1. Truncate all tables and restart sequence
  await query(`
    TRUNCATE TABLE
      unanswered_questions,
      source_api_keys,
      llm_calls,
      audit_log,
      ad_spend,
      outbound_messages,
      reminders,
      handoffs,
      visit_bookings,
      visit_slots,
      blackout_dates,
      availability_rules,
      messages,
      conversations,
      consents,
      lead_touchpoints,
      leads,
      fact_entry_versions,
      fact_entries,
      projects,
      users
    RESTART IDENTITY CASCADE;
  `);

  await query(`ALTER SEQUENCE lead_public_id_seq RESTART WITH 58210;`);
  logger.info('Database truncated and sequences reset successfully.');

  // 2. Users (1 Sales Head + 5 Executives)
  // Seed demo accounts with documented demo password, hashed with Argon2id
  const DEMO_PASSWORD = process.env['DEMO_SEED_PASSWORD'] || 'DemoPass123!';
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userRows = [
    { name: 'Harshil Mehta', email: 'harshil.mehta@example.com', role: 'sales_head', phone: '+919000000001' },
    { name: 'Amit Shah', email: 'amit.shah@example.com', role: 'executive', phone: '+919000000002' },
    { name: 'Priya Patel', email: 'priya.patel@example.com', role: 'executive', phone: '+919000000003' },
    { name: 'Rohan Desai', email: 'rohan.desai@example.com', role: 'executive', phone: '+919000000004' },
    { name: 'Sneha Trivedi', email: 'sneha.trivedi@example.com', role: 'executive', phone: '+919000000005' },
    { name: 'Darshan Dave', email: 'darshan.dave@example.com', role: 'executive', phone: '+919000000006' },
  ];

  const userMap = new Map<string, string>();
  for (const u of userRows) {
    const res = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, phone, active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [u.name, u.email, passwordHash, u.role, u.phone],
    );
    userMap.set(u.email, res.rows[0]!.id);
  }
  const salesHeadId = userMap.get('harshil.mehta@example.com')!;
  const executiveIds = Array.from(userMap.entries())
    .filter(([email]) => email !== 'harshil.mehta@example.com')
    .map(([, id]) => id);

  logger.info(`Inserted 6 users (1 Sales Head, 5 Executives).`);

  // 3. Projects (Project 1 and Project 2)
  const project1Res = await query<{ id: string }>(
    `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      'Project 1',
      'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126 (DEMO-PLACEHOLDER)',
      'SG Highway, Near Iscon Cross Road, Ahmedabad, Gujarat 380054',
      23.0298534,
      72.5073841,
      ['2 BHK', '3 BHK'],
    ],
  );
  const p1Id = project1Res.rows[0]!.id;

  const project2Res = await query<{ id: string }>(
    `INSERT INTO projects (name, rera_number, address, lat, lng, bhk_types)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      'Project 2',
      'PR/GJ/AHMEDABAD/AUDA/RAA05678/011126 (DEMO-PLACEHOLDER)',
      'Science City Road, Sola, Ahmedabad, Gujarat 380060',
      23.0805128,
      72.5186214,
      ['2 BHK', '3 BHK'],
    ],
  );
  const p2Id = project2Res.rows[0]!.id;

  logger.info(`Inserted 2 projects.`);

  // 4. Fact Entries (~25 per project)
  interface FactData {
    key: string;
    title: string;
    value: string;
    category: string;
  }

  const generateFacts = (_projName: string, isP1: boolean): FactData[] => [
    { key: 'price_2bhk', title: '2 BHK Price Range', value: '₹65 Lakh to ₹85 Lakh (exact price depends on floor and view, no discounts quoted by AI)', category: 'pricing' },
    { key: 'price_3bhk', title: '3 BHK Price Range', value: '₹95 Lakh to ₹1.2 Crore (ranges only, final quotation by executive)', category: 'pricing' },
    { key: 'maintenance_deposit', title: 'Maintenance Charges', value: '₹3.50 per sq.ft per month, payable quarterly after handover', category: 'pricing' },
    { key: 'payment_plan', title: 'Payment Milestones', value: '10% on booking, 80% construction-linked across slab completions, 10% on possession', category: 'pricing' },
    { key: 'config_2bhk', title: '2 BHK Dimensions', value: isP1 ? '795 sq.ft carpet area, 2 master bedrooms, 2 bathrooms, utility balcony' : '825 sq.ft carpet area, 2 bedrooms with study corner, 2 balconies', category: 'configuration' },
    { key: 'config_3bhk', title: '3 BHK Dimensions', value: isP1 ? '1,180 sq.ft carpet area, 3 bedrooms, 3 bathrooms, spacious foyer and puja room' : '1,240 sq.ft carpet area, 3 bedrooms with wrap-around balcony', category: 'configuration' },
    { key: 'ceiling_height', title: 'Clear Ceiling Height', value: '10.2 feet clear floor-to-ceiling height in all living areas', category: 'configuration' },
    { key: 'possession_date', title: 'Possession Date', value: isP1 ? 'December 2026 as registered under AUDA RERA guidelines' : 'March 2027 as registered under AUDA RERA guidelines', category: 'possession' },
    { key: 'construction_status', title: 'Current Construction Stage', value: isP1 ? '12th floor slab casting in progress, civil structure on schedule' : '8th floor RCC work completed, brick masonry underway', category: 'possession' },
    { key: 'rera_compliance', title: 'RERA Registration', value: isP1 ? 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126 registered with Gujarat RERA' : 'PR/GJ/AHMEDABAD/AUDA/RAA05678/011126 registered with Gujarat RERA', category: 'legal' },
    { key: 'clubhouse', title: 'Clubhouse Facilities', value: '12,500 sq.ft state-of-the-art clubhouse with indoor games, banquet hall, and cafe', category: 'amenities' },
    { key: 'swimming_pool', title: 'Swimming Pool', value: 'Olympic-length temperature-regulated lap pool with dedicated toddler splash area', category: 'amenities' },
    { key: 'gym_fitness', title: 'Gymnasium & Wellness', value: 'Fully equipped Technogym fitness center, yoga studio, and steam room', category: 'amenities' },
    { key: 'sports_courts', title: 'Sports Facilities', value: 'Full-size indoor badminton court, squash court, and synthetic jogging track', category: 'amenities' },
    { key: 'green_spaces', title: 'Landscaped Gardens', value: '70% open green space with reflexology garden and children themed park', category: 'amenities' },
    { key: 'location_landmarks', title: 'Key Distances', value: isP1 ? '500m to SG Highway, 2.5km to Zydus Hospital, 3km to Thaltej Metro' : '800m to Science City, 2km to Sola Civil Hospital, 15 min to Vaishno Devi Circle', category: 'location' },
    { key: 'airport_railway', title: 'Transit Connectivity', value: '18km to Sardar Vallabhbhai Patel International Airport (35 min), 14km to Kalupur Railway Station', category: 'location' },
    { key: 'parking_allotment', title: 'Car Parking', value: '1 covered basement car park with 2 BHK; 2 covered parking bays with 3 BHK, EV chargers pre-wired', category: 'amenities' },
    { key: 'power_backup', title: 'Power Backup', value: '100% DG backup for common areas, elevators, pumps, and 1 KVA backup per residence', category: 'specifications' },
    { key: 'security_surveillance', title: '3-Tier Security', value: '24/7 CCTV perimeter surveillance, RFID boom barriers, and video door phone at lobby', category: 'specifications' },
    { key: 'water_management', title: 'Water Supply & STP', value: 'Dual plumbing system, 24-hour AMC water connection, automated borewell, and rainwater harvesting', category: 'specifications' },
    { key: 'elevators', title: 'High-Speed Elevators', value: '2 passenger elevators + 1 stretcher/service elevator per tower (Schindler / Otis, 2.0 m/s)', category: 'specifications' },
    { key: 'vastu_compliance', title: 'Vastu Design', value: '100% Vastu-compliant layouts with East-facing entrance options available', category: 'specifications' },
    { key: 'bank_approvals', title: 'Home Loan Approvals', value: 'Pre-approved project with SBI, HDFC Bank, ICICI Bank, Axis Bank, and Bank of Baroda', category: 'finance' },
    { key: 'site_visit_timings', title: 'Site Visit Guidelines', value: 'Personalized 60-minute site visits conducted daily between 10:00 AM and 06:00 PM IST with named advisors', category: 'operations' },
  ];

  const p1Facts = generateFacts('Project 1', true);
  const p2Facts = generateFacts('Project 2', false);

  const insertFact = async (f: FactData, projId: string | null) => {
    const res = await query<{ id: string }>(
      `INSERT INTO fact_entries (project_id, key, title, value, category, status, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW()) RETURNING id`,
      [projId, f.key, f.title, f.value, f.category, salesHeadId],
    );
    const factId = res.rows[0]!.id;
    await query(
      `INSERT INTO fact_entry_versions (fact_entry_id, version_number, title, value, category, status, changed_by, changed_at)
       VALUES ($1, 1, $2, $3, $4, 'active', $5, NOW())`,
      [factId, f.title, f.value, f.category, salesHeadId],
    );
    return factId;
  };

  for (const f of p1Facts) await insertFact(f, p1Id);
  for (const f of p2Facts) await insertFact(f, p2Id);
  logger.info(`Inserted ~50 fact entries with version history across both projects.`);

  // 4b. Unanswered Questions (Inbox for Sales Head)
  const sampleUnanswered = [
    {
      question: 'Can we install personal solar panels on the terrace of the penthouse?',
      buyerLanguage: 'en',
      projectId: p1Id,
    },
    {
      question: 'શું ગેસ લાઇન કનેક્શન પ્રોજેક્ટમાં સામેલ છે કે સિલિન્ડર વાપરવું પડશે?',
      buyerLanguage: 'gu',
      projectId: p2Id,
    },
    {
      question: 'Is there a dedicated box cricket pitch or practice net inside the sports zone?',
      buyerLanguage: 'en',
      projectId: p1Id,
    },
    {
      question: 'Are pets allowed in the apartment towers and clubhouse garden areas?',
      buyerLanguage: 'en',
      projectId: p2Id,
    },
  ];

  for (const u of sampleUnanswered) {
    await query(
      `INSERT INTO unanswered_questions (question, buyer_language, project_id, status)
       VALUES ($1, $2, $3, 'unresolved')`,
      [u.question, u.buyerLanguage, u.projectId],
    );
  }
  logger.info(`Inserted 4 unanswered questions for Sales Head fact inbox.`);

  // 5. Availability Rules (Mon-Sun 10:00 to 18:00, 60-min slots)
  for (const execId of executiveIds) {
    for (let day = 0; day <= 6; day++) {
      await query(
        `INSERT INTO availability_rules (project_id, executive_id, weekday, start_time, end_time, slot_minutes)
         VALUES ($1, $2, $3, '10:00:00', '18:00:00', 60)`,
        [prng.choice([p1Id, p2Id]), execId, day],
      );
    }
  }

  // 6. The 3 Sample Leads from the Brief Verbatim
  // Hardik Patel LD-58210
  const hardikRes = await query<{ id: string }>(
    `INSERT INTO leads (
      public_id, name, phone_e164, email, source, project_id, wants, budget_min, budget_max,
      timeline, language, status, assigned_to, first_touch_at, first_response_at, last_activity_at, consent_status
    ) VALUES (
      'LD-58210', 'Hardik Patel', '+919000000010', 'hardik.patel@example.com',
      'property_portal', $1, '3 BHK', 9500000, 12000000, '3 months', 'en',
      'visit_booked', $2, '2026-10-31T10:15:00Z', '2026-10-31T10:18:00Z', '2026-11-01T11:00:00Z', 'granted'
    ) RETURNING id`,
    [p1Id, executiveIds[0]],
  );
  const hardikId = hardikRes.rows[0]!.id;

  // Nidhi Shah LD-58211
  const nidhiRes = await query<{ id: string }>(
    `INSERT INTO leads (
      public_id, name, phone_e164, email, source, project_id, wants, budget_min, budget_max,
      timeline, language, status, assigned_to, first_touch_at, first_response_at, last_activity_at, consent_status
    ) VALUES (
      'LD-58211', 'Nidhi Shah', '+919000000011', 'nidhi.shah@example.com',
      'social_ad', $1, '2 BHK', 6500000, 8500000, 'Immediate', 'en',
      'engaged', $2, '2026-11-04T14:30:00Z', '2026-11-04T14:32:00Z', '2026-11-04T15:00:00Z', 'granted'
    ) RETURNING id`,
    [p2Id, executiveIds[1]],
  );
  const nidhiId = nidhiRes.rows[0]!.id;

  // Kavita Joshi LD-58224
  const kavitaRes = await query<{ id: string }>(
    `INSERT INTO leads (
      public_id, name, phone_e164, email, source, project_id, wants, budget_min, budget_max,
      timeline, language, status, assigned_to, first_touch_at, first_response_at, last_activity_at, consent_status
    ) VALUES (
      'LD-58224', 'Kavita Joshi', '+919000000024', 'kavita.joshi@example.com',
      'hoarding_call', $1, '2 BHK', 6500000, 8000000, '6 months', 'gu',
      'visited', $2, '2026-10-25T09:00:00Z', '2026-10-25T09:04:00Z', '2026-10-28T15:00:00Z', 'granted'
    ) RETURNING id`,
    [p2Id, executiveIds[2]],
  );
  const kavitaId = kavitaRes.rows[0]!.id;

  // Create visit slots and bookings for the 3 sample leads
  // Hardik: 2026-11-01 11:00 to 12:00 IST (awaiting outcome in past)
  const hardikSlot = await query<{ id: string }>(
    `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
     VALUES ($1, $2, '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', 'booked') RETURNING id`,
    [p1Id, executiveIds[0]],
  );
  await query(
    `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key, created_at)
     VALUES ($1, $2, 'confirmed', 'idem-hardik-visit-58210', '2026-10-31T10:20:00Z')`,
    [hardikId, hardikSlot.rows[0]!.id],
  );

  // Kavita: 2026-10-28 14:00 to 15:00 IST (visited)
  const kavitaSlot = await query<{ id: string }>(
    `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
     VALUES ($1, $2, '2026-10-28T08:30:00Z', '2026-10-28T09:30:00Z', 'booked') RETURNING id`,
    [p2Id, executiveIds[2]],
  );
  await query(
    `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key, created_at)
     VALUES ($1, $2, 'completed', 'idem-kavita-visit-58224', '2026-10-25T09:10:00Z')`,
    [kavitaId, kavitaSlot.rows[0]!.id],
  );

  logger.info(`Inserted 3 sample leads from brief verbatim.`);

  // Advance sequence past sample leads so subsequent auto-generated IDs do not collide
  await query(`SELECT setval('lead_public_id_seq', 58225, false);`);

  // 7. Seed ~60 More Leads over the last 30 days
  const gujaratiFirstNames = ['Aarav', 'Bhavin', 'Chirag', 'Drashti', 'Esha', 'Falgun', 'Gaurav', 'Hitesh', 'Ila', 'Jignesh', 'Kinjal', 'Lalit', 'Manish', 'Neha', 'Parth', 'Rajesh', 'Sonal', 'Tejas', 'Urvi', 'Vishal'];
  const gujaratiLastNames = ['Patel', 'Shah', 'Modi', 'Desai', 'Trivedi', 'Dave', 'Mehta', 'Panchal', 'Bhatt', 'Vyas', 'Chokshi', 'Raval'];
  const sources = ['property_portal', 'social_ad', 'website', 'hoarding_call'] as const;
  const languages = ['en', 'hi', 'gu'] as const;

  const leadIds: string[] = [hardikId, nidhiId, kavitaId];

  // We will generate 62 additional leads
  for (let i = 1; i <= 62; i++) {
    const fName = prng.choice(gujaratiFirstNames);
    const lName = prng.choice(gujaratiLastNames);
    const name = `${fName} ${lName}`;
    const source = prng.choice(sources);
    const projId = prng.choice([p1Id, p2Id]);
    const wants = prng.choice(['2 BHK', '3 BHK']);
    const lang = prng.choice(languages);
    const daysAgo = prng.int(1, 30);
    const firstTouch = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000 - prng.int(10, 500) * 60 * 1000);

    // 30% never reached within 48h
    const isUnreached = prng.next() < 0.32;
    let firstResponse: Date | null = null;
    let leadStatus: 'new' | 'engaged' | 'visit_booked' | 'visited' | 'no_show' | 'lost' = 'new';

    if (!isUnreached) {
      // Median first response realistic: 2 to 15 mins
      const responseDelayMinutes = prng.int(2, 25);
      firstResponse = new Date(firstTouch.getTime() + responseDelayMinutes * 60 * 1000);
      leadStatus = prng.choice(['engaged', 'visit_booked', 'visited', 'no_show', 'lost']);
    }

    const assignedExec = leadStatus !== 'new' ? prng.choice(executiveIds) : null;
    const phoneSuffix = String(100 + i).padStart(4, '0');
    const phone = `+91900000${phoneSuffix}`;
    const email = `${fName.toLowerCase()}.${lName.toLowerCase()}${i}@example.com`;

    const leadRes = await query<{ id: string }>(
      `INSERT INTO leads (
        name, phone_e164, email, source, project_id, wants, budget_min, budget_max,
        timeline, language, status, assigned_to, first_touch_at, first_response_at, last_activity_at, consent_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'granted'
      ) RETURNING id`,
      [
        name,
        phone,
        email,
        source,
        projId,
        wants,
        wants === '2 BHK' ? 6500000 : 9500000,
        wants === '2 BHK' ? 8500000 : 12000000,
        'Within 6 months',
        lang,
        leadStatus,
        assignedExec,
        firstTouch.toISOString(),
        firstResponse?.toISOString() ?? null,
        (firstResponse ?? firstTouch).toISOString(),
      ],
    );
    const leadId = leadRes.rows[0]!.id;
    leadIds.push(leadId);

    // Touchpoints & Consents
    await query(
      `INSERT INTO lead_touchpoints (lead_id, source, channel, occurred_at, raw)
       VALUES ($1, $2, $3, $4, $5)`,
      [leadId, source, 'web', firstTouch.toISOString(), JSON.stringify({ campaign: 'diwali_2026', source })],
    );
    await query(
      `INSERT INTO consents (lead_id, purpose, granted, notice_version, channel, at)
       VALUES ($1, 'lead_enquiry_followup', true, 'v1.0', 'web_form', $2)`,
      [leadId, firstTouch.toISOString()],
    );
  }

  // Set up 4 duplicate pairs (leads with identical details or flagged duplicate)
  // And 2 possible-duplicate pairs
  if (leadIds.length > 20) {
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[3], leadIds[4]]);
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[5], leadIds[6]]);
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[7], leadIds[8]]);
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[9], leadIds[10]]);
    // 2 soft possible duplicates
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[11], leadIds[12]]);
    await query(`UPDATE leads SET possible_duplicate_of = $1 WHERE id = $2`, [leadIds[13], leadIds[14]]);
  }
  logger.info(`Inserted 62 additional leads with touchpoints, consents, duplicate pairs.`);

  // 8. Visit Slots for the Next 21 Days (10:00 to 18:00 IST)
  // IST is UTC+5:30. 10:00 IST is 04:30 UTC. 17:00 IST is 11:30 UTC.
  const hours = [4, 5, 6, 8, 9, 10, 11]; // corresponding to 09:30, 10:30, 11:30 etc UTC
  let confirmedBookingCount = 0;

  for (let dayOffset = 1; dayOffset <= 21; dayOffset++) {
    const slotDate = new Date(now);
    slotDate.setUTCDate(slotDate.getUTCDate() + dayOffset);

    for (const execId of executiveIds) {
      for (const h of hours) {
        const slotStart = new Date(Date.UTC(slotDate.getUTCFullYear(), slotDate.getUTCMonth(), slotDate.getUTCDate(), h, 30, 0));
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
        const projId = prng.choice([p1Id, p2Id]);

        // Allocate ~15 bookings across future slots
        const shouldBook = confirmedBookingCount < 16 && prng.next() < 0.08;
        const status = shouldBook ? 'booked' : 'open';

        const slotRes = await query<{ id: string }>(
          `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [projId, execId, slotStart.toISOString(), slotEnd.toISOString(), status],
        );

        if (shouldBook) {
          const bookedLeadId = leadIds[15 + confirmedBookingCount]!;
          const bookingRes = await query<{ id: string }>(
            `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key, created_at)
             VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id`,
            [bookedLeadId, slotRes.rows[0]!.id, `idem-slot-${confirmedBookingCount}-${slotStart.getTime()}`, now.toISOString()],
          );
          const bookingId = bookingRes.rows[0]!.id;

          // Create 24h and 2h reminders
          const reminder24h = new Date(slotStart.getTime() - 24 * 3600 * 1000);
          const reminder2h = new Date(slotStart.getTime() - 2 * 3600 * 1000);

          await query(
            `INSERT INTO reminders (booking_id, kind, scheduled_at, status)
             VALUES ($1, '24h', $2, 'pending'), ($1, '2h', $3, 'pending')`,
            [bookingId, reminder24h.toISOString(), reminder2h.toISOString()],
          );

          confirmedBookingCount++;
        }
      }
    }
  }
  logger.info(`Generated 21-day visit slots and ${confirmedBookingCount} confirmed future bookings with reminders.`);

  // 9. Conversations in English, Hindi, and Gujarati (including 3 flagged)
  const conversationConfigs = [
    { leadIdx: 0, lang: 'en', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 1, lang: 'en', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 2, lang: 'gu', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 3, lang: 'hi', flagged: true, flagReasons: ['unsupported_discount_inquiry'], note: 'Buyer persistently asked for cash discount' },
    { leadIdx: 4, lang: 'en', flagged: true, flagReasons: ['rera_carpet_area_clarification'], note: 'Questions regarding external wall thickness' },
    { leadIdx: 5, lang: 'gu', flagged: true, flagReasons: ['human_agent_requested'], note: 'Buyer specifically requested immediate telecaller call' },
    { leadIdx: 6, lang: 'en', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 7, lang: 'hi', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 8, lang: 'gu', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 9, lang: 'en', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 10, lang: 'hi', flagged: false, flagReasons: [] as string[] },
    { leadIdx: 11, lang: 'en', flagged: false, flagReasons: [] as string[] },
  ];

  for (const c of conversationConfigs) {
    const leadId = leadIds[c.leadIdx]!;
    const convRes = await query<{ id: string }>(
      `INSERT INTO conversations (lead_id, language, status, flagged, flag_reasons, review_note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [leadId, c.lang, c.flagged ? 'human' : 'ai', c.flagged, c.flagReasons, c.note ?? null],
    );
    const convId = convRes.rows[0]!.id;

    // Messages
    await query(
      `INSERT INTO messages (conversation_id, role, content, meta)
       VALUES
       ($1, 'system', 'Chat initialized under RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126', '{}'::jsonb),
       ($1, 'assistant', 'Namaste! Welcome to Company A. Are you interested in Project 1 (3 BHK) or Project 2 (2 BHK)?', '{}'::jsonb),
       ($1, 'buyer', 'Looking for a spacious home with possession by late 2026.', '{}'::jsonb),
       ($1, 'assistant', 'Project 1 offers 3 BHK (1,180 sq.ft carpet) with Dec 2026 possession in the range of ₹95L to ₹1.2 Cr.', '{}'::jsonb)`,
      [convId],
    );

    // If flagged or requested human, record a handoff
    if (c.flagged) {
      await query(
        `INSERT INTO handoffs (lead_id, conversation_id, executive_id, reason, summary, status)
         VALUES ($1, $2, $3, $4, $5, 'new')`,
        [
          leadId,
          convId,
          executiveIds[0],
          c.flagReasons[0]!,
          JSON.stringify({ notes: c.note, preferredLanguage: c.lang }),
        ],
      );
    }
  }
  logger.info(`Inserted 12 conversations (including 3 flagged) and respective handoffs.`);

  // 10. Ad Spend for the last 3 months (~₹30 Lakh each month)
  const adMonths = ['2026-08-01', '2026-09-01', '2026-10-01'];
  for (const m of adMonths) {
    await query(
      `INSERT INTO ad_spend (month, source, amount_inr)
       VALUES
       ($1, 'property_portal', 1200000.00),
       ($1, 'social_ad', 1000000.00),
       ($1, 'hoarding_call', 500000.00),
       ($1, 'website', 300000.00)
       ON CONFLICT (month, source) DO NOTHING`,
      [m],
    );
  }
  logger.info(`Inserted ad spend records for 3 months totaling ₹30 Lakh / month.`);

  // 11. Mock Outbound Messages (Outbox) and LLM Telemetry
  for (let i = 0; i < 5; i++) {
    await query(
      `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status, sent_at)
       VALUES ($1, 'whatsapp', 'visit_confirmed_v1', 'Namaste! Your site visit is confirmed for Project 1.', 'sent', NOW())`,
      [leadIds[i]],
    );
    await query(
      `INSERT INTO llm_calls (provider, model, latency_ms, input_tokens, output_tokens, outcome)
       VALUES ('gemini', 'gemini-1.5-pro', 320, 480, 95, 'success')`,
    );
  }

  // 12. Source API Keys for webhook / ingest authentication
  const demoSources = [
    { source: 'property_portal', key: 'portal_demo_key_123', name: 'MagicBricks & 99acres Webhook' },
    { source: 'social_ad', key: 'social_demo_key_123', name: 'Meta Ads Lead Sync' },
    { source: 'website', key: 'website_demo_key_123', name: 'Website Lead Form & Chat' },
    { source: 'hoarding_call', key: 'hoarding_demo_key_123', name: 'IVR & Hoarding Call Sync' },
  ];
  for (const s of demoSources) {
    const hash = crypto.createHash('sha256').update(s.key).digest('hex');
    await query(
      `INSERT INTO source_api_keys (source, key_hash, name, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (source) DO UPDATE SET key_hash = EXCLUDED.key_hash, active = true`,
      [s.source, hash, s.name],
    );
  }
  logger.info('Inserted 4 source API keys for webhook authentication.');

  logger.info('Deterministic database reset and seeding completed successfully!');
}

// Allow direct execution: npx tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts')) {
  runSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'Seed execution failed');
      await pool.end();
      process.exit(1);
    });
}
