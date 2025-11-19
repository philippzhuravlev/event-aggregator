import { useState, useEffect } from 'react';
import type { Event } from '@/types/index.ts';
import { formatEventStart, getEventUrl } from '@/utils/eventUtils.ts';

// in frontend, we use React/ts components to render stuff, anything from a small button to a whole page
// therefore a lot of the code is going to be in /components/ and /pages/ folders as .tsx files. This 
// means "typescript extension", which allows us to do html shenanigans inside ts files.

// This file is specifically for a small event card, the ones that show up on the event list.

const DEFAULT_IMAGE = '/dtuevent-logo.png';

// Helper function to check if a URL is valid and non-empty
function isValidImageUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.trim().length > 0;
}

export function EventCard({ event }: { event: Event }) {
  // Initialize with the event's cover image if it's valid, otherwise use default
  const [imageSrc, setImageSrc] = useState<string>(() => {
    return isValidImageUrl(event.coverImageUrl) ? event.coverImageUrl! : DEFAULT_IMAGE;
  });
  const [hasError, setHasError] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  // Update image source when event changes
  useEffect(() => {
    if (isValidImageUrl(event.coverImageUrl)) {
      setImageSrc(event.coverImageUrl!);
      setHasError(false);
      setShowPlaceholder(false);
    } else {
      setImageSrc(DEFAULT_IMAGE);
      setHasError(false);
      setShowPlaceholder(false);
    }
  }, [event.coverImageUrl]);

  const handleImageError = () => {
    if (imageSrc !== DEFAULT_IMAGE && !hasError) {
      // Try fallback image first
      setHasError(true);
      setImageSrc(DEFAULT_IMAGE);
    } else {
      // Both original and fallback failed, show placeholder
      setShowPlaceholder(true);
    }
  };

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
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      // the above class is pulling from tailwindcss, basically a very big styling library
    >
      {/* and here we invoke visuals with "div", which just means a "section" or "aspect" of our card */}
      {/* card */}
      <div className="border rounded p-4 hover:bg-gray-50 transition"> {/* this is just a card container from tailwindcss */}
        {/* layout: image to the left, text to the right*/}
        <div className="flex items-start gap-4">
          {/* event cover image with fallback to DTU logo */}
          {showPlaceholder ? (
            <div className="w-28 h-16 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-xs text-gray-500 text-center px-2">No Image</span>
            </div>
          ) : (
            <img 
              src={imageSrc} 
              alt={event.title} 
              className="w-28 h-16 object-cover rounded bg-gray-100" 
              onError={handleImageError}
              loading="lazy"
            />
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


