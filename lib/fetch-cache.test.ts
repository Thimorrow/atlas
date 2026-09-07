import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedGetJSON,
  invalidateAssignmentsCaches,
  invalidateGetCache,
  invalidateGetCacheByPrefix,
  readGetCache,
  writeGetCache,
} from "@/lib/fetch-cache";

afterEach(() => {
  invalidateGetCache();
  vi.unstubAllGlobals();
});

describe("fetch-cache: Speicher", () => {
  it("gibt Geschriebenes innerhalb der TTL zurück", () => {
    writeGetCache("/x", { a: 1 });
    expect(readGetCache("/x", 60_000)).toEqual({ a: 1 });
  });

  it("gibt nach Ablauf der TTL null zurück", () => {
    writeGetCache("/x", { a: 1 });
    expect(readGetCache("/x", -1)).toBeNull();
  });

  it("invalidate vergisst gezielt oder alles", () => {
    writeGetCache("/a", 1);
    writeGetCache("/b", 2);
    invalidateGetCache("/a");
    expect(readGetCache("/a", 60_000)).toBeNull();
    expect(readGetCache("/b", 60_000)).toBe(2);
    invalidateGetCache();
    expect(readGetCache("/b", 60_000)).toBeNull();
  });
});

describe("fetch-cache: cachedGetJSON", () => {
  it("lädt einmal vom Netz und danach aus dem Speicher", async () => {
    const json = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));
    const first = await cachedGetJSON<{ ok: boolean }>("/api/bot");
    const second = await cachedGetJSON<{ ok: boolean }>("/api/bot");
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fällt bei Netzfehler auf den alten Stand zurück", async () => {
    writeGetCache("/api/bot", { ok: "alt" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    // Gueltiger Eintrag kommt ganz ohne Netz aus dem Speicher.
    const fresh = await cachedGetJSON<{ ok: string }>("/api/bot", 60_000);
    expect(fresh).toEqual({ ok: "alt" });
    // Abgelaufener Eintrag (TTL -1) wird bei Netzfehler als Rueckfall verkauft.
    const stale = await cachedGetJSON<{ ok: string }>("/api/bot", -1);
    expect(stale).toEqual({ ok: "alt" });
  });

  it("wirft ohne Cache und ohne Netz", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    await expect(cachedGetJSON("/leer")).rejects.toThrow();
  });

  it("teilt eine laufende Anfrage zwischen zwei Aufrufern", async () => {
    const json = vi.fn().mockResolvedValue({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json });
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([cachedGetJSON("/api/geteilt"), cachedGetJSON("/api/geteilt")]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetch-cache: Bereichs-Invalidierung", () => {
  it("vergist per Praefix, laesst Fremdes stehen", () => {
    writeGetCache("/api/calendar?view=week&date=2026-09-01", { w: 1 });
    writeGetCache("/api/calendar?view=week&date=2026-09-08", { w: 2 });
    writeGetCache("/api/morgen", { m: 1 });
    invalidateGetCacheByPrefix("/api/calendar");
    expect(readGetCache("/api/calendar?view=week&date=2026-09-01", 60_000)).toBeNull();
    expect(readGetCache("/api/calendar?view=week&date=2026-09-08", 60_000)).toBeNull();
    expect(readGetCache("/api/morgen", 60_000)).toEqual({ m: 1 });
  });

  it("Aufgaben-Mutation trifft Aufgaben, Fokus, Kalender und Lernen", () => {
    writeGetCache("/api/assignments", []);
    writeGetCache("/api/assignments?completed=1", []);
    writeGetCache("/api/morgen", {});
    writeGetCache("/api/calendar?view=week&date=2026-09-01", {});
    writeGetCache("/api/lernen", {});
    writeGetCache("/api/subjects", []);
    invalidateAssignmentsCaches();
    expect(readGetCache("/api/assignments", 60_000)).toBeNull();
    expect(readGetCache("/api/assignments?completed=1", 60_000)).toBeNull();
    expect(readGetCache("/api/morgen", 60_000)).toBeNull();
    expect(readGetCache("/api/calendar?view=week&date=2026-09-01", 60_000)).toBeNull();
    expect(readGetCache("/api/lernen", 60_000)).toBeNull();
    expect(readGetCache("/api/subjects", 60_000)).toEqual([]);
  });
});
