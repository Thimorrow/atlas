import { NextResponse } from "next/server";
import { listConversationsWithMessages } from "@/lib/bot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bot/verlauf -- die letzten Gespraeche mit ihren Nachrichten, damit
// sich morgens nachlesen laesst, was der Bot nachts gemacht hat.
//
// GET /api/bot (Begruessung fuer die Startansicht) legt bei jedem Aufruf ein
// neues, leeres Gespraech an -- ohne Filter wuerden die letzten 20 Eintraege
// schnell nur aus solchen Karteileichen bestehen. Ein groesseres Rohfenster
// abfragen und die leeren danach herausfiltern haelt die Route trotzdem
// additiv: dieselben Felder, nur ohne inhaltslose Eintraege.
export async function GET() {
  const raw = await listConversationsWithMessages(100);
  const conversations = raw.filter((c) => c.messages.length > 0).slice(0, 20);
  return NextResponse.json({ conversations });
}
