// Routen und Query-Parameter bleiben ASCII (CLAUDE.md "Schreibweise im UI").
// Zweimal hat der Umlaut-Durchgang hier echten Schaden angerichtet, beide
// Male still und ohne Fehlermeldung:
//
// 1. `?pruefung=` wurde zu `?prüfung=`, waehrend die Seiten weiter
//    `searchParams.pruefung` lesen -- die Links verloren den Pruefungsbezug.
// 2. `/faecher/<id>` wurde zu `/fächer/<id>`, obwohl das Verzeichnis
//    `app/faecher` heisst. Live gemessen: /faecher gibt 200, /f%C3%A4cher
//    gibt 404. Jeder Klick auf ein Fach lief auf eine Fehlerseite.
//
// Dieser Test faengt beide Rueckfaelle.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZELN = ["app", "components", "lib"];
const ENDUNGEN = [".ts", ".tsx"];

function dateien(pfad: string): string[] {
  if (pfad.includes("node_modules")) return [];
  // Die eigene Datei nennt die verbotenen Muster im Kommentar.
  if (pfad.endsWith("query-parameter-ascii.test.ts")) return [];
  const eintrag = statSync(pfad);
  if (!eintrag.isDirectory()) return ENDUNGEN.some((e) => pfad.endsWith(e)) ? [pfad] : [];
  return readdirSync(pfad).flatMap((name) => dateien(join(pfad, name)));
}

function suche(muster: RegExp): string[] {
  const treffer: string[] = [];
  for (const wurzel of WURZELN) {
    for (const datei of dateien(wurzel)) {
      readFileSync(datei, "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          for (const m of zeile.matchAll(muster)) treffer.push(`${datei}:${i + 1} ${m[0]}`);
        });
    }
  }
  return treffer;
}

// `?name=` und `&name=`, wenn der Parametername einen Umlaut traegt.
const PARAMETER = /[?&][A-Za-zäöüÄÖÜß]*[äöüÄÖÜß][A-Za-zäöüÄÖÜß]*=/g;

// Die tatsaechlich vorhandenen Routen unter app/ als ASCII-Namen. Ein Segment
// mit Umlaut kann keine davon treffen, weil Next.js die Route aus dem
// Verzeichnisnamen ableitet.
const ROUTE = /["'`]\/[A-Za-zäöüÄÖÜß]*[äöüÄÖÜß][A-Za-zäöüÄÖÜß]*[/"'`]/g;

describe("Routen und Query-Parameter sind ASCII", () => {
  it("kein Link baut einen Query-Parameter mit Umlaut im Namen", () => {
    expect(suche(PARAMETER)).toEqual([]);
  });

  it("kein Link zeigt auf ein Routen-Segment mit Umlaut", () => {
    expect(suche(ROUTE)).toEqual([]);
  });

  it("jedes Verzeichnis unter app/ traegt einen ASCII-Namen", () => {
    const mitUmlaut = dateien("app")
      .filter((p) => /[äöüÄÖÜß]/.test(p))
      .map((p) => p);
    expect(mitUmlaut).toEqual([]);
  });
});
