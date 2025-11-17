import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPES,
  DEFAULT_ALLOWED_ORIGINS,
  ERROR_CODES,
  HTTP_HEADERS,
  HTTP_STATUS,
  REQUEST_SIZE_LIMITS,
  SERVER_ERROR_RANGE,
  URL_DEFAULTS,
} from "../../src/config/validation-config.ts";

describe("validation config", () => {
  it("maps known facebook error codes", () => {
    expect(ERROR_CODES).toEqual({
      FACEBOOK_TOKEN_INVALID: 190,
      FACEBOOK_PERMISSION_DENIED: 10,
      FACEBOOK_RATE_LIMIT: 429,
    });
  });

  it("defines reusable http status codes and headers", () => {
    expect(HTTP_STATUS).toMatchObject({
      OK: 200,
      BAD_REQUEST: 400,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_SERVER_ERROR: 500,
    });
    expect(HTTP_HEADERS).toMatchObject({
      CONTENT_TYPE: "content-type",
      AUTHORIZATION: "authorization",
      X_HUB_SIGNATURE_256: "x-hub-signature-256",
    });
  });

  it("exposes content type and size limits for request validation", () => {
    expect(CONTENT_TYPES).toEqual({
      APPLICATION_JSON: "application/json",
      APPLICATION_X_WWW_FORM_URLENCODED: "application/x-www-form-urlencoded",
      MULTIPART_FORM_DATA: "multipart/form-data",
    });
    expect(REQUEST_SIZE_LIMITS).toEqual({
      SMALL: 10_240,
      MEDIUM: 102_400,
      LARGE: 1_048_576,
      EXTRA_LARGE: 10_485_760,
    });
  });

  it("describes the range for server errors", () => {
    expect(SERVER_ERROR_RANGE).toEqual({
      MIN: 500,
      MAX: 599,
    });
  });

  it("maintains canonical web urls and allowed origins", () => {
    expect(URL_DEFAULTS).toEqual({
      WEB_APP: "http://localhost:3000",
      OAUTH_CALLBACK: "http://localhost:8080/oauth-callback",
    });
    expect(DEFAULT_ALLOWED_ORIGINS).toEqual([
      "http://localhost:3000",
      "http://localhost:5000",
      "http://localhost:5173",
      "http://localhost:8080",
      "https://event-aggregator-nine.vercel.app",
    ]);
  });
});


