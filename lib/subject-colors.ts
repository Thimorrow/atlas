// Feste Auswahl von Fachfarben. Der in 36f031b entfernte color-picker kommt
// bewusst NICHT zurueck -- eine ueberschaubare Zahl an Tokens reicht, um
// Faecher auseinanderzuhalten, und haelt die Palette der App zusammen.
// Gespeichert wird der Token-Name (subjects.color), nie ein Hex-Wert.

export const SUBJECT_COLORS = [
  { token: "slate", label: "Grau", value: "oklch(0.55 0.03 260)" },
  // "Weiss" laeuft ueber eine CSS-Variable statt ueber einen festen Wert: ein
  // reinweisser Punkt waere im Hellmodus unsichtbar. globals.css definiert das
  // Token pro Theme (hell: sehr helles Grau, dunkel: reines Weiss).
  { token: "white", label: "Weiß", value: "var(--subject-white)" },
  { token: "blue", label: "Blau", value: "oklch(0.58 0.16 255)" },
  { token: "sky", label: "Hellblau", value: "oklch(0.7 0.12 230)" },
  { token: "teal", label: "Türkis", value: "oklch(0.6 0.11 195)" },
  { token: "green", label: "Grün", value: "oklch(0.6 0.14 150)" },
  { token: "yellow", label: "Gelb", value: "oklch(0.79 0.15 95)" },
  { token: "amber", label: "Bernstein", value: "oklch(0.68 0.15 75)" },
  { token: "orange", label: "Orange", value: "oklch(0.65 0.17 45)" },
  { token: "rose", label: "Rot", value: "oklch(0.6 0.19 20)" },
  { token: "violet", label: "Violett", value: "oklch(0.56 0.18 300)" },
  { token: "lime", label: "Hellgrün", value: "oklch(0.72 0.16 130)" },
  { token: "pink", label: "Pink", value: "oklch(0.65 0.19 350)" },
] as const;

export type SubjectColorToken = (typeof SUBJECT_COLORS)[number]["token"];

const BY_TOKEN = new Map(SUBJECT_COLORS.map((c) => [c.token as string, c.value as string]));

// Neutrales Grau fuer "Allgemein" (Aufgabe ohne Fach) und unbekannte Tokens.
export const NEUTRAL_COLOR = "color-mix(in oklab, var(--foreground) 34%, transparent)";

export function colorValue(token: string | null | undefined): string {
  if (!token) return NEUTRAL_COLOR;
  return BY_TOKEN.get(token) ?? NEUTRAL_COLOR;
}

// Wunschfarben von Sid. Greift beim stillen Anlegen aus einem Untis-Fach und
// bei der Erstauswahl, damit die Faecher von Anfang an richtig eingefaerbt
// sind. Der Nutzer kann jede Farbe auf der Fach-Detailseite wieder aendern --
// das hier ist nur die Vorbelegung, keine feste Verdrahtung.
// Schluessel sind kleingeschrieben und werden als Teilstring geprueft, damit
// auch Untis-Kuerzel und Varianten treffen ("Mathematik", "Mathe", "MA").
const PRESETS: [string, SubjectColorToken][] = [
  ["mathe", "blue"],
  ["biolog", "green"],
  ["deutsch", "rose"],
  ["englisch", "yellow"],
  ["religion", "white"],
  ["chemie", "orange"],
  ["informatik", "slate"],
  ["geschichte", "violet"],
];

// Stabile Default-Farbe fuer alles ohne Wunschfarbe: gleicher Name -> gleiche
// Farbe, ohne dass irgendwo ein Zaehler mitgefuehrt werden muss.
export function defaultColorFor(name: string): SubjectColorToken {
  const key = name.toLowerCase();
  for (const [needle, token] of PRESETS) {
    if (key.includes(needle)) return token;
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length].token;
}
