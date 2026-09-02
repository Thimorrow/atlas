import { describe, expect, it } from "vitest";
import { markdownPreview, renderMarkdown, repairMissingParagraphBreaks } from "@/lib/markdown";

describe("renderMarkdown: Markdown-Syntax", () => {
  it("macht aus ## Titel eine h2", () => {
    expect(renderMarkdown("## Titel")).toContain("<h2>Titel</h2>");
  });

  it("macht aus - a / - b eine ul mit li", () => {
    const html = renderMarkdown("- a\n- b");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("macht aus **fett** ein strong", () => {
    expect(renderMarkdown("**fett**")).toContain("<strong>fett</strong>");
  });

  it("macht aus *kursiv* ein em", () => {
    expect(renderMarkdown("*kursiv*")).toContain("<em>kursiv</em>");
  });

  it("macht aus `code` ein code", () => {
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("macht aus [Link](https://example.com) ein a mit href", () => {
    expect(renderMarkdown("[Link](https://example.com)")).toContain('<a href="https://example.com"');
  });

  it("laesst mailto-Links zu", () => {
    expect(renderMarkdown("[Mail](mailto:a@b.de)")).toContain('<a href="mailto:a@b.de"');
  });

  it("gibt fuer leeren Body einen leeren String zurueck", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("rendert deterministisch, ohne Header-IDs oder gemangelte Adressen", () => {
    const a = renderMarkdown("## Mein Titel\n\n<a@b.de>");
    const b = renderMarkdown("## Mein Titel\n\n<a@b.de>");
    expect(a).toBe(b);
    expect(a).not.toContain("id=");
    expect(a).not.toContain("&#x");
  });
});

describe("renderMarkdown: Sicherheit", () => {
  it("zeigt <script>alert(1)</script> als sichtbaren Text statt als Tag", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("reicht keinen rohen HTML-Block durch", () => {
    const html = renderMarkdown('<div onclick="x()">hallo</div>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain("<div");
    expect(html).not.toContain("<img");
    // Die Attribute ueberleben nur als sichtbarer Text, nie als echtes Markup.
    expect(html).toContain("&lt;div");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("erzeugt kein klickbares javascript:-href", () => {
    const html = renderMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("x");
  });

  it("blockt auch verschleierte und andere unsichere Schemata", () => {
    for (const src of [
      "[x](JaVaScRiPt:alert(1))",
      "[x](java\tscript:alert(1))",
      "[x](data:text/html,<script>alert(1)</script>)",
      "[x](vbscript:msgbox(1))",
      "![bild](javascript:alert(1))",
    ]) {
      const html = renderMarkdown(src);
      expect(html, src).not.toContain("<a ");
      expect(html, src).not.toContain("<img");
    }
  });

  it("laesst Ampersands als Text stehen, ohne HTML zu oeffnen", () => {
    expect(renderMarkdown("AT&T & Co")).toContain("AT&amp;T &amp; Co");
  });
});

describe("markdownPreview", () => {
  it("entfernt Markdown-Zeichen und legt alles auf eine Zeile", () => {
    expect(markdownPreview("## Titel\n\n- **fett** und `code`\n- [Link](https://a.de)")).toBe(
      "Titel fett und code Link",
    );
  });

  it("laesst keine verwaiste Klammer stehen, wenn das Linkziel selbst Klammern hat", () => {
    expect(markdownPreview("[boese](javascript:alert(1))")).toBe("boese");
  });

  it("kuerzt lange Texte mit Auslassung", () => {
    const out = markdownPreview("wort ".repeat(60), 40);
    expect(out.length).toBeLessThanOrEqual(43);
    expect(out.endsWith("...")).toBe(true);
  });
});

describe("repairMissingParagraphBreaks", () => {
  // Echtes Beispiel aus einem gestreamten Bot-Text: der letzte Listenpunkt
  // und der folgende Absatz liefen ohne jedes Trennzeichen ineinander, sodass
  // "Außerdem ..." als Teil des Listenpunkts gerendert wurde statt als
  // eigener Absatz danach.
  const real =
    '- Englisch: Vokabeln Unit 4 lernenAußerdem sind zwei Aufgaben heute überfällig (03.09.): Biologie (Arbeitsblatt Zellatmung) und Mathe.';

  it("trennt den echten Beispielfall in Listenpunkt und neuen Absatz", () => {
    const repaired = repairMissingParagraphBreaks(real);
    expect(repaired).toBe(
      '- Englisch: Vokabeln Unit 4 lernen\n\nAußerdem sind zwei Aufgaben heute überfällig (03.09.): Biologie (Arbeitsblatt Zellatmung) und Mathe.',
    );
  });

  it("beendet die Liste beim Rendern und startet einen eigenen Absatz", () => {
    const html = renderMarkdown(repairMissingParagraphBreaks(real));
    expect(html).toContain("<li>Englisch: Vokabeln Unit 4 lernen</li>");
    expect(html).toContain("<p>Außerdem sind zwei Aufgaben heute überfällig");
    // Der zweite Satz darf nicht mehr im li landen.
    expect(html).not.toContain("lernenAußerdem");
    expect(html).not.toMatch(/<li>[^<]*Außerdem/);
  });

  it("trennt zwei direkt aneinandergrenzende Saetze auch ohne Liste", () => {
    expect(repairMissingParagraphBreaks("Das steht an.Morgen ist frei.")).toBe(
      "Das steht an.\n\nMorgen ist frei.",
    );
  });

  it("lässt normalen Text mit echten Wortzwischenraeumen unveraendert", () => {
    const normal = "Morgen hast du Englisch, Mathematik und Physik. Viel Erfolg!";
    expect(repairMissingParagraphBreaks(normal)).toBe(normal);
  });

  it("lässt bereits vorhandene Absaetze unveraendert", () => {
    const ok = "Erster Satz.\n\nZweiter Satz beginnt sauber.";
    expect(repairMissingParagraphBreaks(ok)).toBe(ok);
  });

  it("zerschneidet Eigennamen mit Grossbuchstaben in der Mitte nicht", () => {
    // Eine Regel "Kleinbuchstabe gefolgt von Grossbuchstabe" wuerde aus
    // OneNote "One / Note" machen. Genau diese Namen kommen in Atlas vor.
    const namen = "Schau in OneNote nach, WebUntis zeigt es auch.";
    expect(repairMissingParagraphBreaks(namen)).toBe(namen);
  });

  it("kommt mit leerem Text klar", () => {
    expect(repairMissingParagraphBreaks("")).toBe("");
  });
});
