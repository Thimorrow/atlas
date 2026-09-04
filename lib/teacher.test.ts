import { describe, expect, it } from "vitest";
import { teacherLabel } from "./teacher";
import { teacherAliases } from "./untis/sync";
import type { UntisLesson } from "./untis/adapter";

describe("teacherLabel", () => {
  it("setzt die Anrede vor den Nachnamen", () => {
    expect(teacherLabel("herr", "Schulze")).toBe("Herr Schulze");
    expect(teacherLabel("frau", "Mueller")).toBe("Frau Mueller");
  });

  it("ohne Namen gibt es nichts anzuzeigen -- auch keine nackte Anrede", () => {
    expect(teacherLabel("herr", null)).toBeNull();
    expect(teacherLabel("herr", "")).toBeNull();
  });

  it("faellt auf den blossen Namen zurueck, wenn die Anrede fehlt", () => {
    expect(teacherLabel(null, "Schulze")).toBe("Schulze");
  });
});

// teacherAliases baut aus den abgefragten Stunden die Zuordnung Kuerzel ->
// Nachname. Nur damit lassen sich alte Zeilen nachziehen, die noch das Kuerzel
// tragen -- aus "Sch" allein laesst sich kein Nachname herleiten.
describe("teacherAliases", () => {
  const stunde = (te: UntisLesson["te"]): UntisLesson => ({
    id: 1,
    date: 20260619,
    startTime: 750,
    endTime: 835,
    te,
  });

  it("merkt sich Kuerzel und Nachnamen aus allen Lehrern einer Stunde", () => {
    const map = teacherAliases([stunde([{ name: "Sch", longname: "Schulze" }, { name: "Mu", longname: "Mueller" }])]);
    expect(map.get("Sch")).toBe("Schulze");
    expect(map.get("Mu")).toBe("Mueller");
  });

  it("ignoriert Lehrer ohne Nachnamen und solche, bei denen beides gleich ist", () => {
    const map = teacherAliases([stunde([{ name: "Sch" }, { name: "Ka", longname: "Ka" }])]);
    expect(map.size).toBe(0);
  });

  it("kommt mit Stunden ohne Lehrer klar", () => {
    expect(teacherAliases([stunde(undefined), stunde([])]).size).toBe(0);
  });
});
