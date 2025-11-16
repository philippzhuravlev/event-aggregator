import { describe, expect, it } from "vitest";
import { normalizeEvent } from "../../src/utils/event-normalizer-util.ts";
import type { FacebookEvent } from "../../src/types.ts";

const baseEvent: FacebookEvent = {
  id: "123",
  name: "Sample Event",
  start_time: "2024-05-01T10:00:00Z",
};

describe("event-normalizer-util", () => {
  it("normalizes a basic event with required fields", () => {
    const normalized = normalizeEvent(baseEvent, "42");

    expect(normalized.page_id).toBe(42);
    expect(normalized.event_id).toBe("123");
    expect(normalized.event_data).toEqual({
      id: "123",
      name: "Sample Event",
      start_time: "2024-05-01T10:00:00Z",
    });
  });

  it("includes optional fields and prefers provided cover image", () => {
    const event: FacebookEvent = {
      ...baseEvent,
      description: "An extended description",
      end_time: "2024-05-01T12:00:00Z",
      place: {
        name: "Main Hall",
      },
      cover: {
        id: "cover-1",
        source: "https://facebook.com/image.jpg",
        offset_x: 0,
        offset_y: 0,
      },
    };

    const normalized = normalizeEvent(
      event,
      "101",
      "https://cdn.example.com/processed.jpg",
    );

    expect(normalized.page_id).toBe(101);
    expect(normalized.event_data).toEqual({
      id: "123",
      name: "Sample Event",
      start_time: "2024-05-01T10:00:00Z",
      description: "An extended description",
      end_time: "2024-05-01T12:00:00Z",
      place: {
        name: "Main Hall",
      },
      cover: {
        id: "cover-1",
        source: "https://cdn.example.com/processed.jpg",
      },
    });
  });

  it("falls back to the facebook cover when processed cover is missing", () => {
    const event: FacebookEvent = {
      ...baseEvent,
      cover: {
        id: "cover-2",
        source: "https://facebook.com/original.jpg",
        offset_x: 10,
        offset_y: 20,
      },
    };

    const normalized = normalizeEvent(event, "7");

    expect(normalized.event_data.cover).toEqual({
      id: "cover-2",
      source: "https://facebook.com/original.jpg",
    });
  });

  it("throws when page id is not numeric", () => {
    expect(() => normalizeEvent(baseEvent, "abc")).toThrowError(
      '[normalizeEvent] Could not parse pageId "abc" for event 123',
    );
  });
});



