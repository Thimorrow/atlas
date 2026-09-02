import { NextResponse } from "next/server";
import { listConversationsWithMessages } from "@/lib/bot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bot/verlauf -- die letzten Gespraeche mit ihren Nachrichten, damit
// sich morgens nachlesen laesst, was der Bot nachts gemacht hat.
export async function GET() {
  const conversations = await listConversationsWithMessages(20);
  return NextResponse.json({ conversations });
}
