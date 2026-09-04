import { LernenThema } from "@/components/lernen-thema";

// In Next 16 sind Route-Params ein Promise. Alles Weitere laedt die
// Client-Komponente selbst ueber /api/lernen/[subjectId]. topicId
// "allgemein" steht fuer Karten ohne Thema.
export default async function LernenThemaPage({
  params,
}: {
  params: Promise<{ subjectId: string; topicId: string }>;
}) {
  const { subjectId, topicId } = await params;
  return <LernenThema subjectId={subjectId} topicId={topicId} />;
}
