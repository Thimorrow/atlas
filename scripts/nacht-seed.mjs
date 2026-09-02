// Fuellt eine LOKALE Entwicklungsdatenbank mit dem Schnappschuss unter
// .ytstack/nacht-snapshot/. Nur fuer die Entwicklung gedacht: das Skript
// weigert sich, gegen Neon zu laufen.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt.");
if (/neon\.(tech|build)/i.test(url)) throw new Error("Nur gegen eine lokale Datenbank.");

const snap = (name) =>
  JSON.parse(readFileSync(new URL(`../.ytstack/nacht-snapshot/${name}.json`, import.meta.url), "utf8"));

const client = new pg.Client({ connectionString: url });
await client.connect();

const subjects = snap("subjects").subjects;
for (const s of subjects) {
  await client.query(
    `insert into subjects (id, name, untis_subject, teacher, teacher_title, room, color, oral_weight)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do update set name = excluded.name, teacher = excluded.teacher`,
    [s.id, s.name, s.untisSubject, s.teacher, s.teacherTitle ?? "herr", s.room, s.color, s.oralWeight ?? 50],
  );
}

// Der Schnappschuss deckt genau eine Woche ab. Fuer einen realistischen
// Eindruck wird derselbe Plan auf die beiden Folgewochen kopiert.
const days = snap("home").week.days;
const plus = (iso, weeks) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};
let blocks = 0;
for (const week of [0, 1, 2]) {
  for (const day of days) {
    for (const e of day.events) {
      if (e.source !== "school") continue;
      const date = plus(e.date, week);
      await client.query(
        `insert into school_blocks (untis_lesson_id, date, start_time, end_time, subject, room, teacher, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (untis_lesson_id, date) do nothing`,
        [`${e.refId}-w${week}`, date, e.startTime, e.endTime, e.title, e.room, e.teacher, e.status ?? "regular"],
      );
      blocks++;
    }
  }
}

const byName = new Map(subjects.map((s) => [s.name, s.id]));
const heute = new Date();
const tag = (n) => {
  const d = new Date(heute);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const aufgaben = [
  ["Mathematik", "homework", "Aufgaben 3 bis 7 auf Seite 84", "Kettenregel ueben", tag(1)],
  ["Mathematik", "exam", "Klassenarbeit Ableitungen", "Kapitel 2 und 3", tag(8)],
  ["Biologie", "homework", "Arbeitsblatt Zellatmung fertig machen", null, tag(1)],
  ["Deutsch", "presentation", "Referat Buechner vorbereiten", "zehn Minuten, mit Handout", tag(6)],
  ["Englisch", "homework", "Vokabeln Unit 4 lernen", null, tag(2)],
  ["Chemie", "test", "Kurztest Saeuren und Basen", null, tag(4)],
  ["Informatik", "homework", "Sortieralgorithmus in Python abgeben", "Bubblesort und Mergesort vergleichen", tag(3)],
  ["Geschichte", "homework", "Quellentext Weimarer Republik lesen", null, tag(-1)],
];
for (const [fach, typ, titel, notiz, faellig] of aufgaben) {
  const sid = byName.get(fach) ?? null;
  await client.query(
    `insert into assignments (subject_id, type, title, notes, due_date) values ($1,$2,$3,$4,$5)`,
    [sid, typ, titel, notiz, faellig],
  );
}

const notizen = [
  ["Mathematik", "Ableitungsregeln", "# Ableitungsregeln\n\n- Potenzregel: f(x)=x^n -> f'(x)=n*x^(n-1)\n- Produktregel: (u*v)' = u'v + uv'\n- Kettenregel: f(g(x))' = f'(g(x)) * g'(x)\n\nTypischer Fehler in der Arbeit: innere Ableitung vergessen."],
  ["Biologie", "Zellatmung", "# Zellatmung\n\nGlykolyse im Zytoplasma, Citratzyklus und Atmungskette im Mitochondrium.\nAus einem Glukosemolekuel entstehen rund 32 ATP.\n\nMerksatz: Glykolyse -> Citratzyklus -> Atmungskette."],
  ["Informatik", "Sortierverfahren", "# Sortierverfahren\n\n| Verfahren | Laufzeit |\n| --- | --- |\n| Bubblesort | O(n^2) |\n| Mergesort | O(n log n) |\n\nMergesort teilt rekursiv und fuegt sortiert zusammen."],
  ["Deutsch", "Buechner, Woyzeck", "# Woyzeck\n\nOffenes Drama, Fragment. Woyzeck als Getriebener.\nWichtige Motive: Armut, Wissenschaft als Entmenschlichung, Eifersucht."],
];
for (const [fach, titel, text] of notizen) {
  const sid = byName.get(fach);
  if (!sid) continue;
  await client.query(`insert into subject_notes (subject_id, title, body) values ($1,$2,$3)`, [sid, titel, text]);
}

const noten = [
  ["Mathematik", "written", 11, "Klassenarbeit 1", tag(-30), 2],
  ["Mathematik", "oral", 12, "Muendliche Note", tag(-10), 1],
  ["Biologie", "written", 13, "Test Genetik", tag(-20), 1],
  ["Englisch", "written", 9, "Vokabeltest", tag(-14), 1],
  ["Deutsch", "written", 10, "Klausur Lyrik", tag(-25), 2],
  ["Chemie", "oral", 8, "Muendliche Note", tag(-12), 1],
];
for (const [fach, art, punkte, label, datum, gewicht] of noten) {
  const sid = byName.get(fach);
  if (!sid) continue;
  await client.query(
    `insert into grades (subject_id, kind, points, label, date, weight) values ($1,$2,$3,$4,$5,$6)`,
    [sid, art, punkte, label, datum, gewicht],
  );
}

console.log(`Faecher: ${subjects.length}, Stunden: ${blocks}, Aufgaben: ${aufgaben.length}, Notizen: ${notizen.length}, Noten: ${noten.length}`);
await client.end();
