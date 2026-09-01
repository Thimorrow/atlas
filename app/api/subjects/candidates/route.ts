import { NextResponse } from "next/server";
import { candidateSubjects } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/subjects/candidates -- distinct Untis-Faecher aus dem Stundenplan.
export async function GET() {
  return NextResponse.json(await candidateSubjects());
}
