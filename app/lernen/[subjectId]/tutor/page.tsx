import Link from "next/link";
import { LernenTutor } from "@/components/lernen-tutor";
import type { TutorModusDTO } from "@/lib/tutor/types";

// In Next 16 sind Route- und Search-Params ein Promise. Pflicht ist `thema`
// ODER `pruefung` (Simulation ueber den ganzen Plan, siehe SPEC.md "Tutor
// kennt die Blaetter des Punkts") -- alles andere hat einen Default. Die
// Client-Komponente laedt Conversation/Verlauf selbst ueber /api/lernen/tutor.
export default async function LernenTutorPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{
    thema?: string;
    modus?: string;
    karte?: string;
    session?: string;
    einheit?: string;
    pruefung?: string;
  }>;
}) {
  const { subjectId } = await params;
  const sp = await searchParams;

  if (!sp.thema && !sp.pruefung) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Kein Thema angegeben</p>
          <Link
            href={`/lernen/${subjectId}`}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zum Fach
          </Link>
        </div>
      </div>
    );
  }

  const modus: TutorModusDTO = sp.modus === "probe" ? "probe" : "lernen";

  return (
    <LernenTutor
      key={sp.session ?? "neu"}
      subjectId={subjectId}
      topicId={sp.thema ?? null}
      modus={modus}
      cardId={sp.karte ?? null}
      sessionId={sp.session ?? null}
      einheitId={sp.einheit ?? null}
      pruefung={sp.pruefung ?? null}
    />
  );
}
