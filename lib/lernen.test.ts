import { describe, expect, it } from "vitest";
import {
  BOX_INTERVALS,
  MASTERED_BOX,
  MAX_BOX,
  daysBetween,
  isDue,
  parseGeneratedCards,
  planForExam,
  progress,
  schedule,
  sessionQueue,
  type CardLike,
} from "@/lib/lernen";

describe("schedule", () => {
  it("erhoeht die Box bei einer richtigen Antwort und setzt due nach Intervall", () => {
    const result = schedule({ box: 1 }, true, "2026-01-01");
    expect(result.box).toBe(2);
    expect(BOX_INTERVALS[2]).toBe(3);
    expect(result.due).toBe("2026-01-04");
  });

  it("box 5 bleibt bei richtiger Antwort auf 5 (Obergrenze)", () => {
    const result = schedule({ box: MAX_BOX }, true, "2026-01-01");
    expect(result.box).toBe(MAX_BOX);
  });

  it("eine falsche Antwort setzt box auf 0 und due auf heute", () => {
    const result = schedule({ box: 4 }, false, "2026-01-01");
    expect(result.box).toBe(0);
    expect(result.due).toBe("2026-01-01");
  });

  it("box 0 -> richtig -> box 1, faellig nach BOX_INTERVALS[1] Tagen", () => {
    const result = schedule({ box: 0 }, true, "2026-01-01");
    expect(result.box).toBe(1);
    expect(result.due).toBe("2026-01-02");
  });
});

describe("isDue", () => {
  it("ist faellig, wenn due <= heute und nicht archiviert", () => {
    const card: CardLike = { box: 0, due: "2026-01-01", reviews: 0 };
    expect(isDue(card, "2026-01-01")).toBe(true);
    expect(isDue(card, "2026-01-02")).toBe(true);
  });

  it("ist nicht faellig, wenn due in der Zukunft liegt", () => {
    const card: CardLike = { box: 0, due: "2026-01-05", reviews: 0 };
    expect(isDue(card, "2026-01-01")).toBe(false);
  });

  it("ist nie faellig, wenn archiviert", () => {
    const card: CardLike = { box: 0, due: "2026-01-01", reviews: 0, archivedAt: "2026-01-01T00:00:00Z" };
    expect(isDue(card, "2026-01-01")).toBe(false);
  });
});

describe("sessionQueue", () => {
  it("faellige zuerst (niedrige Box zuerst, dann aeltestes due), dann neue Karten", () => {
    const cards: CardLike[] = [
      { box: 2, due: "2026-01-01", reviews: 3 }, // faellig
      { box: 0, due: "2026-01-01", reviews: 1 }, // faellig, niedrigste Box
      { box: 1, due: "2025-12-30", reviews: 2 }, // faellig, aelter
      { box: 0, due: "2026-01-05", reviews: 0 }, // neu, nicht faellig
    ];
    const queue = sessionQueue(cards, "2026-01-01");
    expect(queue.map((c) => c.reviews)).toEqual([1, 2, 3, 0]);
  });

  it("begrenzt auf limit", () => {
    const cards: CardLike[] = Array.from({ length: 5 }, (_, i) => ({
      box: 0,
      due: "2026-01-01",
      reviews: i,
    }));
    expect(sessionQueue(cards, "2026-01-01", 2)).toHaveLength(2);
  });

  it("schliesst archivierte Karten aus", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0, archivedAt: "2026-01-01" },
      { box: 0, due: "2026-01-01", reviews: 1 },
    ];
    const queue = sessionQueue(cards, "2026-01-01");
    expect(queue).toHaveLength(1);
  });
});

describe("progress", () => {
  it("zaehlt neu (reviews 0), sicher (box >= MASTERED_BOX), lernend (Rest)", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0 }, // neu
      { box: 1, due: "2026-01-01", reviews: 2 }, // lernend
      { box: MASTERED_BOX, due: "2026-01-01", reviews: 5 }, // sicher
      { box: MAX_BOX, due: "2026-01-01", reviews: 8 }, // sicher
    ];
    expect(progress(cards)).toEqual({ total: 4, neu: 1, lernend: 1, sicher: 2 });
  });

  it("archivierte Karten zaehlen nicht mit", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0, archivedAt: "2026-01-01" },
      { box: 0, due: "2026-01-01", reviews: 0 },
    ];
    expect(progress(cards).total).toBe(1);
  });
});

describe("daysBetween", () => {
  it("rechnet den Abstand zweier ISO-Daten", () => {
    expect(daysBetween("2026-01-01", "2026-01-05")).toBe(4);
    expect(daysBetween("2026-01-05", "2026-01-01")).toBe(-4);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("planForExam", () => {
  it("rechnet proTag als offene Karten geteilt durch verbleibende Tage", () => {
    const cards: CardLike[] = Array.from({ length: 10 }, () => ({ box: 0, due: "2026-01-01", reviews: 0 }));
    const plan = planForExam(cards, "2026-01-06", "2026-01-01");
    expect(plan.tageBis).toBe(5);
    expect(plan.offen).toBe(10);
    expect(plan.proTag).toBe(2);
  });

  it("Pruefung heute: tageBis 0, proTag = offen (Division durch 1 statt 0)", () => {
    const cards: CardLike[] = Array.from({ length: 3 }, () => ({ box: 0, due: "2026-01-01", reviews: 0 }));
    const plan = planForExam(cards, "2026-01-01", "2026-01-01");
    expect(plan.tageBis).toBe(0);
    expect(plan.proTag).toBe(3);
  });

  it("Pruefung in der Vergangenheit: tageBis nie negativ", () => {
    const plan = planForExam([], "2025-12-01", "2026-01-01");
    expect(plan.tageBis).toBe(0);
  });

  it("nur nicht-sichere Karten (box < MASTERED_BOX) zaehlen als offen", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0 },
      { box: MASTERED_BOX, due: "2026-01-01", reviews: 5 },
    ];
    const plan = planForExam(cards, "2026-01-11", "2026-01-01");
    expect(plan.offen).toBe(1);
  });

  it("archivierte Karten zaehlen nicht als offen", () => {
    const cards: CardLike[] = [{ box: 0, due: "2026-01-01", reviews: 0, archivedAt: "2026-01-01" }];
    const plan = planForExam(cards, "2026-01-11", "2026-01-01");
    expect(plan.offen).toBe(0);
  });
});

describe("parseGeneratedCards", () => {
  it("parst ein einfaches JSON-Array mit frage/antwort", () => {
    const text = '[{"frage":"Was ist 1+1?","antwort":"Zwei"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Was ist 1+1?", answer: "Zwei" }]);
  });

  it("entfernt ```json-Code-Fences", () => {
    const text = '```json\n[{"frage":"Wer war Bismarck?","antwort":"Reichskanzler"}]\n```';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Wer war Bismarck?", answer: "Reichskanzler" }]);
  });

  it("findet das Array trotz Vortext", () => {
    const text = 'Hier sind die Karten:\n[{"frage":"Was ist H2O?","antwort":"Wasser"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Was ist H2O?", answer: "Wasser" }]);
  });

  it("akzeptiert auch question/answer statt frage/antwort", () => {
    const text = '[{"question":"Capital of France?","answer":"Paris"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Capital of France?", answer: "Paris" }]);
  });

  it("kaputtes JSON ergibt eine leere Liste", () => {
    expect(parseGeneratedCards("das ist kein JSON")).toEqual([]);
    expect(parseGeneratedCards('[{"frage": "kaputt"')).toEqual([]);
  });

  it("verwirft zu kurze Frage/Antwort", () => {
    const text = '[{"frage":"ab","antwort":"okay"},{"frage":"Gueltige Frage?","antwort":"Jawohl"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Gueltige Frage?", answer: "Jawohl" }]);
  });

  it("entfernt Duplikate mit gleicher Frage", () => {
    const text =
      '[{"frage":"Was ist die Hauptstadt?","antwort":"Berlin"},{"frage":"was ist die hauptstadt?","antwort":"Berlin, nochmal"}]';
    expect(parseGeneratedCards(text)).toHaveLength(1);
  });

  it("begrenzt auf 40 Karten", () => {
    const cards = Array.from({ length: 50 }, (_, i) => ({ frage: `Frage ${i} lang genug`, antwort: `Antwort ${i}` }));
    const text = JSON.stringify(cards);
    expect(parseGeneratedCards(text)).toHaveLength(40);
  });

  it("trimmt Whitespace", () => {
    const text = '[{"frage":"  Frage mit Leerzeichen  ","antwort":"  Antwort  "}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Frage mit Leerzeichen", answer: "Antwort" }]);
  });
});
