import { NextResponse } from "next/server";
import { isObj, isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { getCard, getTopic } from "@/lib/study-store";
import { getAssignment } from "@/lib/assignment-store";
import {
  appendTutorMessage,
  createTutorConversation,
  listTutorConversations,
} from "@/lib/tutor/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODI = ["lernen", "probe"] as const;

// POST /api/lernen/tutor -- { topicId, modus?, cardId?, einheitId?, pruefung? }
// -> legt eine neue Tutor-Session an. Reihenfolge der Pruefungen siehe
// TUTOR-SPEC.md "API" und SPEC.md "Tutor kennt die Blätter des Punkts".
//
// topicId ist Pflicht -- ausser bei pruefung ohne topicId (Simulation ueber
// den ganzen Plan): dann muss modus "probe" sein, sonst 400.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!isObj(body)) return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });

  const hasTopicId = body.topicId !== undefined && body.topicId !== null;
  if (hasTopicId && (typeof body.topicId !== "string" || !isUuid(body.topicId))) {
    return NextResponse.json({ error: "topicId ist ungültig." }, { status: 400 });
  }

  const hasPruefung = body.pruefung !== undefined && body.pruefung !== null;
  if (hasPruefung && (typeof body.pruefung !== "string" || !isUuid(body.pruefung))) {
    return NextResponse.json({ error: "prüfung ist ungültig." }, { status: 400 });
  }

  if (!hasTopicId && !hasPruefung) {
    return NextResponse.json({ error: "topicId fehlt oder ist ungültig." }, { status: 400 });
  }

  if (body.modus !== undefined && !(MODI as readonly string[]).includes(body.modus as string)) {
    return NextResponse.json({ error: "modus muss lernen oder probe sein." }, { status: 400 });
  }
  const modus = (body.modus as "lernen" | "probe" | undefined) ?? "lernen";

  // Simulation (pruefung ohne topicId): nur im Modus probe sinnvoll --
  // die Fazit-Punkte je Punkt ergeben sonst keinen Sinn.
  if (!hasTopicId && hasPruefung && modus !== "probe") {
    return NextResponse.json({ error: "Simulation ohne Thema erfordert modus=probe." }, { status: 400 });
  }

  if (body.cardId !== undefined && body.cardId !== null) {
    if (typeof body.cardId !== "string" || !isUuid(body.cardId)) {
      return NextResponse.json({ error: "cardId ist ungültig." }, { status: 400 });
    }
  }
  if (body.einheitId !== undefined && body.einheitId !== null) {
    if (typeof body.einheitId !== "string" || !isUuid(body.einheitId)) {
      return NextResponse.json({ error: "einheitId ist ungültig." }, { status: 400 });
    }
  }

  if (!botEnabled()) {
    return NextResponse.json({ error: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." }, { status: 503 });
  }

  let topicId: string | null = null;
  let subjectId: string;

  if (hasTopicId) {
    const topic = await getTopic(body.topicId as string);
    if (!topic) return NextResponse.json({ error: "Thema nicht gefunden." }, { status: 404 });
    topicId = topic.id;
    subjectId = topic.subjectId;
  } else {
    const assignment = await getAssignment(body.pruefung as string);
    if (!assignment) return NextResponse.json({ error: "Prüfung nicht gefunden." }, { status: 404 });
    if (!assignment.subjectId) return NextResponse.json({ error: "Prüfung hat kein Fach." }, { status: 400 });
    subjectId = assignment.subjectId;
  }

  const cardId = typeof body.cardId === "string" ? body.cardId : undefined;
  let card;
  if (cardId) {
    card = await getCard(cardId);
    if (!card) return NextResponse.json({ error: "Karte nicht gefunden." }, { status: 404 });
  }

  const einheitId = typeof body.einheitId === "string" ? body.einheitId : undefined;
  const pruefung = typeof body.pruefung === "string" ? body.pruefung : undefined;

  const conversation = await createTutorConversation({
    topicId,
    subjectId,
    modus,
    cardId: cardId ?? null,
    itemId: einheitId ?? null,
    assignmentId: pruefung ?? null,
  });

  if (card) {
    await appendTutorMessage(conversation.id, {
      role: "user",
      content: `Ich hänge bei dieser Frage: ${card.question}`,
    });
  }

  return NextResponse.json({ conversation }, { status: 201 });
}

// GET /api/lernen/tutor?topicId= -- Sessions eines Themas, neueste zuerst.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topicId = searchParams.get("topicId");
  if (!topicId || !isUuid(topicId)) {
    return NextResponse.json({ error: "topicId fehlt oder ist ungültig." }, { status: 400 });
  }

  const conversations = await listTutorConversations(topicId);
  const result = conversations.map((c) => {
    const aufgaben = c.checkliste?.aufgaben ?? [];
    const erledigt = aufgaben.filter((a) => a.status !== "offen").length;
    return {
      id: c.id,
      modus: c.modus,
      createdAt: c.createdAt,
      endedAt: c.endedAt,
      ergebnis: c.ergebnis,
      checklisteFortschritt: { erledigt, gesamt: aufgaben.length },
    };
  });

  return NextResponse.json({ conversations: result });
}
