import { describe, expect, it } from "vitest";
import { vergleichTag, type TagStunde } from "./check";

const stunde = (p: Partial<TagStunde> & { startTime: string }): TagStunde => ({
  endTime: "10:15",
  subject: "Mathe",
  room: "A120",
  teacher: "Mustermann",
  status: "regular",
  ...p,
});

describe("vergleichTag", () => {
  it("leere Luecke: regulaere Untis-Stunde fehlt in Atlas", () => {
    const diff = vergleichTag(
      [stunde({ startTime: "09:30", subject: "Physik" })],
      [],
    );
    expect(diff.fehltInAtlas).toHaveLength(1);
    expect(diff.fehltInAtlas[0].subject).toBe("Physik");
    expect(diff.nurInAtlas).toHaveLength(0);
    expect(diff.statusWeichtAb).toHaveLength(0);
  });

  it("gleicher Stand auf beiden Seiten -> kein Befund", () => {
    const diff = vergleichTag(
      [stunde({ startTime: "09:30" })],
      [stunde({ startTime: "09:30", endTime: "10:15:00", room: "A120" })],
    );
    expect(diff.fehltInAtlas).toHaveLength(0);
    expect(diff.nurInAtlas).toHaveLength(0);
    expect(diff.statusWeichtAb).toHaveLength(0);
  });

  it("Entfall nur in Untis zaehlt als fehlend (Atlas zeigt Luecke, Untis Entfall)", () => {
    const diff = vergleichTag(
      [stunde({ startTime: "11:30", subject: "Bio", status: "cancelled" })],
      [stunde({ startTime: "09:30" })],
    );
    expect(diff.fehltInAtlas.map((s) => s.status)).toEqual(["cancelled"]);
  });

  it("veraltete Atlas-Stunde ohne Untis-Gegenstueck landet in nurInAtlas", () => {
    const diff = vergleichTag([], [stunde({ startTime: "09:30" })]);
    expect(diff.nurInAtlas).toHaveLength(1);
    expect(diff.fehltInAtlas).toHaveLength(0);
  });

  it("gleiche Startzeit, anderes Fach oder Status -> statusWeichtAb", () => {
    const diff = vergleichTag(
      [stunde({ startTime: "09:30", subject: "Physik", status: "substituted" })],
      [stunde({ startTime: "09:30", subject: "Mathe", status: "regular" })],
    );
    expect(diff.fehltInAtlas).toHaveLength(0);
    expect(diff.nurInAtlas).toHaveLength(0);
    expect(diff.statusWeichtAb).toHaveLength(1);
    expect(diff.statusWeichtAb[0].untis.subject).toBe("Physik");
    expect(diff.statusWeichtAb[0].atlas.subject).toBe("Mathe");
  });

  it("verschobene Stunde (andere Startzeit) faellt als fehlend+zusaetzlich auf", () => {
    const diff = vergleichTag(
      [stunde({ startTime: "11:35" })],
      [stunde({ startTime: "11:30" })],
    );
    expect(diff.fehltInAtlas).toHaveLength(1);
    expect(diff.nurInAtlas).toHaveLength(1);
  });

  it("beide Seiten leer -> kein Befund (z.B. Wochenende)", () => {
    expect(vergleichTag([], [])).toEqual({ fehltInAtlas: [], nurInAtlas: [], statusWeichtAb: [] });
  });
});
