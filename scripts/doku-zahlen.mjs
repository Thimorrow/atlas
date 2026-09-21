// Zaehlt, was in der Doku immer wieder veraltet: Routen, Seiten, Migrationen,
// Tabellen, Testdateien. Und prueft zwei Dinge, die keine Zahl, sondern eine
// Luege sind:
//
//   1. Der markierte Zahlenblock in README.md, .ytstack/STATE.md und
//      .ytstack/API.md stimmt nicht mehr mit dem Code ueberein.
//   2. Eine Route in app/api/**/route.ts fehlt in der Routentabelle von
//      .ytstack/API.md -- oder die Tabelle nennt eine Route, die es nicht mehr
//      gibt.
//
// Punkt 2 ist der eigentliche Grund fuer diese Datei. Die Doku hing schon
// zweimal hinterher: STATE.md behauptete "drei Module, 65 Tests" bei fuenf
// Modulen und 142 Tests, und API.md kannte die beiden fertig gebauten Module
// Hefte und Vokabeln gar nicht, obwohl sie als Vertrag fuer den Android-Client
// ausgewiesen ist. Ein solcher Vertrag, der einen ganzen Modulbereich
// verschweigt, ist schlechter als gar keiner, weil ein Client-Autor ihm glaubt.
//
// Aufruf:
//   node scripts/doku-zahlen.mjs             Zahlen und Befunde ausgeben
//   node scripts/doku-zahlen.mjs --schreiben Block neu erzeugen
//   node scripts/doku-zahlen.mjs --check     Exit 1 bei Befunden (CI)
//
// Der Zahlenblock wird NICHT hier drin erfunden, sondern von
// lib/doku-zahlen.test.ts im normalen Testlauf mitgeprueft -- ein veralteter
// Block faerbt also `npm test` rot, nicht nur diesen Aufruf.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const START = "<!-- zahlen:start -->";
const ENDE = "<!-- zahlen:ende -->";

// Ordner, die nicht zum Quelltext gehoeren. build/ und android/*/build/ sind
// Gradle- und Next-Artefakte, .next und dist sind erzeugte Ausgaben.
const UEBERSPRUNGEN = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  ".gradle",
  ".freebuff",
  "dist",
  "build",
  "out",
  "coverage",
  "shots",
]);

async function sammle(ordner, treffer) {
  let eintraege;
  try {
    eintraege = await readdir(ordner, { withFileTypes: true });
  } catch {
    return treffer;
  }
  for (const eintrag of eintraege) {
    if (UEBERSPRUNGEN.has(eintrag.name)) continue;
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) await sammle(voll, treffer);
    else treffer.push(voll);
  }
  return treffer;
}

// [id] in der Datei, {id} in der Doku -- dieselbe Route, zwei Schreibweisen.
// Pfad relativ zu app/ (die Datei heisst app/api/... , die Route /api/...).
export function pfadAusDatei(voll, appOrdner = path.join(WURZEL, "app")) {
  const rel = path.relative(appOrdner, voll).split(path.sep).join("/");
  const ohneEnde = rel.replace(/\/route\.tsx?$/, "").replace(/^route\.tsx?$/, "");
  return ("/" + ohneEnde).replace(/\[([^\]]+)\]/g, "{$1}");
}

export function methodenAusQuelltext(quelle) {
  const gefunden = new Set();
  for (const m of quelle.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) {
    gefunden.add(m[1]);
  }
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].filter((m) => gefunden.has(m));
}

// Alle Routen aus dem Code, alphabetisch. Die Methoden werden mitgelesen und
// mit ausgegeben, aber bewusst nicht gegen API.md geprueft: die Tabelle fasst
// sie zusammen ("GET/POST"), und ein Vergleich zweier Schreibweisen waere nur
// eine Fehlerquelle. Geprueft wird, dass keine Route fehlt.
export async function routenLesen(wurzel = WURZEL) {
  const appOrdner = path.join(wurzel, "app");
  const alle = await sammle(path.join(appOrdner, "api"), []);
  const routen = [];
  for (const voll of alle) {
    if (!/route\.tsx?$/.test(voll)) continue;
    const quelle = await readFile(voll, "utf8");
    routen.push({ pfad: pfadAusDatei(voll, appOrdner), methoden: methodenAusQuelltext(quelle) });
  }
  return routen.sort((a, b) => a.pfad.localeCompare(b.pfad, "de"));
}

// Die Pfadspalte der Routentabelle in API.md. Zeilen der Form
// "| GET | /api/home?date= | ... |" -- Query-Anhaengsel werden abgeschnitten,
// damit ?date= den Vergleich nicht stoert.
export async function apiMdPfade(wurzel = WURZEL) {
  let inhalt;
  try {
    inhalt = await readFile(path.join(wurzel, ".ytstack", "API.md"), "utf8");
  } catch {
    return [];
  }
  const pfade = [];
  for (const zeile of inhalt.split("\n")) {
    if (!zeile.startsWith("|")) continue;
    const spalten = zeile.split("|").map((s) => s.trim());
    // spalten[0] ist leer (Zeile beginnt mit |), spalten[1] die Methode.
    const kandidat = spalten[2] ?? "";
    if (!kandidat.startsWith("/api/")) continue;
    pfade.push(kandidat.split("?")[0].trim());
  }
  return pfade;
}

export async function zahlenLesen(wurzel = WURZEL) {
  const routen = await routenLesen(wurzel);
  const dateien = await sammle(wurzel, []);

  const seiten = dateien.filter((d) => /\/app\/.*page\.tsx?$/.test(d)).length;
  const testdateien = dateien.filter((d) => /\.test\.tsx?$/.test(d)).length;

  const migrationen = dateien
    .filter((d) => /\/drizzle\/\d{4}_[^/]+\.sql$/.test(d))
    .map((d) => path.basename(d))
    .sort();

  let tabellen = 0;
  try {
    const schema = await readFile(path.join(wurzel, "lib", "db", "schema.ts"), "utf8");
    tabellen = [...schema.matchAll(/pgTable\(/g)].length;
  } catch {
    tabellen = 0;
  }

  return {
    routen: routen.length,
    seiten,
    tabellen,
    testdateien,
    migrationen: migrationen.length,
    migrationenVon: migrationen.length > 0 ? migrationen[0].slice(0, 4) : "-",
    migrationenBis: migrationen.length > 0 ? migrationen[migrationen.length - 1].slice(0, 4) : "-",
  };
}

// Inhalt des markierten Blocks je Datei. Bewusst pro Datei unterschiedlich:
// README und STATE.md wollen die Tabelle, API.md nur den Satz, der zu ihrer
// eigenen Tabelle passt.
export function blockInhalt(datei, z) {
  const zeilen = (o) => o.join("\n");
  const kopf = "_Erzeugt von `scripts/doku-zahlen.mjs`; `npm test` wird rot, wenn diese Zahlen nicht mehr zum Code passen._";

  if (datei === ".ytstack/API.md") {
    return zeilen([
      `**${z.routen} Routen** stehen in \`app/api/**/route.ts\`. Die Tabelle unten nennt sie`,
      "alle -- die Pruefung dazu steckt in `lib/doku-zahlen.test.ts`.",
    ]);
  }

  const tabelle = [
    kopf,
    "",
    "| Kennzahl | Wert |",
    "| --- | --- |",
    `| API-Routen (\`app/api/**/route.ts\`) | ${z.routen} |`,
    `| Seiten (\`app/**/page.tsx\`) | ${z.seiten} |`,
    `| Migrationen (\`drizzle/*.sql\`) | ${z.migrationen} (\`${z.migrationenVon}\` bis \`${z.migrationenBis}\`) |`,
    `| Tabellen (\`pgTable\` in \`lib/db/schema.ts\`) | ${z.tabellen} |`,
    `| Testdateien (\`*.test.ts\`) | ${z.testdateien} |`,
  ];
  return zeilen(tabelle);
}

export const DOKU_DATEIEN = ["README.md", ".ytstack/STATE.md", ".ytstack/API.md"];

function blockErsetzenIn(inhalt, neu) {
  const von = inhalt.indexOf(START);
  const bis = inhalt.indexOf(ENDE);
  if (von === -1 || bis === -1 || bis < von) {
    throw new Error(`Der Bereich ${START} ... ${ENDE} fehlt.`);
  }
  return inhalt.slice(0, von + START.length) + "\n" + neu + "\n" + inhalt.slice(bis);
}

// Prueft Block und Routenabdeckung. Rueckgabe: Liste von Befunden (leer = alles
// aktuell). Kein Prozess-Exit hier drin, damit der Test es aufrufen kann.
export async function pruefen(wurzel = WURZEL) {
  const zahlen = await zahlenLesen(wurzel);
  const befunde = [];

  for (const datei of DOKU_DATEIEN) {
    const voll = path.join(wurzel, datei);
    let inhalt;
    try {
      inhalt = await readFile(voll, "utf8");
    } catch {
      befunde.push(`${datei}: Datei fehlt.`);
      continue;
    }
    if (!inhalt.includes(START) || !inhalt.includes(ENDE)) {
      befunde.push(`${datei}: ${START} / ${ENDE} fehlt -- Zahlen stehen hier wieder von Hand.`);
      continue;
    }
    const erwartet = blockInhalt(datei, zahlen);
    const ist = inhalt.slice(inhalt.indexOf(START) + START.length, inhalt.indexOf(ENDE)).trim();
    if (ist !== erwartet.trim()) {
      befunde.push(`${datei}: Der Zahlenblock ist veraltet ("node scripts/doku-zahlen.mjs --schreiben" setzt ihn neu).`);
    }
  }

  const imCode = (await routenLesen(wurzel)).map((r) => r.pfad);
  const inDoku = await apiMdPfade(wurzel);
  const dokumentiert = new Set(inDoku);
  const imCodeSet = new Set(imCode);

  const fehlend = imCode.filter((p) => !dokumentiert.has(p));
  const ueberzaehlig = [...dokumentiert].filter((p) => !imCodeSet.has(p));

  if (fehlend.length > 0) {
    befunde.push(
      `.ytstack/API.md: ${fehlend.length} Route(n) im Code, aber nicht in der Tabelle -- sie sind fuer einen Client unsichtbar:\n  ` +
        fehlend.join("\n  "),
    );
  }
  if (ueberzaehlig.length > 0) {
    befunde.push(
      `.ytstack/API.md: ${ueberzaehlig.length} Route(n) in der Tabelle, die es im Code nicht (mehr) gibt:\n  ` +
        ueberzaehlig.join("\n  "),
    );
  }

  return befunde;
}

export async function schreiben(wurzel = WURZEL) {
  const zahlen = await zahlenLesen(wurzel);
  const geaendert = [];
  for (const datei of DOKU_DATEIEN) {
    const voll = path.join(wurzel, datei);
    const inhalt = await readFile(voll, "utf8");
    const neu = blockErsetzenIn(inhalt, blockInhalt(datei, zahlen));
    if (neu !== inhalt) {
      await writeFile(voll, neu, "utf8");
      geaendert.push(datei);
    }
  }
  return { zahlen, geaendert };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argumente = process.argv.slice(2);
  if (argumente.includes("--schreiben")) {
    const { zahlen, geaendert } = await schreiben();
    console.log(`[atlas-doku] ${zahlen.routen} Routen, ${zahlen.seiten} Seiten, ${zahlen.migrationen} Migrationen`);
    console.log(geaendert.length > 0 ? `[atlas-doku] neu geschrieben: ${geaendert.join(", ")}` : "[atlas-doku] war schon aktuell.");
  } else {
    const befunde = await pruefen();
    if (befunde.length === 0) {
      console.log("[atlas-doku] Zahlen und Routentabelle sind aktuell.");
    } else {
      for (const b of befunde) console.error(`[atlas-doku] ${b}`);
      if (argumente.includes("--check")) process.exit(1);
    }
  }
}
