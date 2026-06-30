import { NextResponse } from "next/server";
import { deleteTodo, parseTodoPatch, updateTodo } from "@/lib/todo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseTodoPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const todo = await updateTodo(id, parsed.value);
  if (!todo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ todo });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deleteTodo(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
