import { NextResponse } from "next/server";
import { listSubjects, reconcileSubjects } from "@/lib/subject-store";
import { normalizeStoredSubjects } from "@/lib/untis/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/subjects/reconcile -- Faecher aus dem vorhandenen Stundenplan
// nachziehen, ohne dafuer zu WebUntis zu gehen.
//
// Derselbe Abgleich laeuft automatisch nach jedem Untis-Sync mit. Die Route
// gibt es fuer den Fall, dass jemand ihn ausloesen will, ohne auf den naechsten
// Sync zu warten -- etwa direkt nachdem eine Normalisierungsregel dazukam.
export async function POST() {
  const renamed = await normalizeStoredSubjects();
  const result = await reconcileSubjects();
  return NextResponse.json({
    ok: true,
    renamed,
    ...result,
    subjects: await listSubjects("all"),
  });
}
