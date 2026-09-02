import { describe, expect, it } from "vitest";
import { parseFuzzyDate } from "./dates";

// Fixer "heute"-Anker: 2025-07-16 ist ein Mittwoch.
const MITTWOCH = new Date("2025-07-16T08:00:00");

describe("parseFuzzyDate", () => {
  it("erkennt ein gueltiges ISO-Datum", () => {
    expect(parseFuzzyDate("2025-08-01", MITTWOCH)).toEqual({ iso: "2025-08-01" });
  });

  it("meldet ein unmoegliches ISO-Datum als Hinweis, nicht als Absturz", () => {
    const result = parseFuzzyDate("2025-02-30", MITTWOCH);
    expect(result.iso).toBeNull();
    expect(result.hint).toBeTruthy();
  });

  it("versteht 'morgen'", () => {
    expect(parseFuzzyDate("morgen", MITTWOCH)).toEqual({ iso: "2025-07-17" });
  });

  it("versteht 'heute' und 'uebermorgen'", () => {
    expect(parseFuzzyDate("heute", MITTWOCH)).toEqual({ iso: "2025-07-16" });
    expect(parseFuzzyDate("übermorgen", MITTWOCH)).toEqual({ iso: "2025-07-18" });
  });

  it("versteht 'naechsten Montag' als den kommenden, nicht den heutigen", () => {
    // Mittwoch -> naechster Montag ist in 5 Tagen (21.7.)
    expect(parseFuzzyDate("naechsten Montag", MITTWOCH)).toEqual({ iso: "2025-07-21" });
  });

  it("versteht einen blossen Wochentagsnamen als naechstes Vorkommen", () => {
    // Mittwoch -> naechster Mittwoch ist in 7 Tagen, nicht heute
    expect(parseFuzzyDate("Mittwoch", MITTWOCH)).toEqual({ iso: "2025-07-23" });
    // Freitag ist noch in dieser Woche
    expect(parseFuzzyDate("Freitag", MITTWOCH)).toEqual({ iso: "2025-07-18" });
  });

  it("gibt bei Unsinn null plus Hinweis zurueck, keinen Fehler", () => {
    const result = parseFuzzyDate("irgendwann naechstes Jahrzehnt", MITTWOCH);
    expect(result.iso).toBeNull();
    expect(result.hint).toBeTruthy();
  });
});
