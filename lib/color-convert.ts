// OKLCH nach sRGB-Hex.
//
// Die Palette in lib/subject-colors.ts ist in OKLCH geschrieben, weil der
// Browser das direkt versteht. Ein nativer Client versteht es nicht: Android
// kennt nur ganzzahlige ARGB-Werte. Ohne diese Umrechnung muesste die Palette
// zweimal gepflegt werden, einmal hier und einmal in Kotlin -- und die zweite
// Kopie waere beim ersten Farbwechsel veraltet.
//
// Die Formeln stammen aus Bjoern Ottossons Definition von OKLab: OKLCH ->
// OKLab (polar nach kartesisch) -> LMS -> lineares sRGB -> Gamma -> Hex.
// Bewusst reine Funktionen ohne Abhaengigkeiten, damit sie testbar bleiben.

export type Rgb = { r: number; g: number; b: number };

// "oklch(0.58 0.16 255)". Prozentwerte fuer L sind erlaubt, weil CSS sie
// erlaubt; in unserer Palette kommen sie nicht vor.
export function parseOklch(css: string): { l: number; c: number; h: number } | null {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(css.trim());
  if (!m) return null;

  const raw = m[1];
  const l = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  const c = Number(m[2]);
  const h = Number(m[3]);
  if (![l, c, h].every(Number.isFinite)) return null;
  return { l, c, h };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Die Uebertragungsfunktion von sRGB. Der lineare Fuss unterhalb von 0.0031308
// ist kein Detail: ohne ihn werden sehr dunkle Farben merklich zu hell.
function linearToSrgb(v: number): number {
  const x = clamp01(v);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  // OKLab -> LMS. Die dritte Wurzel des Originals steckt hier als Kubik, weil
  // OKLab bereits im kubikwurzel-komprimierten Raum rechnet.
  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;

  // LMS -> lineares sRGB.
  const rLin = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const gLin = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bLin = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  // Ausserhalb des sRGB-Wuerfels wird schlicht abgeschnitten. Eine echte
  // Gamut-Abbildung waere aufwendiger; unsere Palette liegt ohnehin drin.
  return {
    r: Math.round(linearToSrgb(rLin) * 255),
    g: Math.round(linearToSrgb(gLin) * 255),
    b: Math.round(linearToSrgb(bLin) * 255),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Gibt null zurueck, statt zu werfen: ein unlesbarer Farbwert soll die
// /api/colors-Antwort nicht mit einer 500 beenden.
export function oklchToHex(css: string): string | null {
  const parsed = parseOklch(css);
  if (!parsed) return null;
  return rgbToHex(oklchToRgb(parsed.l, parsed.c, parsed.h));
}
