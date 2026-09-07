import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolBlocks } from "@/lib/db/schema";
import { isRealDate } from "@/lib/calendar-expand";
import { fetchTimetable } from "@/lib/untis/client";
import { lessonToSchoolBlock, type UntisLesson } from "@/lib/untis/adapter";
import { teacherAliases } from "@/lib/untis/sync";
import { vergleichTag, type TagStunde } from "@/lib/untis/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/sync/untis/check?date=YYYY-MM-DD
//
// Diagnose fuer "Atlas zeigt Luecke, Untis Unterricht": fragt Untis LIVE fuer
// genau diesen einen Tag (ohne in die DB zu schreiben) und legt das Ergebnis
// neben die school_blocks, die Atlas fuer den Tag gespeichert hat. Der
// Unterschied steht in fehltInAtlas / nurInAtlas / statusWeichtAb -- damit ist
// sofort sichtbar, ob Untis nichts liefert (hinweis!), Atlas alt ist oder
// beide schlicht verschiedene Plaene meinen.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? "";

  if (!DATE_RE.test(date) || !isRealDate(date)) {
    return NextResponse.json(
      { ok: false, error: "date muss ein gültiges Datum im Format JJJJ-MM-TT sein." },
      { status: 400 },
    );
  }

  try {
    const tag = new Date(`${date}T00:00:00`);
    const { lessons, teachers, schoolyear, window, hinweis } = await fetchTimetable(tag, tag);

    const stunden = lessons as unknown as UntisLesson[];
    const aliases = teacherAliases(stunden, teachers);
    const untis: TagStunde[] = stunden
      .map((l) => lessonToSchoolBlock(l, aliases))
      .map((b) => ({
        startTime: b.startTime.slice(0, 5),
        endTime: b.endTime.slice(0, 5),
        subject: b.subject,
        room: b.room ?? null,
        teacher: b.teacher ?? null,
        status: b.status ?? "regular",
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const gespeichert = await db
      .select()
      .from(schoolBlocks)
      .where(eq(schoolBlocks.date, date));
    const atlas: TagStunde[] = gespeichert
      .map((b) => ({
        startTime: b.startTime.slice(0, 5),
        endTime: b.endTime.slice(0, 5),
        subject: b.subject,
        room: b.room ?? null,
        teacher: b.teacher ?? null,
        status: b.status ?? "regular",
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return NextResponse.json({
      ok: true,
      date,
      untis,
      atlas,
      ...vergleichTag(untis, atlas),
      schoolyear,
      window,
      hinweis,
    });
  } catch (e) {
    console.error("Untis check failed:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
