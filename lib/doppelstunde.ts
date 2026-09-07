// Doppelstunden: Untis liefert eine Doppelstunde als zwei (oder mehr)
// aufeinanderfolgende Einzelbloecke (z.B. 08:00-08:45 + 08:45-09:30, gleiches
// Fach). Der Import speichert sie 1:1 in school_blocks. Fuer Anzeige und
// Live-Erkennung gehoeren sie zusammen: ein Chip, eine Zeitspanne, ein
// Live-Zustand -- sonst springt die Restzeit zur Naht neu los, und Notiz und
// Meldung haengen nur an einer Haelfte.
//
// Reine Logik ohne DB-Zugriff, damit sie ohne Datenbank testbar ist --
// gleiches Muster wie lib/jetzt-stunde.ts.

// Nur die Felder, die die Entscheidung braucht. Generisch gehalten, damit
// Cockpit (StundeLessonDTO) und Fokus (MorgenLessonDTO) dieselbe Funktion
// nutzen koennen.
export type DoppelKandidat = {
  refId: string;
  startTime: string;
  endTime: string | null;
  title: string;
  status: string;
  room: string | null;
  teacher: string | null;
  substitutionText?: string | null;
  hasNote: boolean;
  hasAssignment: boolean;
};

// Eine zusammengefasste Einheit: refId bleibt die ID des ersten Blocks
// (stabile Auswahl, Notiz- und Meldungs-APIs brauchen genau eine ID),
// refIds zaehlt alle enthaltenen Bloecke auf.
export type DoppelEinheit<T extends DoppelKandidat> = T & { refIds: string[] };

// Fasst lueckenlos aneinanderhaengende Bloecke desselben Fachs zu einer
// Einheit zusammen: Ende des einen ist Anfang des naechsten, und Titel,
// Status, Raum und Lehrer stimmen ueberein. Alles andere (Pause dazwischen,
// andere Klasse im Raum, nur eine Haelfte vertreten/entfallen) bleibt
// getrennt -- lieber zwei Chips als eine falsch verschmolzene Stunde.
export function fasseDoppelstundenZusammen<T extends DoppelKandidat>(events: T[]): DoppelEinheit<T>[] {
  const sortiert = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const einheiten: DoppelEinheit<T>[] = [];
  for (const ev of sortiert) {
    const letzte = einheiten[einheiten.length - 1];
    if (letzte && gehoertDazu(letzte, ev)) {
      letzte.endTime = ev.endTime;
      letzte.hasNote = letzte.hasNote || ev.hasNote;
      letzte.hasAssignment = letzte.hasAssignment || ev.hasAssignment;
      letzte.refIds.push(ev.refId);
    } else {
      einheiten.push({ ...ev, refIds: [ev.refId] });
    }
  }
  return einheiten;
}

function gehoertDazu<T extends DoppelKandidat>(prev: DoppelEinheit<T>, cur: T): boolean {
  return (
    prev.endTime !== null &&
    cur.startTime === prev.endTime &&
    cur.title === prev.title &&
    cur.status === prev.status &&
    cur.room === prev.room &&
    cur.teacher === prev.teacher &&
    (cur.substitutionText ?? null) === (prev.substitutionText ?? null)
  );
}
