import type { Event, Page } from '../types';
import { events as mockEvents, pages as mockPages } from './mock';

// Data Access Layer (client-side). Today: returns mock data asynchronously.
// Later: swap implementation to call Firestore / API.

const useFirestore = (String((import.meta as any).env?.VITE_USE_FIRESTORE || '')).toLowerCase() === 'true';

export async function getPages(): Promise<Page[]> {
  if (!useFirestore) {
    await new Promise(r => setTimeout(r, 100));
    return mockPages;
  }
  const { db } = await import('../lib/firebase');
  const { collection, getDocs } = await import('firebase/firestore');
  const snap = await getDocs(collection(db, 'pages'));
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: data.name,
      url: data.url,
      active: !!data.active,
    } satisfies Page;
  });
}

function toIso(value: any | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
}

export async function getEvents(): Promise<Event[]> {
  if (!useFirestore) {
    await new Promise(r => setTimeout(r, 150));
    return mockEvents;
  }
  const { db } = await import('../lib/firebase');
  const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
  const q = query(collection(db, 'events'), orderBy('startTime'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      pageId: data.pageId,
      title: data.title,
      description: data.description,
      startTime: toIso(data.startTime) as string,
      endTime: toIso(data.endTime),
      place: data.place,
      coverImageUrl: data.coverImageUrl,
      eventURL: data.eventURL,
      createdAt: toIso(data.createdAt) as string,
      updatedAt: toIso(data.updatedAt) as string,
    } satisfies Event;
  });
}


