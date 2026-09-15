export type Sprache = "latein" | "englisch";
export type VokabelEntwurf = {
  abschnitt: string;
  wort: string;
  deutsch: string;
};
export type Vokabel = VokabelEntwurf & {
  id: string;
  sprache: Sprache;
  box: number;
  revision: number;
};

export function fortschritt(karten: { box: number }[]): number {
  if (!karten.length) return 0;
  const wert =
    karten.reduce((sum, karte) => sum + (karte.box - 1) * 20, 0) /
    karten.length;
  // 100 % ist ausschließlich vollständig gelernten Sammlungen vorbehalten.
  return karten.every((karte) => karte.box === 6)
    ? 100
    : Math.min(99, Math.round(wert));
}

export function naechsteBox(box: number, richtig: boolean): number {
  return richtig ? Math.min(6, box + 1) : 1;
}

export function abschnittLabel(sprache: Sprache, abschnitt: string): string {
  return `${sprache === "latein" ? "Lektion" : "Seite"} ${abschnitt}`;
}

export function pruefeEntwurf(
  value: unknown,
  leereAbschnitte = false,
): VokabelEntwurf[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 300) {
    throw new Error("Es müssen 1 bis 300 Vokabeln enthalten sein.");
  }
  return value.map((row) => {
    if (!row || typeof row !== "object")
      throw new Error("Eine Vokabel ist unvollständig.");
    const { abschnitt, wort, deutsch } = row;
    if (
      typeof abschnitt !== "string" ||
      typeof wort !== "string" ||
      typeof deutsch !== "string" ||
      (!leereAbschnitte && !abschnitt.trim()) ||
      !wort.trim() ||
      !deutsch.trim() ||
      abschnitt.length > 80 ||
      wort.length > 400 ||
      deutsch.length > 1000
    ) {
      throw new Error(
        "Prüfe Lektion/Seite, Vokabel und deutsche Bedeutung. Alle Felder müssen ausgefüllt sein.",
      );
    }
    return {
      abschnitt: abschnitt.trim(),
      wort: wort.trim(),
      deutsch: deutsch.trim(),
    };
  });
}

export function leseVokabelJson(text: string): VokabelEntwurf[] {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return pruefeEntwurf(JSON.parse(clean), true);
  } catch {
    throw new Error(
      "Die Vokabeln konnten nicht sicher gelesen werden. Versuche ein schärferes Foto mit sichtbarer Überschrift.",
    );
  }
}

export function lernkartenFuerAbschnitt(
  karten: Vokabel[],
  sprache: Sprache,
  abschnitt: string,
): Vokabel[] {
  const gruppe = karten.filter(
    (karte) => karte.sprache === sprache && karte.abschnitt === abschnitt,
  );
  const offen = gruppe.filter((karte) => karte.box < 6);
  return offen.length ? offen : gruppe;
}
