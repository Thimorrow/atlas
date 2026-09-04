import { NextResponse } from "next/server";
import { overview } from "@/lib/study-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/lernen -- Uebersicht ueber alle Faecher fuers Dashboard des Lernbereichs.
export async function GET() {
  return NextResponse.json(await overview());
}
