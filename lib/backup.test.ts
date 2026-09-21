// Tests fuer Export und Restore.
//
// Der erste Block laeuft immer und braucht keine Datenbank: die Reihenfolge,
// die Dump-Pruefung und die Aufbereitung der Werte sind reine Logik.
//
// Der zweite Block ist ein echter Rundlauf gegen Postgres und deshalb
// OPT-IN: er loescht alles (TRUNCATE), was in der Datenbank steht. Gegen eine
// gemeinsame Testdatenbank waere das ein Datenverlust-Anlass fuer alles, was
// parallel laeuft -- also dieselbe Vorsicht wie in
// lib/bot/grade-proposals.test.ts: nur, wenn ATLAS_BACKUP_TEST=1 gesetzt ist
// UND DATABASE_URL auf localhost zeigt.
//
// Aufruf:
//   ATLAS_BACKUP_TEST=1 DATABASE_URL=postgres://...@127.0.0.1:5432/<wegwerf> \
//     npx vitest run lib/backup.test.ts

import { describe, expect, it } from "vitest";
import { DUMP_VERSION, dumpPruefen, reihenfolge, wiederherstellen, type Dump, type Executor } from "@/lib/backup";

describe("Reihenfolge aus Fremdschluesseln", () => {
  it("setzt Eltern vor Kinder, in einer Stufe alphabetisch", () => {
    const reihe = reihenfolge(
      ["study_cards", "subjects", "study_reviews"],
      [
        ["study_cards", "subjects"],
        ["study_reviews", "subjects"],
        ["study_reviews", "study_cards"],
      ],
    );
    expect(reihe).toEqual(["subjects", "study_cards", "study_reviews"]);
  });

  it("ignoriert einen Selbstbezug", () => {
    // Eine Tabelle, die auf sich selbst verweist, ist kein Zyklus: fuer das
    // Einfuegen in fester Reihenfolge spielt es keine Rolle.
    const reihe = reihenfolge(["chat", "subjects"], [["chat", "chat"]]);
    expect(reihe).toHaveLength(2);
    expect(reihe[0]).toBe("chat");
    expect(reihe[1]).toBe("subjects");
  });

  it("meldet einen echten Zyklus mit allen Beteiligten", () => {
    expect(() =>
      reihenfolge(
        ["a", "b", "c"],
        [
          ["a", "b"],
          ["b", "a"],
        ],
      ),
    ).toThrowError(/Zyklus.*a.*b/);
  });

  it("ignoriert Kanten auf Tabellen, die es nicht gibt", () => {
    expect(reihenfolge(["a"], [["a", "verschwunden"]])).toEqual(["a"]);
  });
});

describe("Dump pruefen", () => {
  const gueltig = (): Dump => ({
    format: "atlas-dump",
    version: DUMP_VERSION,
    erzeugtAm: "2026-09-21T06:00:00.000Z",
    tabellen: [{ name: "subjects", spalten: [{ name: "id", udt: "uuid" }], zeilen: 1, daten: [{ id: "x" }] }],
  });

  it("nimmt einen gueltigen Dump an", () => {
    expect(dumpPruefen(gueltig())).toEqual([]);
  });

  it("lehnt fremde Formate ab", () => {
    const befunde = dumpPruefen({ ...gueltig(), format: "irgendwas" });
    expect(befunde.join(" ")).toMatch(/Unbekanntes Format/);
  });

  it("lehnt eine neuere Formatversion ab", () => {
    const befunde = dumpPruefen({ ...gueltig(), version: DUMP_VERSION + 1 });
    expect(befunde.join(" ")).toMatch(/neueren Version/);
  });

  it("bemerkt, wenn die angekuendigte Zeilenzahl nicht stimmt", () => {
    const dump = gueltig();
    dump.tabellen[0].zeilen = 5;
    expect(dumpPruefen(dump).join(" ")).toMatch(/angekuendigt 5 Zeilen, enthalten sind 1/);
  });

  it("lehnt etwas ab, das kein Dump ist", () => {
    expect(dumpPruefen(null).join(" ")).toMatch(/kein Objekt/);
    expect(dumpPruefen("[]").join(" ")).toMatch(/kein Objekt/);
    expect(dumpPruefen({ format: "atlas-dump" }).join(" ")).toMatch(/Tabellenliste fehlt/);
  });
});

// Der Rundlauf ohne Datenbank: ein aufzeichnender Executor zeigt, was
// tatsaechlich ans Postgres gehen wuerde.
describe("Werte fuer das Einfuegen aufbereiten", () => {
  function aufzeichnen(): { aufrufe: { text: string; params: unknown[] }[]; ausfuehren: Executor } {
    const aufrufe: { text: string; params: unknown[] }[] = [];
    const ausfuehren: Executor = async (text, params = []) => {
      aufrufe.push({ text, params });
      return { rows: [] };
    };
    return { aufrufe, ausfuehren };
  }

  it("schickt jsonb als Text, nicht als Postgres-Array", async () => {
    // Das ist der Fehler, den dieser Test verhindert: node-postgres macht aus
    // einem JS-Array "{a,b}" -- in einer jsonb-Spalte ist das kein gueltiges
    // JSON, das Zurueckspielen scheitert mit "invalid input syntax for type
    // json". study_plan_points.file_ids und notebook_pages.content sind genau
    // solche Spalten.
    const { aufrufe, ausfuehren } = aufzeichnen();
    const dump: Dump = {
      format: "atlas-dump",
      version: DUMP_VERSION,
      erzeugtAm: "2026-09-21T06:00:00.000Z",
      tabellen: [
        {
          name: "study_plan_points",
          spalten: [
            { name: "id", udt: "uuid" },
            { name: "file_ids", udt: "jsonb" },
          ],
          zeilen: 1,
          daten: [{ id: "p1", file_ids: ["f1", "f2"] }],
        },
      ],
    };

    await wiederherstellen(ausfuehren, dump);

    expect(aufrufe[0].text).toMatch(/^truncate table "study_plan_points" cascade$/);
    expect(aufrufe[1].text).toMatch(/^insert into "study_plan_points" \("id", "file_ids"\) values \(\$1, \$2\)$/);
    expect(aufrufe[1].params[1]).toBe('["f1","f2"]');
  });

  it("laesst echte Postgres-Arrays Arrays und schreibt keinen erfundenen Wert", async () => {
    const { aufrufe, ausfuehren } = aufzeichnen();
    const dump: Dump = {
      format: "atlas-dump",
      version: DUMP_VERSION,
      erzeugtAm: "2026-09-21T06:00:00.000Z",
      tabellen: [
        {
          name: "probe",
          spalten: [
            { name: "tags", udt: "_text" },
            { name: "fehlt", udt: "text" },
          ],
          zeilen: 1,
          daten: [{ tags: ["a", "b"] }],
        },
      ],
    };

    await wiederherstellen(ausfuehren, dump);

    expect(aufrufe[1].params[0]).toEqual(["a", "b"]);
    // Eine Spalte, die im Dump fehlt, wird null -- nicht undefined, das
    // node-postgres sonst als Text "undefined" schicken wuerde.
    expect(aufrufe[1].params[1]).toBe(null);
  });

  it("loescht nur, was im Dump steht, und haengt nichts an", async () => {
    const { aufrufe, ausfuehren } = aufzeichnen();
    await wiederherstellen(ausfuehren, {
      format: "atlas-dump",
      version: DUMP_VERSION,
      erzeugtAm: "2026-09-21T06:00:00.000Z",
      tabellen: [{ name: "subjects", spalten: [{ name: "id", udt: "uuid" }], zeilen: 0, daten: [] }],
    });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].text).toMatch(/^truncate/);
  });

  it("verweigert einen unbrauchbaren Dump, bevor etwas geloescht wird", async () => {
    const { aufrufe, ausfuehren } = aufzeichnen();
    await expect(wiederherstellen(ausfuehren, { format: "falsch" })).rejects.toThrowError(/unbrauchbar/);
    expect(aufrufe).toHaveLength(0);
  });
});

// --- Echter Rundlauf gegen Postgres (opt-in, loescht alles) -----------------

const lokal = /^postgres(?:ql)?:\/\/[^/]*@(127\.0\.0\.1|localhost):\d+\//.test(process.env.DATABASE_URL ?? "");
const mitDb = process.env.ATLAS_BACKUP_TEST === "1" && lokal;

describe.skipIf(!mitDb)("Rundlauf gegen Postgres (loescht alles)", () => {
  it("spielt einen Dump so zurueck, dass derselbe Dump wieder herauskommt", async () => {
    const { Pool } = await import("pg");
    const { exportieren } = await import("@/lib/backup");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const ausfuehren: Executor = async (text, params = []) => {
      const ergebnis = await pool.query(text, params);
      return { rows: ergebnis.rows };
    };

    try {
      // Ein Datenbestand, der alle heiklen Faelle beruehrt: jsonb (auch als
      // Array darin), ein date, ein timestamptz, Umlaute, und ein leerer Text.
      const [fach] = (
        await ausfuehren(
          `insert into subjects (name, color) values ($1, $2) returning id`,
          ["Deutsch – Rundlauf", "blue"],
        )
      ).rows;
      const [aufgabe] = (
        await ausfuehren(`insert into assignments (subject_id, title, due_date, type) values ($1, $2, $3, $4) returning id`, [
          fach.id,
          'Hausaufgabe mit "Anfuehrungszeichen"',
          "2026-09-21",
          "homework",
        ])
      ).rows;
      const [thema] = (
        await ausfuehren(`insert into study_topics (subject_id, title) values ($1, $2) returning id`, [
          fach.id,
          "Thema",
        ])
      ).rows;
      const [plan] = (
        await ausfuehren(
          `insert into study_plans (assignment_id, subject_id, exam_date) values ($1, $2, $3) returning id`,
          [aufgabe.id, fach.id, "2026-10-05"],
        )
      ).rows;
      await ausfuehren(
        `insert into study_plan_points (plan_id, topic_id, position, title, file_ids, minutes_estimate)
         values ($1, $2, 0, 'Punkt', $3::jsonb, 30)`,
        [plan.id, thema.id, JSON.stringify(["kein-file"])],
      );
      await ausfuehren(`insert into notebook_pages (subject_id, title, content) values ($1, $2, $3::jsonb)`, [
        fach.id,
        "Seite",
        JSON.stringify({ strokes: [{ x: 1, y: 2 }], blocks: [] }),
      ]);
      await ausfuehren(`insert into grades (subject_id, kind, points, label, date) values ($1, $2, $3, $4, $5)`, [
        fach.id,
        "written",
        13,
        "Klausur",
        "2026-09-21",
      ]);

      const vorher = await exportieren(ausfuehren, "2026-09-21T06:00:00.000Z");

      // 1. Datumsspalten liegen als "JJJJ-MM-TT" im Dump, nicht als Zeitstempel.
      const noten = vorher.tabellen.find((t) => t.name === "grades");
      expect(noten?.daten[0]?.date).toBe("2026-09-21");
      const punkte = vorher.tabellen.find((t) => t.name === "study_plan_points");
      expect(punkte?.daten[0]?.file_ids).toEqual(["kein-file"]);

      // 2. Zurueckspielen.
      const ergebnis = await wiederherstellen(ausfuehren, vorher);
      expect(ergebnis.gesamt).toBeGreaterThan(0);

      // 3. Derselbe Datenbestand -> derselbe Dump (nur der Zeitstempel des
      //    Dumps selbst ist neu).
      const nachher = await exportieren(ausfuehren, "2026-09-21T06:05:00.000Z");
      expect(nachher.tabellen).toEqual(vorher.tabellen);

      // 4. Und der Kalendertag liegt auch in der Datenbank noch richtig.
      //
      // Gelesen wird hier ausdruecklich mit to_char. Ein blankes
      // `select date from grades` liefert von node-postgres ein Date-Objekt,
      // das als UTC-Zeitstempel 2026-09-20T22:00:00.000Z erscheint -- lokal
      // Berliner Mitternacht, aber ein Vergleich mit dem Datum "2026-09-21"
      // scheitert daran. Genau diese Falle umgeht lib/backup.ts im Export.
      const { rows } = await ausfuehren(`select to_char(date, 'YYYY-MM-DD') as datum from grades limit 1`);
      expect(rows[0].datum).toBe("2026-09-21");
    } finally {
      await pool.end();
    }
  });
});
