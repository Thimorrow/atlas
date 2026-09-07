import { NextResponse } from "next/server";
import { cachedJson } from "@/lib/http-cache";
import {
  createSubject,
  getSubject,
  listSubjects,
  parseNewSubject,
  type SubjectScope,
} from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/subjects?archived=1|all=1
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope: SubjectScope = url.searchParams.get("all")
    ? "all"
    : url.searchParams.get("archived")
      ? "archived"
      : "active";
  // Faechersliste aendert sich fast nie (Setup, Abgleich): 5 Minuten frisch.
  return cachedJson({ subjects: await listSubjects(scope) }, 300);
}

// POST /api/subjects -- { name, teacher?, room?, color?, untisSubject? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseNewSubject(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createSubject(parsed.value);
  return NextResponse.json({ subject: await getSubject(row.id) }, { status: 201 });
}
