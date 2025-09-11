import './App.css'
import { events, pages } from './data/mock'; // using mock data for now, no api calls
import { useState } from 'react';

function App() {
  const dateTimeFormatter = new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeStyle: 'short' });
  
  // Filtering
  const [pageId, setPageId] = useState<string>(''); 
  const filtered = pageId ? events.filter(e => e.pageId === pageId) : events; // if pageId is set, filter events by pageId. Else show all events
  const list = [...filtered].sort( // sort filtered events by start time
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // helper: prefer explicit URL; fallback to Facebook event URL built from id
  const getEventUrl = (id: string, url?: string) => url ?? `https://facebook.com/events/${id}`;

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

      {/* filter bar */}
      <div className="mb-6 flex items-center gap-3">
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
        {/* if the length is 1, don't show the 's' in 'events'*/}
        <span className="text-sm text-gray-600">{list.length} event{list.length === 1 ? '' : 's'}</span>
      </div>

      {/* if list is empty */}
      {list.length === 0 && (
        <p className="text-sm text-gray-600 mb-4">No events found for this page.</p>
      )}

      {/* list of events themselves */}
      <div className="space-y-3"> {/* vertical spacing between cards; basically padding */}
        {list.map(event => (
          /* LINK. a = anchor, creates a link */
          <a
            key={event.id} /* key must be stable + unique per item */
            href={getEventUrl(event.id, event.eventURL)} /* if the eventURL is not set, use the facebook event URL */
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
                  <div className="text-sm text-gray-600">{dateTimeFormatter.format(new Date(event.startTime))}</div>
                  <div className="text-sm">{event.place?.name ?? 'Location TBA'}</div>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default App
