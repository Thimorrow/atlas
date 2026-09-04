// Die App schreibt ueberall ohne Umlaute und ohne Eszett (siehe CLAUDE.md).
// Statische Texte stehen deshalb schon transliteriert im Quelltext. Diese
// Funktion ist fuer alles, was von aussen hereinkommt und trotzdem Umlaute
// mitbringen kann: Untis-Fachnamen, Antworten des Modells, Tippeingaben.
//
// Zweiter Einsatzzweck ist der Vergleich: wer "Französisch" tippt und wer
// "Franzoesisch" tippt, meint dasselbe Fach. Beide Seiten durch diese Funktion
// zu schicken macht solche Vergleiche unempfindlich gegen die Schreibweise.
//
// Reihenfolge zaehlt: die Grossbuchstaben-Umlaute zuerst, sonst wuerde aus
// "Ä" ueber die Kleinschreibung ein falsches "ae" statt "Ae".

const ERSETZUNGEN: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/Ä/g, "Ae"],
  [/Ö/g, "Oe"],
  [/Ü/g, "Ue"],
  [/ß/g, "ss"],
];

export function ohneUmlaute(text: string): string {
  // NFC zuerst, damit auch zerlegt kodierte Umlaute (a + Trema als zwei
  // Zeichen, wie macOS sie beim Dateinamen-Import liefert) getroffen werden.
  let out = text.normalize("NFC");
  for (const [re, ersatz] of ERSETZUNGEN) out = out.replace(re, ersatz);
  return out;
}

// Fuer Vergleiche: ohne Umlaute, klein, getrimmt.
export function vergleichbar(text: string): string {
  return ohneUmlaute(text).trim().toLowerCase();
}
