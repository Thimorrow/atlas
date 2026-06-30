import { NextResponse } from "next/server";
import { createTodo, listTodos, parseNewTodo } from "@/lib/todo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ todos: await listTodos() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = parseNewTodo(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const todo = await createTodo(parsed.value);
  return NextResponse.json({ todo }, { status: 201 });
}
