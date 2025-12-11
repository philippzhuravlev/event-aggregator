import { EventCard } from './EventCard.tsx'; // renders individual event cards
import type { Event as EventType } from '@/types/index.ts'; // imports the type for event

// function to returns a list of event cards (list is an array of EventType) 
export function EventList({ list }: { list: EventType[] }) {
  if (list.length === 0) { // check if there are no events in the list
    return <p className="text-sm text-[var(--text-subtle)] mb-4 text-center py-8">No events found for this page.</p>;
  }
  return (
    <div className="page">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {list.map(e => <EventCard key={e.id} event={e} />)}
      </div>
    </div>
  );
}
