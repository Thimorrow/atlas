import { NextResponse } from "next/server";
import { lehrplanAlsMarkdown } from "@/lib/lehrplan/rendern";
import {
  KERNLEHRPLAN_QUELLE,
  getSubject,
  isUuid,
  saveCurriculum,
  vorlageFuerFach,
} from "@/lib/subject-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/subjects/[id]/curriculum/seed
//
// Belegt genau dieses Fach aus der Vorlage vor -- anders als seedCurricula
// bewusst AUCH dann, wenn schon ein Text steht: das ist der "Auf den
// Kernlehrplan zuruecksetzen"-Knopf der Oberflaeche, und der soll
// ueberschreiben. Die Rueckfrage davor stellt die Oberflaeche.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });

  const subject = await getSubject(id);
  if (!subject) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });

  const vorlage = vorlageFuerFach(subject);
  if (!vorlage) {
    return NextResponse.json(
      { error: `Fuer „${subject.name}“ ist im Kernlehrplan NRW kein Lehrplan hinterlegt.` },
      { status: 404 },
    );
  }

  const saved = await saveCurriculum(id, lehrplanAlsMarkdown(vorlage), KERNLEHRPLAN_QUELLE);
  if (!saved) return NextResponse.json({ error: "Fach nicht gefunden." }, { status: 404 });

  return NextResponse.json({ ...saved, vorlage: { fach: vorlage.fach } });
}
