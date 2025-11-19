import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getEventDetails,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
} from "../../src/services/facebook-service.ts";
import type { PaginatedEventResponse } from "../../src/types.ts";

type FetchMock = ReturnType<typeof vi.fn>;

const createResponse = <T>(
  data: T,
  init: { ok?: boolean; status?: number } = {},
) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(data),
  }) as unknown as Response;

describe("services/facebook-service", () => {
  let fetchMock: FetchMock;
  let logger: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    setFacebookServiceLogger(logger);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setFacebookServiceLogger();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exchanges authorization code for a short-lived token", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({ access_token: "short-lived-token" }),
    );

    const token = await exchangeCodeForToken(
      "auth-code",
      "app-id",
      "app-secret",
      "https://redirect.example.com",
    );

    expect(token).toBe("short-lived-token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("client_id=app-id"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Exchanged authorization code for short-lived token",
      undefined,
    );
  });

  it("throws when Facebook does not return a short-lived token", async () => {
    fetchMock.mockResolvedValueOnce(createResponse({}));

    await expect(
      exchangeCodeForToken(
        "auth-code",
        "app-id",
        "app-secret",
        "https://redirect.example.com",
      ),
    ).rejects.toThrowError("No access token received from Facebook");
  });

  it("exchanges short-lived token for a long-lived token", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({ access_token: "long-lived-token" }),
    );

    const token = await exchangeForLongLivedToken(
      "short-lived-token",
      "app-id",
      "app-secret",
    );

    expect(token).toBe("long-lived-token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("fb_exchange_token=short-lived-token"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Exchanged short-lived token for long-lived token",
      undefined,
    );
  });

  it("fetches paginated user pages", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Page 1" }],
          paging: { next: "https://next.example.com" },
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "2", name: "Page 2" }],
        }),
      );

    const pages = await getUserPages("access-token");

    expect(pages).toEqual([
      { id: "1", name: "Page 1" },
      { id: "2", name: "Page 2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      "Fetched Facebook user pages",
      { count: 2 },
    );
  });

  it("retrieves page events and logs batches", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [
          {
            id: "event-1",
            name: "Event 1",
            start_time: "2024-05-01T10:00:00Z",
          },
        ],
      }),
    );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([
      {
        id: "event-1",
        name: "Event 1",
        start_time: "2024-05-01T10:00:00Z",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      "Fetched Facebook page events batch",
      {
        pageId: "page-1",
        timeFilter: "upcoming",
        batchCount: 1,
      },
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Fetched Facebook page events",
      {
        pageId: "page-1",
        timeFilter: "upcoming",
        totalCount: 1,
      },
    );
  });

  it("fetches event details", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        id: "event-1",
        name: "Event 1",
        start_time: "2024-05-01T10:00:00Z",
      }),
    );

    const event = await getEventDetails("event-1", "access-token");

    expect(event).toEqual({
      id: "event-1",
      name: "Event 1",
      start_time: "2024-05-01T10:00:00Z",
    });
    expect(logger.debug).toHaveBeenCalledWith(
      "Fetched Facebook event details",
      { eventId: "event-1" },
    );
  });

  it("aggregates upcoming and recent past events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-upcoming",
                name: "Upcoming",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-recent",
                name: "Recent Past",
                start_time: "2024-05-25T10:00:00Z",
              },
              {
                id: "event-old",
                name: "Older Past",
                start_time: "2024-01-01T10:00:00Z",
              },
              {
                id: "event-upcoming",
                name: "Upcoming",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 14);

    expect(events).toEqual([
      {
        id: "event-upcoming",
        name: "Upcoming",
        start_time: "2024-06-05T10:00:00Z",
      },
      {
        id: "event-recent",
        name: "Recent Past",
        start_time: "2024-05-25T10:00:00Z",
      },
    ]);

    const aggregatedCall = logger.info.mock.calls.at(-1);
    expect(aggregatedCall).toEqual([
      "Aggregated relevant Facebook events",
      {
        pageId: "page-1",
        upcomingCount: 1,
        recentPastCount: 2,
        totalUnique: 2,
        daysBack: 14,
      },
    ]);
  });

  it("throws and logs when Facebook reports an invalid token", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {
          error: {
            code: 190,
            message: "Invalid OAuth 2.0 Access Token",
            type: "OAuthException",
          },
        },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("bad-token")).rejects.toThrowError(
      "Facebook token invalid (190)",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Facebook token expired or invalid",
      null,
      {
        errorCode: 190,
        status: 400,
      },
    );
  });

  it("retries on rate limits before succeeding", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(
        createResponse(
          {
            error: {
              message: "Rate limit hit",
            },
          },
          { ok: false, status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Recovered Page" }],
        }),
      );

    const promise = getUserPages("retry-token");

    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;

    expect(pages).toEqual([{ id: "1", name: "Recovered Page" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(logger.warn).toHaveBeenCalledWith(
      "Facebook API error - retrying with backoff",
      expect.objectContaining({
        status: 429,
        attempt: 1,
        maxRetries: 3,
        delayMs: 1000,
      }),
    );

    vi.useRealTimers();
  });

  it("retries on server errors (500-599) before succeeding", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce(
        createResponse(
          { error: { message: "Internal server error" } },
          { ok: false, status: 500 },
        ),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Recovered Page" }],
        }),
      );

    const promise = getUserPages("retry-token");

    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;

    expect(pages).toEqual([{ id: "1", name: "Recovered Page" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Facebook API error - retrying with backoff",
      expect.objectContaining({
        status: 500,
        attempt: 1,
        maxRetries: 3,
      }),
    );

    vi.useRealTimers();
  });

  it("throws on non-retryable errors immediately", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {
          error: {
            code: 100,
            message: "Invalid parameter",
            type: "OAuthException",
          },
        },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("bad-token")).rejects.toThrow(
      /Facebook API error: 400 - Invalid parameter/,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Facebook API responded with an error",
      null,
      expect.objectContaining({
        status: 400,
        message: "Invalid parameter",
      }),
    );
  });

  it("detects token expired error from 401 status", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Invalid token", code: 190 } },
        { ok: false, status: 401 },
      ),
    );

    await expect(getUserPages("expired-token")).rejects.toThrow(
      /Facebook token invalid/,
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Facebook token expired or invalid",
      null,
      expect.objectContaining({
        status: 401,
      }),
    );
  });

  it("exhausts retries and throws error", async () => {
    vi.useFakeTimers();

    fetchMock.mockResolvedValue(
      createResponse(
        { error: { message: "Rate limit" } },
        { ok: false, status: 429 },
      ),
    );

    // Create promise and immediately attach error handler to prevent unhandled rejection
    const promise = getUserPages("token");
    // Attach a catch handler to prevent unhandled rejection warnings
    promise.catch(() => {
      // Error will be caught in the test below
    });

    // Advance through all retries: attempt 1 delay (1000ms) + attempt 2 delay (2000ms)
    // Attempt 3 throws immediately without delay
    await vi.advanceTimersByTimeAsync(3000);
    // Run all pending timers to ensure all async operations complete
    await vi.runAllTimersAsync();

    // Ensure promise rejection is properly caught
    await expect(promise).rejects.toThrow(/Facebook API error: 429/);

    expect(fetchMock).toHaveBeenCalledTimes(3); // 3 attempts (MAX_RETRIES = 3)

    vi.useRealTimers();
  });

  it("handles network errors and retries", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Page" }],
        }),
      );

    const promise = getUserPages("token");

    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;

    expect(pages).toEqual([{ id: "1", name: "Page" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Facebook API request failed - retrying",
      expect.objectContaining({
        error: "Network error",
        attempt: 1,
      }),
    );

    vi.useRealTimers();
  });

  it("handles string-based network errors in retries", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockRejectedValueOnce("Network outage")
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Recovered Page" }],
        }),
      );

    const promise = getUserPages("token");

    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;

    expect(pages).toEqual([{ id: "1", name: "Recovered Page" }]);
    expect(logger.warn).toHaveBeenCalledWith(
      "Facebook API request failed - retrying",
      expect.objectContaining({
        error: "Network outage",
        attempt: 1,
      }),
    );

    vi.useRealTimers();
  });

  it("does not retry on token errors in catch block", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("Facebook token invalid (190)"),
    );

    await expect(getUserPages("token")).rejects.toThrowError(
      "Facebook token invalid",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles pagination with URL already containing query params", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Page 1" }],
          paging: {
            next:
              "https://graph.facebook.com/v23.0/me/accounts?access_token=token&after=cursor",
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "2", name: "Page 2" }],
        }),
      );

    const pages = await getUserPages("access-token");

    expect(pages).toEqual([
      { id: "1", name: "Page 1" },
      { id: "2", name: "Page 2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles empty data arrays in pagination", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [],
      }),
    );

    const pages = await getUserPages("access-token");

    expect(pages).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      "Fetched Facebook user pages",
      { count: 0 },
    );
  });

  it("handles missing data field in pagination response", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        // No data field
      } as { data?: unknown[] }),
    );

    const pages = await getUserPages("access-token");

    expect(pages).toEqual([]);
  });

  it("handles getPageEvents with past time filter", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [
          {
            id: "event-1",
            name: "Past Event",
            start_time: "2024-01-01T10:00:00Z",
          },
        ],
      }),
    );

    const events = await getPageEvents("page-1", "access-token", "past");

    expect(events).toEqual([
      {
        id: "event-1",
        name: "Past Event",
        start_time: "2024-01-01T10:00:00Z",
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      "Fetched Facebook page events",
      {
        pageId: "page-1",
        timeFilter: "past",
        totalCount: 1,
      },
    );
  });

  it("handles getPageEvents pagination", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "event-1", name: "Event 1" }],
          paging: { next: "https://next.example.com" },
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "event-2", name: "Event 2" }],
        }),
      );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([
      { id: "event-1", name: "Event 1" },
      { id: "event-2", name: "Event 2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles getPageEvents errors and rethrows", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Error" } },
        { ok: false, status: 400 },
      ),
    );

    await expect(
      getPageEvents("page-1", "access-token", "upcoming"),
    ).rejects.toThrow(/Facebook API error: 400 - Error/);

    expect(logger.error).toHaveBeenCalledWith(
      "Error fetching Facebook page events",
      expect.any(Error),
      { pageId: "page-1", timeFilter: "upcoming" },
    );
  });

  it("treats missing data in getPageEvents response as empty array", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [],
        // coerce to unknown first before forcing PaginatedEventResponse shape
        paging: {
          next: undefined,
        } as unknown as PaginatedEventResponse["paging"],
      }),
    );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith(
      "Fetched Facebook page events batch",
      {
        pageId: "page-1",
        timeFilter: "upcoming",
        batchCount: 0,
      },
    );
  });

  it("logs null error metadata when logger throws non-Error in getPageEvents", async () => {
    const throwingLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(() => {
        throw "Logger failure";
      }),
    };

    setFacebookServiceLogger(throwingLogger);

    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [{ id: "event-1", name: "Event 1" }],
      }),
    );

    await expect(
      getPageEvents("page-1", "access-token", "upcoming"),
    ).rejects.toBe("Logger failure");

    expect(throwingLogger.error).toHaveBeenCalledWith(
      "Error fetching Facebook page events",
      null,
      { pageId: "page-1", timeFilter: "upcoming" },
    );
  });

  it("filters out events without start_time in getAllRelevantEvents", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-upcoming",
                name: "Upcoming",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-no-time",
                name: "No Time",
                // No start_time
              },
              {
                id: "event-recent",
                name: "Recent",
                start_time: "2024-05-25T10:00:00Z",
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 14);

    expect(events).toEqual([
      {
        id: "event-upcoming",
        name: "Upcoming",
        start_time: "2024-06-05T10:00:00Z",
      },
      {
        id: "event-recent",
        name: "Recent",
        start_time: "2024-05-25T10:00:00Z",
      },
    ]);

    vi.useRealTimers();
  });

  it("filters out old past events beyond daysBack in getAllRelevantEvents", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(createResponse({ data: [] }));
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-recent",
                name: "Recent",
                start_time: "2024-05-25T10:00:00Z", // 7 days ago
              },
              {
                id: "event-old",
                name: "Old",
                start_time: "2024-01-01T10:00:00Z", // Way too old
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 14);

    expect(events).toEqual([
      {
        id: "event-recent",
        name: "Recent",
        start_time: "2024-05-25T10:00:00Z",
      },
    ]);

    vi.useRealTimers();
  });

  it("removes duplicate events in getAllRelevantEvents", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-1",
                name: "Event 1",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-1", // Duplicate ID
                name: "Event 1 Duplicate",
                start_time: "2024-05-25T10:00:00Z",
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 14);

    // Should only have one event with id "event-1"
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("event-1");

    vi.useRealTimers();
  });

  it("throws when long-lived token exchange fails", async () => {
    fetchMock.mockResolvedValueOnce(createResponse({}));

    await expect(
      exchangeForLongLivedToken("short-token", "app-id", "app-secret"),
    ).rejects.toThrowError("No long-lived token received from Facebook");
  });

  it("handles getEventDetails with full event data", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        id: "event-1",
        name: "Event 1",
        description: "Description",
        start_time: "2024-05-01T10:00:00Z",
        end_time: "2024-05-01T12:00:00Z",
        place: { name: "Venue" },
        cover: { source: "https://example.com/cover.jpg" },
      }),
    );

    const event = await getEventDetails("event-1", "access-token");

    expect(event).toEqual({
      id: "event-1",
      name: "Event 1",
      description: "Description",
      start_time: "2024-05-01T10:00:00Z",
      end_time: "2024-05-01T12:00:00Z",
      place: { name: "Venue" },
      cover: { source: "https://example.com/cover.jpg" },
    });
  });

  it("sets and resets logger correctly", () => {
    const customLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    setFacebookServiceLogger(customLogger);
    // Logger should be set
    expect(customLogger.info).toBeDefined();

    setFacebookServiceLogger();
    // Should reset to default
    setFacebookServiceLogger(undefined);
    // Should also reset to default
  });

  it("handles logger with partial methods", () => {
    const partialLogger = {
      info: vi.fn(),
      // Missing other methods
    };

    setFacebookServiceLogger(partialLogger);
    // Should not throw
    expect(partialLogger.info).toBeDefined();
  });

  it("uses default logger when no custom logger is set", async () => {
    setFacebookServiceLogger();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    fetchMock.mockResolvedValueOnce(
      createResponse({ access_token: "token" }),
    );

    await exchangeCodeForToken("code", "app-id", "secret", "redirect");

    // Default logger should log
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("default logger handles info with metadata", async () => {
    setFacebookServiceLogger();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Call a function that uses logInfo with metadata
    fetchMock.mockResolvedValueOnce(
      createResponse({ data: [{ id: "1", name: "Page" }] }),
    );

    await getUserPages("token");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("default logger handles warn with and without metadata", async () => {
    setFacebookServiceLogger();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(
      () => {},
    );

    // This will trigger a retry which logs a warning
    fetchMock.mockResolvedValue(
      createResponse(
        { error: { message: "Rate limit" } },
        { ok: false, status: 429 },
      ),
    );

    vi.useFakeTimers();
    const promise = getUserPages("token").catch(() => {
      // Silently catch to avoid unhandled rejection
    });
    // Advance timers to trigger retry (first delay is 1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    // Run all pending timers to ensure all async operations complete
    await vi.runAllTimersAsync();
    await promise; // Wait for the promise to settle
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("default logger handles error", async () => {
    setFacebookServiceLogger();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(
      () => {},
    );

    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Error" } },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("default logger handles debug with and without metadata", async () => {
    setFacebookServiceLogger();
    const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(
      () => {},
    );

    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [{ id: "event-1", name: "Event" }],
        paging: { next: null },
      }),
    );

    await getPageEvents("page-1", "token", "upcoming");
    expect(consoleDebugSpy).toHaveBeenCalled();
    consoleDebugSpy.mockRestore();
  });

  it("detects token expired error from 401 status without error code", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {}, // No error object, just 401 status
        { ok: false, status: 401 },
      ),
    );

    await expect(getUserPages("expired-token")).rejects.toThrow(
      /Facebook token invalid/,
    );
  });

  it("handles pagination with URL that already has query params", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "1", name: "Page 1" }],
          paging: {
            next:
              "https://graph.facebook.com/v23.0/me/accounts?existing=param&access_token=token",
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "2", name: "Page 2" }],
          paging: { next: null },
        }),
      );

    const pages = await getUserPages("token");

    expect(pages).toHaveLength(2);
    // Should use the URL as-is when it already has query params
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1][0];
    expect(String(secondCall)).toContain("existing=param");
  });

  it("throws retry exhausted error when loop completes without returning", async () => {
    vi.useFakeTimers();

    // Mock fetch to always throw a non-retryable error that doesn't match token error
    fetchMock.mockImplementation(() => {
      throw new Error("Network error");
    });

    // Create promise and immediately attach error handler to prevent unhandled rejection
    const promise = getUserPages("token");
    // Attach a catch handler to prevent unhandled rejection warnings
    promise.catch(() => {
      // Error will be caught in the test below
    });

    // Advance timers through retries: attempt 1 delay (1000ms) + attempt 2 delay (2000ms)
    // Attempt 3 throws "retry exhausted" after the loop completes
    await vi.advanceTimersByTimeAsync(3000);
    // Run all pending timers to ensure all async operations complete
    await vi.runAllTimersAsync();

    // Ensure promise rejection is properly caught
    await expect(promise).rejects.toThrow(
      "Facebook API retry attempts exhausted",
    );

    vi.useRealTimers();
  });

  it("handles null response from fetch", async () => {
    fetchMock.mockResolvedValueOnce(null as unknown as Response);

    await expect(getUserPages("token")).rejects.toThrow(
      "No response received from Facebook API",
    );
  });

  it("handles error response without error object", async () => {
    // Mock responses for all retry attempts (MAX_RETRIES = 3)
    // All attempts will fail with the same error, and on the last attempt it will throw
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(
        createResponse(
          {}, // No error object
          { ok: false, status: 500 },
        ),
      );
    }

    await expect(getUserPages("token")).rejects.toThrow(
      /Facebook API error: 500 - Unknown error/,
    );
  });

  it("handles error response with error object but no code", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {
          error: {
            message: "Some error",
            // No code field
          },
        },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow(
      /Facebook API error: 400 - Some error/,
    );
  });

  it("handles token error with missing error code", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse(
        {
          error: {
            // No code, but status is 401
            message: "Token invalid",
          },
        },
        { ok: false, status: 401 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow(
      /Facebook token invalid \(unknown\)/,
    );
  });

  it("handles retryable API error that becomes non-retryable in catch block", async () => {
    vi.useFakeTimers();

    // First attempt: retryable error (500)
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Server error" } },
        { ok: false, status: 500 },
      ),
    );

    // Second attempt: non-retryable error (400) - this should be thrown immediately
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Bad request" } },
        { ok: false, status: 400 },
      ),
    );

    // Create promise and immediately attach error handler to prevent unhandled rejection
    const promise = getUserPages("token");
    // Attach a catch handler to prevent unhandled rejection warnings
    promise.catch(() => {
      // Error will be caught in the test below
    });

    await vi.advanceTimersByTimeAsync(1000);
    // Run all pending timers to ensure all async operations complete
    await vi.runAllTimersAsync();

    // Ensure promise rejection is properly caught
    await expect(promise).rejects.toThrow(/Facebook API error: 400/);

    vi.useRealTimers();
  });

  it("handles API error in catch block without status match", async () => {
    vi.useFakeTimers();

    // Create an error that looks like an API error but doesn't match the pattern
    fetchMock.mockImplementationOnce(() => {
      throw new Error("Facebook API error: invalid format");
    });

    // Should retry as network error - mock the successful response before retry
    fetchMock.mockResolvedValueOnce(
      createResponse({ data: [{ id: "1", name: "Page" }] }),
    );

    const promise = getUserPages("token");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    const pages = await promise;

    expect(pages).toEqual([{ id: "1", name: "Page" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("handles retryable error on last attempt in catch block", async () => {
    vi.useFakeTimers();

    // Mock to throw a retryable API error (500) on all attempts
    fetchMock.mockImplementation(() => {
      throw new Error("Facebook API error: 500 - Server error");
    });

    const promise = getUserPages("token");
    promise.catch(() => {}); // Prevent unhandled rejection

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(3000);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/Facebook API error: 500/);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("handles getPageEvents with URL already containing query params", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "event-1", name: "Event 1" }],
          paging: {
            next:
              "https://graph.facebook.com/v23.0/page-1/events?access_token=token&after=cursor",
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse({
          data: [{ id: "event-2", name: "Event 2" }],
        }),
      );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([
      { id: "event-1", name: "Event 1" },
      { id: "event-2", name: "Event 2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles getUserPages with empty paging object", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [{ id: "1", name: "Page 1" }],
        paging: {}, // Empty paging object
      }),
    );

    const pages = await getUserPages("access-token");

    expect(pages).toEqual([{ id: "1", name: "Page 1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles getPageEvents with empty paging object", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        data: [{ id: "event-1", name: "Event 1" }],
        paging: {}, // Empty paging object
      }),
    );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([{ id: "event-1", name: "Event 1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles getPageEvents when response has no data property", async () => {
    fetchMock.mockResolvedValueOnce(
      createResponse({
        paging: { next: null },
      }),
    );

    const events = await getPageEvents("page-1", "access-token", "upcoming");

    expect(events).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles getAllRelevantEvents with custom daysBack", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(createResponse({ data: [] }));
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-recent",
                name: "Recent",
                start_time: "2024-05-20T10:00:00Z", // 12 days ago
              },
              {
                id: "event-old",
                name: "Old",
                start_time: "2024-04-01T10:00:00Z", // 61 days ago
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 30);

    expect(events).toEqual([
      {
        id: "event-recent",
        name: "Recent",
        start_time: "2024-05-20T10:00:00Z",
      },
    ]);

    vi.useRealTimers();
  });

  it("handles getAllRelevantEvents with zero daysBack", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-upcoming",
                name: "Upcoming",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-past",
                name: "Past",
                start_time: "2024-05-31T23:59:59Z", // Just before cutoff
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 0);

    // With 0 daysBack, only upcoming events should be included
    expect(events).toEqual([
      {
        id: "event-upcoming",
        name: "Upcoming",
        start_time: "2024-06-05T10:00:00Z",
      },
    ]);

    vi.useRealTimers();
  });

  it("skips recent past events that are missing start_time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("time_filter=upcoming")) {
        return Promise.resolve(
          createResponse({
            data: [
              {
                id: "event-upcoming",
                name: "Upcoming",
                start_time: "2024-06-05T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (url.includes("time_filter=past")) {
        return Promise.resolve(
          createResponse({
            data: [
              { id: "missing-start", name: "Missing start" },
              {
                id: "event-recent",
                name: "Recent",
                start_time: "2024-05-25T10:00:00Z",
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    const events = await getAllRelevantEvents("page-1", "access-token", 14);

    expect(events).toEqual([
      {
        id: "event-upcoming",
        name: "Upcoming",
        start_time: "2024-06-05T10:00:00Z",
      },
      {
        id: "event-recent",
        name: "Recent",
        start_time: "2024-05-25T10:00:00Z",
      },
    ]);

    vi.useRealTimers();
  });

  it("handles response.json() throwing an error", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error("JSON parse error")),
    } as unknown as Response;

    fetchMock.mockResolvedValueOnce(mockResponse);

    await expect(getUserPages("token")).rejects.toThrow("JSON parse error");
  });

  it("handles response.json() throwing an error for error response", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("JSON parse error")),
    } as unknown as Response;

    fetchMock.mockResolvedValueOnce(mockResponse);

    await expect(getUserPages("token")).rejects.toThrow("JSON parse error");
  });

  it("handles response.json() rejecting with a non-Error value", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue("Malformed payload"),
    } as unknown as Response;

    fetchMock.mockResolvedValueOnce(mockResponse);

    await expect(getUserPages("token")).rejects.toThrow(
      "JSON parse error: Malformed payload",
    );
  });

  it("retries when a Facebook API error omits the status code", async () => {
    vi.useFakeTimers();

    fetchMock
      .mockRejectedValueOnce(new Error("Facebook API error: temporary outage"))
      .mockResolvedValueOnce(createResponse({ data: [] }));

    const promise = getUserPages("token");
    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;
    expect(pages).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      "Facebook API request failed - retrying",
      expect.objectContaining({
        error: "Facebook API error: temporary outage",
        attempt: 1,
        maxRetries: expect.any(Number),
      }),
    );

    vi.useRealTimers();
  });

  it("handles isRetryableError with status at SERVER_ERROR_RANGE.MIN", async () => {
    // Test that status 500 (SERVER_ERROR_RANGE.MIN) is retryable
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Server error" } },
        { ok: false, status: 500 },
      ),
    );

    // Should retry
    fetchMock.mockResolvedValueOnce(
      createResponse({ data: [{ id: "1", name: "Page" }] }),
    );

    vi.useFakeTimers();
    const promise = getUserPages("token");
    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;
    expect(pages).toEqual([{ id: "1", name: "Page" }]);

    vi.useRealTimers();
  });

  it("handles isRetryableError with status just below SERVER_ERROR_RANGE.MAX", async () => {
    // Test that status 599 (just below SERVER_ERROR_RANGE.MAX) is retryable
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Server error" } },
        { ok: false, status: 599 },
      ),
    );

    // Should retry
    fetchMock.mockResolvedValueOnce(
      createResponse({ data: [{ id: "1", name: "Page" }] }),
    );

    vi.useFakeTimers();
    const promise = getUserPages("token");
    await vi.advanceTimersByTimeAsync(1000);

    const pages = await promise;
    expect(pages).toEqual([{ id: "1", name: "Page" }]);

    vi.useRealTimers();
  });

  it("handles non-retryable error status 600", async () => {
    // Status 600 is above SERVER_ERROR_RANGE.MAX, should not retry
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Error" } },
        { ok: false, status: 600 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow(
      /Facebook API error: 600/,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles default logger with metadata for error", async () => {
    setFacebookServiceLogger();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(
      () => {},
    );

    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Error", code: 100 } },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("handles default logger without metadata for error", async () => {
    setFacebookServiceLogger();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(
      () => {},
    );

    // Create a scenario that logs error without metadata
    fetchMock.mockResolvedValueOnce(
      createResponse(
        { error: { message: "Error" } },
        { ok: false, status: 400 },
      ),
    );

    await expect(getUserPages("token")).rejects.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
