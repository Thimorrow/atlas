// Spielt einen Dump in die Datenbank aus DATABASE_URL zurueck.
//
//   node scripts/restore.mjs <datei> --ja
//
// Ohne --ja passiert nichts ausser einer Warnung. Das ist Absicht: diese Datei
// loescht zuerst ALLES (TRUNCATE ... CASCADE) und schreibt dann den Dump
// hinein. Ein halb ausgefuehrtes Zurueckspielen waere schlimmer als gar keins.
//
// Vorgehen: erst pruefen, dann loeschen, dann in Fremdschluessel-Reihenfolge
// einfuegen (siehe lib/backup.ts). Die Reihenfolge kommt aus pg_constraint,
// nicht aus einer Liste hier drin.
//
// Laeuft mit Node >= 22.18 (siehe scripts/export.mjs).
//
// Gedacht fuer die lokale Datenbank und fuer den Ernstfall. Gegen Production
// richtet sich dieses Skript nur, wenn DATABASE_URL bewusst darauf zeigt -- die
// Zugangsdaten liegen dort als "sensitiv" und sind von aussen ohnehin nicht
// lesbar.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { wiederherstellen, dumpPruefen } from "../lib/backup.ts";
import { pgExecutor } from "./backup-netz.mjs";

const argumente = process.argv.slice(2);
const bestaetigt = argumente.includes("--ja");
const datei = argumente.find((a) => !a.startsWith("--"));

if (!datei) {
  console.error("Aufruf: node scripts/restore.mjs <datei> --ja");
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(2);
}

let roh;
try {
  roh = await readFile(path.resolve(datei), "utf8");
} catch (fehler) {
  console.error(`Die Datei ${datei} liess sich nicht lesen: ${fehler.message}`);
  process.exit(2);
}

let dump;
try {
  dump = JSON.parse(roh);
} catch (fehler) {
  console.error(`Die Datei ${datei} ist kein JSON: ${fehler.message}`);
  process.exit(2);
}

// Erst pruefen, dann erst loeschen -- ein unbrauchbarer Dump darf nicht dazu
// fuehren, dass die Datenbank leer zurueckbleibt.
const befunde = dumpPruefen(dump);
if (befunde.length > 0) {
  console.error("[atlas-restore] Der Dump ist unbrauchbar:");
  for (const b of befunde) console.error(`  ${b}`);
  process.exit(1);
}

const zeilen = dump.tabellen.reduce((summe, t) => summe + t.daten.length, 0);
const ziel = url.replace(/\/\/[^@]*@/, "//***@");

if (!bestaetigt) {
  console.warn(`[atlas-restore] Es geht um ${ziel}.`);
  console.warn(
    `[atlas-restore] ${dump.tabellen.length} Tabellen, ${zeilen} Zeilen aus ${datei} ` +
      `(erzeugt am ${dump.erzeugtAm}, Format ${dump.version}).`,
  );
  console.warn("[atlas-restore] Nichts passiert. Derselbe Aufruf mit --ja loescht alles Vorhandene und spielt den Dump ein.");
  process.exit(0);
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: url });
try {
  const ergebnis = await wiederherstellen(pgExecutor(pool), dump);
  for (const [tabelle, anzahl] of Object.entries(ergebnis.proTabelle)) {
    if (anzahl > 0) console.log(`[atlas-restore] ${tabelle}: ${anzahl} Zeilen`);
  }
  console.log(`[atlas-restore] Fertig: ${ergebnis.gesamt} Zeilen in ${dump.tabellen.length} Tabellen zurueckgespielt.`);
} catch (fehler) {
  console.error(`[atlas-restore] Fehlgeschlagen: ${fehler.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
