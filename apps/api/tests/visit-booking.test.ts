import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import { visitService } from '../src/services/visit.service.js';
import { visitRepository } from '../src/repositories/visit.repository.js';
import { SlotUnavailableError } from '../src/errors/index.js';

describe('Site-Visit Booking, Concurrency & Reminders', () => {
  let projectId: string;
  let exec1Id: string;
  let exec2Id: string;

  beforeAll(async () => {
    const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
    projectId = projRes.rows[0]!.id;

    const execRes = await query<{ id: string; name: string; email: string; role: 'executive'; phone: string }>(
      "SELECT id, name, email, role, phone FROM users WHERE role = 'executive' ORDER BY name ASC LIMIT 2",
    );
    exec1Id = execRes.rows[0]!.id;
    exec2Id = execRes.rows[1]!.id;
  });

  afterAll(async () => {
    // Wait for any trailing pools
  });

  // Helper to create a test lead
  async function createLead(namePrefix: string): Promise<string> {
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
    const phone = `+9199${randomSuffix}`;
    const email = `${namePrefix.toLowerCase()}.${Date.now()}@testbuyer.com`;

    const res = await query<{ id: string }>(
      `INSERT INTO leads (name, phone_e164, email, source, project_id, wants, status)
       VALUES ($1, $2, $3, 'website', $4, '2 BHK', 'engaged')
       RETURNING id`,
      [`${namePrefix} ${randomSuffix}`, phone, email, projectId],
    );
    return res.rows[0]!.id;
  }

  // Helper to create a single specific slot
  async function createSlot(executiveId: string, startsAt: Date, endsAt: Date, status: 'open' | 'booked' = 'open'): Promise<string> {
    await query(
      'DELETE FROM visit_bookings WHERE slot_id IN (SELECT id FROM visit_slots WHERE executive_id = $1 AND starts_at = $2)',
      [executiveId, startsAt.toISOString()],
    );
    const res = await query<{ id: string }>(
      `INSERT INTO visit_slots (project_id, executive_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (executive_id, starts_at) DO UPDATE SET status = EXCLUDED.status
       RETURNING id`,
      [projectId, executiveId, startsAt.toISOString(), endsAt.toISOString(), status],
    );
    return res.rows[0]!.id;
  }

  it(
    '20 parallel bookings for the same single slot via Promise.all: exactly 1 succeeds, 19 get SlotUnavailable',
    async () => {
      // Target time: 10 days in the future at 11:00 UTC
      const targetStartsAt = new Date(Date.now() + 10 * 24 * 3600 * 1000);
      targetStartsAt.setUTCHours(11, 0, 0, 0);
      const targetEndsAt = new Date(targetStartsAt.getTime() + 60 * 60 * 1000);

      // Ensure ONLY 1 single slot exists at targetStartsAt for this project
      await query(
        'DELETE FROM visit_bookings WHERE slot_id IN (SELECT id FROM visit_slots WHERE project_id = $1 AND starts_at = $2)',
        [projectId, targetStartsAt.toISOString()],
      );
      await query(
        'DELETE FROM visit_slots WHERE project_id = $1 AND starts_at = $2',
        [projectId, targetStartsAt.toISOString()],
      );

      // Create alternative slots so the 19 failing requests receive 3 alternatives
      for (let i = 1; i <= 3; i++) {
        const altStart = new Date(targetStartsAt.getTime() + i * 2 * 3600 * 1000);
        const altEnd = new Date(altStart.getTime() + 3600 * 1000);
        await createSlot(exec1Id, altStart, altEnd, 'open');
      }

      // Now insert the single contested slot
      const slotId = await createSlot(exec1Id, targetStartsAt, targetEndsAt, 'open');

      // Create 20 unique leads
      const leadIds: string[] = [];
      for (let i = 0; i < 20; i++) {
        const lid = await createLead(`ConcurrentBuyer${i}`);
        leadIds.push(lid);
      }

      // Fire 20 parallel booking requests at the exact same moment
      const results = await Promise.allSettled(
        leadIds.map((lid, idx) =>
          visitService.bookVisit(
            lid,
            projectId,
            targetStartsAt.toISOString(),
            `IDEM-CONCURRENT-RACE-${idx}-${Date.now()}`,
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 1 must succeed
      expect(fulfilled).toHaveLength(1);

      // Exactly 19 must fail
      expect(rejected).toHaveLength(19);

      // All 19 rejected must be SlotUnavailableError with alternatives
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason).toBeInstanceOf(SlotUnavailableError);
          const err = rej.reason as SlotUnavailableError;
          expect(err.statusCode).toBe(409);
          expect(err.code).toBe('SLOT_UNAVAILABLE');
          expect(err.alternatives.length).toBeGreaterThanOrEqual(1);
        }
      }

      // Database verification: Slot status must be 'booked'
      const slotCheck = await query<{ status: string }>('SELECT status FROM visit_slots WHERE id = $1', [slotId]);
      expect(slotCheck.rows[0]!.status).toBe('booked');

      // Database verification: Exactly 1 confirmed booking exists for that slot
      const bookingCheck = await query<{ count: string }>(
        "SELECT COUNT(*) FROM visit_bookings WHERE slot_id = $1 AND status = 'confirmed'",
        [slotId],
      );
      expect(parseInt(bookingCheck.rows[0]!.count, 10)).toBe(1);
    }, 15000);

  it('Idempotent retry: double click returns the same booking without re-booking', async () => {
    const leadId = await createLead('IdempotentLead');
    const targetStartsAt = new Date(Date.now() + 8 * 24 * 3600 * 1000);
    targetStartsAt.setUTCHours(10, 0, 0, 0);
    const targetEndsAt = new Date(targetStartsAt.getTime() + 3600 * 1000);

    await createSlot(exec2Id, targetStartsAt, targetEndsAt, 'open');

    const idempotencyKey = `IDEM-RETRY-KEY-${Date.now()}`;

    // First call
    const booking1 = await visitService.bookVisit(leadId, projectId, targetStartsAt.toISOString(), idempotencyKey);
    expect(booking1.status).toBe('confirmed');

    // Second call with same idempotencyKey
    const booking2 = await visitService.bookVisit(leadId, projectId, targetStartsAt.toISOString(), idempotencyKey);

    expect(booking2.id).toBe(booking1.id);
    expect(booking2.startsAt).toBe(booking1.startsAt);
  });

  it('The same lead booking twice is blocked by unique active lead constraint', async () => {
    const leadId = await createLead('DoubleBookingLead');

    const time1 = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    time1.setUTCHours(10, 0, 0, 0);
    await createSlot(exec1Id, time1, new Date(time1.getTime() + 3600 * 1000), 'open');

    const time2 = new Date(Date.now() + 6 * 24 * 3600 * 1000);
    time2.setUTCHours(14, 0, 0, 0);
    await createSlot(exec2Id, time2, new Date(time2.getTime() + 3600 * 1000), 'open');

    // Book first visit
    await visitService.bookVisit(leadId, projectId, time1.toISOString(), `IDEM-FIRST-${Date.now()}`);

    // Try to book a second active visit for the same lead
    await expect(
      visitService.bookVisit(leadId, projectId, time2.toISOString(), `IDEM-SECOND-${Date.now()}`),
    ).rejects.toThrow(/already has an active confirmed site visit/i);
  });

  it('Atomic reschedule: frees old slot, claims new slot, and cancels old reminders', async () => {
    const leadId = await createLead('RescheduleLead');

    const time1 = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    time1.setUTCHours(10, 0, 0, 0);
    const oldSlotId = await createSlot(exec1Id, time1, new Date(time1.getTime() + 3600 * 1000), 'open');

    const time2 = new Date(Date.now() + 8 * 24 * 3600 * 1000);
    time2.setUTCHours(15, 0, 0, 0);
    const newSlotId = await createSlot(exec2Id, time2, new Date(time2.getTime() + 3600 * 1000), 'open');

    const initialBooking = await visitService.bookVisit(
      leadId,
      projectId,
      time1.toISOString(),
      `IDEM-RESCHED-${Date.now()}`,
    );

    // Old slot is booked
    const oldSlotBefore = await query<{ status: string }>('SELECT status FROM visit_slots WHERE id = $1', [oldSlotId]);
    expect(oldSlotBefore.rows[0]!.status).toBe('booked');

    // Reschedule
    const rescheduled = await visitService.rescheduleVisit(initialBooking.id, time2.toISOString());

    expect(rescheduled.id).toBe(initialBooking.id);
    expect(new Date(rescheduled.startsAt).toISOString()).toBe(time2.toISOString());

    // Old slot is now open!
    const oldSlotAfter = await query<{ status: string }>('SELECT status FROM visit_slots WHERE id = $1', [oldSlotId]);
    expect(oldSlotAfter.rows[0]!.status).toBe('open');

    // New slot is now booked!
    const newSlotAfter = await query<{ status: string }>('SELECT status FROM visit_slots WHERE id = $1', [newSlotId]);
    expect(newSlotAfter.rows[0]!.status).toBe('booked');

    // Old reminders were cancelled and new reminders created
    const reminders = await visitRepository.getRemindersByBookingId(initialBooking.id);
    const cancelledReminders = reminders.filter((r) => r.status === 'cancelled');
    const pendingReminders = reminders.filter((r) => r.status === 'pending');

    expect(cancelledReminders.length).toBeGreaterThanOrEqual(1);
    expect(pendingReminders.length).toBeGreaterThanOrEqual(1);
  });

  it('Cancel frees the slot, cancels pending reminders, and sets lead status to engaged', async () => {
    const leadId = await createLead('CancelLead');

    const targetTime = new Date(Date.now() + 4 * 24 * 3600 * 1000);
    targetTime.setUTCHours(11, 0, 0, 0);
    const slotId = await createSlot(exec1Id, targetTime, new Date(targetTime.getTime() + 3600 * 1000), 'open');

    const booking = await visitService.bookVisit(
      leadId,
      projectId,
      targetTime.toISOString(),
      `IDEM-CANCEL-${Date.now()}`,
    );

    // Cancel visit
    const cancelled = await visitService.cancelVisit(booking.id, 'Buyer requested cancellation');
    expect(cancelled.status).toBe('cancelled');

    // Slot is open again
    const slotCheck = await query<{ status: string }>('SELECT status FROM visit_slots WHERE id = $1', [slotId]);
    expect(slotCheck.rows[0]!.status).toBe('open');

    // Reminders are cancelled
    const reminders = await visitRepository.getRemindersByBookingId(booking.id);
    expect(reminders.every((r) => r.status === 'cancelled' || r.status === 'skipped')).toBe(true);

    // Lead status is back to engaged
    const leadCheck = await query<{ status: string }>('SELECT status FROM leads WHERE id = $1', [leadId]);
    expect(leadCheck.rows[0]!.status).toBe('engaged');
  });

  it('Reminder rows: created with status pending for >24h visits, status skipped for <24h visits', async () => {
    // Case A: Visit 3 days away (>24h)
    const leadA = await createLead('FarVisitLead');
    const timeFar = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    timeFar.setUTCHours(10, 0, 0, 0);
    await createSlot(exec1Id, timeFar, new Date(timeFar.getTime() + 3600 * 1000), 'open');

    const bookingA = await visitService.bookVisit(
      leadA,
      projectId,
      timeFar.toISOString(),
      `IDEM-REM-FAR-${Date.now()}`,
    );

    const remindersA = await visitRepository.getRemindersByBookingId(bookingA.id);
    const r24A = remindersA.find((r) => r.kind === '24h');
    const r2A = remindersA.find((r) => r.kind === '2h');

    expect(r24A?.status).toBe('pending');
    expect(r2A?.status).toBe('pending');

    // Case B: Visit 5 hours away (<24h, but satisfies 3h min lead time)
    const leadB = await createLead('NearVisitLead');
    const timeNear = new Date(Date.now() + 5 * 3600 * 1000);
    await createSlot(exec2Id, timeNear, new Date(timeNear.getTime() + 3600 * 1000), 'open');

    const bookingB = await visitService.bookVisit(
      leadB,
      projectId,
      timeNear.toISOString(),
      `IDEM-REM-NEAR-${Date.now()}`,
    );

    const remindersB = await visitRepository.getRemindersByBookingId(bookingB.id);
    const r24B = remindersB.find((r) => r.kind === '24h');
    const r2B = remindersB.find((r) => r.kind === '2h');

    expect(r24B?.status).toBe('skipped');
    expect(r2B?.status).toBe('pending');
  });

  it('Outcome recording: rejects prior to visit start time, updates status after start time', async () => {
    // Future visit: outcome should be rejected
    const leadFuture = await createLead('OutcomeFutureLead');
    const futureTime = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    await createSlot(exec1Id, futureTime, new Date(futureTime.getTime() + 3600 * 1000), 'open');

    const futureBooking = await visitService.bookVisit(
      leadFuture,
      projectId,
      futureTime.toISOString(),
      `IDEM-OUT-FUT-${Date.now()}`,
    );

    await expect(
      visitService.recordOutcome(futureBooking.id, { outcome: 'visited' }, exec1Id, 'executive'),
    ).rejects.toThrow(/Cannot record visit outcome before the scheduled visit start time/i);

    // Past visit: manually create a visit in the past
    const leadPast = await createLead('OutcomePastLead');
    const pastTime = new Date(Date.now() - 2 * 3600 * 1000); // 2 hours ago
    const pastSlotId = await createSlot(exec1Id, pastTime, new Date(pastTime.getTime() + 3600 * 1000), 'booked');

    const pastBookingRes = await query<{ id: string }>(
      `INSERT INTO visit_bookings (lead_id, slot_id, status, idempotency_key)
       VALUES ($1, $2, 'confirmed', $3)
       RETURNING id`,
      [leadPast, pastSlotId, `IDEM-PAST-${Date.now()}`],
    );
    const pastBookingId = pastBookingRes.rows[0]!.id;

    // Record Visited outcome
    const visited = await visitService.recordOutcome(
      pastBookingId,
      { outcome: 'visited', notes: 'Client loved the 3 BHK layout' },
      exec1Id,
      'executive',
    );

    expect(visited.status).toBe('completed');

    const leadCheck = await query<{ status: string }>('SELECT status FROM leads WHERE id = $1', [leadPast]);
    expect(leadCheck.rows[0]!.status).toBe('visited');
  });

  it('API: GET /api/projects/:id/slots returns grouped slots collapsing multiple executives', async () => {
    const testDay = new Date(Date.now() + 12 * 24 * 3600 * 1000);
    testDay.setUTCHours(10, 0, 0, 0);
    const endHour = new Date(testDay.getTime() + 3600 * 1000);

    // Create slot at same time for both Executive 1 and Executive 2
    await createSlot(exec1Id, testDay, endHour, 'open');
    await createSlot(exec2Id, testDay, endHour, 'open');

    const res = await request(app).get(`/api/projects/${projectId}/slots`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.days).toBeInstanceOf(Array);

    // Find the slot in the response
    const dayWithSlot = res.body.data.days.find((d: { slots: Array<{ startsAt: string }> }) =>
      d.slots.some((s) => new Date(s.startsAt).toISOString() === testDay.toISOString()),
    );

    expect(dayWithSlot).toBeDefined();
    const matchedSlot = dayWithSlot.slots.find(
      (s: { startsAt: string }) => new Date(s.startsAt).toISOString() === testDay.toISOString(),
    );
    expect(matchedSlot).toBeDefined();
    expect(matchedSlot.availableCount).toBe(2);
  });
});