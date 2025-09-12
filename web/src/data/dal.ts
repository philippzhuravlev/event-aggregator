import type { Event, Page } from '../types';
import { events as mockEvents, pages as mockPages } from './mock';

// Data Access Layer (client-side). Today: returns mock data asynchronously.
// Later: swap implementation to call Firestore / API.

export async function getPages(): Promise<Page[]> {
  // simulate latency
  await new Promise(r => setTimeout(r, 100));
  return mockPages;
}

export async function getEvents(): Promise<Event[]> {
  // simulate latency
  await new Promise(r => setTimeout(r, 150));
  return mockEvents;
}


