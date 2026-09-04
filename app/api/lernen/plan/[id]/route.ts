import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { LernplanStoreFehler, planLaden, planLoeschen } from "@/lib/lernplan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/lernen/plan/[id] -- id ist die assignmentId. Siehe SPEC.md
// "Planseite".
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "kein_plan" }, { status: 404 });

  const plan = await planLaden(id);
  if (!plan) return NextResponse.json({ error: "kein_plan" }, { status: 404 });
  return NextResponse.json({ plan });
}

// DELETE /api/lernen/plan/[id] -- id ist die planId. Body optional
// { topicIds?: string[] }.
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "kein_plan" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const topicIdsRaw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).topicIds : undefined;
  const topicIds = topicIdsRaw === undefined ? [] : topicIdsRaw;
  if (!Array.isArray(topicIds) || !topicIds.every((t) => typeof t === "string" && isUuid(t))) {
    return NextResponse.json({ error: "topicIds" }, { status: 400 });
  }

  try {
    await planLoeschen(id, topicIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof LernplanStoreFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] plan delete: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
