import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getEventDetails,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
} from "../../src/services/facebook-service.ts";

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
});


