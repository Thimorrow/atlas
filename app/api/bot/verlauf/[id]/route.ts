import { NextResponse } from "next/server";
import { getConversation, listMessages, type MessageDTO } from "@/lib/bot/store";
import { isWriteToolMessage } from "@/lib/bot/verlauf";
import { getAssignment } from "@/lib/assignment-store";
import { getNote, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Ehrlichkeitscheck: eine angelegte Aufgabe/Notiz kann laengst wieder
// geloescht oder inhaltlich veraendert worden sein -- der Verlauf soll dann
// nicht so tun, als gaebe es sie noch unveraendert. Das laesst sich mit
// vertretbarem Aufwand nur fuer "existiert sie noch" pruefen (ein Blick in
// die aktuellen Tabellen), nicht dafuer, OB und WIE sie seither geaendert
// wurde -- das wuerde eine eigene Versionsgeschichte brauchen, die es nicht
// gibt. Darum bleibt die Kennzeichnung auf "nicht mehr vorhanden" beschraenkt.
async function withExistenceCheck(m: MessageDTO): Promise<MessageDTO & { stillExists?: boolean }> {
  if (!isWriteToolMessage(m) || !isObj(m.toolResult)) return m;

  if ((m.toolName === "aufgabe_anlegen" || m.toolName === "aufgabe_aendern") && isObj(m.toolResult.aufgabe)) {
    const id = m.toolResult.aufgabe.id;
    const stillExists = typeof id === "string" ? Boolean(await getAssignment(id)) : false;
    return { ...m, stillExists };
  }
  if ((m.toolName === "notiz_anlegen" || m.toolName === "notiz_aendern") && isObj(m.toolResult.notiz)) {
    const id = m.toolResult.notiz.id;
    const stillExists = typeof id === "string" ? Boolean(await getNote(id)) : false;
    return { ...m, stillExists };
  }
  return m;
}

// GET /api/bot/verlauf/[id] -- ein einzelnes Gespraech mit allen Nachrichten,
// fuer die geoeffnete Ansicht in app/bot/verlauf/[id]. Ergaenzt gegenueber
// GET /api/bot/verlauf zusaetzlich stillExists an angelegten/geaenderten
// Aufgaben und Notizen -- additiv, die uebrigen Felder bleiben gleich.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Ungueltige id." }, { status: 400 });

  const conversation = await getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Gespraech nicht gefunden." }, { status: 404 });

  const rawMessages = await listMessages(id);
  const messages = await Promise.all(rawMessages.map(withExistenceCheck));

  return NextResponse.json({ conversation, messages });
}
