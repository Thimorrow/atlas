// Naechste Stunde desselben Fachs nach einem Termin -- der Kern der
// Faelligkeits-Vorbelegung, wenn eine Aufgabe direkt aus einer Schulstunde
// heraus entsteht (siehe openComposer in app/page.tsx).

import { asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks, type SchoolBlock } from "@/lib/db/schema";
import { normalizeSubject } from "@/lib/untis/adapter";

export type LessonOccurrence = { date: string; status: SchoolBlock["status"] };

// Reine Logik, kein DB-Zugriff: welches ist das naechste Datum NACH `afterISO`,
// an dem das Fach tatsaechlich stattfindet? Datums-Strings (JJJJ-MM-TT) lassen
// sich lexikografisch vergleichen -- kein Date-Parsing, damit auch keine
// Zeitzonen-Fallstricke an Tages-/Jahresgrenzen.
//
// Mehrere Bloecke desselben Tages (z.B. eine Doppelstunde als zwei Perioden)
// zaehlen als EIN Termin: es zaehlt nur das Datum. Faellt an einem Tag JEDE
// Stunde des Fachs aus, gilt der Tag nicht und die naechste stattfindende
// Stunde traegt. Kein Treffer im uebergebenen Zeitraum -> null, lieber ehrlich
// leer als geraten.
export function nextLessonDate(occurrences: LessonOccurrence[], afterISO: string): string | null {
  const usableDates = new Set<string>();
  for (const o of occurrences) {
    if (o.date > afterISO && o.status !== "cancelled") usableDates.add(o.date);
  }
  if (usableDates.size === 0) return null;
  return [...usableDates].sort()[0];
}

// DB-Anbindung: laedt den Ursprungsblock und alle spaeteren Bloecke, deren
// (normalisiertes) Fach uebereinstimmt -- Untis liefert dasselbe Fach teils
// mit wechselnder Schreibweise, normalizeSubject gleicht das an (dieselbe
// Funktion, die auch den Stundenplan-Titel bildet). Reicht sie an die reine
// Funktion weiter.
export async function findNextLessonDate(schoolBlockId: string): Promise<string | null> {
  const [origin] = await db.select().from(schoolBlocks).where(eq(schoolBlocks.id, schoolBlockId));
  if (!origin) return null;

  const subject = normalizeSubject(origin.subject);
  const later = await db
    .select({ date: schoolBlocks.date, subject: schoolBlocks.subject, status: schoolBlocks.status })
    .from(schoolBlocks)
    .where(gt(schoolBlocks.date, origin.date))
    .orderBy(asc(schoolBlocks.date));

  const occurrences: LessonOccurrence[] = later
    .filter((b) => normalizeSubject(b.subject) === subject)
    .map((b) => ({ date: b.date, status: b.status }));

  return nextLessonDate(occurrences, origin.date);
}
