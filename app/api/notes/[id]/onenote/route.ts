import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { NOT_CONFIGURED, accessTokenFor, createPage, microsoftConfig } from "@/lib/microsoft";
import { getNote, getSubject, isUuid } from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/notes/[id]/onenote -- legt die Notiz als OneNote-Seite an.
//
// Der Zielabschnitt kommt aus dem Fach, nicht aus dem Request: der Nutzer
// waehlt ihn einmal pro Fach, danach ist der Knopf an der Notiz ein Klick
// ohne Rueckfrage.
export async function POST(_req: Request, { params }: Ctx) {
  const config = microsoftConfig();
  if (!config) return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Notiz nicht gefunden." }, { status: 404 });

  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: "Notiz nicht gefunden." }, { status: 404 });

  const subject = await getSubject(note.subjectId);
  if (!subject?.onenoteSectionId) {
    return NextResponse.json(
      { error: "Für dieses Fach ist noch kein OneNote-Abschnitt ausgewählt." },
      { status: 409 },
    );
  }

  const token = await accessTokenFor(config);
  if ("error" in token) return NextResponse.json({ error: token.error }, { status: 401 });

  // Derselbe escape-first-Renderer wie in der Notiz-Ansicht. OneNote bekommt
  // damit garantiert kein ausfuehrbares HTML aus dem Notiz-Body.
  const html = renderMarkdown(note.body) || "<p></p>";
  const page = await createPage(token.token, subject.onenoteSectionId, note.title, html);
  if ("error" in page) return NextResponse.json(page, { status: 502 });

  return NextResponse.json({ link: page.link }, { status: 201 });
}
