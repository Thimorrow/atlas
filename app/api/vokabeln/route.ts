import { db } from "@/lib/db";
import { vokabeln } from "@/lib/db/schema";
import { pruefeEntwurf } from "@/lib/vokabeln";

export async function GET() {
  try {
    return Response.json({ vokabeln: await db.select().from(vokabeln) });
  } catch {
    return Response.json(
      {
        error:
          "Deine Vokabeln konnten nicht geladen werden. Versuche es erneut.",
      },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !["latein", "englisch"].includes(body.sprache))
    return Response.json(
      { error: "Wähle Latein oder Englisch." },
      { status: 400 },
    );
  let rows;
  try {
    rows = pruefeEntwurf(body.vokabeln);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  try {
    const added = await db
      .insert(vokabeln)
      .values(rows.map((row) => ({ ...row, sprache: body.sprache })))
      .onConflictDoNothing()
      .returning();
    return Response.json({ hinzugefuegt: added.length });
  } catch {
    return Response.json(
      {
        error:
          "Speichern fehlgeschlagen. Dein Entwurf bleibt erhalten; versuche es erneut.",
      },
      { status: 503 },
    );
  }
}
