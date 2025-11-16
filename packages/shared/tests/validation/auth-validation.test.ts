import { describe, expect, it } from "vitest";
import {
  timingSafeCompare,
  computeHmacSignature,
  verifyHmacSignature,
} from "../../src/validation/auth-validation.ts";

describe("auth-validation", () => {
  describe("timingSafeCompare", () => {
    it("returns true for identical strings", () => {
      expect(timingSafeCompare("test", "test")).toBe(true);
      expect(timingSafeCompare("", "")).toBe(true);
    });

    it("returns false for different strings", () => {
      expect(timingSafeCompare("test", "different")).toBe(false);
      expect(timingSafeCompare("a", "b")).toBe(false);
    });

    it("returns false for strings of different lengths", () => {
      expect(timingSafeCompare("short", "longer")).toBe(false);
      expect(timingSafeCompare("a", "ab")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(timingSafeCompare("Test", "test")).toBe(false);
      expect(timingSafeCompare("TEST", "test")).toBe(false);
    });
  });

  describe("computeHmacSignature", () => {
    it("computes sha256=hex format signature", async () => {
      const signature = await computeHmacSignature(
        "test payload",
        "secret",
        "sha256=hex",
      );

      expect(signature).toMatch(/^sha256=[a-f0-9]+$/);
      expect(signature.length).toBeGreaterThan(10);
    });

    it("computes hex format signature", async () => {
      const signature = await computeHmacSignature(
        "test payload",
        "secret",
        "hex",
      );

      expect(signature).toMatch(/^[a-f0-9]+$/);
      expect(signature).not.toContain("sha256=");
    });

    it("produces consistent signatures for same input", async () => {
      const sig1 = await computeHmacSignature("payload", "secret");
      const sig2 = await computeHmacSignature("payload", "secret");

      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different payloads", async () => {
      const sig1 = await computeHmacSignature("payload1", "secret");
      const sig2 = await computeHmacSignature("payload2", "secret");

      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different secrets", async () => {
      const sig1 = await computeHmacSignature("payload", "secret1");
      const sig2 = await computeHmacSignature("payload", "secret2");

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyHmacSignature", () => {
    it("verifies a valid signature", async () => {
      const payload = "test payload";
      const secret = "secret";
      const signature = await computeHmacSignature(payload, secret);

      const result = await verifyHmacSignature(payload, signature, secret);

      expect(result.valid).toBe(true);
      expect(result.computedSignature).toBe(signature.replace("sha256=", ""));
    });

    it("rejects an invalid signature", async () => {
      const payload = "test payload";
      const secret = "secret";
      const wrongSignature = "sha256=wrong";

      const result = await verifyHmacSignature(
        payload,
        wrongSignature,
        secret,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects signature with wrong secret", async () => {
      const payload = "test payload";
      const signature = await computeHmacSignature(payload, "secret1");

      const result = await verifyHmacSignature(payload, signature, "secret2");

      expect(result.valid).toBe(false);
    });

    it("handles hex format signatures", async () => {
      const payload = "test payload";
      const secret = "secret";
      const signature = await computeHmacSignature(payload, secret, "hex");

      const result = await verifyHmacSignature(
        payload,
        signature,
        secret,
        "hex",
      );

      expect(result.valid).toBe(true);
    });
  });
});

