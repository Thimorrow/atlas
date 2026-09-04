import { heuteISO } from "@/lib/zeit";
import { addDays } from "@/lib/assignments-view";
import { describe, expect, it, vi } from "vitest";
import type { StundeResponse } from "@/lib/stunde-kontext";

// buildGreeting kommt ohne Modellaufruf aus, braucht aber die DB -- die wird
// hier ueber die beiden Store-Funktionen gemockt, im Stil der uebrigen Tests
// (siehe lib/subject-store.test.ts), nur eben mit vi.mock statt reiner Logik,
// weil buildGreeting selbst keine reine Funktion ist.

const expandRange = vi.fn();
const listAssignments = vi.fn();

vi.mock("@/lib/calendar-expand", () => ({ expandRange }));
vi.mock("@/lib/assignment-store", () => ({ listAssignments }));

const { buildGreeting, buildSystemPrompt } = await import("./context");

// Deutscher Kalendertag plus Versatz -- dieselbe Lesart wie der Code selbst
// (lib/zeit.ts), damit der Test in jeder Zeitzone dasselbe "morgen" meint.
function heuteLokal(offset = 0): string {
  return addDays(heuteISO(), offset);
}

describe("buildGreeting", () => {
  it("sagt ehrlich, dass keine Stunden anstehen, wenn der Plan leer ist", async () => {
    expandRange.mockResolvedValue({ days: Array.from({ length: 8 }, (_, i) => ({ date: heuteLokal(i), events: [] })) });
    listAssignments.mockResolvedValue([]);

    const greeting = await buildGreeting();
    expect(greeting.text).toContain("keine Schulstunden");
    expect(greeting.suggestions).toHaveLength(3);
  });

  it("nennt Faecher und eine anstehende Arbeit fuer morgen", async () => {
    const morgen = heuteLokal(1);
    expandRange.mockResolvedValue({
      days: [
        { date: heuteLokal(0), events: [] },
        {
          date: morgen,
          events: [
            { title: "Biologie", startTime: "08:00" },
            { title: "Informatik", startTime: "09:00" },
            { title: "Mathe", startTime: "10:00" },
          ],
        },
        ...Array.from({ length: 6 }, (_, i) => ({ date: heuteLokal(i + 2), events: [] })),
      ],
    });
    listAssignments.mockResolvedValue([
      { id: "1", subjectName: "Mathe", type: "exam", dueDate: morgen, completedAt: null },
    ]);

    const greeting = await buildGreeting();
    expect(greeting.text).toContain("Morgen");
    expect(greeting.text).toContain("Biologie");
    expect(greeting.text).toContain("Informatik");
    expect(greeting.text).toContain("Mathe");
    expect(greeting.text).toContain("Arbeit");
    // Die anstehende Arbeit liegt innerhalb der naechsten 7 Tage, darum
    // ersetzt der Pruefungshinweis den ersten Vorschlag durch einen
    // Lern-Vorschlag statt des sonst ueblichen "was muss ich fuer morgen".
    expect(greeting.suggestions[0]).toContain("lernen");
  });

  function fixtureJetzt(overrides: Partial<StundeResponse> = {}): StundeResponse {
    return {
      today: heuteLokal(0),
      nowHM: "09:15",
      modus: "live",
      tag: [],
      liveRefId: "ref-1",
      selected: {
        refId: "ref-1",
        date: heuteLokal(0),
        startTime: "09:00",
        endTime: "09:45",
        title: "Mathe",
        status: "regular",
        room: "R204",
        teacher: "Frau Muster",
        subjectId: "s1",
        subjectColor: "blue",
        subjectName: "Mathe",
        hasNote: false,
        hasAssignment: false,
        minutesLeft: 30,
        minutesUntil: 0,
        progress: 0.33,
      },
      faellig: [],
      ohneTermin: [],
      demnaechst: [],
      naechstePruefung: null,
      letzteNotiz: null,
      naechsterTermin: null,
      ...overrides,
    };
  }

  it("live-Modus: nennt das laufende Fach, die Restzeit und faellige Aufgaben", async () => {
    listAssignments.mockResolvedValue([]);
    const jetzt = fixtureJetzt({
      faellig: [
        {
          id: "a1",
          subjectId: "s1",
          subjectName: "Mathe",
          subjectColor: null,
          type: "homework",
          title: "Buch S. 5",
          notes: null,
          dueDate: heuteLokal(0),
          completedAt: null,
        },
      ],
    });

    const greeting = await buildGreeting(jetzt);
    expect(greeting.text).toContain("Gerade läuft Mathe");
    expect(greeting.text).toContain("noch 30 Minuten");
    expect(greeting.text).toContain("1 Aufgabe(n) fällig");
    expect(greeting.suggestions).toContain("Was ist heute noch fällig?");
  });

  it("pause/vor-Modus: nennt die naechste Stunde mit Uhrzeit und Raum", async () => {
    listAssignments.mockResolvedValue([]);
    const jetzt = fixtureJetzt({ modus: "vor" });

    const greeting = await buildGreeting(jetzt);
    expect(greeting.text).toContain("Als Nächstes Mathe um 09:00");
    expect(greeting.text).toContain("Raum R204");
  });

  it("haengt in jedem Fall einen Pruefungshinweis an, wenn in den naechsten 7 Tagen eine Pruefung ansteht", async () => {
    expandRange.mockResolvedValue({
      days: Array.from({ length: 8 }, (_, i) => ({ date: heuteLokal(i), events: [] })),
    });
    const pruefungsTag = heuteLokal(3);
    listAssignments.mockResolvedValue([
      {
        id: "e1",
        subjectId: "s1",
        subjectName: "Mathe",
        subjectColor: null,
        type: "exam",
        title: "Matheklausur",
        notes: null,
        dueDate: pruefungsTag,
        completedAt: null,
      },
    ]);

    const greeting = await buildGreeting();
    expect(greeting.text).toContain("Matheklausur");
    expect(greeting.suggestions[0]).toBe("Hilf mir, für Mathe zu lernen");
  });
});

describe("buildSystemPrompt", () => {
  it("weist das Modell an, auch auf Deutsch zu denken", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Denke auf Deutsch. Auch deine internen Ueberlegungen formulierst du ausschliesslich auf Deutsch.");
  });
});
