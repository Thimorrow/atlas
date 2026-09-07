import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  gateEnabled,
  issueToken,
  safeEqual,
  verifyToken,
} from "@/lib/gate";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gate: safeEqual", () => {
  it("erkennt gleiche Strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
  });

  it("lehnt verschiedene Strings gleicher Laenge ab", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("a", "b")).toBe(false);
  });

  it("lehnt verschiedene Laengen ab", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("gate: issueToken/verifyToken", () => {
  it("akzeptiert ein frisch ausgestelltes Token", async () => {
    const token = await issueToken("geheim");
    expect(await verifyToken(token, "geheim")).toBe(true);
  });

  it("lehnt ein abgelaufenes Token ab", async () => {
    const token = await issueToken("geheim");
    const exp = Number(token.slice(0, token.lastIndexOf(".")));
    // Zeit auf nach Ablauf stellen (MAX_AGE + 1 Sekunde).
    vi.spyOn(Date, "now").mockReturnValue(exp + 1000);
    expect(await verifyToken(token, "geheim")).toBe(false);
  });

  it("lehnt ein falsches Secret ab", async () => {
    const token = await issueToken("richtig");
    expect(await verifyToken(token, "falsch")).toBe(false);
  });

  it("lehnt manipulierte Signatur ab", async () => {
    const token = await issueToken("geheim");
    const dot = token.lastIndexOf(".");
    const manipuliert = `${token.slice(0, dot)}.0000`;
    expect(await verifyToken(manipuliert, "geheim")).toBe(false);
  });

  it("lehnt fehlende und kaputte Tokens ab", async () => {
    expect(await verifyToken(undefined, "geheim")).toBe(false);
    expect(await verifyToken("", "geheim")).toBe(false);
    expect(await verifyToken("ohne-punkt", "geheim")).toBe(false);
    expect(await verifyToken(".nur-signatur", "geheim")).toBe(false);
    expect(await verifyToken("keine-zahl.signatur", "geheim")).toBe(false);
  });
});

describe("gate: gateEnabled", () => {
  it("ist ohne Passwort aus", () => {
    expect(gateEnabled(undefined)).toBe(false);
    expect(gateEnabled("")).toBe(false);
  });

  it("ist mit gesetztem Passwort an", () => {
    expect(gateEnabled("geheim")).toBe(true);
  });
});

describe("gate: Konstanten", () => {
  it("nutzt Cookie-Name und ein Jahr Laufzeit", () => {
    expect(COOKIE_NAME).toBe("atlas-gate");
    expect(COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });
});
