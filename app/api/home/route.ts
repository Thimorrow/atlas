import { NextResponse } from "next/server";
import { heuteISO } from "@/lib/zeit";
import { listAssignments } from "@/lib/assignment-store";
import { expandWeek, isRealDate } from "@/lib/calendar-expand";
import { listSubjects } from "@/lib/subject-store";
import { syncState } from "@/lib/untis/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Das LOKALE Datum des Servers, nicht das UTC-Datum. toISOString() waere hier
// falsch: es liefert nach 22 Uhr deutscher Sommerzeit schon den naechsten Tag
// und die Startseite spraenge auf die falsche Woche. Die schwedische Locale
// ist der kuerzeste Weg zu JJJJ-MM-TT.
function heuteLokal(): string {
  return heuteISO();
}

// GET /api/home?date=JJJJ-MM-TT
//
// Fuer einen Bildschirm holte der Client bisher vier Antworten einzeln:
// Stundenplan, Aufgaben, Faecher, Sync-Stand. Im Mobilfunknetz sind vier
// Roundtrips vor dem ersten sichtbaren Inhalt zu viel; hier wird daraus einer.
//
// Die Route buendelt nur, sie rechnet nichts Eigenes: jeder Teil ist genau
// das, was die passende Einzelroute auch liefert. So bleibt der Client bei
// einem spaeteren Feldwechsel an einer Stelle richtig, nicht an zweien.
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? heuteLokal();
  if (!DATE_RE.test(date) || !isRealDate(date)) {
    return NextResponse.json(
      { error: "date muss ein gueltiges Datum im Format JJJJ-MM-TT sein." },
      { status: 400 },
    );
  }

  // Parallel, nicht nacheinander: die vier Abfragen haengen nicht voneinander
  // ab, hintereinander waere die Antwort schlicht viermal so langsam.
  const [week, assignments, subjects, sync] = await Promise.all([
    expandWeek(date),
    listAssignments({ includeCompleted: false }),
    listSubjects("active"),
    syncState(),
  ]);

  return NextResponse.json({ week: { view: "week", ...week }, assignments, subjects, sync });
}
