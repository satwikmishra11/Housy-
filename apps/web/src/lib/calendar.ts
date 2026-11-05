/**
 * Pure utility to generate and trigger download of RFC 5545 compliant iCalendar (.ics) files.
 */

function formatUtcForIcs(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  startsAt: string; // ISO 8601 UTC timestamp
  endsAt: string; // ISO 8601 UTC timestamp
}

export function generateIcsContent(event: CalendarEvent): string {
  const start = formatUtcForIcs(new Date(event.startsAt));
  const end = formatUtcForIcs(new Date(event.endsAt));
  const now = formatUtcForIcs(new Date());
  const uid = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@housy.in`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Housy//Site Visit Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${event.location.replace(/\n/g, ', ')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcsCalendar(event: CalendarEvent, filename = 'site-visit.ics'): void {
  const icsContent = generateIcsContent(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

