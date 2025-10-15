// utils folder is for stuff that is used in multiple places, like constants, helper functions etc

// this file contains utility functions related to events, like formatting dates and constructing URLs

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


