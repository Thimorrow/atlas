import { describe, expect, it } from "vitest";
import { cacheControlHeader, cachedJson } from "@/lib/http-cache";

describe("http-cache: cacheControlHeader", () => {
  it("spiegelt stale-while-revalidate auf max-age ohne zweiten Parameter", () => {
    expect(cacheControlHeader(60)).toBe("private, max-age=60, stale-while-revalidate=60");
  });

  it("nimmt einen eigenen stale Wert an", () => {
    expect(cacheControlHeader(60, 30)).toBe("private, max-age=60, stale-while-revalidate=30");
  });

  it("bleibt privat fuer Single-User Daten", () => {
    expect(cacheControlHeader(120)).toMatch(/^private,/);
  });
});

describe("http-cache: cachedJson", () => {
  it("liefert JSON mit Cache Header und Status 200", async () => {
    const res = cachedJson({ ok: true }, 60);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(cacheControlHeader(60));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("nimmt Status und eigenen stale Wert an", async () => {
    const res = cachedJson({ fehler: true }, 60, 10, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe(cacheControlHeader(60, 10));
    expect(await res.json()).toEqual({ fehler: true });
  });
});
