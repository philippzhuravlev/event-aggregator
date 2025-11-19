import {
  assertEquals,
  assertRejects,
} from "std/assert/mod.ts";
import { assertSpyCalls, spy, returnsNext, stub } from "std/testing/mock.ts";
import { FakeTime } from "std/testing/time.ts";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
  getEventDetails,
  getPageEvents,
  getUserPages,
  setFacebookServiceLogger,
} from "@event-aggregator/shared/src/services/facebook-service.ts";

type FetchStub = ReturnType<typeof stub<typeof globalThis.fetch>>;

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function createJsonResponse(
  data: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function withFetchStub(
  responses: Array<Response | Promise<Response>>,
  fn: () => Promise<void>,
): Promise<void> {
  const fetchStub: FetchStub = stub(
    globalThis,
    "fetch",
    returnsNext(
      responses.map((response) =>
        response instanceof Promise ? response : Promise.resolve(response)
      ),
    ),
  );

  try {
    await fn();
  } finally {
    fetchStub.restore();
  }
}

Deno.test("facebook-service exchanges short and long lived tokens", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [createJsonResponse({ access_token: "short-token" })],
    async () => {
      const token = await exchangeCodeForToken(
        "auth-code",
        "app-id",
        "secret",
        "https://redirect.test",
      );

      assertEquals(token, "short-token");
    },
  );

  await withFetchStub(
    [createJsonResponse({ access_token: "long-token" })],
    async () => {
      const token = await exchangeForLongLivedToken(
        "short-token",
        "app-id",
        "secret",
      );

      assertEquals(token, "long-token");
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service paginates user pages", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse({
        data: [{ id: "1", name: "Page 1" }],
        paging: { next: "https://graph.test/next" },
      }),
      createJsonResponse({
        data: [{ id: "2", name: "Page 2" }],
      }),
    ],
    async () => {
      const pages = await getUserPages("token");
      assertEquals(pages.map((page) => page.id), ["1", "2"]);
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service retries on server errors", async () => {
  setFacebookServiceLogger(noopLogger);
  const fakeTime = new FakeTime();

  await withFetchStub(
    [
      createJsonResponse(
        { error: { message: "server boom" } },
        { status: 500 },
      ),
      createJsonResponse({
        data: [{ id: "recovered", name: "Recovered Page" }],
      }),
    ],
    async () => {
      const pagesPromise = getUserPages("token");
      await fakeTime.tickAsync(1000);
      const pages = await pagesPromise;
      assertEquals(pages[0].id, "recovered");
    },
  );

  fakeTime.restore();
  setFacebookServiceLogger();
});

Deno.test("facebook-service surfaces API errors from getPageEvents", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse(
        {
          error: {
            message: "Bad request",
          },
        },
        { status: 400 },
      ),
    ],
    async () => {
      await assertRejects(
        () => getPageEvents("page", "token", "upcoming"),
        Error,
        "Facebook API error: 400 - Bad request",
      );
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service logs invalid token errors and throws immediately", async () => {
  const errorSpy = spy(
    (_message: string, _error?: Error | null, _metadata?: Record<string, unknown>) => {},
  );
  setFacebookServiceLogger({
    info: () => {},
    warn: () => {},
    error: errorSpy,
    debug: () => {},
  });

  await withFetchStub(
    [
      createJsonResponse(
        {
          error: {
            code: 190,
            message: "Invalid OAuth token",
          },
        },
        { status: 400 },
      ),
    ],
    async () => {
      await assertRejects(
        () => getUserPages("bad-token"),
        Error,
        "Facebook token invalid (190)",
      );
    },
  );

  assertSpyCalls(errorSpy, 1);
  setFacebookServiceLogger();
});

Deno.test("facebook-service throws JSON parse error for successful responses", async () => {
  setFacebookServiceLogger(noopLogger);

  const mockResponse = {
    ok: true,
    status: 200,
    json: () => Promise.reject("Malformed payload"),
  } as unknown as Response;

  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse));
  try {
    await assertRejects(
      () => getUserPages("token"),
      Error,
      "JSON parse error: Malformed payload",
    );
  } finally {
    fetchStub.restore();
    setFacebookServiceLogger();
  }
});

Deno.test("facebook-service throws JSON parse error for error responses", async () => {
  setFacebookServiceLogger(noopLogger);

  const mockResponse = {
    ok: false,
    status: 500,
    json: () => Promise.reject(new Error("Broken JSON")),
  } as unknown as Response;

  const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse));
  try {
    await assertRejects(
      () => getUserPages("token"),
      Error,
      "JSON parse error: Broken JSON",
    );
  } finally {
    fetchStub.restore();
    setFacebookServiceLogger();
  }
});

Deno.test(
  "facebook-service does not retry non-retryable API errors thrown in catch block",
  async () => {
    setFacebookServiceLogger(noopLogger);

    let callCount = 0;
    const fetchStub = stub(globalThis, "fetch", () => {
      callCount++;
      return Promise.reject(
        new Error("Facebook API error: 400 - Invalid parameter"),
      );
    });

    try {
      await assertRejects(
        () => getUserPages("token"),
        Error,
        "Facebook API error: 400 - Invalid parameter",
      );
      assertEquals(callCount, 1);
    } finally {
      fetchStub.restore();
      setFacebookServiceLogger();
    }
  },
);

Deno.test("facebook-service retries string-based network errors then succeeds", async () => {
  const warnSpy = spy(
    (_message: string, _metadata?: Record<string, unknown>) => {},
  );
  setFacebookServiceLogger({
    info: () => {},
    warn: warnSpy,
    error: () => {},
    debug: () => {},
  });

  const fakeTime = new FakeTime();
  let call = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    if (call === 0) {
      call++;
      return Promise.reject("Network outage");
    }
    return Promise.resolve(
      createJsonResponse({ data: [{ id: "1", name: "Recovered Page" }] }),
    );
  });

  try {
    const pagesPromise = getUserPages("token");
    await fakeTime.tickAsync(1000);
    const pages = await pagesPromise;
    assertEquals(pages.length, 1);
    assertSpyCalls(warnSpy, 1);
  } finally {
    fetchStub.restore();
    fakeTime.restore();
    setFacebookServiceLogger();
  }
});

Deno.test("facebook-service fetches event details", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse({
        id: "event-1",
        name: "Launch",
      }),
    ],
    async () => {
      const event = await getEventDetails("event-1", "token");
      assertEquals(event.id, "event-1");
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service aggregates relevant events", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse({
        data: [{ id: "upcoming", name: "Upcoming", start_time: "2024-06-05" }],
        paging: { next: null },
      }),
      createJsonResponse({
        data: [
          { id: "recent", name: "Recent", start_time: new Date().toISOString() },
          { id: "old", name: "Old", start_time: "2000-01-01T00:00:00Z" },
        ],
        paging: { next: null },
      }),
    ],
    async () => {
      const events = await getAllRelevantEvents("page", "token", 7);
      const ids = events.map((event) => event.id);
      assertEquals(ids.sort(), ["recent", "upcoming"]);
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service handles missing fetch responses", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [Promise.resolve(null as unknown as Response)],
    async () => {
      await assertRejects(
        () => getUserPages("token"),
        Error,
        "No response received from Facebook API",
      );
    },
  );

  setFacebookServiceLogger();
});

Deno.test(
  "facebook-service throws when short-lived token exchange response is missing token",
  async () => {
    setFacebookServiceLogger(noopLogger);

    await withFetchStub(
      [createJsonResponse({})],
      async () => {
        await assertRejects(
          () =>
            exchangeCodeForToken(
              "code",
              "app",
              "secret",
              "https://redirect.test",
            ),
          Error,
          "No access token received from Facebook",
        );
      },
    );

    setFacebookServiceLogger();
  },
);

Deno.test(
  "facebook-service throws when long-lived token exchange response is missing token",
  async () => {
    setFacebookServiceLogger(noopLogger);

    await withFetchStub(
      [createJsonResponse({})],
      async () => {
        await assertRejects(
          () =>
            exchangeForLongLivedToken(
              "short",
              "app",
              "secret",
            ),
          Error,
          "No long-lived token received from Facebook",
        );
      },
    );

    setFacebookServiceLogger();
  },
);

Deno.test("facebook-service filters past events without start_time", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse({
        data: [{ id: "upcoming", name: "Upcoming", start_time: "2024-06-05" }],
      }),
      createJsonResponse({
        data: [
          { id: "no-time", name: "No Time" },
          { id: "recent", name: "Recent", start_time: new Date().toISOString() },
        ],
      }),
    ],
    async () => {
      const events = await getAllRelevantEvents("page", "token", 30);
      const ids = events.map((event) => event.id).sort();
      assertEquals(ids, ["recent", "upcoming"]);
    },
  );

  setFacebookServiceLogger();
});

Deno.test("facebook-service uses default console logger when custom logger unset", async () => {
  setFacebookServiceLogger();
  const consoleLog = spy(console, "log", () => {});
  try {
    await withFetchStub(
      [createJsonResponse({ access_token: "short" })],
      async () => {
        await exchangeCodeForToken(
          "code",
          "app",
          "secret",
          "https://redirect.test",
        );
      },
    );
    assertSpyCalls(consoleLog, 1);
  } finally {
    consoleLog.restore();
    setFacebookServiceLogger();
  }
});

Deno.test("facebook-service removes duplicate events by id", async () => {
  setFacebookServiceLogger(noopLogger);

  await withFetchStub(
    [
      createJsonResponse({
        data: [
          { id: "event-1", name: "Upcoming", start_time: "2024-06-05T10:00:00Z" },
        ],
      }),
      createJsonResponse({
        data: [
          {
            id: "event-1",
            name: "Duplicate Past",
            start_time: new Date().toISOString(),
          },
        ],
      }),
    ],
    async () => {
      const events = await getAllRelevantEvents("page", "token", 60);
      assertEquals(events.length, 1);
      assertEquals(events[0].id, "event-1");
    },
  );

  setFacebookServiceLogger();
});

