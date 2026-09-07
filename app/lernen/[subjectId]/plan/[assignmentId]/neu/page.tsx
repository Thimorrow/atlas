import { LernplanErstellen } from "@/components/lernplan-erstellen";

// Erstell-Seite des Lernplans, drei Schritte ueber ?schritt=1..3. In Next 16
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
  // Eine Bruchzahl wie 2.5 kam frueher ungerundet durch und traf keinen der
  // drei Zweige in LernplanErstellen -- die Seite blieb dann leer. Runden und
  // auf den echten Bereich klemmen faengt das hier ab; die Komponente klemmt
  // die Obergrenze zwar selbst, aber der Wert soll schon hier stimmen.
  const parsed = Math.round(Number(sp.schritt));
  const initialSchritt = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 1;

  return (
    <LernplanErstellen subjectId={subjectId} assignmentId={assignmentId} initialSchritt={initialSchritt} />
  );
}
