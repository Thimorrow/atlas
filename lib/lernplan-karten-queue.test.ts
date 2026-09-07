// Tests fuer die Karten-Queue der Planseite. Siehe SPEC.md "Planseite"
// (Karten-Queue) und Akzeptanzkriterium A22.

import { describe, expect, it, vi } from "vitest";
import { runKartenQueue } from "@/lib/lernplan-karten-queue";
import type { PunktDTO } from "@/lib/lernplan-types";

const SUBJECT_ID = "11111111-1111-1111-1111-111111111111";
const ASSIGNMENT_ID = "22222222-2222-2222-2222-222222222222";
const NEUES_THEMA_ID = "33333333-3333-3333-3333-333333333333";

const PUNKT_DEFAULTS: Omit<PunktDTO, "id"> = {
  planId: "plan-1",
  topicId: "topic-1",
  position: 0,
  titel: "Punkt",
  detail: "",
  seiten: null,
  fileIds: ["datei-1"],
  blaetter: [],
  minutenSchaetzung: 10,
  sicherheit: 0,
  sicherheitQuelle: "ohne_test",
  sicherheitAm: new Date().toISOString(),
  cardsState: "offen",
  kartenAnzahl: 0,
  checks: [],
};

function makePunkt(overrides: Partial<PunktDTO> & { id: string }): PunktDTO {
  return { ...PUNKT_DEFAULTS, ...overrides };
}

type Call = { url: string; init?: RequestInit };

// Baut einen fetch-Stub: generieren-Aufrufe werden verzoegert (steuerbar per
// resolve-Funktion), damit die Parallelitaet messbar ist. patch-Aufrufe
// loesen sofort auf.
function makeFetchStub(opts: {
  generierenStatus?: (call: Call, index: number) => number;
  onGenerierenStart?: () => void;
  onGenerierenEnd?: () => void;
  themenStatus?: number;
} = {}) {
  const calls: Call[] = [];
  let generierenIndex = 0;

  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === "/api/lernen/generieren") {
      const index = generierenIndex++;
      opts.onGenerierenStart?.();
      // Mikrotask-Verzoegerung reicht, um echte Ueberlappung zu erzwingen,
      // ohne Timer im Test zu brauchen.
      await new Promise((r) => setTimeout(r, 5));
      opts.onGenerierenEnd?.();
      const status = opts.generierenStatus?.({ url, init }, index) ?? 200;
      return {
        ok: status < 400,
        status,
        json: async () => ({ cards: [{ question: "q", answer: "a", kind: "wissen" }] }),
      } as Response;
    }
    if (url === "/api/lernen/themen") {
      const status = opts.themenStatus ?? 201;
      return {
        ok: status < 400,
        status,
        json: async () => ({ thema: { id: NEUES_THEMA_ID } }),
      } as Response;
    }
    // PATCH /api/lernen/plan/points/[id]
    return { ok: true, status: 200, json: async () => ({ punkt: {} }) } as Response;
  });

  return { fetchStub, calls };
}

describe("runKartenQueue", () => {
  it("ruft für 3 offene Punkte genau 3 mal generieren auf, nie mehr als 2 gleichzeitig, und setzt cardsState fertig", async () => {
    let laufend = 0;
    let maxLaufend = 0;
    const { fetchStub, calls } = makeFetchStub({
      onGenerierenStart: () => {
        laufend++;
        maxLaufend = Math.max(maxLaufend, laufend);
      },
      onGenerierenEnd: () => {
        laufend--;
      },
    });

    const punkte = [makePunkt({ id: "p1" }), makePunkt({ id: "p2" }), makePunkt({ id: "p3" })];
    const statusEvents: { pointId: string; status: string }[] = [];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      onStatus: (pointId, status) => statusEvents.push({ pointId, status }),
    });

    const generierenCalls = calls.filter((c) => c.url === "/api/lernen/generieren");
    expect(generierenCalls.length).toBe(3);
    expect(maxLaufend).toBeLessThanOrEqual(2);
    expect(ergebnis.fertig.sort()).toEqual(["p1", "p2", "p3"]);
    expect(ergebnis.fehler).toEqual([]);

    const patchCalls = calls.filter((c) => c.url.startsWith("/api/lernen/plan/points/"));
    expect(patchCalls.length).toBe(3);
    for (const c of patchCalls) {
      expect(JSON.parse(c.init!.body as string)).toEqual({ cardsState: "fertig" });
    }
    expect(statusEvents.filter((e) => e.status === "fertig").length).toBe(3);
  });

  it("meldet einen 500 als fehler und patcht cardsState fehler", async () => {
    const { fetchStub, calls } = makeFetchStub({
      generierenStatus: (_call, index) => (index === 1 ? 500 : 200),
    });
    const punkte = [makePunkt({ id: "p1" }), makePunkt({ id: "p2" }), makePunkt({ id: "p3" })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });

    expect(ergebnis.fehler.length).toBe(1);
    expect(ergebnis.fertig.length).toBe(2);
    const fehlerId = ergebnis.fehler[0];
    const patchForFehler = calls.find(
      (c) => c.url === `/api/lernen/plan/points/${fehlerId}` && JSON.parse(c.init!.body as string).cardsState === "fehler",
    );
    expect(patchForFehler).toBeDefined();
  });

  it("fragt Punkte mit vorhandenen Karten nicht an", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [makePunkt({ id: "p1" }), makePunkt({ id: "p2", kartenAnzahl: 5, cardsState: "fertig" })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });

    const generierenCalls = calls.filter((c) => c.url === "/api/lernen/generieren");
    expect(generierenCalls.length).toBe(1);
    expect(ergebnis.fertig).toEqual(["p1"]);
  });

  it("nutzt quelle notizen für Punkte ohne Blätter", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [makePunkt({ id: "p1", fileIds: [] })];

    await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });

    const call = calls.find((c) => c.url === "/api/lernen/generieren")!;
    const body = JSON.parse(call.init!.body as string);
    expect(body.quelle).toBe("notizen");
    expect(body.fileIds).toEqual([]);
  });

  it("legt für einen Punkt ohne Thema ein neues Thema an, hängt topicId zurück und generiert dann Karten", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [makePunkt({ id: "p1", topicId: null })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });

    const themenCall = calls.find((c) => c.url === "/api/lernen/themen");
    expect(themenCall).toBeDefined();
    expect(JSON.parse(themenCall!.init!.body as string)).toEqual({
      subjectId: SUBJECT_ID,
      title: "Punkt",
      assignmentId: ASSIGNMENT_ID,
    });

    const topicPatchCall = calls.find(
      (c) => c.url === "/api/lernen/plan/points/p1" && JSON.parse(c.init!.body as string).topicId === NEUES_THEMA_ID,
    );
    expect(topicPatchCall).toBeDefined();

    const generierenCall = calls.find((c) => c.url === "/api/lernen/generieren")!;
    expect(JSON.parse(generierenCall.init!.body as string).topicId).toBe(NEUES_THEMA_ID);

    // Reihenfolge: erst themen-POST, dann PATCH topicId, dann generieren.
    const urls = calls.map((c) => c.url);
    expect(urls.indexOf("/api/lernen/themen")).toBeLessThan(urls.indexOf("/api/lernen/generieren"));
    expect(urls.indexOf("/api/lernen/plan/points/p1")).toBeLessThan(urls.indexOf("/api/lernen/generieren"));

    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.fertig).toEqual(["p1"]);
  });

  it("meldet einen 500 beim Thema-Anlegen als fehler, ohne generieren aufzurufen", async () => {
    const { fetchStub, calls } = makeFetchStub({ themenStatus: 500 });
    const punkte = [makePunkt({ id: "p1", topicId: null })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });

    expect(calls.filter((c) => c.url === "/api/lernen/generieren").length).toBe(0);
    expect(ergebnis.fehler).toEqual(["p1"]);
    const patchForFehler = calls.find(
      (c) => c.url === "/api/lernen/plan/points/p1" && JSON.parse(c.init!.body as string).cardsState === "fehler",
    );
    expect(patchForFehler).toBeDefined();
  });

  it("bricht nach dem laufenden Request ab und startet keine weiteren", async () => {
    const controller = new AbortController();
    let started = 0;
    const { fetchStub, calls } = makeFetchStub({
      onGenerierenStart: () => {
        started++;
        if (started === 1) controller.abort();
      },
    });
    const punkte = [makePunkt({ id: "p1" }), makePunkt({ id: "p2" }), makePunkt({ id: "p3" }), makePunkt({ id: "p4" })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      parallel: 1,
      signal: controller.signal,
    });

    const generierenCalls = calls.filter((c) => c.url === "/api/lernen/generieren");
    expect(generierenCalls.length).toBe(1);
    expect(ergebnis.fertig.length).toBe(1);
  });

  it("bezieht cardsState fehler nur ein, wenn sie explizit in erneut stehen", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [makePunkt({ id: "p1", cardsState: "fehler" }), makePunkt({ id: "p2", cardsState: "fehler" })];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      erneut: ["p1"],
    });

    expect(calls.filter((c) => c.url === "/api/lernen/generieren").length).toBe(1);
    expect(ergebnis.fertig).toEqual(["p1"]);
  });

  it("bezieht cardsState fertig ohne Karten nur ein, wenn sie explizit in erneut stehen (S3)", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [
      makePunkt({ id: "p1", cardsState: "fertig", kartenAnzahl: 0 }),
      makePunkt({ id: "p2", cardsState: "fertig", kartenAnzahl: 0 }),
    ];

    // Ohne erneut: kein automatischer Zugriff, sonst wuerde ein Punkt, der
    // wiederholt nichts liefert, bei jedem Aufruf erneut angestossen.
    const ohneErneut = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
    });
    expect(calls.filter((c) => c.url === "/api/lernen/generieren").length).toBe(0);
    expect(ohneErneut.fertig).toEqual([]);
    expect(ohneErneut.fehler).toEqual([]);

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      erneut: ["p1"],
    });

    expect(calls.filter((c) => c.url === "/api/lernen/generieren").length).toBe(1);
    expect(ergebnis.fertig).toEqual(["p1"]);
  });

  it("S1: ein erneut()-Aufruf nimmt keine offenen Punkte ausserhalb von erneut mit, auch wenn sie kartenAnzahl 0 haben", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [
      makePunkt({ id: "p1", cardsState: "fehler" }),
      // p2/p3 stehen fuer Punkte, die der parallel laufende Hauptlauf gerade
      // vorbereitet (cardsState "offen", kartenAnzahl 0) -- ein erneut()-Ruf
      // fuer p1 darf sie nicht nebenbei mitnehmen, sonst laufen fuer
      // dasselbe Thema zwei generieren-Aufrufe gleichzeitig (S1).
      makePunkt({ id: "p2", cardsState: "offen", kartenAnzahl: 0 }),
      makePunkt({ id: "p3", cardsState: "offen", kartenAnzahl: 0 }),
    ];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      erneut: ["p1"],
    });

    const generierenCalls = calls.filter((c) => c.url === "/api/lernen/generieren");
    expect(generierenCalls.length).toBe(1);
    expect(ergebnis.fertig).toEqual(["p1"]);
    expect(ergebnis.fehler).toEqual([]);
  });

  it("S1: ein offener Punkt darf trotzdem ueber erneut() laufen, wenn er dort explizit genannt ist", async () => {
    const { fetchStub, calls } = makeFetchStub();
    const punkte = [
      makePunkt({ id: "p1", cardsState: "offen", kartenAnzahl: 0 }),
      makePunkt({ id: "p2", cardsState: "offen", kartenAnzahl: 0 }),
    ];

    const ergebnis = await runKartenQueue(punkte, {
      fetch: fetchStub as unknown as typeof fetch,
      subjectId: SUBJECT_ID,
      assignmentId: ASSIGNMENT_ID,
      erneut: ["p1"],
    });

    const generierenCalls = calls.filter((c) => c.url === "/api/lernen/generieren");
    expect(generierenCalls.length).toBe(1);
    expect(ergebnis.fertig).toEqual(["p1"]);
  });
});
