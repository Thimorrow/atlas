import { NextResponse } from "next/server";
import { completeTodo, parseCompletionDate, uncompleteTodo } from "@/lib/todo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Abhaken: { date: "YYYY-MM-DD" } -> Completion fuer (Aufgabe, Tag) anlegen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseCompletionDate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await completeTodo(id, parsed.value);
  return NextResponse.json({ completed: true }, { status: 201 });
}

// Haken entfernen: { date: "YYYY-MM-DD" }.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseCompletionDate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ok = await uncompleteTodo(id, parsed.value);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
