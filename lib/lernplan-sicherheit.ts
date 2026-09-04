// Reine Umrechnung Sicherheit aus Karten-Boxen und aus Tutor-Fazit. Die
// DB-seitigen Hooks (aktualisiereAusKarten, aktualisiereAusFazit), die diese
// Werte tatsaechlich zurueckschreiben, liegen in lib/lernplan-store.ts.
// Siehe SPEC.md "Sicherheit schreibt sich zurueck".

// Boxen 0..5 (Leitner-System, siehe lib/lernen.ts). Schnitt der Boxen relativ
// zur maximalen Box 5, auf Prozent skaliert.
export function sicherheitAusKarten(boxen: number[]): number {
  if (boxen.length === 0) return 0;
  const schnitt = boxen.reduce((sum, box) => sum + box, 0) / boxen.length;
  return Math.round((schnitt / 5) * 100);
}

export function sicherheitAusFazit(prozent: number): number {
  return Math.min(100, Math.max(0, Math.round(prozent)));
}
