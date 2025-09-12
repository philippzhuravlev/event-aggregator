import type { Event } from '../types';
import { formatEventStart, getEventUrl } from '../utils/eventUtils';

// Small presentational card. Receives one event and renders a link + metadata.
export function EventCard({ event }: { event: Event }) {
  return (
    <a
      href={getEventUrl(event.id, event.eventURL)}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
    >
      {/* card */}
      <div className="border rounded p-4 hover:bg-gray-50 transition">
        {/* layout: optional image */}
        <div className="flex items-start gap-4">
          {event.coverImageUrl && (
            <img src={event.coverImageUrl} alt={event.title} className="w-28 h-16 object-cover rounded" />
          )}
          {/* text column */}
          <div className="min-w-0">
            <div className="font-semibold truncate">{event.title}</div>
            <div className="text-sm text-gray-600">{formatEventStart(event.startTime)}</div>
            <div className="text-sm">{event.place?.name ?? 'Location TBA'}</div>
          </div>
        </div>
      </div>
    </a>
  );
}


