import type { TeacherTitle } from "@/lib/db/schema";

export const TEACHER_TITLES: { value: TeacherTitle; label: string }[] = [
  { value: "herr", label: "Herr" },
  { value: "frau", label: "Frau" },
];

// "Herr Schulze" aus Anrede und Nachname. Ohne Namen gibt es nichts anzuzeigen
// -- eine nackte Anrede ist keine Auskunft, sondern ein halber Satz.
export function teacherLabel(
  title: TeacherTitle | null | undefined,
  teacher: string | null | undefined,
): string | null {
  if (!teacher) return null;
  const anrede = TEACHER_TITLES.find((t) => t.value === title)?.label;
  return anrede ? `${anrede} ${teacher}` : teacher;
}
