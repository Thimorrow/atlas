import { NextResponse } from "next/server";
import { isUuid } from "@/lib/subject-store";
import { botEnabled } from "@/lib/bot/model";
import { bewerten, defaultLernplanGenDeps, LernplanGenFehler, type BewertenAntwort } from "@/lib/lernplan-generieren";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ANTWORTEN = 20;
const MAX_ANTWORT_LEN = 500;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// POST /api/lernen/plan/bewerten -- wertet den Diagnosetest aus (Schritt 3).
// Siehe SPEC.md "Schritt 3: Diagnosetest".
export async function POST(req: Request) {
  if (!botEnabled()) {
    return NextResponse.json(
      { error: "bot_aus", hinweis: "Der Bot ist nicht eingerichtet (ZAI_API_KEY fehlt)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!isObj(body)) return NextResponse.json({ error: "body" }, { status: 400 });

  const { subjectId, antworten } = body;
  if (typeof subjectId !== "string" || !isUuid(subjectId)) {
    return NextResponse.json({ error: "subjectId", hinweis: "subjectId ist keine gueltige ID." }, { status: 400 });
  }
  if (!Array.isArray(antworten) || antworten.length === 0 || antworten.length > MAX_ANTWORTEN) {
    return NextResponse.json(
      { error: "antworten", hinweis: `antworten muss 1 bis ${MAX_ANTWORTEN} Eintraege haben.` },
      { status: 400 },
    );
  }

  const parsed: BewertenAntwort[] = [];
  for (const a of antworten) {
    if (!isObj(a) || typeof a.frage !== "string" || typeof a.musterantwort !== "string") {
      return NextResponse.json(
        { error: "antworten", hinweis: "frage und musterantwort muessen Strings sein." },
        { status: 400 },
      );
    }
    if (a.antwort !== null && typeof a.antwort !== "string") {
      return NextResponse.json({ error: "antworten", hinweis: "antwort muss ein String oder null sein." }, { status: 400 });
    }
    if (typeof a.antwort === "string" && a.antwort.length > MAX_ANTWORT_LEN) {
      return NextResponse.json(
        { error: "antworten", hinweis: `antwort darf hoechstens ${MAX_ANTWORT_LEN} Zeichen haben.` },
        { status: 400 },
      );
    }
    parsed.push({ frage: a.frage, musterantwort: a.musterantwort, antwort: (a.antwort as string | null) ?? null });
  }

  try {
    const urteile = await bewerten({ subjectId, antworten: parsed }, defaultLernplanGenDeps);
    return NextResponse.json(urteile);
  } catch (err) {
    if (err instanceof LernplanGenFehler) {
      return NextResponse.json({ error: err.code, ...(err.hinweis ? { hinweis: err.hinweis } : {}) }, { status: err.status });
    }
    console.error("[lernplan] bewerten: unbekannter Fehler:", err);
    return NextResponse.json({ error: "unbekannt" }, { status: 500 });
  }
}
