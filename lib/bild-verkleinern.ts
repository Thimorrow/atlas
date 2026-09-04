// Bilder vor dem Upload im Browser verkleinern (Lernplan-Erstellseite,
// Checkliste als Foto). Keine Bibliothek, nur Canvas. Siehe SPEC.md
// "Erstell-Seite, Schritt 1: Material".

const MAX_KANTE = 2000;
const JPEG_QUALITAET = 0.85;
const MAX_BYTES = 4 * 1024 * 1024;

// Reine Berechnung der Zielmasse: lange Kante auf maxKante begrenzt,
// Seitenverhaeltnis bleibt erhalten. Kleinere Bilder werden nicht vergroessert.
export function zielmasse(
  breite: number,
  hoehe: number,
  maxKante: number = MAX_KANTE,
): { breite: number; hoehe: number } {
  const laengsteKante = Math.max(breite, hoehe);
  if (laengsteKante <= maxKante) return { breite, hoehe };
  const faktor = maxKante / laengsteKante;
  return {
    breite: Math.round(breite * faktor),
    hoehe: Math.round(hoehe * faktor),
  };
}

// Verkleinert ein Bild (Foto oder beliebiges Bildformat inklusive HEIC) auf
// eine lange Kante von maxKante Pixeln und wandelt es zu JPEG. Wirft, wenn
// das Ergebnis trotzdem ueber 4 MB liegt.
export async function verkleinereBild(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { breite, hoehe } = zielmasse(bitmap.width, bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = breite;
  canvas.height = hoehe;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfuegbar");
  ctx.drawImage(bitmap, 0, 0, breite, hoehe);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITAET),
  );
  if (!blob) throw new Error("Bild konnte nicht verkleinert werden");
  if (blob.size > MAX_BYTES) throw new Error("Bild zu gross");

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
