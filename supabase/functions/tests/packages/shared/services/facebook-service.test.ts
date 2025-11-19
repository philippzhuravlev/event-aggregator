import {
  assertEquals,
  assertRejects,
} from "std/assert/mod.ts";
import { returnsNext, stub } from "std/testing/mock.ts";
import { FakeTime } from "std/testing/time.ts";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAllRelevantEvents,
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

