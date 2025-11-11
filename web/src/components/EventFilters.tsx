import type { Page } from '@/types/index.ts';

// in frontend, we use React/ts components to render stuff, anything from a small button to a whole page
// therefore a lot of the code is going to be in /components/ and /pages/ folders as .tsx files. This 
// means "typescript extension", which allows us to do html shenanigans inside ts files.

// This file is specifically for the event filtering strip at the top of the event list,
// including page dropdown, search input, and date range stuff

interface EventFiltersProps {
  // interfaces like these define the types of our component props (inputs). Props are how components get data
  // from their parents, e.g. App.tsx passing down the pages and filter state to this EventFilters component. 
  // Note that in TS/JS, interfaces are used to define the types of an object, unlike in java/c#/etc where they
  // define a contract for classes.
  pages: Page[]; // i.e. an array of Page objects
  pageId: string;
  setPageId: (id: string) => void; // => is a function that takes string and returns void
  query: string;
  setQuery: (q: string) => void; // so just writing => instead of function () { ... } etc
  fromDate: string;
  setFromDate: (date: string) => void; 
  toDate: string;
  setToDate: (date: string) => void;
  resultCount: number;
  invalidRange: boolean;
}

/**
 * Event filtering UI component
 * Contains page dropdown, search input, and date range filters
 */
export function EventFilters({
  pages,
  pageId,
  setPageId,
  query,
  setQuery,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  resultCount,
  invalidRange,
}: EventFiltersProps) {
  return (
    <>
      {/* Filter bar row 1: Page and Search */}
      <div className="mb-2 flex flex-wrap items-center gap-3"> 
        {/* mb = margin [at the] bottom, gap = space between items */}
        <label htmlFor="page" className="text-sm font-medium">Page</label>
        {/* htmlFor just a label*/}
        <select // select dropdown for pages
          id="page" // label
          className="border rounded px-2 py-1" // looks
          value={pageId} // actual name 
          onChange={e => setPageId(e.target.value)} // when changed, call setPageId with new value
        >
          <option value="">All</option> {/* default option; empty string means no filter is applied */}
          {pages.map((p: Page) => ( // bit confusing, but "map" here is old HTML speak for a for loop
            // specifically "for each" page p of type Page, defined above in the interface
            <option key={p.id} value={p.id}>{p.name}</option> 
            // in HTML, option tags define the options in a dropdown. key is needed for React to track items in a list
          ))}
        </select> {/* ^^^ that's what happens when you select an option */}

        {/* Search input */}
        <label htmlFor="q" className="text-sm font-medium">Search</label> 
        {/* again, label as "q" as text with medium font. sm = small */}
        <input
          id="q" // use the label "q" defined above
          type="text"
          placeholder="Search events"
          className="border rounded px-2 py-1 w-56"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        
        {/* Result count */}
        <span className="text-sm text-gray-600">
          {resultCount} event{resultCount === 1 ? '' : 's'}
        </span>
      </div>

      {/* Filter bar row 2: Date range */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
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

      {/* Invalid range warning */}
      {invalidRange && (
        <p className="text-xs text-red-600 mb-2">
          End date is before start date. Showing results up to any end date.
        </p>
      )}
    </>
  );
}
