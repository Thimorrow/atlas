// Reine Umrechnung Sicherheit aus Karten-Boxen und aus Tutor-Fazit. Die
// DB-seitigen Hooks (aktualisiereAusKarten, aktualisiereAusFazit), die diese
// Werte tatsaechlich zurueckschreiben, liegen in lib/lernplan-store.ts.
// Siehe SPEC.md "Sicherheit schreibt sich zurueck".

import { readiness } from "@/lib/lernen";

// Derselbe Maßstab wie im Lernbereich: ab Box 3 gilt eine Karte als sicher.
export function sicherheitAusKarten(boxen: number[]): number {
  return readiness(boxen.map((box) => ({ box, due: "", reviews: 0 })));
}

export function sicherheitAusFazit(prozent: number): number {
  return Math.min(100, Math.max(0, Math.round(prozent)));
}
