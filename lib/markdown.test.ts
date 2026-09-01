import { describe, expect, it } from "vitest";
import { markdownPreview, renderMarkdown } from "@/lib/markdown";

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
