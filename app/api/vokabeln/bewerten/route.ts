import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vokabeln } from "@/lib/db/schema";
import { isUuid } from "@/lib/subject-store";
import { naechsteBox } from "@/lib/vokabeln";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !isUuid(body.id) ||
    typeof body.richtig !== "boolean" ||
    !Number.isInteger(body.revision) ||
    body.revision < 0
  ) {
    return Response.json({ error: "Ungültige Bewertung." }, { status: 400 });
  }
  try {
    const [card] = await db
      .select()
      .from(vokabeln)
      .where(eq(vokabeln.id, body.id));
    if (!card)
      return Response.json(
        { error: "Diese Vokabel existiert nicht mehr." },
        { status: 404 },
      );
    const [updated] = await db
      .update(vokabeln)
      .set({
        box: naechsteBox(card.box, body.richtig),
        revision: card.revision + 1,
      })
      .where(
        and(eq(vokabeln.id, card.id), eq(vokabeln.revision, body.revision)),
      )
      .returning();
    if (!updated)
      return Response.json(
        {
          error:
            "Der Lernstand hat sich geändert. Lade die Vokabeln neu, bevor du weiterlernst.",
        },
        { status: 409 },
      );
    return Response.json({ vokabel: updated });
  } catch {
    return Response.json(
      {
        error:
          "Die Antwort wurde nicht bestätigt. Prüfe deine Verbindung und lade den Lernstand neu.",
      },
      { status: 503 },
    );
  }
}
