import { LernenSession } from "@/components/lernen-session";
import type { SessionModus } from "@/lib/lernen-types";

// In Next 16 sind Route- und Search-Params ein Promise. Alles Weitere laedt
// die Client-Komponente selbst ueber /api/lernen/[subjectId].
export default async function LernenSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ modus?: string; thema?: string; pruefung?: string }>;
}) {
  const { subjectId } = await params;
  const sp = await searchParams;
  const modus: SessionModus = sp.modus === "schwach" || sp.modus === "probe" ? sp.modus : "lernen";
  return <LernenSession subjectId={subjectId} modus={modus} thema={sp.thema ?? null} pruefung={sp.pruefung ?? null} />;
}
