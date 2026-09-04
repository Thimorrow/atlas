import { NextResponse } from "next/server";
import { seedCurricula } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/subjects/curriculum/seed -- belegt alle Faecher vor, an denen noch
// kein Lehrplan steht. Ein zweiter Aufruf belegt nichts mehr.
export async function POST() {
  return NextResponse.json(await seedCurricula());
}
