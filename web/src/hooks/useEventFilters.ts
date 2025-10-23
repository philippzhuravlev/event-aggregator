import { useState, useEffect, useMemo } from 'react';
import type { Event } from '../types';
import { parseDateOnly, startOfDayMs, endOfDayMs } from '../utils/eventUtils';

// "hooks" are a bit of an abstract but highly important frtontend concept in React.js.
// They allow us to "hook into" React features that are otherwise "stateless", meaning
// they don't have any internal memory of what happened before. For example, a button
// component (.tsx) doesn't remember if it was clicked before or not, unless we use hooks.
// So 80% of the time, hooks are used to add the functionality of a button, meanwhile 
// components are used to define the visuals.

// this hook specifically is used for all the event filtering stuff, including page filter,
// text search filter, and date range filter.

interface UseEventFiltersReturn { 
  // this interface defines what the hook returns. In TS/JS, interfaces are used to define
  // the types of an object, unlike in java/c#/etc where they define a contract for classes.
  filtered: Event[];
  pageId: string;
  setPageId: (id: string) => void; // => means "function that returns", in this case void
  query: string;
  setQuery: (q: string) => void; // NB: => is actually a TS shorthand that defines a function 
  fromDate: string;
  setFromDate: (date: string) => void; // so just writing => instead of function () { ... } etc
  toDate: string;
  setToDate: (date: string) => void;
  invalidRange: boolean;
}

/**
 * Hook to manage all event filtering logic:
 * - Page filtering
 * - Text search (debounced)
 * - Date range filtering
 */
export function useEventFilters(events: Event[]): UseEventFiltersReturn {
  // Page filter
  const [pageId, setPageId] = useState<string>('');  // empty string means "all pages"
  
  // Text search (debounced)
  // "debounced" means we wait for user to stop typing for a bit before applying the filter
  const [query, setQuery] = useState<string>('');  // again, empty string means "no filter"
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  
  // Date range filter
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Debounce text search
  // useEffect is a React hook that runs some code when certain values change, in our case 
  // the user types something
  useEffect(() => { // () => is confusing but it just means "function that does something"
    const id = setTimeout(() => { // wait 250ms after user stops typing
      setDebouncedQuery(query.trim().toLowerCase()); // then trip and lowercase what they typed
    }, 250);
    return () => clearTimeout(id); // removes timeout if user types again before 250ms
  }, [query]);

  // Calculate filtered results
  const filtered = useMemo(() => { // Memo means "remember the last result if inputs didn't change"
    // Step 1: Filter by pageId
    let result = pageId // if pageId is set, filter by it, otherwise return all events
      ? events.filter((e: Event) => e.pageId === pageId) // .filter method filters arrays by this condition:
      : events; // ? : notation means "if ... then ... else ...". So if pageId is set, filter, else return all events
      // the filtering will thus return only events whose event.pageId matches the selected pageId

    // Step 2: Filter by text search
    if (debouncedQuery) { // so if debouncedQuery is not empty str
      result = result.filter((event: Event) => { // .filter is a TS/JS method that filters arrays by...:
        const haystack = ( // "haystack" is frontend language for where we look for the "needle" (query)
          (event.title || '') + ' ' +
          (event.description || '') + ' ' +
          (event.place?.name || '') // concat all searchable fields
        ).toLowerCase();
        return haystack.includes(debouncedQuery);
      });
      // again, this whole filtering will return only events whose haystack includes the debouncedQuery
    }

    // Step 3: Filter by date range
    // parseDateOnly is a util that converts "yyyy-mm-dd" string to real Date object
    const fromObj = parseDateOnly(fromDate); 
    const toObj = parseDateOnly(toDate);
    const invalidRange = !!(fromObj && toObj && toObj < fromObj); // check if from is after to
    const effectiveToObj = invalidRange ? undefined : toObj; // if invalid, ignore toDate filter

    result = result.filter((event: Event) => { // filter again but this time by date range
      const eventMs = new Date(event.startTime).getTime();  // get event start time in ms
      if (fromObj && eventMs < startOfDayMs(fromObj)) return false;  // before fromDate (>)
      if (effectiveToObj && eventMs > endOfDayMs(effectiveToObj)) return false; // after toDate (<)
      return true; // otherwise include event (< and >)
    });
    // so we filtered event to only those that are within the date range

    // Step 4: Sort by start time
    return [...result].sort( //[...result] creates a copy of result array so we can send it to sort
      // ... means "spread operator" in TS/JS, which expands an array
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      // this confusing mess above is just how you sort an array in TS/JS by a certain property, in 
      // this case startTime. Again, => is just shorthand for "function that returns ..."
    );
  }, [events, pageId, debouncedQuery, fromDate, toDate]);

  // check if date range is invalid
  const fromObj = parseDateOnly(fromDate);
  const toObj = parseDateOnly(toDate);
  const invalidRange = !!(fromObj && toObj && toObj < fromObj); // !! converts to boolean
  // so if both dates are set and toDate is before fromDate, it's invalid

  return {
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
  };
}
