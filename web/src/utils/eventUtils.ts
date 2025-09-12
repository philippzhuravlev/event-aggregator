// Utilities for event rendering and formatting

const dateTimeFormatter = new Intl.DateTimeFormat('da-DK', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatEventStart(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function getEventUrl(id: string, explicit?: string): string {
  return explicit ?? `https://facebook.com/events/${id}`;
}


