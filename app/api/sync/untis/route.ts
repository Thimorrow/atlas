import { NextResponse } from "next/server";
import { syncUntis, defaultSyncWindow } from "@/lib/untis/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { start, end } = defaultSyncWindow();
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
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
