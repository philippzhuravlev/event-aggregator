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

/**
 * Parse a date string in YYYY-MM-DD format to a Date object
 */
export function parseDateOnly(value: string): Date | undefined {
  // the problem is YYYY-MM-DD is not directly parseable by TS/JS. Therefore, we need to 
  // put it into a Date object (which btw isn't much better, but at least works for filtering)
  // we do so by manually splitting the string and constructing a Date 
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number); // splitting by "-" and converting to numbers
  if (!y || !m || !d) return undefined; 
  return new Date(y, m - 1, d); // months start at 0 in the JS Date object. Told you it was messy
}

/**
 * Get the timestamp at the start of day (00:00:00.000)
 */
export function startOfDayMs(d: Date): number {
  // we create a new Date object at the start of the day and get its timestamp in ms
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Get the timestamp at the end of day (23:59:59.999)
 */
export function endOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

