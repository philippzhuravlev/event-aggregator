import React from 'react'; // Ensure JSX has React in scope for some TS configs
void React; // mark as used to satisfy linters when automatic JSX runtime isn't enabled
import type { Page } from '@/types/index.ts';
import { MultiSelectFilter } from './MultiSelectFilter.tsx';

// render a multi-select dropdown for pages
function PageFilter({ pages, pageIds, setPageIds }: { pages: Page[]; pageIds: string[]; setPageIds: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Organizer</label>
      <MultiSelectFilter
        pages={pages}
        selectedIds={pageIds}
        onSelectionChange={setPageIds}
      />
    </div>
  );
}

// render a search box with event count
function SearchBox({ query, setQuery, count }: { query: string; setQuery: (v: string) => void; count: number }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="q" className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Search</label>
      <div className="flex items-center gap-2">
        <input
          id="q"
          type="text"
          placeholder="Search events..."
          className="flex-1 px-4 py-2.5 rounded-lg border-2 input text-[var(--input-text)] bg-[var(--input-bg)] border-[var(--input-border)] focus:border-[var(--input-focus-border)] focus:outline-none focus:ring-3 focus:ring-[var(--button-hover)] transition-all duration-200"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="text-sm font-semibold text-[var(--text-subtle)] whitespace-nowrap px-3 py-2.5 bg-[var(--button-hover)] rounded-lg">{count}</span>
      </div>
    </div>
  );
}

// two simple date pickers (from / to) 
function DateRangeFilter({ fromDate, setFromDate, toDate, setToDate }: { fromDate: string; setFromDate: (v: string) => void; toDate: string; setToDate: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Date Range</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="flex-1 px-4 py-2.5 rounded-lg border-2 input text-[var(--input-text)] bg-[var(--input-bg)] border-[var(--input-border)] focus:border-[var(--input-focus-border)] focus:outline-none focus:ring-3 focus:ring-[var(--button-hover)] transition-all duration-200"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          title="Start date"
        />
        <span className="text-[var(--text-subtle)] font-medium px-2">→</span>
        <input
          type="date"
          className="flex-1 px-4 py-2.5 rounded-lg border-2 input text-[var(--input-text)] bg-[var(--input-bg)] border-[var(--input-border)] focus:border-[var(--input-focus-border)] focus:outline-none focus:ring-3 focus:ring-[var(--button-hover)] transition-all duration-200"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          title="End date"
        />
      </div>
    </div>
  );
}

export type SortMode = 'upcoming' | 'newest' | 'all';

// upcoming/newest filter 
function SortFilter({ sortMode, setSortMode }: { sortMode: SortMode; setSortMode: (v: SortMode) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="sort" className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Sort</label>
      <select
        id="sort"
        className="px-4 py-2.5 rounded-lg border-2 input text-[var(--input-text)] bg-[var(--input-bg)] border-[var(--input-border)] focus:border-[var(--input-focus-border)] focus:outline-none focus:ring-3 focus:ring-[var(--button-hover)] transition-all duration-200 cursor-pointer"
        value={sortMode}
        onChange={e => setSortMode(e.target.value as SortMode)}
      >
        <option value="all">All</option>
        <option value="upcoming">Upcoming</option>
        <option value="newest">Newest</option>
      </select>
    </div>
  );
}

// main component combining the filters
export function FilterBar(props: {
  pages: Page[]; // pages to show
  pageIds: string[]; // currently selected organizer ids
  setPageIds: (v: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  count: number;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
}) {
  return (
    <div className="space-y-6">

      {/* Filter container with DTU colors and glassmorphism */}
      <div className="backdrop-filter backdrop-blur-md bg-[var(--panel-bg)] border border-[var(--panel-border)] rounded-2xl p-6 shadow-lg transition-all duration-300">
        {/* Row 1: Organizer, Search, Sort */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-6">
          <div className="md:col-span-1 lg:col-span-1">
            <PageFilter pages={props.pages} pageIds={props.pageIds} setPageIds={props.setPageIds} />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <SearchBox query={props.query} setQuery={props.setQuery} count={props.count} />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            <SortFilter sortMode={props.sortMode} setSortMode={props.setSortMode} />
          </div>
        </div>

        {/* Row 2: Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-2 gap-6">
          <div className="md:col-span-3 lg:col-span-1">
            <DateRangeFilter
              fromDate={props.fromDate}
              setFromDate={props.setFromDate}
              toDate={props.toDate}
              setToDate={props.setToDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
