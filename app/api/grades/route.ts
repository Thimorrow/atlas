import { NextResponse } from "next/server";
import { gradeOverview } from "@/lib/grade-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/grades -- Schnitt je aktivem Fach plus Gesamtschnitt.
// Eine Runde fuer die ganze Uebersicht, damit die Faecher-Seite (und spaeter
// die native App) nicht pro Fach nachfragen muss.
export async function GET() {
  return NextResponse.json(await gradeOverview());
}
