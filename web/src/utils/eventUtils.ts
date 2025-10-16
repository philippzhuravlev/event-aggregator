// utils folder is for stuff that is used in multiple places, like constants, helper functions etc

// this file contains utility functions related to events, like formatting dates and constructing URLs

const dateTimeFormatter = new Intl.DateTimeFormat('da-DK', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatEventStart(iso?: string | null): string {
  // Guard against missing/invalid inputs. Intl.DateTimeFormat.format throws
  // a RangeError when given an invalid date (getTime() is NaN).
  if (!iso) return '';
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return '';
  return dateTimeFormatter.format(d);
}

export function getEventUrl(id: string, explicit?: string): string {
  return explicit ?? `https://facebook.com/events/${id}`;
}


