import { describe, expect, it } from "vitest";
import { planSubjectSetup, type ExistingSubjectForSetup } from "./subject-store";

// planSubjectSetup ist die reine Mengenlogik hinter setupSubjects, ohne DB.
// Sie entscheidet, was angelegt, reaktiviert oder archiviert werden muss --
// und zwar so, dass ein zweiter Aufruf mit denselben Eingaben nichts mehr
// aendert (Idempotenz).

function faktisches(id: string, untisSubject: string | null, archivedAt: Date | null): ExistingSubjectForSetup {
  return { id, untisSubject, archivedAt };
}

describe("planSubjectSetup", () => {
  it("archiviert ein Fach, das aus selected herausfaellt", () => {
    const existing = [faktisches("1", "Mathe", null)];
    const plan = planSubjectSetup(existing, [], ["Mathe"]);
    expect(plan.toArchive).toEqual(["1"]);
    expect(plan.toReactivate).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it("reaktiviert ein archiviertes Fach, das wieder in selected steht", () => {
    const existing = [faktisches("1", "Mathe", new Date("2024-01-01"))];
    const plan = planSubjectSetup(existing, ["Mathe"], ["Mathe"]);
    expect(plan.toReactivate).toEqual(["1"]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it("laesst ein Fach mit untisSubject null unangetastet, egal was in selected steht", () => {
    const existing = [faktisches("1", null, null)];
    const planLeer = planSubjectSetup(existing, [], []);
    const planVoll = planSubjectSetup(existing, ["Irgendwas"], ["Irgendwas"]);
    expect(planLeer.toArchive).toEqual([]);
    expect(planLeer.toReactivate).toEqual([]);
    expect(planVoll.toArchive).toEqual([]);
    expect(planVoll.toReactivate).toEqual([]);
  });

  it("erzeugt beim zweiten Aufruf mit denselben Eingaben keine Aenderung", () => {
    const existing = [
      faktisches("1", "Mathe", null), // schon aktiv, bleibt aktiv
      faktisches("2", "Kunst", new Date("2024-01-01")), // schon archiviert, bleibt archiviert
    ];
    const plan = planSubjectSetup(existing, ["Mathe"], ["Mathe", "Kunst"]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toReactivate).toEqual([]);
    expect(plan.toArchive).toEqual([]);
  });

  it("legt einen neuen Namen mit korrektem archivedAt je nach selected an", () => {
    const plan = planSubjectSetup([], ["Mathe"], ["Mathe", "Kunst"]);
    expect(plan.toCreate).toHaveLength(2);
    const mathe = plan.toCreate.find((c) => c.name === "Mathe");
    const kunst = plan.toCreate.find((c) => c.name === "Kunst");
    expect(mathe?.archivedAt).toBeNull();
    expect(kunst?.archivedAt).toBeInstanceOf(Date);
  });
});
