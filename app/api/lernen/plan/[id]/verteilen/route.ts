import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { LernplanStoreFehler, neuVerteilenImStore } from "@/lib/lernplan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UMFAENGE = ["ueberfaellig", "alle_offen"] as const;

// POST /api/lernen/plan/[id]/verteilen -- id ist die planId. Body
// { umfang: 'ueberfaellig' | 'alle_offen' }. Siehe SPEC.md "Neu verteilen".
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "kein_plan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const umfang = typeof body === "object" && body !== null ? (body as Record<string, unknown>).umfang : undefined;
  if (typeof umfang !== "string" || !(UMFAENGE as readonly string[]).includes(umfang)) {
    return NextResponse.json({ error: "umfang" }, { status: 400 });
  }

  try {
    const result = await neuVerteilenImStore(id, umfang as (typeof UMFAENGE)[number]);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LernplanStoreFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] verteilen: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
