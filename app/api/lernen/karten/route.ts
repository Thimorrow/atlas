import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { createCards, listCards } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 2000;

// GET /api/lernen/karten?subject=<id> -- alle (nicht archivierten) Karten eines Fachs.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const subject = url.searchParams.get("subject");
  if (!subject || !isUuid(subject)) {
    return NextResponse.json({ error: "subject ist keine gültige Fach-ID." }, { status: 400 });
  }
  return NextResponse.json({ cards: await listCards(subject) });
}

// POST /api/lernen/karten -- { subjectId, question, answer } legt eine Karte manuell an.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { subjectId, question, answer } = body as Record<string, unknown>;
  if (typeof subjectId !== "string" || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId ist keine gültige Fach-ID." }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "question darf nicht leer sein." }, { status: 400 });
  }
  if (question.length > MAX_LEN) {
    return NextResponse.json({ error: `question darf höchstens ${MAX_LEN} Zeichen lang sein.` }, { status: 400 });
  }
  if (typeof answer === "string" && answer.length > MAX_LEN) {
    return NextResponse.json({ error: `answer darf höchstens ${MAX_LEN} Zeichen lang sein.` }, { status: 400 });
  }

  const [card] = await createCards(
    subjectId,
    [{ question: question.trim(), answer: typeof answer === "string" ? answer : "" }],
    "manuell",
  );
  return NextResponse.json({ card }, { status: 201 });
}
