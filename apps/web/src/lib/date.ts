/**
 * Date formatting utilities conforming to AGENTS.md:
 * All timestamps are stored in UTC and presented in Asia/Kolkata (IST).
 */

const IST_TIMEZONE = 'Asia/Kolkata';

export function formatInKolkataTime(
  utcIsoString: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof utcIsoString === 'string' ? new Date(utcIsoString) : utcIsoString;
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };

  return new Intl.DateTimeFormat('en-IN', options ?? defaultOptions).format(date);
}

export function formatTimeInKolkata(utcIsoString: string | Date): string {
  return formatInKolkataTime(utcIsoString, {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateInKolkata(utcIsoString: string | Date): string {
  return formatInKolkataTime(utcIsoString, {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDayDisplay(dateStr: string): { dayName: string; dayNumber: string; monthName: string } {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 6, 0, 0));
    const dayName = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TIMEZONE, weekday: 'short' }).format(d);
    const dayNumber = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TIMEZONE, day: 'numeric' }).format(d);
    const monthName = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TIMEZONE, month: 'short' }).format(d);
    return { dayName, dayNumber, monthName };
  }
  return { dayName: '', dayNumber: '', monthName: '' };
}

