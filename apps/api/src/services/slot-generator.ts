/**
 * Pure function and utilities for site-visit slot generation.
 * Handles exact Asia/Kolkata (IST, UTC+05:30) calendar math and converts to UTC timestamps.
 */

export interface AvailabilityRuleInput {
  id?: string;
  projectId: string;
  executiveId: string;
  weekday: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string; // "HH:MM" or "HH:MM:SS"
  slotMinutes?: number; // default 60
}

export interface BlackoutDateInput {
  id?: string;
  projectId?: string | null;
  executiveId?: string | null;
  blackoutDate: string; // "YYYY-MM-DD"
  reason?: string | null;
}

export interface GeneratedSlotRow {
  projectId: string;
  executiveId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'open';
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30 in milliseconds

/**
 * Parses an ISO date string or Date object and returns the "YYYY-MM-DD" calendar date in Asia/Kolkata.
 */
export function getKolkataDateString(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  // Shift by IST offset to extract UTC date parts as local IST date parts
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a calendar date string ("YYYY-MM-DD") and time ("HH:MM") in Asia/Kolkata to a UTC Date.
 */
export function kolkataTimeToUtc(dateStr: string, timeStr: string): Date {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const [hourStr, minuteStr] = timeStr.split(':');

  const year = parseInt(yearStr!, 10);
  const monthIndex = parseInt(monthStr!, 10) - 1;
  const day = parseInt(dayStr!, 10);
  const hour = parseInt(hourStr!, 10);
  const minute = parseInt(minuteStr!, 10);

  // UTC equivalent = UTC representation of IST wall-clock time minus 5h30m
  const istWallClockTime = Date.UTC(year, monthIndex, day, hour, minute, 0, 0);
  return new Date(istWallClockTime - IST_OFFSET_MS);
}

/**
 * Helper to parse "HH:MM" or "HH:MM:SS" into total minutes from start of day.
 */
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

/**
 * Helper to format total minutes from start of day into "HH:MM".
 */
function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Pure function to generate slot rows across a number of days from fromDate.
 *
 * @param rules Array of weekly recurring availability rules for executives on projects
 * @param blackoutDates Array of blackout dates (by project, executive, or global)
 * @param fromDate Starting date (Date or ISO string or YYYY-MM-DD in Asia/Kolkata)
 * @param days Number of days to generate (default 21)
 * @returns Array of slot rows with UTC startsAt and endsAt
 */
export function generateSlots(
  rules: readonly AvailabilityRuleInput[],
  blackoutDates: readonly BlackoutDateInput[] = [],
  fromDate: Date | string = new Date(),
  days = 21,
): GeneratedSlotRow[] {
  if (days <= 0 || rules.length === 0) {
    return [];
  }

  // Get fromDate as YYYY-MM-DD in Asia/Kolkata
  const startDateStr = typeof fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
    ? fromDate
    : getKolkataDateString(fromDate);

  const [startYear, startMonth, startDay] = startDateStr.split('-').map((n) => parseInt(n, 10));

  const slots: GeneratedSlotRow[] = [];
  const seenSlots = new Set<string>();

  for (let d = 0; d < days; d++) {
    // Construct calendar day in IST:
    // Create base UTC date at midday for the current day index to safely add days
    const currentCalDate = new Date(Date.UTC(startYear!, startMonth! - 1, startDay! + d, 12, 0, 0));
    const year = currentCalDate.getUTCFullYear();
    const month = String(currentCalDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(currentCalDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Weekday in JavaScript: 0 is Sunday, 1 is Monday, ..., 6 is Saturday
    const weekday = currentCalDate.getUTCDay();

    for (const rule of rules) {
      if (rule.weekday !== weekday) {
        continue;
      }

      // Check if date is blacked out for this project or executive
      const isBlackedOut = blackoutDates.some((bd) => {
        if (bd.blackoutDate !== dateStr) {
          return false;
        }
        const matchesProject = !bd.projectId || bd.projectId === rule.projectId;
        const matchesExecutive = !bd.executiveId || bd.executiveId === rule.executiveId;
        return matchesProject && matchesExecutive;
      });

      if (isBlackedOut) {
        continue;
      }

      const slotMinutes = rule.slotMinutes && rule.slotMinutes > 0 ? rule.slotMinutes : 60;
      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);

      for (let currMin = startMinutes; currMin + slotMinutes <= endMinutes; currMin += slotMinutes) {
        const slotStartTimeStr = formatMinutesToTime(currMin);
        const slotEndTimeStr = formatMinutesToTime(currMin + slotMinutes);

        const startsAt = kolkataTimeToUtc(dateStr, slotStartTimeStr);
        const endsAt = kolkataTimeToUtc(dateStr, slotEndTimeStr);

        const dedupKey = `${rule.executiveId}_${startsAt.toISOString()}`;
        if (!seenSlots.has(dedupKey)) {
          seenSlots.add(dedupKey);
          slots.push({
            projectId: rule.projectId,
            executiveId: rule.executiveId,
            startsAt,
            endsAt,
            status: 'open',
          });
        }
      }
    }
  }

  // Sort chronologically by startsAt, then executiveId
  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return slots;
}

