// Macht aus einem Eintrag der statischen Vorlage den Text, der in
// subjects.curriculum landet.
//
// Bewusst nur die Syntax, die lib/markdown.ts wirklich rendert: Ueberschriften,
// Listen, Fett und (per gfm-Autolink) die Quellen-URL. Blockquotes gibt es
// dort nicht -- der Renderer escapt die Quelle vor dem Parsen, ein `>` am
// Zeilenanfang bliebe also sichtbares Zeichen statt Zitat.

import type { LehrplanFach } from "@/lib/lehrplan/nrw-g9-klasse-10";

export function lehrplanAlsMarkdown(fach: LehrplanFach): string {
  const teile: string[] = [];

  // Der Hinweis steht ganz oben, nicht als Fussnote: wer den Text ueberfliegt,
  // soll zuerst wissen, dass er nicht belegt ist.
  if (fach.unsicher) {
    teile.push(
      "**Hinweis:** Dieser Lehrplan konnte nicht vollstaendig aus der offiziellen Quelle belegt werden. Nimm ihn als groben Anhaltspunkt und richte dich nach deiner Lehrkraft.",
    );
  }

  for (const inhaltsfeld of fach.inhaltsfelder) {
    teile.push(`## ${inhaltsfeld.titel}`);
    teile.push(inhaltsfeld.schwerpunkte.map((s) => `- ${s}`).join("\n"));
  }

  teile.push(`Quelle: ${fach.quelle}`);

  return teile.join("\n\n");
}
