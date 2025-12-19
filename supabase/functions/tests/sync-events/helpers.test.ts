import { assertEquals } from "std/assert/mod.ts";
import {
  resetSyncSinglePageDeps,
  setSyncSinglePageDeps,
  syncSinglePage,
} from "../../sync-events/helpers.ts";
import type {
  DatabasePage,
  FacebookEvent,
  NormalizedEvent,
} from "../../../../packages/shared/src/types.ts";
import type { ExpiringToken } from "../../sync-events/types.ts";

type SyncOverride = Parameters<typeof setSyncSinglePageDeps>[0];

const basePage: Partial<DatabasePage> = {
  page_id: 123,
  page_name: "Test Page",
  token_status: "active",
  page_access_token_id: "999",
} as const;

const mockSupabase = {} as unknown;

const defaultDeps: Required<SyncOverride> = {
  checkTokenExpiry: () =>
    Promise.resolve({
      isExpiring: false,
      daysUntilExpiry: 30,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    }),
  getPageToken: () => Promise.resolve("mock-token"),
  getAllRelevantEvents: () => Promise.resolve([] as FacebookEvent[]),
  markTokenExpired: () => Promise.resolve(),
  normalizeEvent: (event: FacebookEvent, pageId: string): NormalizedEvent => ({
    event_id: event.id,
    page_id: Number(pageId),
    event_data: {
      id: event.id,
      name: event.name,
      start_time: event.start_time,
    },
  }),
};

function installDeps(overrides: SyncOverride = {}) {
  resetSyncSinglePageDeps();
  setSyncSinglePageDeps({ ...defaultDeps, ...overrides });
}

Deno.test("syncSinglePage returns empty events when vault has no token", async () => {
  let facebookCalled = false;
  installDeps({
    getPageToken: () => Promise.resolve(null),
    getAllRelevantEvents: () => {
      facebookCalled = true;
      return Promise.resolve([] as FacebookEvent[]);
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events.length, 0);
    assertEquals(facebookCalled, false);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage collects expiring token metadata", async () => {
  const expiresAt = new Date("2025-02-01T10:00:00.000Z");
  installDeps({
    checkTokenExpiry: () =>
      Promise.resolve({
        isExpiring: true,
        daysUntilExpiry: 3,
        expiresAt,
      }),
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );

    assertEquals(result.events.length, 0);
    assertEquals(expiringTokens.length, 1);
    assertEquals(expiringTokens[0].daysUntilExpiry, 3);
    assertEquals(expiringTokens[0].expiresAt, expiresAt);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage marks tokens expired on Facebook 190 errors", async () => {
  let markCalls = 0;
  installDeps({
    getAllRelevantEvents: () => {
      return Promise.reject(new Error("190: Invalid OAuth 2.0 Access Token"));
    },
    markTokenExpired: () => {
      markCalls += 1;
      return Promise.resolve();
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(markCalls, 1);
    assertEquals(result.events.length, 0);
    assertEquals(result.error, null);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage returns error for non-token Facebook failures", async () => {
  const error = new Error("Graph API unavailable");
  let markCalled = false;
  installDeps({
    getAllRelevantEvents: () => {
      return Promise.reject(error);
    },
    markTokenExpired: () => {
      markCalled = true;
      return Promise.resolve();
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events.length, 0);
    assertEquals(result.error, error.message);
    assertEquals(markCalled, false);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage normalizes events and forwards cover metadata", async () => {
  const coverUrl = "https://example.com/image.jpg";
  const normalizedEvent: NormalizedEvent = {
    event_id: "evt-1",
    page_id: 123,
    event_data: {
      id: "evt-1",
      name: "Party",
      start_time: "2025-03-01T10:00:00.000Z",
    },
  };

  let capturedCover: string | null | undefined = undefined;

  installDeps({
    getAllRelevantEvents: () =>
      Promise.resolve([{
        id: "evt-1",
        name: "Party",
        start_time: "2025-03-01T10:00:00.000Z",
        cover: { source: coverUrl },
      }] as FacebookEvent[]),
    normalizeEvent: (_event, _pageId, cover?: null) => {
      capturedCover = cover as unknown as string | null;
      return normalizedEvent;
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events, [normalizedEvent]);
    assertEquals(capturedCover, coverUrl);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage surfaces earlier errors (e.g., token expiry lookup)", async () => {
  installDeps({
    checkTokenExpiry: () => {
      return Promise.reject(new Error("Supabase unavailable"));
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events.length, 0);
    assertEquals(result.error, "Supabase unavailable");
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles events without cover images", async () => {
  const normalizedEvent: NormalizedEvent = {
    event_id: "evt-1",
    page_id: 123,
    event_data: {
      id: "evt-1",
      name: "Party",
      start_time: "2025-03-01T10:00:00.000Z",
    },
  };

  let capturedCover: string | null | undefined = undefined;

  installDeps({
    getAllRelevantEvents: () =>
      Promise.resolve([{
        id: "evt-1",
        name: "Party",
        start_time: "2025-03-01T10:00:00.000Z",
      }] as FacebookEvent[]),
    normalizeEvent: (_event, _pageId, cover?: null) => {
      capturedCover = cover as unknown as string | null;
      return normalizedEvent;
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events, [normalizedEvent]);
    assertEquals(capturedCover, null);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles events with cover but no source", async () => {
  const normalizedEvent: NormalizedEvent = {
    event_id: "evt-1",
    page_id: 123,
    event_data: {
      id: "evt-1",
      name: "Party",
      start_time: "2025-03-01T10:00:00.000Z",
    },
  };

  let capturedCover: string | null | undefined = undefined;

  installDeps({
    getAllRelevantEvents: () =>
      Promise.resolve([{
        id: "evt-1",
        name: "Party",
        start_time: "2025-03-01T10:00:00.000Z",
        cover: {},
      }] as FacebookEvent[]),
    normalizeEvent: (_event, _pageId, cover?: null) => {
      capturedCover = cover as unknown as string | null;
      return normalizedEvent;
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events, [normalizedEvent]);
    assertEquals(capturedCover, null);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles token expiry with null expiresAt", async () => {
  installDeps({
    checkTokenExpiry: () =>
      Promise.resolve({
        isExpiring: true,
        daysUntilExpiry: 3,
        expiresAt: null,
      }),
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );

    assertEquals(result.events.length, 0);
    assertEquals(expiringTokens.length, 1);
    assertEquals(expiringTokens[0].daysUntilExpiry, 3);
    assertEquals(expiringTokens[0].expiresAt, null);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles markTokenExpired errors gracefully", async () => {
  let markCalls = 0;
  installDeps({
    getAllRelevantEvents: () => {
      return Promise.reject(new Error("190: Invalid OAuth 2.0 Access Token"));
    },
    markTokenExpired: () => {
      markCalls += 1;
      return Promise.reject(new Error("Failed to mark token expired"));
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(markCalls, 1);
    // Should still return empty events even if markTokenExpired throws
    assertEquals(result.events.length, 0);
    // The error from markTokenExpired should be caught and returned
    assertEquals(result.error !== null, true);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles token error with 'token' in message", async () => {
  let markCalls = 0;
  installDeps({
    getAllRelevantEvents: () => {
      return Promise.reject(new Error("Invalid token provided"));
    },
    markTokenExpired: () => {
      markCalls += 1;
      return Promise.resolve();
    },
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(markCalls, 1);
    assertEquals(result.events.length, 0);
    assertEquals(result.error, null);
  } finally {
    resetSyncSinglePageDeps();
  }
});

Deno.test("syncSinglePage handles non-Error exceptions from Facebook API", async () => {
  installDeps({
    getAllRelevantEvents: () => {
      return Promise.reject("String error");
    },
    markTokenExpired: () => Promise.resolve(),
  });

  try {
    const expiringTokens: ExpiringToken[] = [];
    const result = await syncSinglePage(
      basePage as DatabasePage,
      mockSupabase,
      expiringTokens,
    );
    assertEquals(result.events.length, 0);
    // Should check if error message includes "token"
    assertEquals(result.error !== null, true);
  } finally {
    resetSyncSinglePageDeps();
  }
});
