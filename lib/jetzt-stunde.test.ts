import { describe, expect, it } from "vitest";
import { minutesLeft, pickLiveLesson, type LiveCandidate } from "@/lib/jetzt-stunde";

// --- Reiner Logiktest, kein DB-Zugriff ---------------------------------------

type Stunde = LiveCandidate & { refId: string };

function stunde(refId: string, startTime: string, endTime: string | null, status = "regular"): Stunde {
  return { refId, startTime, endTime, status };
}

// Ein normaler Vormittag: zwei Stunden mit einer Pause dazwischen.
const ERSTE = stunde("e1", "08:00", "08:45");
const ZWEITE = stunde("e2", "09:45", "10:30");
const TAG = [ERSTE, ZWEITE];

describe("pickLiveLesson", () => {
  it("findet die Stunde, die mittendrin laeuft", () => {
    expect(pickLiveLesson(TAG, "10:07")?.refId).toBe("e2");
  });

  it("die Stunde laeuft genau ab ihrer Startzeit", () => {
    expect(pickLiveLesson(TAG, "09:45")?.refId).toBe("e2");
  });

  it("zur Endzeit laeuft sie nicht mehr", () => {
    expect(pickLiveLesson(TAG, "10:30")).toBeNull();
  });

  it("in der Pause laeuft nichts", () => {
    expect(pickLiveLesson(TAG, "09:00")).toBeNull();
  });

  it("vor der ersten und nach der letzten Stunde laeuft nichts", () => {
    expect(pickLiveLesson(TAG, "07:30")).toBeNull();
    expect(pickLiveLesson(TAG, "16:00")).toBeNull();
  });

  it("ignoriert eine entfallene Stunde", () => {
    const tag = [stunde("x", "09:45", "10:30", "cancelled")];
    expect(pickLiveLesson(tag, "10:07")).toBeNull();
  });

  it("eine Vertretung laeuft ganz normal", () => {
    const tag = [stunde("v", "09:45", "10:30", "substituted")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("v");
  });

  it("leerer Tag ergibt null", () => {
    expect(pickLiveLesson([], "10:07")).toBeNull();
  });

  it("ohne Endzeit laesst sich nichts behaupten", () => {
    expect(pickLiveLesson([stunde("o", "09:45", null)], "10:07")).toBeNull();
  });

  it("bei Ueberlappung gewinnt die zuerst beginnende", () => {
    const tag = [stunde("spaet", "10:00", "10:45"), stunde("frueh", "09:45", "10:30")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("frueh");
  });

  it("normalisiert rohe Postgres-time-Werte und einstellige Stunden", () => {
    const tag = [stunde("p", "09:45:00", "10:30:00")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("p");
    expect(pickLiveLesson([stunde("k", "9:45", "10:30")], "10:07")?.refId).toBe("k");
  });

  it("unbrauchbare Zeitangaben fuehren zu keinem Treffer", () => {
    expect(pickLiveLesson(TAG, "jetzt")).toBeNull();
    expect(pickLiveLesson([stunde("m", "99:99", "10:30")], "10:07")).toBeNull();
  });
});

describe("minutesLeft", () => {
  it("rechnet die verbleibenden Minuten", () => {
    expect(minutesLeft("10:30", "10:07")).toBe(23);
  });

  it("zaehlt ueber die volle Stunde hinweg richtig", () => {
    expect(minutesLeft("10:30", "09:45")).toBe(45);
  });

  it("eine angebrochene Minute zaehlt nicht mit", () => {
    expect(minutesLeft("10:30", "10:29")).toBe(1);
    expect(minutesLeft("10:30", "10:30")).toBe(0);
  });

  it("wird nie negativ", () => {
    expect(minutesLeft("10:30", "11:00")).toBe(0);
  });

  it("unbrauchbare Zeitangaben ergeben 0", () => {
    expect(minutesLeft("10:30", "jetzt")).toBe(0);
    expect(minutesLeft("", "10:07")).toBe(0);
  });
});
