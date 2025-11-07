import './App.css'
import { EventCard } from './components/EventCard';
import { EventFilters } from './components/EventFilters';
import { OAuthButton } from './components/OAuthButton';
import { useEventsData } from './hooks/useEventsData';
import { useEventFilters } from './hooks/useEventFilters';
import { useOAuthRedirect } from './hooks/useOAuthRedirect';
import { debugEnv } from './debug';

// Debug: Log environment variables on app load
if (typeof window !== 'undefined') {
  debugEnv();
}

function App() {
  // Load pages and events data
  const { pages, events, loading, error } = useEventsData();
  
  // Handle OAuth redirect from Facebook. This is done in a hook in /hooks/
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
    <div className="p-6 max-w-3xl mx-auto"> {/* padding 6, max width 3xl (xl = 768px), center horizontally */}
      {/* h1 = Header 1 */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">DTU Event</h1>
      </header>

      {/* Filter controls */}
      <EventFilters // EventFilters is actually a component we import from /components/; this displays the filter UI
        pages={pages} // the {} are "props", which are inputs in the component
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

      {/* Loading and error text in case we're in a loading or error state */}
      {loading && <p className="text-sm text-gray-600 mb-2">Loading…</p>}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {/* Empty state text */}
      {!loading && events.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">No events in the database yet. Sync events from Facebook to get started!</p>
      )}
      {!loading && events.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">No events found for this page.</p>
      )}

      {/* Event list text */}
      <div className="space-y-3">
        {filtered.map(event => ( // again, map = for each event in filtered events
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* OAuth connection button */}
      <OAuthButton />
    </div>
  );
}

export default App
