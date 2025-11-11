/**
 * HomePage - Main application page
 * Displays event list with filters and OAuth connection
 */

import { EventCard } from '@/components/EventCard.tsx';
import { EventFilters } from '@/components/EventFilters.tsx';
import { OAuthButton } from '@/components/OAuthButton.tsx';
import { useEventsData } from '@/hooks/useEventsData.ts';
import { useEventFilters } from '@/hooks/useEventFilters.ts';
import { useOAuthRedirect } from '@/hooks/useOAuthRedirect.ts';

export function HomePage() {
  // Load pages and events data
  const { pages, events, loading, error } = useEventsData();

  // Handle OAuth redirect from Facebook
  useOAuthRedirect();

  // Filter events by page, search query, and date range
  const {
    filtered,
    pageId,
    setPageId,
    query,
    setQuery,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    invalidRange,
  } = useEventFilters(events);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">DTU Event</h1>
      </header>

      {/* Filter controls */}
      <EventFilters
        pages={pages}
        pageId={pageId}
        setPageId={setPageId}
        query={query}
        setQuery={setQuery}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        resultCount={filtered.length}
        invalidRange={invalidRange}
      />

      {/* Loading and error states */}
      {loading && <p className="text-sm text-gray-600 mb-2">Loading…</p>}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {/* Empty state messages */}
      {!loading && events.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">
          No events in the database yet. Sync events from Facebook to get started!
        </p>
      )}
      {!loading && events.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">
          No events found for this page.
        </p>
      )}

      {/* Event list */}
      <div className="space-y-3">
        {filtered.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* OAuth connection button */}
      <OAuthButton />
    </div>
  );
}

