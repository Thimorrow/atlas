import { describe, expect, it } from "vitest";
import { heuteISO, jetztHM, tagesbeginn } from "./zeit";

// Feste Zeitpunkte in UTC; die Erwartung ist immer die deutsche Lesart.
describe("zeit", () => {
  it("heuteISO nimmt das deutsche Datum, auch wenn UTC noch am Vortag ist (Sommer)", () => {
    expect(heuteISO(new Date("2026-09-04T22:30:00Z"))).toBe("2026-09-05");
  });

  it("heuteISO im Winter (eine Stunde Versatz)", () => {
    expect(heuteISO(new Date("2026-01-10T23:30:00Z"))).toBe("2026-01-11");
    expect(heuteISO(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-10");
  });

  it("jetztHM liefert die deutsche Uhrzeit als HH:MM", () => {
    expect(jetztHM(new Date("2026-09-04T06:30:00Z"))).toBe("08:30");
    expect(jetztHM(new Date("2026-01-10T07:05:00Z"))).toBe("08:05");
    expect(jetztHM(new Date("2026-09-04T22:30:00Z"))).toBe("00:30");
  });

  it("tagesbeginn ist Mitternacht deutscher Zeit als UTC-Zeitpunkt", () => {
    expect(tagesbeginn(new Date("2026-09-04T10:00:00Z")).toISOString()).toBe("2026-09-03T22:00:00.000Z");
    expect(tagesbeginn(new Date("2026-01-10T10:00:00Z")).toISOString()).toBe("2026-01-09T23:00:00.000Z");
    // Kurz nach deutscher Mitternacht gehoert der Zeitpunkt schon zum neuen Tag.
    expect(tagesbeginn(new Date("2026-09-04T22:30:00Z")).toISOString()).toBe("2026-09-04T22:00:00.000Z");
  });
});
