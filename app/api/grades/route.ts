import { cachedJson } from "@/lib/http-cache";
import { gradeOverview } from "@/lib/grade-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/grades -- Schnitt je aktivem Fach plus Gesamtschnitt.
// Eine Runde fuer die ganze Uebersicht, damit die Faecher-Seite (und spaeter
// die native App) nicht pro Fach nachfragen muss. Noten aendern sich selten,
// 5 Minuten frisch genuegen.
export async function GET() {
  return cachedJson(await gradeOverview(), 300);
}
