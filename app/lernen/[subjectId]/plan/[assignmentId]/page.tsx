import { LernplanSeite } from "@/components/lernplan-seite";

// Planseite des Lernplans -- die Client-Komponente laedt PlanDTO, Fach und
// Pruefung selbst ueber die APIs, siehe SPEC.md "Planseite".
export default async function LernplanSeitePage({
  params,
}: {
  params: Promise<{ subjectId: string; assignmentId: string }>;
}) {
  const { subjectId, assignmentId } = await params;
  return <LernplanSeite subjectId={subjectId} assignmentId={assignmentId} />;
}
