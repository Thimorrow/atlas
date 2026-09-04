import { describe, expect, it } from "vitest";
import {
  planCurriculumSeed,
  planSubjectReconcile,
  planSubjectSetup,
  type ExistingSubjectForReconcile,
  type ExistingSubjectForSetup,
} from "./subject-store";

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

// planSubjectReconcile ist die reine Mengenlogik hinter reconcileSubjects: der
// Stundenplan sagt, welche Faecher es gibt und wer sie unterrichtet, die
// Faecherliste zieht nach.

function fach(
  id: string,
  untisSubject: string | null,
  extra: Partial<ExistingSubjectForReconcile> = {},
): ExistingSubjectForReconcile {
  return {
    id,
    untisSubject,
    teacher: null,
    room: null,
    untisTeacher: null,
    untisRoom: null,
    archivedAt: null,
    content: 0,
    ...extra,
  };
}

describe("planSubjectReconcile", () => {
  it("legt ein Fach an, das im Stundenplan steht, aber noch keine Zeile hat", () => {
    const plan = planSubjectReconcile([], [{ subject: "Physik", teacher: "Ka", room: "B12" }]);
    expect(plan.toCreate).toEqual([{ subject: "Physik", teacher: "Ka", room: "B12" }]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toArchive).toEqual([]);
  });

  it("uebernimmt Lehrer und Raum aus dem Stundenplan", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Mathe")],
      [{ subject: "Mathe", teacher: "Sch", room: "A120" }],
    );
    expect(plan.toUpdate).toEqual([
      { id: "1", teacher: "Sch", room: "A120", untisTeacher: "Sch", untisRoom: "A120" },
    ]);
  });

  it("laesst alles stehen, wenn Untis nichts weiss", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Mathe", { teacher: "Schulz", room: "A120" })],
      [{ subject: "Mathe", teacher: null, room: null }],
    );
    expect(plan.toUpdate).toEqual([]);
  });

  it("aendert nichts, wenn Lehrer und Raum schon stimmen (idempotent)", () => {
    const plan = planSubjectReconcile(
      [
        fach("1", "Mathe", {
          teacher: "Sch",
          room: "A120",
          untisTeacher: "Sch",
          untisRoom: "A120",
        }),
      ],
      [{ subject: "Mathe", teacher: "Sch", room: "A120" }],
    );
    expect(plan).toEqual({ toCreate: [], toUpdate: [], toArchive: [], toDelete: [] });
  });

  // Der Fall, fuer den es untisTeacher ueberhaupt gibt: zu manchen Lehrern
  // kennt Untis nur ein Kuerzel, der lesbare Name kann dann nur von Hand
  // kommen -- und muss den naechsten Sync ueberleben.
  it("laesst eine Handeingabe stehen, auch wenn Untis weiter sein Kuerzel liefert", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Chemie", { teacher: "Bergmann", untisTeacher: "BRM" })],
      [{ subject: "Chemie", teacher: "BRM", room: null }],
    );
    expect(plan.toUpdate).toEqual([]);
  });

  it("uebernimmt einen Lehrerwechsel, solange niemand von Hand eingegriffen hat", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Mathe", { teacher: "Wirth", untisTeacher: "Wirth" })],
      [{ subject: "Mathe", teacher: "Schulze", room: null }],
    );
    expect(plan.toUpdate).toEqual([
      { id: "1", teacher: "Schulze", room: null, untisTeacher: "Schulze", untisRoom: null },
    ]);
  });

  // Der Rohwert wird auch dann mitgeschrieben, wenn die Anzeige von Hand
  // gepflegt ist. Sonst wuerde ein spaeterer Lehrerwechsel nie auffallen.
  it("merkt sich den neuen Untis-Wert hinter einer Handeingabe", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Chemie", { teacher: "Bergmann", untisTeacher: "BRM" })],
      [{ subject: "Chemie", teacher: "NEU", room: null }],
    );
    expect(plan.toUpdate).toEqual([
      { id: "1", teacher: "Bergmann", room: null, untisTeacher: "NEU", untisRoom: null },
    ]);
  });

  it("loescht ein Fach ohne Stunden und ohne Inhalt", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Informatik/ang. Mathematik", { archivedAt: new Date("2024-01-01") })],
      [{ subject: "Informatik", teacher: null, room: null }],
    );
    expect(plan.toDelete).toEqual(["1"]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toCreate.map((c) => c.subject)).toEqual(["Informatik"]);
  });

  it("archiviert statt zu loeschen, sobald Inhalte daran haengen", () => {
    const plan = planSubjectReconcile([fach("1", "Kunst", { content: 3 })], [
      { subject: "Mathe", teacher: null, room: null },
    ]);
    expect(plan.toArchive).toEqual(["1"]);
    expect(plan.toDelete).toEqual([]);
  });

  it("archiviert ein bereits archiviertes Fach mit Inhalt nicht erneut", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Kunst", { content: 3, archivedAt: new Date("2024-01-01") })],
      [{ subject: "Mathe", teacher: null, room: null }],
    );
    expect(plan.toArchive).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("reaktiviert ein abgewaehltes Fach nicht, nur weil es im Stundenplan steht", () => {
    const plan = planSubjectReconcile(
      [fach("1", "Kunst", { archivedAt: new Date("2024-01-01") })],
      [{ subject: "Kunst", teacher: null, room: null }],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("laesst manuell angelegte Faecher (untisSubject null) unangetastet", () => {
    const plan = planSubjectReconcile(
      [fach("1", null, { teacher: "Frau Meyer" })],
      [{ subject: "Mathe", teacher: null, room: null }],
    );
    expect(plan.toArchive).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
  });
});

// planCurriculumSeed ist die reine Zuordnung hinter seedCurricula: welches
// Fach bekommt welchen Text aus der statischen Vorlage, und welches gar keinen.
describe("planCurriculumSeed", () => {
  it("findet die Vorlage ueber den Fachnamen", () => {
    const plan = planCurriculumSeed([{ id: "1", name: "Mathematik", untisSubject: null }]);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].vorlage).toBe("Mathematik");
    expect(plan.toWrite[0].curriculum).toContain("##");
    expect(plan.ohneVorlage).toEqual([]);
  });

  it("faellt auf den Untis-Wert zurueck, wenn der Anzeigename nichts trifft", () => {
    const plan = planCurriculumSeed([{ id: "1", name: "Mathe LK Frau Meyer", untisSubject: "M" }]);
    expect(plan.toWrite[0]?.vorlage).toBe("Mathematik");
  });

  it("meldet ein Fach ohne Vorlage, statt es zu belegen", () => {
    const plan = planCurriculumSeed([{ id: "1", name: "Schulband", untisSubject: null }]);
    expect(plan.toWrite).toEqual([]);
    expect(plan.ohneVorlage).toEqual(["Schulband"]);
  });
});
