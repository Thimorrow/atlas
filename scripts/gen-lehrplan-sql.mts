// Erzeugt die Migration, die den Lehrplan an den Faechern vorbelegt.
//
// Warum eine Migration und kein Aufruf einer Seed-Route: scripts/migrate.mjs
// laeuft als Build-Schritt vor jedem Deploy und fuehrt JEDE Datei aus dem
// Journal erneut aus. Ein "UPDATE ... WHERE curriculum IS NULL" ist damit
// selbstheilend -- ein Fach, das erst beim naechsten Untis-Sync entsteht,
// bekommt seinen Lehrplan beim naechsten Deploy von allein, ohne dass jemand
// eine Route von Hand anstossen muss. Und ein von Hand geschriebener Text
// bleibt unangetastet, weil er die Bedingung nicht mehr erfuellt.
//
// Aufruf nach jeder Aenderung an lib/lehrplan/:
//   node --experimental-strip-types scripts/gen-lehrplan-sql.mts
//
// Achtung: der Generator ueberschreibt dieselbe Migrationsdatei. Das ist fuer
// die Vorbelegung richtig (sie soll ja nur Leerstellen fuellen). Soll ein
// bereits gesetzter Text ersetzt werden, braucht es eine eigene neue
// Migration -- diese hier fasst belegte Faecher bewusst nie an.

import { writeFile } from "node:fs/promises";
import { LEHRPLAN_NRW_G9_KLASSE_10 } from "../lib/lehrplan/nrw-g9-klasse-10.ts";
import { lehrplanAlsMarkdown } from "../lib/lehrplan/rendern.ts";

const QUELLE = "Kernlehrplan NRW G9, Klasse 10";

// Postgres-Stringliteral: nur das einfache Anfuehrungszeichen muss verdoppelt
// werden, Zeilenumbrueche sind in einem Literal erlaubt.
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const kopf = `-- Lehrplan an den Faechern vorbelegen (erzeugt von scripts/gen-lehrplan-sql.mts,
-- nicht von Hand aendern -- Quelle ist lib/lehrplan/nrw-g9-klasse-10.ts).
--
-- Trifft ueber den Anzeigenamen ODER den Untis-Wert, jeweils case-insensitiv,
-- weil Faecher aus dem Sync oft nur "M" oder "BI" heissen. Setzt ausschliesslich
-- dort, wo noch nichts steht: ein selbst geschriebener Lehrplan bleibt.
`;

const bloecke = LEHRPLAN_NRW_G9_KLASSE_10.map((fach) => {
  // Set: manches Fach fuehrt seinen eigenen Namen auch als Alias, doppelte
  // Werte in einem IN() waeren nur Rauschen in der Migration.
  const namen = [...new Set([fach.fach, ...fach.aliase].map((n) => n.toLowerCase()))]
    .map(lit)
    .join(", ");
  return `-- ${fach.fach}
UPDATE "subjects" SET
  "curriculum" = ${lit(lehrplanAlsMarkdown(fach))},
  "curriculum_source" = ${lit(QUELLE)},
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN (${namen}) OR lower("untis_subject") IN (${namen}));`;
});

const ziel = new URL("../drizzle/0015_lehrplan_vorbelegen.sql", import.meta.url);
await writeFile(ziel, kopf + "\n" + bloecke.join("\n--> statement-breakpoint\n") + "\n");
console.log(`${bloecke.length} Faecher geschrieben nach ${ziel.pathname}`);
