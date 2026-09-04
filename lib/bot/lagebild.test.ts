import { describe, expect, it } from "vitest";
import { heuteISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";
import { lagebildAlsText, type Lagebild } from "./lagebild";

// lagebildAlsText ist eine reine Funktion -- kein Mock noetig, im Stil von
// lib/assignments-view.test.ts.

function heuteLokal(offset = 0): string {
  return addDays(heuteISO(), offset);
}

describe("lagebildAlsText", () => {
  it("baut den vollen Text mit allen Bloecken", () => {
    const heute = heuteLokal();
    const morgen = heuteLokal(1);
    const ueberfaellig = heuteLokal(-2);
    const pruefungsTag = heuteLokal(6);

    const lagebild: Lagebild = {
      heute,
      faecher: [
        { name: "Mathematik", lehrer: "Herr Schulze", raum: "R12" },
        { name: "Deutsch", lehrer: "Frau Meier", raum: null },
      ],
      stundenHeute: [
        { startTime: "08:00", endTime: "08:45", fach: "Mathematik", raum: "R12" },
        { startTime: "08:50", endTime: "09:35", fach: "Deutsch", raum: "R3" },
      ],
      naechsterSchultag: {
        date: heuteLokal(2),
        stunden: [{ startTime: "08:00", endTime: "08:45", fach: "Englisch", raum: "R5" }],
      },
      aufgaben: [
        { id: "a1", titel: "S. 42 Nr. 3", fach: "Mathematik", typ: "homework", faellig: morgen },
        { id: "a2", titel: "Aufsatz nachholen", fach: "Deutsch", typ: "homework", faellig: ueberfaellig },
      ],
      pruefungen: [
        { id: "p1", titel: "Gedichtanalyse", fach: "Deutsch", typ: "exam", faellig: pruefungsTag },
      ],
      notizen: [{ id: "n1", titel: "Ableitungen", fach: "Mathematik", geaendert: heuteLokal(-2) }],
    };

    const text = lagebildAlsText(lagebild);

    expect(text).toContain("Mathematik (Herr Schulze, R12)");
    expect(text).toContain("Deutsch (Frau Meier)");
    expect(text).toContain("Heute,");
    expect(text).toContain("08:00-08:45 Mathematik R12");
    expect(text).toContain("08:50-09:35 Deutsch R3");
    expect(text).toContain("Naechster Schultag");
    expect(text).toContain("08:00-08:45 Englisch R5");
    expect(text).toContain("[a1] Hausaufgabe Mathematik \"S. 42 Nr. 3\", faellig");
    expect(text).toContain("(morgen)");
    expect(text).toContain("[a2] Hausaufgabe Deutsch \"Aufsatz nachholen\", faellig");
    expect(text).toContain("(seit 2 Tagen ueberfaellig)");
    expect(text).toContain("[p1] Klassenarbeit Deutsch \"Gedichtanalyse\" am");
    expect(text).toContain("(in 6 Tagen)");
    expect(text).toContain(`[n1] Mathematik "Ableitungen" (${heuteLokal(-2)})`);
  });

  it("meldet leere Bloecke ehrlich, wenn nichts vorliegt", () => {
    const lagebild: Lagebild = {
      heute: heuteLokal(),
      faecher: [],
      stundenHeute: [],
      naechsterSchultag: null,
      aufgaben: [],
      pruefungen: [],
      notizen: [],
    };

    const text = lagebildAlsText(lagebild);

    expect(text).toContain("keine Schule");
    expect(text).toContain("Naechster Schultag: in den naechsten 7 Tagen keiner");
    expect(text).not.toContain("Seine Faecher");
    expect(text).toContain("Offene Aufgaben (bis in 14 Tagen, ohne Pruefungen):\n- keine");
    expect(text).toContain("Pruefungen (naechste 30 Tage):\n- keine");
    expect(text).toContain("Zuletzt geaenderte Notizen:\n- keine");
  });
});
