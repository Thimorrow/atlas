// Routen dieser App sind ASCII: /faecher, /pruefungen, /ueben. Getippt,
// gebookmarkt oder aus einem Chat kopiert landet aber schnell die deutsche
// Schreibweise in der Adresszeile -- /fächer. Next findet dafuer kein
// Verzeichnis und antwortet mit 404, obwohl die Seite existiert.
//
// Deshalb wird ein Pfad mit Umlauten hier auf seine ASCII-Form gebracht und
// der Aufruf dorthin umgeleitet, statt ins Leere zu laufen. Nur der Pfad wird
// angefasst: Query und Fragment bleiben, wie sie kamen.

const ERSATZ: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/Ä/g, "Ae"],
  [/Ö/g, "Oe"],
  [/Ü/g, "Ue"],
  [/ß/g, "ss"],
];

// Gibt den ASCII-Pfad zurueck, oder null, wenn der Pfad schon ASCII ist.
export function asciiPfad(pathname: string): string | null {
  // Der Browser schickt Umlaute prozentkodiert (/f%C3%A4cher). decodeURI
  // scheitert bei kaputter Kodierung -- dann bleibt der Pfad, wie er ist.
  let lesbar: string;
  try {
    lesbar = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  let out = lesbar;
  for (const [re, ersatz] of ERSATZ) out = out.replace(re, ersatz);
  return out === lesbar ? null : out;
}
