import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { generateSummary, type GenerateInput } from "@/lib/lernen-generieren";
import { getTopic, updateTopic } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const QUELLEN = ["notizen", "dateien", "lehrplan", "alles"] as const;

// POST /api/lernen/themen/[id]/lernzettel -- { quelle, fileIds?, noteIds? }
// erzeugt per Bot einen Lernzettel und speichert ihn direkt am Thema.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Thema nicht gefunden." }, { status: 404 });

  const topic = await getTopic(id);
  if (!topic) return NextResponse.json({ error: "Thema nicht gefunden." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { quelle, fileIds, noteIds } = body as Record<string, unknown>;
  if (typeof quelle !== "string" || !(QUELLEN as readonly string[]).includes(quelle)) {
    return NextResponse.json({ error: `quelle muss eine von ${QUELLEN.join(", ")} sein.` }, { status: 400 });
  }

  const input: GenerateInput = {
    subjectId: topic.subjectId,
    quelle: quelle as GenerateInput["quelle"],
    fileIds: Array.isArray(fileIds) ? fileIds.filter((f): f is string => typeof f === "string") : undefined,
    noteIds: Array.isArray(noteIds) ? noteIds.filter((f): f is string => typeof f === "string") : undefined,
    topicId: id,
  };

  try {
    const result = await generateSummary(input);
    if (!result.summary) {
      return NextResponse.json({ hinweis: result.hinweis });
    }

    const thema = await updateTopic(id, { summary: result.summary });
    return NextResponse.json({ thema, hinweis: result.hinweis });
  } catch (err) {
    if (err instanceof Error && err.message === "BOT_DISABLED") {
      return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
    }
    throw err;
  }
}
