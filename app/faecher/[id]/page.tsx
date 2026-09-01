import { SubjectDetail } from "@/components/subject-detail";

// In Next 16 sind Route-Params ein Promise. Die Seite reicht nur die id an die
// Client-Komponente durch, die alles Weitere ueber /api/subjects/[id] laedt.
export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubjectDetail id={id} />;
}
