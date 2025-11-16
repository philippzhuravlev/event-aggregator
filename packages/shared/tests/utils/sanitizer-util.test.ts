import { describe, expect, it } from "vitest";
import { sanitizeSearchQuery } from "../../src/utils/sanitizer-util.ts";

describe("sanitizeSearchQuery", () => {
  it("removes disallowed characters", () => {
    const sanitized = sanitizeSearchQuery("Party! @ Night #2024", 50);

    expect(sanitized).toBe("Party  Night 2024");
  });

  it("trims whitespace and limits the length", () => {
    const sanitized = sanitizeSearchQuery("  upcoming events  ", 8);

    expect(sanitized).toBe("upcoming");
  });

  it("retains allowed punctuation", () => {
    const sanitized = sanitizeSearchQuery("rock-n'roll & jazz, vol. 2", 50);

    expect(sanitized).toBe("rock-n'roll & jazz, vol. 2");
  });
});


