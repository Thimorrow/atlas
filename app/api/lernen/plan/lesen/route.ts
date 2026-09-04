import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { getAssignment } from "@/lib/assignment-store";
import { listFiles } from "@/lib/subject-file-store";
import { defaultLernplanGenDeps, lesen, LernplanGenFehler } from "@/lib/lernplan-generieren";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_IDS = 20;
const MAX_TEXT = 8000;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// POST /api/lernen/plan/lesen -- liest Checkliste + Blaetter, liefert einen
// Punkte-Entwurf. Speichert nichts. Siehe SPEC.md "Server: POST
// /api/lernen/plan/lesen".
export async function POST(req: Request) {
  if (!botEnabled()) {
    return NextResponse.json(
      { error: "bot_aus", hinweis: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!isObj(body)) return NextResponse.json({ error: "body" }, { status: 400 });

  const { assignmentId, checklist, fileIds } = body;

  if (typeof assignmentId !== "string" || !isUuid(assignmentId)) {
    return NextResponse.json({ error: "assignmentId", hinweis: "assignmentId ist keine gueltige ID." }, { status: 400 });
  }

  if (!isObj(checklist)) {
    return NextResponse.json({ error: "checklist", hinweis: "checklist fehlt." }, { status: 400 });
  }
  const hatFileId = typeof checklist.fileId === "string";
  const hatText = typeof checklist.text === "string";
  if (hatFileId === hatText) {
    return NextResponse.json(
      { error: "checklist", hinweis: "checklist muss genau eins von fileId oder text tragen." },
      { status: 400 },
    );
  }
  if (hatFileId && !isUuid(checklist.fileId as string)) {
    return NextResponse.json({ error: "checklist", hinweis: "checklist.fileId ist keine gueltige ID." }, { status: 400 });
  }
  if (hatText && (checklist.text as string).length > MAX_TEXT) {
    return NextResponse.json(
      { error: "checklist", hinweis: `Text darf hoechstens ${MAX_TEXT} Zeichen haben.` },
      { status: 400 },
    );
  }

  const fileIdsArr = fileIds === undefined ? [] : fileIds;
  if (
    !Array.isArray(fileIdsArr) ||
    fileIdsArr.length > MAX_FILE_IDS ||
    !fileIdsArr.every((f) => typeof f === "string" && isUuid(f))
  ) {
    return NextResponse.json(
      { error: "fileIds", hinweis: `fileIds muss ein Array von hoechstens ${MAX_FILE_IDS} gueltigen IDs sein.` },
      { status: 400 },
    );
  }

  const assignment = await getAssignment(assignmentId);
  if (!assignment) return NextResponse.json({ error: "pruefung", hinweis: "Pruefung gibt es nicht mehr." }, { status: 404 });
  if (!assignment.subjectId) {
    return NextResponse.json({ error: "kein_fach", hinweis: "Pruefung hat kein Fach." }, { status: 400 });
  }

  const dateien = await listFiles(assignment.subjectId);
  const gueltig = new Set(dateien.map((d) => d.id));
  const alleFileIds = [...(fileIdsArr as string[]), ...(hatFileId ? [checklist.fileId as string] : [])];
  if (alleFileIds.some((id) => !gueltig.has(id))) {
    return NextResponse.json({ error: "dateien_fremd", hinweis: "Eine Datei gehoert nicht zu diesem Fach." }, { status: 400 });
  }

  const checklistInput = hatFileId ? { fileId: checklist.fileId as string } : { text: checklist.text as string };

  try {
    const result = await lesen(
      { subjectId: assignment.subjectId, checklist: checklistInput, fileIds: fileIdsArr as string[] },
      defaultLernplanGenDeps,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LernplanGenFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] lesen: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
