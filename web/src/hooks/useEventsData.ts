import { useEffect, useState } from "react";
import { getEvents, getPages } from "@/services/dal.ts";

/**
 * Hook to load pages and events data asynchronously
 * Returns loading state, error state, and the loaded data
 */
export function useEventsData() {
  // states for pages, events, loading and error. It's a bit verbose but
  // Awaited and ReturnType are TS utilities to infer types from async functions.
  // Async functions always return a Promise object, and the type inside Awaited<...>
  // is what we'll extract (as a []) from that promise, straight into pages or events
  const [pages, setPages] = useState(
    [] as Awaited<ReturnType<typeof getPages>>,
  );
  const [events, setEvents] = useState(
    [] as Awaited<ReturnType<typeof getEvents>>,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => { // again, () => just means "when this happens, do this"
    let cancelled = false;

    (async () => { // async programming is a whole topic on its own, but basically, it lets
      // us wait for things to finish (like networks sending stuff back and forth) before
      // continuing our code execution, without blocking the entire browser in the meantime.
      // async functions like this one (indeed, => is just shorthand for function() { ... })
      // return a Promise object. We'll have to extract the actual data from that Promise obj
      try {
        setLoading(true);
        const [page, event] = await Promise.all([ // await means "wait for this to finish":
          // Promise.all lets us run multiple async things in parallel, speeding up loading times
          getPages(), // so "wait for both getPages and getEvents to finish"
          getEvents({ upcoming: false }),
          // TODO: When in prod, remove upcoming: false. this is just in here for testing so we can
          // see past events as well!
        ]);
        if (cancelled) return;
        setPages(page);
        setEvents(event);
      } catch (err) {
        if (cancelled) return;
        const message = (err instanceof Error && err.message)
          ? err.message
          : "Failed to load data";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })(); // () at the end just means "run this function immediately"

    return () => { // cleanup action we run
      cancelled = true;
    };
  }, []);

  return { pages, events, loading, error };
}
