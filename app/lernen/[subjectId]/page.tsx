import { LernenFach } from "@/components/lernen-fach";

// In Next 16 sind Route-Params ein Promise. Alles Weitere laedt die
// Client-Komponente selbst ueber /api/lernen/[subjectId].
export default async function LernenFachPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return <LernenFach subjectId={subjectId} />;
}
