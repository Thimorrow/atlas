import { Marked, type Tokens } from "marked";

import { ohneUmlaute } from "@/lib/umlaute";

// Markdown-Rendering fuer Fach-Notizen.
//
// Sicherheit: Das Ergebnis landet in `dangerouslySetInnerHTML`, also darf aus
// dem Body niemals ausfuehrbares HTML entstehen. Statt hinterher zu sanitizen
// (fehleranfaellig, braucht eine weitere Dependency) escapen wir die Quelle
// VOR dem Parsen. marked sieht dann nur noch Markdown-Syntax und keine Tags:
// `<script>alert(1)</script>` kommt als sichtbarer Text an. marked erkennt
// bestehende Entities und kodiert sie nicht doppelt.
//
// Preis dieser Variante: `>` am Zeilenanfang ist kein Blockquote mehr. Die
// Spec verlangt Ueberschriften, Listen, Fett, Kursiv, Code und Links -- das
// bleibt vollstaendig erhalten.
function escapeSource(src: string): string {
  return src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Zweite Verteidigungslinie: Link- und Bildziele. Erlaubt sind nur http,
// https und mailto. Alles andere (`javascript:`, `data:`, `vbscript:`) wird
// zu reinem Text, es entsteht also gar kein klickbares Element.
const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

function isSafeUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  // Entities und Steuerzeichen zuerst aufloesen, sonst schmuggelt sich
  // `java&#115;cript:` oder `java\tscript:` an der Pruefung vorbei.
  const raw = href
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&colon;/gi, ":")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020]/g, "")
    .trim();
  // Relative Ziele (kein Schema) sind unbedenklich.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) return true;
  return SAFE_PROTOCOL.test(raw);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Eigene Marked-Instanz statt globaler Optionen: kein geteilter Zustand mit
// anderem Code. Deterministisch konfiguriert -- keine Header-IDs (gh-Slugger),
// kein E-Mail-Mangling, keine Zufallsanteile im Output.
const md = new Marked({
  gfm: true,
  breaks: true,
  pedantic: false,
  renderer: {
    link({ href, title, text }: Tokens.Link) {
      if (!isSafeUrl(href)) return text;
      const t = title ? ` title="${escapeAttr(title)}"` : "";
      return `<a href="${escapeAttr(href)}"${t} target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      if (!isSafeUrl(href)) return text;
      const t = title ? ` title="${escapeAttr(title)}"` : "";
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(text)}"${t} />`;
    },
    // Falls trotz Escaping je ein HTML-Token entsteht: nie roh durchreichen.
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeSource(text);
    },
  },
});

export function renderMarkdown(src: string): string {
  if (!src) return "";
  return md.parse(escapeSource(src), { async: false });
}

// Reparatur fuer gestreamten Bot-Text: das Modell liefert manchmal zwei
// Saetze oder einen Listenpunkt und den folgenden Absatz ganz ohne
// Trennzeichen aneinander, z. B. "...Unit 4 lernenAusserdem sind zwei
// Aufgaben..." oder "...steht an.Morgen ist frei.". Ohne Leerzeile dazwischen
// zieht Markdown (Lazy Continuation) den zweiten Satz in denselben
// Listenpunkt statt einen neuen Absatz zu beginnen.
//
// Getrennt wird nur an zwei eindeutigen Stellen, nicht bei jedem
// Grossbuchstaben mitten im Wort: nach einem Satzendezeichen, und vor einer
// kurzen Liste von Woertern, mit denen ein neuer Absatz typischerweise
// anfaengt. Alles andere bleibt, wie es ist -- eine allgemeine Regel "klein
// gefolgt von gross" wuerde Eigennamen wie OneNote oder WebUntis mitten
// entzweischneiden. Nur fuer Bot-Text gedacht (vor renderMarkdown
// angewendet), nicht Teil von renderMarkdown selbst -- Fach-Notizen sollen
// sich nicht aendern.
const ABSATZ_ANFAENGE = [
  "Ausserdem",
  "Zusaetzlich",
  "Zudem",
  "Daneben",
  "Ansonsten",
  "Uebrigens",
  "Insgesamt",
  "Dazu",
  "Wichtig",
  "Hinweis",
  "Tipp",
  "Achtung",
  "Soll",
  "Willst",
  "Moechtest",
];

export function repairMissingParagraphBreaks(src: string): string {
  if (!src) return src;
  // Hier laeuft der einzige Text durch, den nicht die App, sondern das Modell
  // geschrieben hat -- also die einzige Stelle, an der doch noch Umlaute in
  // die Oberflaeche kommen koennten. Deshalb zuerst transliterieren (siehe
  // CLAUDE.md), erst danach die Absaetze reparieren: die Wortliste unten
  // braucht so nur eine Schreibweise.
  return ohneUmlaute(src)
    // "...steht an.Morgen ist frei." -- ein Satzzeichen ohne Leerzeichen
    // dahinter ist immer eine Bruchstelle.
    .replace(/([.!?:])([A-Z][a-z])/g, "$1\n\n$2")
    // "...Unit 4 lernenAusserdem sind..." -- hier fehlt sogar das
    // Satzzeichen, deshalb nur vor den bekannten Absatzanfaengen.
    .replace(
      new RegExp(`([a-z])(${ABSATZ_ANFAENGE.join("|")})(?![a-z])`, "g"),
      "$1\n\n$2",
    );
}

// Einzeilige Vorschau fuer die Notizliste: Markdown-Zeichen raus, alles auf
// eine Zeile, damit der Body als lesbarer Satz erscheint statt als Rohtext.
export function markdownPreview(src: string, max = 120): string {
  const plain = (src || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    // Das Ziel darf selbst Klammern enthalten (`javascript:alert(1)`), sonst
    // bliebe eine verwaiste `)` in der Vorschau stehen.
    .replace(/!\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}
