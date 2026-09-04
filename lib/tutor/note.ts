// Notenschluessel fuer die Probe-Simulation des Tutors. 85/70/55/40/20 Prozent
// -- ueblicher NRW-Schluessel fuer Klassenarbeiten in der Sek I (Annahme,
// siehe TUTOR-SPEC.md "Getroffene Annahmen").

export function noteFuerProzent(p: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (p >= 85) return 1;
  if (p >= 70) return 2;
  if (p >= 55) return 3;
  if (p >= 40) return 4;
  if (p >= 20) return 5;
  return 6;
}
