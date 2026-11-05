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

