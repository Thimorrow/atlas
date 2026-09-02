import { describe, expect, it, vi } from "vitest";

// buildGreeting kommt ohne Modellaufruf aus, braucht aber die DB -- die wird
// hier ueber die beiden Store-Funktionen gemockt, im Stil der uebrigen Tests
// (siehe lib/subject-store.test.ts), nur eben mit vi.mock statt reiner Logik,
// weil buildGreeting selbst keine reine Funktion ist.

const expandRange = vi.fn();
const listAssignments = vi.fn();

vi.mock("@/lib/calendar-expand", () => ({ expandRange }));
vi.mock("@/lib/assignment-store", () => ({ listAssignments }));

const { buildGreeting } = await import("./context");

function heuteLokal(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    expect(greeting.suggestions[0]).toContain("morgen");
  });
});
