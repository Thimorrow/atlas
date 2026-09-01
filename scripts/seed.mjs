// Testdaten fuer die Stundenplan-Ansicht, solange WebUntis abgeschaltet ist.
//
// Alle erzeugten Zeilen tragen eine untis_lesson_id mit dem Praefix "seed-",
// damit sie sich jederzeit sauber wieder entfernen lassen und der echte
// Untis-Sync (der echte Lesson-IDs schreibt) nie mit ihnen kollidiert.
//
//   npm run db:seed         -> aktuelle Woche + Folgewoche anlegen
//   npm run db:seed:clear   -> alle Seed-Zeilen wieder entfernen

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Typisches deutsches Stundenraster inkl. der beiden grossen Pausen.
const STUNDEN = [
  ["08:00", "08:45"],
  ["08:45", "09:30"],
  ["09:50", "10:35"],
  ["10:35", "11:20"],
  ["11:40", "12:25"],
  ["12:25", "13:10"],
  ["14:00", "14:45"],
  ["14:45", "15:30"],
];

// Wochenplan: pro Wochentag (1 = Montag) eine Liste [Fach, Raum, Kuerzel].
// null = Freistunde. Der Index entspricht der Stunde in STUNDEN.
const PLAN = {
  1: [["Mathematik", "A101", "MUE"], ["Mathematik", "A101", "MUE"], ["Deutsch", "B203", "SCH"], ["Deutsch", "B203", "SCH"], ["Biologie", "C012", "WEB"], ["Englisch", "A104", "KLE"], null, null],
  2: [["Englisch", "A104", "KLE"], ["Physik", "C105", "HOF"], ["Physik", "C105", "HOF"], ["Geschichte", "B201", "RIC"], ["Sport", "Turnhalle", "BAU"], ["Sport", "Turnhalle", "BAU"], null, null],
  3: [["Deutsch", "B203", "SCH"], ["Mathematik", "A101", "MUE"], ["Chemie", "C110", "NEU"], ["Chemie", "C110", "NEU"], ["Informatik", "D001", "LAN"], ["Informatik", "D001", "LAN"], null, null],
  4: [["Geschichte", "B201", "RIC"], ["Englisch", "A104", "KLE"], ["Mathematik", "A101", "MUE"], ["Kunst", "E020", "FIS"], ["Kunst", "E020", "FIS"], null, ["Biologie", "C012", "WEB"], ["Biologie", "C012", "WEB"]],
  5: [["Biologie", "C012", "WEB"], ["Deutsch", "B203", "SCH"], ["Englisch", "A104", "KLE"], ["Physik", "C105", "HOF"], ["Geschichte", "B201", "RIC"], null, null, null],
};

// Ein paar Sonderfaelle, damit Entfall und Vertretung in der UI sichtbar werden.
// Schluessel: "<Wochentag>-<Stundenindex>".
const SONDERFAELLE = {
  "2-4": { status: "cancelled", substitutionText: "Entfall" },
  "3-0": { status: "substituted", substitutionText: "Vertretung, Raum A102" },
  "5-3": { status: "cancelled", substitutionText: "Entfall" },
};

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Montag der Woche, in der das uebergebene Datum liegt.
function montagVon(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const versatz = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - versatz);
  return x;
}

function zeilenFuerWoche(montag) {
  const zeilen = [];
  for (const [tagStr, faecher] of Object.entries(PLAN)) {
    const tag = Number(tagStr);
    const datum = new Date(montag);
    datum.setUTCDate(montag.getUTCDate() + (tag - 1));
    const datumISO = iso(datum);

    faecher.forEach((eintrag, i) => {
      if (!eintrag) return;
      const [fach, raum, lehrkraft] = eintrag;
      const sonder = SONDERFAELLE[`${tag}-${i}`] ?? {};
      zeilen.push({
        untisLessonId: `seed-${datumISO}-${i}`,
        date: datumISO,
        startTime: STUNDEN[i][0],
        endTime: STUNDEN[i][1],
        subject: fach,
        room: raum,
        teacher: lehrkraft,
        status: sonder.status ?? "regular",
        substitutionText: sonder.substitutionText ?? null,
      });
    });
  }
  return zeilen;
}

async function loeschen() {
  const weg = await sql`DELETE FROM school_blocks WHERE untis_lesson_id LIKE 'seed-%' RETURNING id`;
  console.log(`${weg.length} Seed-Zeilen entfernt.`);
}

async function anlegen() {
  const dieseWoche = montagVon(new Date());
  const naechsteWoche = new Date(dieseWoche);
  naechsteWoche.setUTCDate(dieseWoche.getUTCDate() + 7);

  const zeilen = [...zeilenFuerWoche(dieseWoche), ...zeilenFuerWoche(naechsteWoche)];

  for (const z of zeilen) {
    await sql`
      INSERT INTO school_blocks
        (untis_lesson_id, date, start_time, end_time, subject, room, teacher, status, substitution_text)
      VALUES
        (${z.untisLessonId}, ${z.date}, ${z.startTime}, ${z.endTime}, ${z.subject},
         ${z.room}, ${z.teacher}, ${z.status}, ${z.substitutionText})
      ON CONFLICT (untis_lesson_id, date) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        subject = EXCLUDED.subject,
        room = EXCLUDED.room,
        teacher = EXCLUDED.teacher,
        status = EXCLUDED.status,
        substitution_text = EXCLUDED.substitution_text,
        updated_at = now()
    `;
  }

  console.log(`${zeilen.length} Stunden angelegt.`);
  console.log(`Woche ab ${iso(dieseWoche)} und ab ${iso(naechsteWoche)}.`);
}

if (process.argv.includes("--clear")) {
  await loeschen();
} else {
  await anlegen();
}
