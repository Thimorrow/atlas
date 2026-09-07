import { NextResponse } from "next/server";
import { decideGradeProposal, GradeProposalError } from "@/lib/bot/grade-proposals";
import { isObj, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Ungültiger Notenvorschlag." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!isObj(body) || (body.decision !== "accept" && body.decision !== "discard")) {
    return NextResponse.json({ error: "Entscheidung muss accept oder discard sein." }, { status: 400 });
  }
  try {
    return NextResponse.json(await decideGradeProposal(id, body.decision));
  } catch (err) {
    if (err instanceof GradeProposalError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[bot/proposal] Entscheidung konnte nicht gespeichert werden:", err);
    return NextResponse.json({ error: "Die Entscheidung konnte nicht gespeichert werden. Bitte erneut versuchen." }, { status: 500 });
  }
}
