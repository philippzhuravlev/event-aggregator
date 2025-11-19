import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { normalizeEvent } from "@event-aggregator/shared/utils/event-normalizer.js";

const baseEvent = {
  id: "evt_1",
  name: "Sample Event",
  start_time: "2024-05-01T10:00:00Z",
};

Deno.test("normalizeEvent includes required identifiers and copies event data", () => {
  const normalized = normalizeEvent(baseEvent, "42");

  assertEquals(normalized.page_id, 42);
  assertEquals(normalized.event_id, "evt_1");
  assertEquals(normalized.event_data, {
    id: "evt_1",
    name: "Sample Event",
    start_time: "2024-05-01T10:00:00Z",
  });
});

Deno.test("normalizeEvent prefers processed cover images when provided", () => {
  const event = {
    ...baseEvent,
    cover: {
      id: "cover-1",
      source: "https://facebook.com/original.jpg",
    },
  };

  const normalized = normalizeEvent(
    event,
    "100",
    "https://cdn.example.com/processed.jpg",
  );

  assertEquals(normalized.event_data.cover, {
    id: "cover-1",
    source: "https://cdn.example.com/processed.jpg",
  });
});

Deno.test("normalizeEvent falls back to facebook cover when processed url missing", () => {
  const event = {
    ...baseEvent,
    cover: {
      id: "cover-2",
      source: "https://facebook.com/fallback.jpg",
    },
  };

  const normalized = normalizeEvent(event, "7");
  assertEquals(normalized.event_data.cover, {
    id: "cover-2",
    source: "https://facebook.com/fallback.jpg",
  });
});

Deno.test("normalizeEvent throws when page id is not numeric", () => {
  assertThrows(
    () => normalizeEvent(baseEvent, "abc"),
    Error,
    'Could not parse pageId "abc"',
  );
});

Deno.test("normalizeEvent includes optional fields when available", () => {
  const event = {
    ...baseEvent,
    description: "Extended description",
    end_time: "2024-05-01T12:00:00Z",
    place: {
      name: "Venue",
    },
  };

  const normalized = normalizeEvent(event, "5");
  assertEquals(normalized.event_data.description, "Extended description");
  assertEquals(normalized.event_data.end_time, "2024-05-01T12:00:00Z");
  assertEquals(normalized.event_data.place, { name: "Venue" });
});

Deno.test("normalizeEvent omits cover when neither processed or event cover provided", () => {
  const normalized = normalizeEvent(baseEvent, "12");
  assertEquals(normalized.event_data.cover, undefined);

  const normalizedWithNullCover = normalizeEvent(baseEvent, "12", null);
  assertEquals(normalizedWithNullCover.event_data.cover, undefined);
});

