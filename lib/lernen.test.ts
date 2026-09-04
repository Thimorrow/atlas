import { describe, expect, it } from "vitest";
import {
  BOX_INTERVALS,
  MASTERED_BOX,
  MAX_BOX,
  daysBetween,
  defaultKindFor,
  heutePlan,
  isDue,
  lernartFor,
  normalizeVokabel,
  parseGeneratedCards,
  parseGeneratedVariant,
  parseUrteil,
  parseUrteile,
  planForExam,
  progress,
  progressOf,
  queueFor,
  readiness,
  schedule,
  sessionQueue,
  vokabelStimmt,
  type CardLike,
  type HeuteThema,
  type QueueCardLike,
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

describe("lernartFor", () => {
  it("Mathe/Physik/Chemie/Informatik -> aufgaben", () => {
    expect(lernartFor("Mathematik")).toBe("aufgaben");
    expect(lernartFor("Physik")).toBe("aufgaben");
    expect(lernartFor("Chemie")).toBe("aufgaben");
    expect(lernartFor("Informatik")).toBe("aufgaben");
  });

  it("Sprachen -> vokabeln", () => {
    expect(lernartFor("Englisch")).toBe("vokabeln");
    expect(lernartFor("Französisch")).toBe("vokabeln");
    expect(lernartFor("Latein")).toBe("vokabeln");
    expect(lernartFor("Spanisch")).toBe("vokabeln");
  });

  it("Deutsch -> texte, alles andere -> wissen", () => {
    expect(lernartFor("Deutsch")).toBe("texte");
    expect(lernartFor("Erdkunde")).toBe("wissen");
  });

  it("Teilstring und Gross/Kleinschreibung egal, Kuerzel bleiben wissen", () => {
    expect(lernartFor("mathe leistungskurs")).toBe("aufgaben");
    expect(lernartFor("M")).toBe("wissen");
    expect(lernartFor("E")).toBe("wissen");
  });
});

describe("defaultKindFor", () => {
  it("ordnet jeder Lernart die passende Standard-Kartenart zu", () => {
    expect(defaultKindFor("aufgaben")).toBe("aufgabe");
    expect(defaultKindFor("vokabeln")).toBe("vokabel");
    expect(defaultKindFor("wissen")).toBe("wissen");
    expect(defaultKindFor("texte")).toBe("wissen");
  });
});

describe("readiness", () => {
  it("0..100 gewichtete Sicherheit ueber min(box, MASTERED_BOX)", () => {
    const cards: CardLike[] = [
      { box: MASTERED_BOX, due: "2026-01-01", reviews: 1 },
      { box: 0, due: "2026-01-01", reviews: 0 },
    ];
    // (3 + 0) / (3 * 2) = 0.5 -> 50
    expect(readiness(cards)).toBe(50);
  });

  it("leere Liste ergibt 0", () => {
    expect(readiness([])).toBe(0);
  });

  it("archivierte Karten zaehlen nicht mit", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0, archivedAt: "2026-01-01" },
      { box: MASTERED_BOX, due: "2026-01-01", reviews: 1 },
    ];
    expect(readiness(cards)).toBe(100);
  });
});

describe("progressOf", () => {
  it("liefert progress() plus faellig und bereit", () => {
    const cards: CardLike[] = [
      { box: 0, due: "2026-01-01", reviews: 0 },
      { box: MASTERED_BOX, due: "2026-01-05", reviews: 3 },
    ];
    const result = progressOf(cards, "2026-01-01");
    expect(result.total).toBe(2);
    expect(result.faellig).toBe(1);
    expect(result.bereit).toBe(50);
  });
});

describe("queueFor", () => {
  const cards: QueueCardLike[] = [
    { box: 0, due: "2026-01-01", reviews: 1, lapses: 3 },
    { box: 1, due: "2026-01-01", reviews: 2, lapses: 5 },
    { box: 4, due: "2026-01-01", reviews: 4, lapses: 0 },
  ];

  it("modus lernen verhaelt sich wie sessionQueue", () => {
    const queue = queueFor("lernen", cards, "2026-01-01");
    expect(queue.map((c) => c.lapses)).toEqual([3, 5, 0]);
  });

  it("modus lernen: ohne faellige/neue Karten die schwaechsten (box asc)", () => {
    const nichtFaellig: QueueCardLike[] = [
      { box: 3, due: "2026-02-01", reviews: 2, lapses: 0 },
      { box: 1, due: "2026-02-01", reviews: 1, lapses: 0 },
    ];
    const queue = queueFor("lernen", nichtFaellig, "2026-01-01");
    expect(queue.map((c) => c.box)).toEqual([1, 3]);
  });

  it("modus schwach sortiert nach lapses desc, box asc, due asc", () => {
    const queue = queueFor("schwach", cards, "2026-01-01");
    expect(queue.map((c) => c.lapses)).toEqual([5, 3, 0]);
  });

  it("modus probe mischt deterministisch und begrenzt auf limit (Default 25)", () => {
    const big: QueueCardLike[] = Array.from({ length: 30 }, (_, i) => ({
      box: 0,
      due: "2026-01-01",
      reviews: 0,
      lapses: 0,
      idx: i,
    })) as unknown as QueueCardLike[];
    const a = queueFor("probe", big, "2026-01-01", 0, 42);
    const b = queueFor("probe", big, "2026-01-01", 0, 42);
    expect(a).toHaveLength(25);
    expect(a).toEqual(b);
    expect(a).not.toEqual(big.slice(0, 25));
  });

  it("modus probe: gleicher seed ist deterministisch, anderer seed mischt anders", () => {
    const c: QueueCardLike[] = Array.from({ length: 10 }, (_, i) => ({
      box: 0,
      due: "2026-01-01",
      reviews: 0,
      lapses: 0,
      idx: i,
    })) as unknown as QueueCardLike[];
    const a = queueFor("probe", c, "2026-01-01", 10, 1);
    const b = queueFor("probe", c, "2026-01-01", 10, 2);
    expect(a).not.toEqual(b);
  });
});

describe("heutePlan", () => {
  it("Thema mit Pruefung: anzahl = max(faellig, ceil(offen / tageBis))", () => {
    const themen: HeuteThema[] = [
      {
        subjectId: "s1",
        subjectName: "Mathe",
        color: "blue",
        topicId: "t1",
        titel: "Quadratische Funktionen",
        pruefung: { id: "p1", title: "Arbeit", type: "exam", dueDate: "2026-01-06", tageBis: 5 },
        cards: Array.from({ length: 10 }, () => ({ box: 0, due: "2026-02-01", reviews: 0 })),
      },
    ];
    const plan = heutePlan("2026-01-01", themen);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].grund).toBe("pruefung");
    expect(plan.items[0].anzahl).toBe(2); // ceil(10/5)
    expect(plan.karten).toBe(2);
  });

  it("Thema ohne Pruefung: anzahl = faellig, 0 wird weggelassen", () => {
    const themen: HeuteThema[] = [
      {
        subjectId: "s1",
        subjectName: "Bio",
        color: null,
        topicId: null,
        titel: "Allgemein",
        pruefung: null,
        cards: [
          { box: 0, due: "2026-01-01", reviews: 1 },
          { box: 0, due: "2026-02-01", reviews: 0 },
        ],
      },
      {
        subjectId: "s2",
        subjectName: "Kunst",
        color: null,
        topicId: null,
        titel: "Allgemein",
        pruefung: null,
        cards: [{ box: 0, due: "2026-02-01", reviews: 0 }],
      },
    ];
    const plan = heutePlan("2026-01-01", themen);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].subjectName).toBe("Bio");
    expect(plan.items[0].grund).toBe("faellig");
  });

  it("sortiert Pruefungen nach tageBis asc, dann Faellige nach Anzahl desc", () => {
    const themen: HeuteThema[] = [
      {
        subjectId: "s1",
        subjectName: "Bio",
        color: null,
        topicId: null,
        titel: "Allgemein",
        pruefung: null,
        cards: Array.from({ length: 2 }, () => ({ box: 0, due: "2026-01-01", reviews: 1 })),
      },
      {
        subjectId: "s2",
        subjectName: "Mathe",
        color: null,
        topicId: "t2",
        titel: "Geometrie",
        pruefung: { id: "p2", title: "Arbeit", type: "exam", dueDate: "2026-01-04", tageBis: 3 },
        cards: Array.from({ length: 3 }, () => ({ box: 0, due: "2026-01-01", reviews: 1 })),
      },
      {
        subjectId: "s3",
        subjectName: "Physik",
        color: null,
        topicId: "t3",
        titel: "Mechanik",
        pruefung: { id: "p3", title: "Arbeit", type: "exam", dueDate: "2026-01-02", tageBis: 1 },
        cards: Array.from({ length: 3 }, () => ({ box: 0, due: "2026-01-01", reviews: 1 })),
      },
    ];
    const plan = heutePlan("2026-01-01", themen);
    expect(plan.items.map((i) => i.subjectName)).toEqual(["Physik", "Mathe", "Bio"]);
  });
});

describe("normalizeVokabel und vokabelStimmt", () => {
  it("normalisiert trim, lowercase und Artikel", () => {
    expect(normalizeVokabel("  The Dog ")).toBe("dog");
    expect(normalizeVokabel("le chat")).toBe("chat");
    expect(normalizeVokabel("der Hund")).toBe("hund");
  });

  it("entfernt Akzente", () => {
    expect(normalizeVokabel("café")).toBe("cafe");
  });

  it("vokabelStimmt ignoriert Artikel und Gross/Kleinschreibung", () => {
    expect(vokabelStimmt("the dog", "the Dog")).toBe(true);
    expect(vokabelStimmt("Dog", "the dog")).toBe(true);
  });

  it("vokabelStimmt ignoriert Akzente", () => {
    expect(vokabelStimmt("cafe", "café")).toBe(true);
  });

  it("bei mehreren Bedeutungen reicht eine Uebereinstimmung", () => {
    expect(vokabelStimmt("Tisch", "Wort1, Tisch")).toBe(true);
    expect(vokabelStimmt("falsch", "Wort1, Tisch")).toBe(false);
  });

  it("leere Eingabe ist nie richtig", () => {
    expect(vokabelStimmt("   ", "Antwort")).toBe(false);
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

  it("uebernimmt ein gueltiges art-Feld als kind", () => {
    const text = '[{"frage":"Merkregel?","antwort":"So gehts","art":"wissen"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Merkregel?", answer: "So gehts", kind: "wissen" }]);
  });

  it("ignoriert ein ungueltiges art-Feld (kein kind gesetzt)", () => {
    const text = '[{"frage":"Was ist 1+1?","antwort":"Zwei","art":"quatsch"}]';
    expect(parseGeneratedCards(text)).toEqual([{ question: "Was ist 1+1?", answer: "Zwei" }]);
  });
});

describe("parseGeneratedVariant", () => {
  it("parst ein einzelnes JSON-Objekt", () => {
    const text = '{"frage":"Loese 3x+2=8","antwort":"x=2"}';
    expect(parseGeneratedVariant(text)).toEqual({ question: "Loese 3x+2=8", answer: "x=2" });
  });

  it("akzeptiert question/answer und entfernt Code-Fences", () => {
    const text = '```json\n{"question":"2+2?","answer":"Vier"}\n```';
    expect(parseGeneratedVariant(text)).toEqual({ question: "2+2?", answer: "Vier" });
  });

  it("kaputtes JSON ergibt null", () => {
    expect(parseGeneratedVariant("kein json")).toBeNull();
    expect(parseGeneratedVariant('{"frage": "kaputt"')).toBeNull();
  });

  it("zu kurze Felder ergeben null", () => {
    expect(parseGeneratedVariant('{"frage":"ab","antwort":"ok"}')).toBeNull();
  });
});

describe("parseUrteil", () => {
  it("parst ein einzelnes JSON-Objekt", () => {
    const text = '{"urteil":"teilweise","feedback":"Kern gestimmt, Rechenweg fehlt."}';
    expect(parseUrteil(text)).toEqual({ urteil: "teilweise", feedback: "Kern gestimmt, Rechenweg fehlt." });
  });

  it("findet das JSON in umgebendem Text / Codefence", () => {
    const text = 'Hier die Bewertung:\n```json\n{"urteil":"richtig","feedback":"Passt."}\n```\nDanke.';
    expect(parseUrteil(text)).toEqual({ urteil: "richtig", feedback: "Passt." });
  });

  it("fehlendes feedback ergibt eine leere Zeichenkette", () => {
    expect(parseUrteil('{"urteil":"falsch"}')).toEqual({ urteil: "falsch", feedback: "" });
  });

  it("unbekanntes Urteil ergibt null", () => {
    expect(parseUrteil('{"urteil":"keine_ahnung","feedback":"x"}')).toBeNull();
  });

  it("fehlendes JSON ergibt null", () => {
    expect(parseUrteil("kein json hier")).toBeNull();
  });
});

describe("parseUrteile", () => {
  it("parst ein JSON-Array mehrerer Urteile", () => {
    const text =
      '[{"urteil":"richtig","feedback":"Passt."},{"urteil":"falsch","feedback":"Nicht ganz."}]';
    expect(parseUrteile(text)).toEqual([
      { urteil: "richtig", feedback: "Passt." },
      { urteil: "falsch", feedback: "Nicht ganz." },
    ]);
  });

  it("findet das JSON-Array in umgebendem Text / Codefence", () => {
    const text = 'Hier die Bewertung:\n```json\n[{"urteil":"teilweise","feedback":"Halb."}]\n```\nDanke.';
    expect(parseUrteile(text)).toEqual([{ urteil: "teilweise", feedback: "Halb." }]);
  });

  it("fehlendes feedback ergibt eine leere Zeichenkette", () => {
    expect(parseUrteile('[{"urteil":"falsch"}]')).toEqual([{ urteil: "falsch", feedback: "" }]);
  });

  it("Eintraege mit unbekanntem/fehlendem urteil werden verworfen, der Rest bleibt", () => {
    const text = '[{"urteil":"richtig","feedback":"a"},{"urteil":"keine_ahnung","feedback":"b"},{"feedback":"c"}]';
    expect(parseUrteile(text)).toEqual([{ urteil: "richtig", feedback: "a" }]);
  });

  it("fehlendes JSON-Array ergibt null", () => {
    expect(parseUrteile("kein json hier")).toBeNull();
  });

  it("kaputtes JSON ergibt null", () => {
    expect(parseUrteile("[{urteil: richtig}]")).toBeNull();
  });

  it("gibt das index-Feld zurueck, wenn vorhanden", () => {
    const text = '[{"index":2,"urteil":"richtig","feedback":"a"},{"index":0,"urteil":"falsch","feedback":"b"}]';
    expect(parseUrteile(text)).toEqual([
      { index: 2, urteil: "richtig", feedback: "a" },
      { index: 0, urteil: "falsch", feedback: "b" },
    ]);
  });
});
