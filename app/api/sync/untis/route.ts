import { NextResponse } from "next/server";
import { syncUntis, defaultSyncWindow, syncState } from "@/lib/untis/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sync/untis -- nur lesen, stoesst nichts an.
// Beantwortet die Frage "muss ich ueberhaupt abgleichen?", ohne dafuer einen
// Abgleich auszuloesen. Der teure POST darunter bleibt unveraendert.
export async function GET() {
  return NextResponse.json(await syncState());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Ohne Rumpf wird das uebliche Fenster abgeglichen. Mit { start, end } als
// Datum im Format JJJJ-MM-TT laesst sich ein anderer Zeitraum holen. Das
// braucht man, wenn Untis fuer einen Zeitraum nichts liefert und man wissen
// will, ob es an den Zugangsdaten liegt oder schlicht an diesen Tagen.
function parseWindow(body: unknown): { start: Date; end: Date } | { error: string } {
  const b = body as { start?: unknown; end?: unknown } | null;
  if (!b || (b.start === undefined && b.end === undefined)) return defaultSyncWindow();

  if (typeof b.start !== "string" || !DATE_RE.test(b.start)) {
    return { error: "start muss ein Datum im Format JJJJ-MM-TT sein." };
  }
  if (typeof b.end !== "string" || !DATE_RE.test(b.end)) {
    return { error: "end muss ein Datum im Format JJJJ-MM-TT sein." };
  }

  const start = new Date(`${b.start}T00:00:00`);
  const end = new Date(`${b.end}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Das ist kein gültiges Datum." };
  }
  if (end < start) return { error: "end liegt vor start." };
  return { start, end };
}

export async function POST(req: Request) {
  const parsed = parseWindow(await req.json().catch(() => null));
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { start, end } = parsed;
  try {
    const result = await syncUntis(start, end);
    return NextResponse.json({
      ok: true,
      ...result,
      window: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
    });
  } catch (e) {
    console.error("Untis sync failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
        window: {
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
        },
      },
      { status: 500 },
    );
  }
}
