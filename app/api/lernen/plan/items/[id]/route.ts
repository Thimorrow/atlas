import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { itemAbhaken, LernplanStoreFehler } from "@/lib/lernplan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/lernen/plan/items/[id] -- { done, result? }. Siehe SPEC.md
// "Abhaken lernen/ueben" und "Abhaken probe/simulation von Hand".
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "item_fehlt" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) return NextResponse.json({ error: "body" }, { status: 400 });

  const { done, result } = body as Record<string, unknown>;
  if (typeof done !== "boolean") return NextResponse.json({ error: "done" }, { status: 400 });
  if (result !== undefined && (typeof result !== "number" || result < 0 || result > 100)) {
    return NextResponse.json({ error: "result" }, { status: 400 });
  }

  try {
    const item = await itemAbhaken(id, { done, result: result as number | undefined });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof LernplanStoreFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] items patch: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
