import { describe, expect, it } from "vitest";
import {
  cockpitMode,
  defaultLesson,
  lessonProgress,
  minutesLeft,
  minutesUntil,
  pickLiveLesson,
  pickNextLesson,
  pickPreviousLesson,
  type LiveCandidate,
} from "@/lib/jetzt-stunde";

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
  it("findet die Stunde, die mittendrin läuft", () => {
    expect(pickLiveLesson(TAG, "10:07")?.refId).toBe("e2");
  });

  it("die Stunde läuft genau ab ihrer Startzeit", () => {
    expect(pickLiveLesson(TAG, "09:45")?.refId).toBe("e2");
  });

  it("zur Endzeit läuft sie nicht mehr", () => {
    expect(pickLiveLesson(TAG, "10:30")).toBeNull();
  });

  it("in der Pause läuft nichts", () => {
    expect(pickLiveLesson(TAG, "09:00")).toBeNull();
  });

  it("vor der ersten und nach der letzten Stunde läuft nichts", () => {
    expect(pickLiveLesson(TAG, "07:30")).toBeNull();
    expect(pickLiveLesson(TAG, "16:00")).toBeNull();
  });

  it("ignoriert eine entfallene Stunde", () => {
    const tag = [stunde("x", "09:45", "10:30", "cancelled")];
    expect(pickLiveLesson(tag, "10:07")).toBeNull();
  });

  it("eine Vertretung läuft ganz normal", () => {
    const tag = [stunde("v", "09:45", "10:30", "substituted")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("v");
  });

  it("leerer Tag ergibt null", () => {
    expect(pickLiveLesson([], "10:07")).toBeNull();
  });

  it("ohne Endzeit lässt sich nichts behaupten", () => {
    expect(pickLiveLesson([stunde("o", "09:45", null)], "10:07")).toBeNull();
  });

  it("bei Überlappung gewinnt die zuerst beginnende", () => {
    const tag = [stunde("spaet", "10:00", "10:45"), stunde("frueh", "09:45", "10:30")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("frueh");
  });

  it("normalisiert rohe Postgres-time-Werte und einstellige Stunden", () => {
    const tag = [stunde("p", "09:45:00", "10:30:00")];
    expect(pickLiveLesson(tag, "10:07")?.refId).toBe("p");
    expect(pickLiveLesson([stunde("k", "9:45", "10:30")], "10:07")?.refId).toBe("k");
  });

  it("unbrauchbare Zeitangaben führen zu keinem Treffer", () => {
    expect(pickLiveLesson(TAG, "jetzt")).toBeNull();
    expect(pickLiveLesson([stunde("m", "99:99", "10:30")], "10:07")).toBeNull();
  });
});

describe("minutesLeft", () => {
  it("rechnet die verbleibenden Minuten", () => {
    expect(minutesLeft("10:30", "10:07")).toBe(23);
  });

  it("zählt über die volle Stunde hinweg richtig", () => {
    expect(minutesLeft("10:30", "09:45")).toBe(45);
  });

  it("eine angebrochene Minute zählt nicht mit", () => {
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

describe("minutesUntil", () => {
  it("rechnet die Minuten bis zum Start", () => {
    expect(minutesUntil("09:45", "09:30")).toBe(15);
  });

  it("wird nie negativ, auch wenn die Stunde schon läuft", () => {
    expect(minutesUntil("09:45", "10:00")).toBe(0);
  });

  it("genau zum Start sind es 0 Minuten", () => {
    expect(minutesUntil("09:45", "09:45")).toBe(0);
  });

  it("unbrauchbare Zeitangaben ergeben 0", () => {
    expect(minutesUntil("09:45", "jetzt")).toBe(0);
    expect(minutesUntil("", "09:30")).toBe(0);
  });
});

describe("lessonProgress", () => {
  it("rechnet den Anteil der verstrichenen Zeit", () => {
    expect(lessonProgress("09:45", "10:30", "10:07")).toBeCloseTo(22 / 45, 5);
  });

  it("vor Beginn ist der Fortschritt 0", () => {
    expect(lessonProgress("09:45", "10:30", "09:00")).toBe(0);
  });

  it("nach Ende ist der Fortschritt geklemmt bei 1", () => {
    expect(lessonProgress("09:45", "10:30", "11:00")).toBe(1);
  });

  it("genau am Start ist der Fortschritt 0, genau am Ende 1", () => {
    expect(lessonProgress("09:45", "10:30", "09:45")).toBe(0);
    expect(lessonProgress("09:45", "10:30", "10:30")).toBe(1);
  });

  it("unbrauchbare Zeitangaben ergeben 0", () => {
    expect(lessonProgress("09:45", "10:30", "jetzt")).toBe(0);
    expect(lessonProgress("", "10:30", "10:07")).toBe(0);
  });
});

describe("pickNextLesson", () => {
  it("findet die nächste bevorstehende Stunde", () => {
    expect(pickNextLesson(TAG, "08:50")?.refId).toBe("e2");
  });

  it("während einer laufenden Stunde ist die nächste die danach", () => {
    expect(pickNextLesson(TAG, "08:10")?.refId).toBe("e2");
  });

  it("nach der letzten Stunde gibt es keine nächste mehr", () => {
    expect(pickNextLesson(TAG, "10:30")).toBeNull();
  });

  it("ignoriert eine entfallene nächste Stunde nicht -- sie zählt trotzdem nicht", () => {
    const tag = [ERSTE, stunde("cancelled-next", "09:45", "10:30", "cancelled")];
    expect(pickNextLesson(tag, "08:50")).toBeNull();
  });

  it("leerer Tag ergibt null", () => {
    expect(pickNextLesson([], "08:50")).toBeNull();
  });
});

describe("pickPreviousLesson", () => {
  it("findet die zuletzt vorbeigegangene Stunde", () => {
    expect(pickPreviousLesson(TAG, "09:00")?.refId).toBe("e1");
  });

  it("genau zum Ende zählt die Stunde schon als vorbei", () => {
    expect(pickPreviousLesson(TAG, "08:45")?.refId).toBe("e1");
  });

  it("vor der ersten Stunde gibt es keine vorherige", () => {
    expect(pickPreviousLesson(TAG, "07:30")).toBeNull();
  });

  it("nach der letzten Stunde ist diese die vorherige", () => {
    expect(pickPreviousLesson(TAG, "16:00")?.refId).toBe("e2");
  });

  it("leerer Tag ergibt null", () => {
    expect(pickPreviousLesson([], "09:00")).toBeNull();
  });
});

describe("cockpitMode", () => {
  it("frei: kein einziger Termin heute", () => {
    expect(cockpitMode([], "10:00")).toBe("frei");
  });

  it("frei: nur entfallene Stunden zählen wie kein Tag", () => {
    expect(cockpitMode([stunde("x", "08:00", "08:45", "cancelled")], "10:00")).toBe("frei");
  });

  it("live: eine Stunde läuft gerade", () => {
    expect(cockpitMode(TAG, "10:07")).toBe("live");
  });

  it("vor: jetzt liegt vor der ersten Stunde", () => {
    expect(cockpitMode(TAG, "07:30")).toBe("vor");
  });

  it("nach: jetzt liegt nach der letzten Stunde", () => {
    expect(cockpitMode(TAG, "16:00")).toBe("nach");
  });

  it("pause: zwischen zwei Stunden", () => {
    expect(cockpitMode(TAG, "09:00")).toBe("pause");
  });
});

describe("defaultLesson", () => {
  it("live hat Vorrang", () => {
    expect(defaultLesson(TAG, "10:07")?.refId).toBe("e2");
  });

  it("in der Pause die nächste Stunde", () => {
    expect(defaultLesson(TAG, "09:00")?.refId).toBe("e2");
  });

  it("nach der Schule die letzte Stunde", () => {
    expect(defaultLesson(TAG, "16:00")?.refId).toBe("e2");
  });

  it("an einem freien Tag null", () => {
    expect(defaultLesson([], "10:00")).toBeNull();
  });
});
