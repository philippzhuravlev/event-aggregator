import './App.css'
import { useEffect, useState } from 'react';
import { EventCard } from './components/EventCard';
import { getEvents, getPages } from './data/dal'; // async data access layer

function App() {
  
  // Data state (loaded asynchronously). 
  // having a data access layer like this (dal) makes the code cleaner/reusable.
  const [pages, setPages] = useState([] as Awaited<ReturnType<typeof getPages>>);
  const [events, setEvents] = useState([] as Awaited<ReturnType<typeof getEvents>>);
  const [loading, setLoading] = useState(true);   // loading indicator
  const [error, setError] = useState<string>(''); // simple error string

  // Facebook OAuth
  const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID;
  const FB_REDIRECT_URI = encodeURIComponent('https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback');
  const FB_SCOPES = [
    'pages_show_list',
    'pages_read_engagement'
    //'pages_manage_events'
  ].join(',');

  function buildFacebookLoginUrl() {
    return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${FB_REDIRECT_URI}&scope=${FB_SCOPES}`;
  }

  // load data on mount. "mount" = when the component is created/loaded. Done asynchronously. 
  useEffect(() => {
    let cancelled = false; // if the component is "unmounted", i.e. deleted, we don't want to set the state.
    (async () => {
      try {
        setLoading(true); // show loading indicator
        const [page, event] = await Promise.all([getPages(), getEvents()]); // promise used for async code
        if (cancelled) return; 
        setPages(page); 
        setEvents(event); // set the data
      } catch (err) {
        if (cancelled) return;
        const message = (err instanceof Error && err.message) ? err.message : 'Failed to load data';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, []);

  // Filtering
  const [pageId, setPageId] = useState<string>(''); 
  const filtered = pageId ? events.filter(e => e.pageId === pageId) : events; // if pageId is set, filter events by pageId. Else show all events

  // Text search (debounced)
  // debounce = wait for a short delay after typing stops before updating the search query
  const [query, setQuery] = useState<string>(''); // what's typed in the search box
  const [debouncedQuery, setDebouncedQuery] = useState<string>(''); // updates after a short delay
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 250); // wait 250ms after typing stops
    return () => clearTimeout(id); // cleanup if user keeps typing
  }, [query]);

  // Apply text filter on title/description/place
 
  const textFiltered = debouncedQuery
    ? filtered.filter(event => {
        const haystack = (  // "haystack" = the text we're searching in
          (event.title || '') + ' ' +
          (event.description || '') + ' ' +
          (event.place?.name || '')
        ).toLowerCase();
        return haystack.includes(debouncedQuery);
      })
    : filtered;

  // Date range filtering (from/to)
  // input values are YYYY-MM-DD; we compare event startTime against day boundaries
  const [fromDate, setFromDate] = useState<string>(''); // inclusive
  const [toDate, setToDate] = useState<string>('');     // inclusive

  // helpers to parse and compute day boundaries
  const parseDateOnly = (value: string) => {
    if (!value) return undefined;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  };
  const startOfDayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const endOfDayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

  const fromObj = parseDateOnly(fromDate);
  const toObj = parseDateOnly(toDate);
  const invalidRange = !!(fromObj && toObj && toObj < fromObj);

  // If the range is invalid, ignore the 'to' bound to avoid hiding everything
  const effectiveToObj = invalidRange ? undefined : toObj;

  const dateFiltered = textFiltered.filter(event => {
    const eventMs = new Date(event.startTime).getTime();
    if (fromObj && eventMs < startOfDayMs(fromObj)) return false;
    if (effectiveToObj && eventMs > endOfDayMs(effectiveToObj)) return false;
    return true;
  });

  const list = [...dateFiltered].sort( // sort filtered events by start time
    // "a" and "b" are the two events we're comparing in the filtering process
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // HTML Quick Intro:
  // p = paragraph
  // a = anchor, creates a link
  // h1 = header 1 (largest)
  // ul = list (unordered)
  // li = list item
  // div = division, creates an element 
  // label = text next to element
  // map = iterate over each event, kind of like a for loop
  return (
    <div className="p-6 max-w-3xl mx-auto"> {/* page container: padding + centered + width */}
      {/* header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">DTU Events</h1>
      </header>

      {/* filter bar (row 1: Page then Search inline) */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label htmlFor="page" className="text-sm font-medium">Page</label> {/* label's htmlFor must match select id */}
        {/* the little dropdown menu itself. */}
        {/* border = border around the dropdown menu. rounded = rounded corners. px-2 py-1 = padding. */}
        <select
          id="page"
          className="border rounded px-2 py-1"
          value={pageId}
          onChange={e => setPageId(e.target.value)}
        >
          {/* option = each item in the dropdown menu */}
          {/* value = what's selected. onChange = what to do when selected*/}
          <option value="">All</option>
          {pages.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* search box follows Page */}
        <label htmlFor="q" className="text-sm font-medium">Search</label> {/* label next to input */}
        <input
          id="q"
          type="text"
          placeholder="Search events"
          className="border rounded px-2 py-1 w-56"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {/* if the length is 1, don't show the 's' in 'events'*/}
        <span className="text-sm text-gray-600">{list.length} event{list.length === 1 ? '' : 's'}</span>
      </div>

      {/* filter bar (row 2: date range below Page and Search) */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* date range (from/to). Both are inclusive. */}
        <label htmlFor="from" className="text-sm font-medium">From</label>
        <input
          id="from"
          type="date"
          className="border rounded px-2 py-1"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
        />
        <label htmlFor="to" className="text-sm font-medium">To</label>
        <input
          id="to"
          type="date"
          className="border rounded px-2 py-1"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
        />
      </div>

      {/* loading and error */}
      {loading && (
        <p className="text-sm text-gray-600 mb-2">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}

      {/* show a tiny message if the date range is invalid */}
      {invalidRange && (
        <p className="text-xs text-red-600 mb-2">End date is before start date. Showing results up to any end date.</p>
      )}

      {/* if list is empty */}
      {list.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">No events found for this page.</p>
      )}

      {/* list of events themselves */}
      <div className="space-y-3"> {/* vertical spacing between cards; basically padding */}
        {list.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      <div className="mb-4">
        <a
          href={buildFacebookLoginUrl()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
        >
          Connect Facebook Page
        </a>
      </div>

    </div>
  );
}

export default App
