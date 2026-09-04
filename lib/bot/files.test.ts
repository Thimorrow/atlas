import { describe, expect, it } from "vitest";
import { MAX_CHARS, truncate } from "./files";

describe("truncate", () => {
  it("lässt kurzen Text unverändert", () => {
    expect(truncate("Kurzer Text")).toBe("Kurzer Text");
  });

  it("kürzt langen Text und hängt einen Hinweis an", () => {
    const langerText = "x".repeat(MAX_CHARS + 500);
    const result = truncate(langerText);
    expect(result.length).toBeLessThan(langerText.length);
    expect(result.startsWith("x".repeat(MAX_CHARS))).toBe(true);
    expect(result).toContain("gekürzt");
  });

  it("respektiert ein eigenes Limit", () => {
    const result = truncate("abcdefghij", 5);
    expect(result.startsWith("abcde")).toBe(true);
    expect(result).toContain("gekürzt");
  });
});
