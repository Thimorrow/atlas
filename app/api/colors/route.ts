import { NextResponse } from "next/server";
import { oklchToHex } from "@/lib/color-convert";
import { NEUTRAL_COLOR, SUBJECT_COLORS } from "@/lib/subject-colors";

export const runtime = "nodejs";

// GET /api/colors
//
// Die Palette liegt in lib/subject-colors.ts, gespeichert wird pro Fach nur
// der Token-Name. Ein Browser kann daraus selbst eine Farbe machen, ein
// nativer Client nicht: er versteht weder oklch() noch var() noch color-mix().
// Muesste er die Palette selbst nachbauen, gaebe es zwei Wahrheiten, und die
// zweite waere beim ersten Farbwechsel falsch.
//
// Deshalb liefert diese Route zu jedem Token beides: den CSS-Ausdruck, den die
// Web-App benutzt, und einen fertigen Hex-Wert je Theme.

// Zwei Werte in der Palette sind keine Farben, sondern Verweise, und stehen
// deshalb hier aufgeloest. Die Quelle sind die Custom Properties in
// app/globals.css: :root ist hell, .dark ist dunkel. Aendert sich dort etwas,
// muss es hier mitwandern -- CSS laesst sich zur Laufzeit nicht auswerten.
const SUBJECT_WHITE_LIGHT = "oklch(0.84 0 0)";
const SUBJECT_WHITE_DARK = "oklch(1 0 0)";
const FOREGROUND_LIGHT = "oklch(0.205 0 0)";
const FOREGROUND_DARK = "oklch(0.97 0 0)";

// NEUTRAL_COLOR ist color-mix(in oklab, var(--foreground) 34%, transparent).
// Mischen mit transparent aendert nur die Deckkraft, nicht den Farbton -- es
// bleibt also der Vordergrund bei 34 Prozent. Ein Hex-Wert kann das nicht
// ausdruecken, darum steht die Deckkraft als eigenes Feld daneben.
const NEUTRAL_ALPHA = 0.34;

type ColorDTO = {
  token: string;
  label: string;
  css: string;
  hexLight: string | null;
  hexDark: string | null;
  alpha?: number;
};

function entry(token: string, label: string, css: string, light: string, dark: string): ColorDTO {
  return { token, label, css, hexLight: oklchToHex(light), hexDark: oklchToHex(dark) };
}

export async function GET() {
  const colors: ColorDTO[] = SUBJECT_COLORS.map((c) => {
    if (c.token === "white") {
      return entry(c.token, c.label, c.value, SUBJECT_WHITE_LIGHT, SUBJECT_WHITE_DARK);
    }
    // Alle uebrigen Token stehen schon als oklch() da und sind themeunabhaengig.
    return entry(c.token, c.label, c.value, c.value, c.value);
  });

  // Kein Fachfarben-Token, aber der Client braucht ihn: so wird "Allgemein"
  // (Aufgabe ohne Fach) und jedes unbekannte Token eingefaerbt.
  colors.push({
    ...entry("neutral", "Neutral", NEUTRAL_COLOR, FOREGROUND_LIGHT, FOREGROUND_DARK),
    alpha: NEUTRAL_ALPHA,
  });

  return NextResponse.json({ colors });
}
