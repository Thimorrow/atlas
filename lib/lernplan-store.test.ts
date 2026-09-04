// Integrations-Tests gegen echtes Neon (uebersprungen ohne DATABASE_URL,
// siehe lib/tutor/store.test.ts fuer dasselbe Muster). Legt ein Sentinel-Fach
// und eine Sentinel-Pruefung an, raeumt in afterAll wieder auf.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, studyCards, studyTopics, subjects } from "@/lib/db/schema";
import {
  aktualisiereAusFazit,
  aktualisiereAusKarten,
  itemAbhaken,
  LernplanStoreFehler,
  planAnlegen,
  planLaden,
  planLoeschen,
} from "@/lib/lernplan-store";
import type { CheckDraft, PunktDraft } from "@/lib/lernplan-types";
import { reviewCard } from "@/lib/study-store";

const mitDb = Boolean(process.env.DATABASE_URL);

const SUBJECT_NAME = "TST-Lernplan";

async function cleanup() {
  await db.delete(subjects).where(eq(subjects.name, SUBJECT_NAME)); // cascade raeumt assignments/study_plans/study_topics mit
}

function punkt(overrides: Partial<PunktDraft> = {}): PunktDraft {
  return {
    titel: "Bruchrechnung",
    detail: "Brüche addieren und subtrahieren",
    seiten: "12-14",
    fileIds: [],
    minuten: 30,
    frage: "Was ist 1/2 + 1/4?",
    musterantwort: "3/4",
    ...overrides,
  };
}

describe.skipIf(!mitDb)("lernplan-store (Integration, Neon)", () => {
  let subjectId: string;
  let assignmentId: string;
  const heute = { heuteISO: "2026-01-01", jetztHM: "08:00" };

  beforeAll(async () => {
    await cleanup();
    const [subject] = await db.insert(subjects).values({ name: SUBJECT_NAME, untisSubject: null }).returning();
    subjectId = subject.id;
    const [assignment] = await db
      .insert(assignments)
      .values({ subjectId, type: "exam", title: "TST-Klausur", dueDate: "2026-01-10" })
      .returning();
    assignmentId = assignment.id;
  });

  afterAll(cleanup);

  it("legt einen Plan mit ohne_test-Sicherheit an, wenn checks null ist", async () => {
    const { plan, createdTopicIds } = await planAnlegen(
      {
        assignmentId,
        checklist: { text: "Checkliste" },
        fileIds: [],
        minutesWeekday: 30,
        minutesWeekend: 60,
        punkte: [punkt(), punkt({ titel: "Prozentrechnung" })],
        checks: null,
        ersetzen: false,
      },
      heute,
    );

    expect(plan.punkte).toHaveLength(2);
    expect(plan.punkte.every((p) => p.sicherheit === 50 && p.sicherheitQuelle === "ohne_test")).toBe(true);
    expect(createdTopicIds).toHaveLength(2);
    expect(plan.items.length).toBeGreaterThan(0);
    // Letzter Tag ist die Simulation.
    expect(plan.items.some((i) => i.phase === "simulation")).toBe(true);

    await planLoeschen(plan.id, createdTopicIds);
  });

  it("ersetzt einen bestehenden Plan (ersetzen: true) und behaelt/erneuert Themen nach Titel", async () => {
    const erster = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
      heute,
    );

    const zweiter = await planAnlegen(
      {
        assignmentId,
        checklist: { text: "y" },
        fileIds: [],
        minutesWeekday: 30,
        minutesWeekend: 60,
        punkte: [punkt({ titel: "Bruchrechnung" })],
        checks: null,
        ersetzen: true,
      },
      heute,
    );

    expect(zweiter.plan.id).not.toBe(erster.plan.id);
    // Gleicher Titel an derselben Pruefung -> Thema wiederverwendet, kein
    // zweites Thema angelegt.
    expect(zweiter.createdTopicIds).toHaveLength(0);
    expect(zweiter.plan.punkte[0].topicId).toBe(erster.plan.punkte[0].topicId);

    // Der alte Plan ist weg (assignment_id ist unique).
    expect(await planLaden(assignmentId)).not.toBeNull();
    expect((await planLaden(assignmentId))?.id).toBe(zweiter.plan.id);

    await planLoeschen(zweiter.plan.id, zweiter.plan.punkte.map((p) => p.topicId!).filter(Boolean));
  });

  it("fremde Datei -> 400 dateien_fremd", async () => {
    await expect(
      planAnlegen(
        {
          assignmentId,
          checklist: { text: "x" },
          fileIds: ["00000000-0000-0000-0000-000000000000"],
          minutesWeekday: 30,
          minutesWeekend: 60,
          punkte: [punkt()],
          checks: null,
          ersetzen: false,
        },
        heute,
      ),
    ).rejects.toMatchObject({ status: 400, code: "dateien_fremd" });
  });

  it("409 plan_gerade_erstellt innerhalb 30s ohne ersetzen", async () => {
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
      heute,
    );

    await expect(
      planAnlegen(
        { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
        heute,
      ),
    ).rejects.toMatchObject({ status: 409, code: "plan_gerade_erstellt" });

    await planLoeschen(plan.id, createdTopicIds);
  });

  it("DELETE mit topicIds loescht nur diese Themen; fremde topicIds -> 400 themen_fremd", async () => {
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
      heute,
    );

    await expect(planLoeschen(plan.id, ["00000000-0000-0000-0000-000000000000"])).rejects.toMatchObject({
      status: 400,
      code: "themen_fremd",
    });

    await planLoeschen(plan.id, createdTopicIds);
    expect(await planLaden(assignmentId)).toBeNull();
  });

  it("PATCH item mit result auf probe setzt Sicherheit mit Quelle selbst", async () => {
    const check: CheckDraft = { frage: punkt().frage!, musterantwort: punkt().musterantwort!, antwort: "3/4", urteil: "richtig", feedback: "" };
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: [check], ersetzen: false },
      heute,
    );

    // Sicherheit 100 (richtig) -> nur "ueben", kein "probe". Fuer einen
    // sicheren "probe"-Test wird der Punkt manuell auf < 80 zurueckgesetzt
    // ueber einen zweiten Plan mit falscher Antwort.
    await planLoeschen(plan.id, createdTopicIds);

    const falsch: CheckDraft = { frage: punkt().frage!, musterantwort: punkt().musterantwort!, antwort: "falsch", urteil: "falsch", feedback: "" };
    const zweiter = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: [falsch], ersetzen: true },
      heute,
    );

    const probeItem = zweiter.plan.items.find((i) => i.phase === "probe");
    expect(probeItem).toBeDefined();

    const updated = await itemAbhaken(probeItem!.id, { done: true, result: 0 });
    expect(updated.doneAt).not.toBeNull();
    expect(updated.result).toBe(0);

    const geladen = await planLaden(assignmentId);
    const punktGeladen = geladen!.punkte.find((p) => p.id === probeItem!.pointId);
    expect(punktGeladen?.sicherheit).toBe(0);
    expect(punktGeladen?.sicherheitQuelle).toBe("selbst");

    await planLoeschen(zweiter.plan.id, zweiter.createdTopicIds);
  });

  it("itemAbhaken mit unbekannter id wirft 404 item_fehlt", async () => {
    await expect(itemAbhaken("00000000-0000-0000-0000-000000000000", { done: true })).rejects.toBeInstanceOf(
      LernplanStoreFehler,
    );
  });

  it("aktualisiereAusKarten setzt Sicherheit aus Karten-Boxen (Quelle karten)", async () => {
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
      heute,
    );
    const topicId = plan.punkte[0].topicId!;

    await db.insert(studyCards).values({ subjectId, topicId, question: "Q", answer: "A", box: 5, due: "2026-01-01", reviews: 1 });
    await db.insert(studyCards).values({ subjectId, topicId, question: "Q2", answer: "A2", box: 0, due: "2026-01-01", reviews: 0 });

    await aktualisiereAusKarten(topicId);

    const geladen = await planLaden(assignmentId);
    const p = geladen!.punkte.find((x) => x.topicId === topicId);
    // Nur die Karte mit >=1 Review zaehlt: Box 5 -> sicherheitAusKarten([5]) = 100.
    expect(p?.sicherheit).toBe(100);
    expect(p?.sicherheitQuelle).toBe("karten");

    await planLoeschen(plan.id, createdTopicIds);
  });

  it("A14 reviewCard einer Karte des Themas schreibt die Punkt-Sicherheit zurueck (Quelle karten)", async () => {
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: null, ersetzen: false },
      heute,
    );
    const topicId = plan.punkte[0].topicId!;

    const [card] = await db
      .insert(studyCards)
      .values({ subjectId, topicId, question: "Q", answer: "A", box: 4, due: "2026-01-01" })
      .returning();

    await reviewCard(card.id, true);

    const geladen = await planLaden(assignmentId);
    const p = geladen!.punkte.find((x) => x.topicId === topicId);
    expect(p?.sicherheitQuelle).toBe("karten");

    await planLoeschen(plan.id, createdTopicIds);
  });

  it("aktualisiereAusFazit setzt Sicherheit einer Probe-Einheit mit Quelle fazit", async () => {
    const falsch: CheckDraft = { frage: "f", musterantwort: "m", antwort: "falsch", urteil: "falsch", feedback: "" };
    const { plan, createdTopicIds } = await planAnlegen(
      { assignmentId, checklist: { text: "x" }, fileIds: [], minutesWeekday: 30, minutesWeekend: 60, punkte: [punkt()], checks: [falsch], ersetzen: false },
      heute,
    );
    const probeItem = plan.items.find((i) => i.phase === "probe")!;

    await aktualisiereAusFazit(probeItem.id, 70);

    const geladen = await planLaden(assignmentId);
    const p = geladen!.punkte.find((x) => x.id === probeItem.pointId);
    expect(p?.sicherheit).toBe(70);
    expect(p?.sicherheitQuelle).toBe("fazit");
    const itemGeladen = geladen!.items.find((i) => i.id === probeItem.id);
    expect(itemGeladen?.doneAt).not.toBeNull();

    await planLoeschen(plan.id, createdTopicIds);
  });
});
