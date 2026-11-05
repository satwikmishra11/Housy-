import { describe, it, expect } from 'vitest';
import {
  generateSlots,
  kolkataTimeToUtc,
  getKolkataDateString,
  type AvailabilityRuleInput,
  type BlackoutDateInput,
} from '../src/services/slot-generator.js';

describe('Site-Visit Slot Generation Math & Rules', () => {
  const dummyProjectId = '11111111-1111-1111-1111-111111111111';
  const dummyExecutive1 = '22222222-2222-2222-2222-222222222222';
  const dummyExecutive2 = '33333333-3333-3333-3333-333333333333';

  it('converts Asia/Kolkata date and time to exact UTC timestamp', () => {
    // 10:00 IST on 2026-11-06 is 04:30 UTC (IST is UTC + 5h30m)
    const utcDate = kolkataTimeToUtc('2026-11-06', '10:00');
    expect(utcDate.toISOString()).toBe('2026-11-06T04:30:00.000Z');

    // 18:00 IST on 2026-11-06 is 12:30 UTC
    const eveningUtc = kolkataTimeToUtc('2026-11-06', '18:00');
    expect(eveningUtc.toISOString()).toBe('2026-11-06T12:30:00.000Z');
  });

  it('handles midnight IST/UTC boundary properly across day boundary', () => {
    // 00:00 IST on 2026-11-06 is 18:30 UTC on 2026-11-05
    const midnightUtc = kolkataTimeToUtc('2026-11-06', '00:00');
    expect(midnightUtc.toISOString()).toBe('2026-11-05T18:30:00.000Z');

    // getKolkataDateString on that UTC timestamp must return 2026-11-06
    expect(getKolkataDateString(midnightUtc)).toBe('2026-11-06');
  });

  it('generates 60-minute slots between startTime and endTime', () => {
    // 2026-11-06 is a Friday (weekday = 5)
    const rules: AvailabilityRuleInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5, // Friday
        startTime: '10:00',
        endTime: '13:00',
        slotMinutes: 60,
      },
    ];

    const slots = generateSlots(rules, [], '2026-11-06', 1);

    // 10:00 to 13:00 with 60min slots -> 3 slots (10-11, 11-12, 12-13)
    expect(slots).toHaveLength(3);
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-11-06T04:30:00.000Z');
    expect(slots[0]!.endsAt.toISOString()).toBe('2026-11-06T05:30:00.000Z');
    expect(slots[1]!.startsAt.toISOString()).toBe('2026-11-06T05:30:00.000Z');
    expect(slots[2]!.startsAt.toISOString()).toBe('2026-11-06T06:30:00.000Z');
  });

  it('generates slots across a 21-day window for recurring weekly rules', () => {
    const rules: AvailabilityRuleInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 1, // Monday
        startTime: '10:00',
        endTime: '12:00', // 2 slots
      },
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5, // Friday
        startTime: '14:00',
        endTime: '16:00', // 2 slots
      },
    ];

    // Starting on Friday 2026-11-06 for 21 days:
    // Friday: Nov 6, Nov 13, Nov 20 (3 Fridays x 2 slots = 6 slots)
    // Monday: Nov 9, Nov 16, Nov 23 (3 Mondays x 2 slots = 6 slots)
    // Total: 12 slots
    const slots = generateSlots(rules, [], '2026-11-06', 21);
    expect(slots).toHaveLength(12);
  });

  it('skips dates matching blackout dates for matching project/executive', () => {
    const rules: AvailabilityRuleInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5, // Friday
        startTime: '10:00',
        endTime: '12:00',
      },
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive2,
        weekday: 5, // Friday
        startTime: '10:00',
        endTime: '12:00',
      },
    ];

    // Blackout specifically for Executive 1 on Nov 6
    const blackouts: BlackoutDateInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        blackoutDate: '2026-11-06',
        reason: 'Executive personal leave',
      },
    ];

    const slots = generateSlots(rules, blackouts, '2026-11-06', 1);

    // Only Executive 2's 2 slots should be generated
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.executiveId === dummyExecutive2)).toBe(true);
  });

  it('skips all slots when a global blackout date is specified', () => {
    const rules: AvailabilityRuleInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5,
        startTime: '10:00',
        endTime: '18:00',
      },
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive2,
        weekday: 5,
        startTime: '10:00',
        endTime: '18:00',
      },
    ];

    const globalBlackout: BlackoutDateInput[] = [
      {
        projectId: null,
        executiveId: null,
        blackoutDate: '2026-11-06',
        reason: 'Diwali Public Holiday',
      },
    ];

    const slots = generateSlots(rules, globalBlackout, '2026-11-06', 1);
    expect(slots).toHaveLength(0);
  });

  it('guarantees deterministic output and deduplication', () => {
    const rules: AvailabilityRuleInput[] = [
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5,
        startTime: '10:00',
        endTime: '12:00',
      },
      // Duplicate rule definition for the same executive
      {
        projectId: dummyProjectId,
        executiveId: dummyExecutive1,
        weekday: 5,
        startTime: '10:00',
        endTime: '12:00',
      },
    ];

    const run1 = generateSlots(rules, [], '2026-11-06', 7);
    const run2 = generateSlots(rules, [], '2026-11-06', 7);

    expect(run1).toHaveLength(2);
    expect(run1).toEqual(run2);
  });
});

