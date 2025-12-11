import type { Event } from '@/types/index.ts';
import { formatEventStart, getEventUrl } from '@/utils/eventUtils.ts';

// in frontend, we use React/ts components to render stuff, anything from a small button to a whole page
// therefore a lot of the code is going to be in /components/ and /pages/ folders as .tsx files. This 
// means "typescript extension", which allows us to do html shenanigans inside ts files.

// This file is specifically for a small event card, the ones that show up on the event list.

export function EventCard({ event }: { event: Event }) {
  return (
    // HTML Quick Intro:
    // p = paragraph
    // a = anchor, creates a link
    // h1 = header 1 (largest)
    // ul = list (unordered)
    // li = list item
    // div = division, creates an element 
    // label = text next to element
    // map = iterate over each event, for loop
    <a // this confusing syntax is JSX allow us to write html inside tsx files with React
      href={getEventUrl(event.id, event.eventURL)} // html link to the event
      target="_blank" // open in new tab
      rel="noopener noreferrer" // this is for security, prevents the new page from accessing the old page's window object
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link-primary)] rounded-xl"
      // the above class is pulling from tailwindcss, basically a very big styling library
    >
      {/* and here we invoke visuals with "div", which just means a "section" or "aspect" of our card */}
      {/* card */}
      <div className="bubble h-full flex flex-col gap-3">
        {/* layout: image on top, text below for a cleaner grid look */}
        <div className="w-full aspect-[16/9] overflow-hidden rounded-xl bg-[var(--button-hover)]">
          <img 
            src={event.coverImageUrl || '/dtuevent-logo.png'} 
            alt={event.title} 
            className="w-full h-full object-cover"
          />
        </div>
        {/* text column */}
        <div className="min-w-0 space-y-1">
          <div className="font-semibold text-primary truncate">{event.title}</div>
          <div className="text-sm text-subtle">{formatEventStart(event.startTime)}</div>
          <div className="text-sm text-body">{event.place?.name ?? 'Location TBA'}</div>
        </div>
      </div>
    </a>
  );
}


