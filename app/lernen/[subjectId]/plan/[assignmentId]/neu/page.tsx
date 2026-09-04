import { LernplanErstellen } from "@/components/lernplan-erstellen";

// Erstell-Seite des Lernplans, vier Schritte ueber ?schritt=1..4. In Next 16
// sind params und searchParams ein Promise; alles Weitere (Gate-Pruefung,
// Laden der Prüfung/Dateien) uebernimmt die Client-Komponente selbst.
export default async function LernplanNeuPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string; assignmentId: string }>;
  searchParams: Promise<{ schritt?: string }>;
}) {
  const { subjectId, assignmentId } = await params;
  const sp = await searchParams;
  const parsed = Number(sp.schritt);
  const initialSchritt = parsed >= 1 && parsed <= 4 ? parsed : 1;

  return (
    <LernplanErstellen subjectId={subjectId} assignmentId={assignmentId} initialSchritt={initialSchritt} />
  );
}
