import { LernenSession } from "@/components/lernen-session";

// In Next 16 sind Route-Params ein Promise. Alles Weitere laedt die
// Client-Komponente selbst ueber /api/lernen/[subjectId].
export default async function LernenSessionPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return <LernenSession subjectId={subjectId} />;
}
