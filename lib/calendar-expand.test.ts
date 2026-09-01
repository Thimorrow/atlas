import { describe, expect, it } from "vitest";
import { isRealDate } from "./calendar-expand";

// Der Anlass: /api/calendar?date=2026-13-99 kam durch die Formatpruefung und
// stuerzte danach mit leerem Rumpf ab, waehrend 2026-02-30 still zum 2. Maerz
// wurde. Beides faellt jetzt hier auf.
describe("isRealDate", () => {
  it("nimmt gewoehnliche Daten an", () => {
    expect(isRealDate("2026-09-01")).toBe(true);
    expect(isRealDate("2025-12-31")).toBe(true);
  });

  it("weist Monate und Tage ausserhalb des Kalenders ab", () => {
    expect(isRealDate("2026-13-99")).toBe(false);
    expect(isRealDate("2026-00-10")).toBe(false);
    expect(isRealDate("2026-01-32")).toBe(false);
  });

  it("weist den 30. Februar ab, statt ihn auf Maerz zu schieben", () => {
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("2026-02-29")).toBe(false);
  });

  it("kennt den Schalttag", () => {
    expect(isRealDate("2024-02-29")).toBe(true);
  });
});
