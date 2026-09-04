import { describe, expect, it, beforeEach, vi } from "vitest";

// seedCurricula und saveCurriculum gegen eine eingesetzte Fake-Datenzugriffs-
// schicht: die echte Datenbank ist aus dieser Umgebung nicht erreichbar
// (DATABASE_URL ist bewusst nicht hinterlegt). Der Fake bildet genau die zwei
// Zugriffe nach, die der Store macht -- ein select auf die Faecher ohne
// Lehrplan und ein update je Fach.
//
// Grenze des Fakes, bewusst so: das WHERE der Queries wird nicht ausgewertet.
// Der Filter "curriculum is null" steckt stattdessen im Fake selbst, und ein
// update trifft das Fach, dessen Vorlagentext geschrieben wird (bei
// Handeingaben das einzige Fach im Store). Was der Test also zeigt, ist die
// Zuordnungs- und Ueberschreiblogik, nicht das SQL.

type Row = {
  id: string;
  name: string;
  untisSubject: string | null;
  curriculum: string | null;
  curriculumSource: string | null;
  curriculumUpdatedAt: Date | null;
};

let store: Row[] = [];
let updates: Record<string, unknown>[] = [];

function thenable(value: unknown) {
  return {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(res, rej),
    returning: () => Promise.resolve(value),
  };
}

const db = {
  select: () => ({
    from: () => ({
      where: () =>
        Promise.resolve(
          store
            .filter((r) => r.curriculum === null)
            .map((r) => ({ id: r.id, name: r.name, untisSubject: r.untisSubject })),
        ),
    }),
  }),
  update: () => ({
    set: (patch: Record<string, unknown>) => ({
      where: () => {
        updates.push(patch);
        const ziel =
          store.find((r) => r.curriculum === null && erwarteterText(r) === patch.curriculum) ??
          store[0];
        if (ziel) {
          ziel.curriculum = (patch.curriculum as string | null) ?? null;
          ziel.curriculumSource = (patch.curriculumSource as string | null) ?? null;
          ziel.curriculumUpdatedAt = (patch.curriculumUpdatedAt as Date | null) ?? null;
        }
        return thenable(ziel ? [ziel] : []);
      },
    }),
  }),
};

vi.mock("@/lib/db", () => ({ db }));

const { KERNLEHRPLAN_QUELLE, saveCurriculum, seedCurricula, vorlageFuerFach } = await import(
  "./subject-store"
);
const { lehrplanAlsMarkdown } = await import("./lehrplan/rendern");

function erwarteterText(row: { name: string; untisSubject: string | null }): string | null {
  const vorlage = vorlageFuerFach(row);
  return vorlage ? lehrplanAlsMarkdown(vorlage) : null;
}

function fach(id: string, name: string, untisSubject: string | null, curriculum: string | null = null): Row {
  return {
    id,
    name,
    untisSubject,
    curriculum,
    curriculumSource: curriculum ? "Von Hand" : null,
    curriculumUpdatedAt: curriculum ? new Date("2026-01-01") : null,
  };
}

beforeEach(() => {
  store = [];
  updates = [];
});

describe("seedCurricula", () => {
  it("belegt ein Fach aus der Vorlage vor und meldet Fächer ohne Treffer", async () => {
    store = [fach("1", "Mathematik", "M"), fach("2", "Schulband", null)];

    const bericht = await seedCurricula();

    expect(bericht.belegt).toEqual([{ fach: "Mathematik", vorlage: "Mathematik" }]);
    expect(bericht.ohneVorlage).toEqual(["Schulband"]);
    expect(store[0].curriculum).toContain("##");
    expect(store[0].curriculumSource).toBe(KERNLEHRPLAN_QUELLE);
    expect(store[1].curriculum).toBeNull();
  });

  it("findet die Vorlage über den Untis-Wert, wenn der Anzeigename nichts trifft", async () => {
    store = [fach("1", "Mathe bei Frau Meyer", "M")];
    const bericht = await seedCurricula();
    expect(bericht.belegt).toEqual([{ fach: "Mathe bei Frau Meyer", vorlage: "Mathematik" }]);
  });

  it("belegt beim zweiten Lauf nichts neu", async () => {
    store = [fach("1", "Mathematik", "M"), fach("2", "Schulband", null)];
    await seedCurricula();
    const nachErstemLauf = store[0].curriculum;
    updates = [];

    const zweiter = await seedCurricula();

    expect(zweiter.belegt).toEqual([]);
    expect(updates).toEqual([]);
    expect(store[0].curriculum).toBe(nachErstemLauf);
  });

  it("lässt einen von Hand geschriebenen Text unangetastet", async () => {
    store = [fach("1", "Mathematik", "M", "Mein eigener Plan")];

    const bericht = await seedCurricula();

    expect(bericht.belegt).toEqual([]);
    expect(updates).toEqual([]);
    expect(store[0].curriculum).toBe("Mein eigener Plan");
    expect(store[0].curriculumSource).toBe("Von Hand");
  });
});

describe("saveCurriculum", () => {
  it("speichert Text, Quelle und Zeitpunkt", async () => {
    store = [fach("1", "Mathematik", "M")];

    const gespeichert = await saveCurriculum("1", "  Mein eigener Plan  ", "Von Hand");

    // Getrimmt gespeichert, wie bei den Stundennotizen.
    expect(gespeichert?.curriculum).toBe("Mein eigener Plan");
    expect(gespeichert?.curriculumSource).toBe("Von Hand");
    expect(gespeichert?.curriculumUpdatedAt).toBeTruthy();
  });

  it("löscht alle drei Spalten bei leerem Text", async () => {
    store = [fach("1", "Mathematik", "M", "Mein eigener Plan")];

    const gespeichert = await saveCurriculum("1", "   \n ", "Von Hand");

    expect(gespeichert?.curriculum).toBeNull();
    expect(gespeichert?.curriculumSource).toBeNull();
    expect(gespeichert?.curriculumUpdatedAt).toBeNull();
  });

  it("lässt den eigenen Text auch nach einem erneuten Seed-Lauf stehen", async () => {
    store = [fach("1", "Mathematik", "M")];
    await saveCurriculum("1", "Mein eigener Plan", "Von Hand");

    const bericht = await seedCurricula();

    expect(bericht.belegt).toEqual([]);
    expect(store[0].curriculum).toBe("Mein eigener Plan");
  });
});
