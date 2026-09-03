// Wendet die SQL-Dateien aus drizzle/ an.
//
// Der Grund fuer diese Datei: die Zugangsdaten der Datenbank liegen nur auf
// Vercel und sind dort als "sensitiv" hinterlegt, also von aussen nicht mehr
// lesbar. Von hier aus laesst sich drizzle-kit deshalb nicht gegen Neon fahren.
// Der Server selbst hat die Verbindung aber, also macht er es -- und zwar
// jetzt zweimal: einmal als eigener Build-Schritt (der Regelweg, siehe unten
// im CLI-Teil), einmal als Notfall-Handweg ueber die Route
// app/api/admin/migrate/route.ts. Beide rufen dieselbe Logik hier auf, damit
// es nur eine Version der Wahrheit gibt.
//
// Bewusst NICHT Drizzles eigener Migrator: der fuehrt Buch in
// __drizzle_migrations, und dieses Buch gibt es hier nicht, weil die bisherigen
// Migrationen von Hand eingespielt wurden. Er wuerde bei 0000 anfangen und an
// einer laengst existierenden Tabelle scheitern.
//
// Stattdessen alles der Reihe nach ausfuehren und die drei Postgres-Fehler
// schlucken, die genau "gibt es schon" bedeuten. Damit ist der Aufruf beliebig
// oft wiederholbar, egal in welchem Zustand die Datenbank vorher war.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// 42P07 Relation existiert bereits, 42701 Spalte existiert bereits,
// 42710 Objekt wie Typ, Index oder Constraint existiert bereits.
const SCHON_DA = new Set(["42P07", "42701", "42710"]);

function istSchonDa(err) {
  const code = err?.code;
  if (code && SCHON_DA.has(code)) return true;
  // Neon reicht den Fehlercode nicht immer durch, dann bleibt nur der Text.
  return String(err?.message ?? "")
    .toLowerCase()
    .includes("already exists");
}

// `execute` fuehrt eine einzelne SQL-Anweisung aus (der Aufrufer bringt seine
// eigene Datenbankverbindung mit, egal ob Drizzle oder rohes pg/neon). Damit
// bleibt diese Datei frei von Drizzle und laeuft genauso im nackten
// Node-Prozess wie in der Route.
export async function applyMigrations(execute, ordner = path.join(process.cwd(), "drizzle")) {
  let tags;
  try {
    const journal = JSON.parse(
      await readFile(path.join(ordner, "meta", "_journal.json"), "utf8"),
    );
    tags = journal.entries.map((e) => e.tag);
  } catch (e) {
    return { ok: false, error: `Das Journal liess sich nicht lesen: ${e.message}` };
  }

  const bericht = [];

  for (const tag of tags) {
    let inhalt;
    try {
      inhalt = await readFile(path.join(ordner, `${tag}.sql`), "utf8");
    } catch {
      bericht.push({ datei: tag, neu: 0, schonDa: 0 });
      continue;
    }

    let neu = 0;
    let schonDa = 0;
    for (const teil of inhalt.split("--> statement-breakpoint")) {
      const anweisung = teil.trim().replace(/;\s*$/, "");
      if (!anweisung) continue;
      try {
        await execute(anweisung);
        neu++;
      } catch (e) {
        if (istSchonDa(e)) {
          schonDa++;
          continue;
        }
        return {
          ok: false,
          datei: tag,
          anweisung: anweisung.slice(0, 200),
          error: e.message,
          bericht,
        };
      }
    }
    bericht.push({ datei: tag, neu, schonDa });
  }

  return { ok: true, bericht };
}

// CLI-Teil: laeuft nur, wenn die Datei direkt gestartet wird (per
// `node scripts/migrate.mjs`), nicht wenn sie aus route.ts importiert wird.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;

  // Lokal gibt es haeufig keine DATABASE_URL (z.B. `npm run build` ohne
  // .env.local). Das darf den Build nicht scheitern lassen -- die Migration
  // wird dann einfach uebersprungen, genau wie lib/db/index.ts das fehlende
  // DATABASE_URL erst zur Laufzeit meldet statt beim Build.
  if (!url) {
    console.log("Keine DATABASE_URL, Migrationen werden uebersprungen.");
    process.exit(0);
  }

  console.log("[atlas-migrate] Start");

  // Dieselbe Fallunterscheidung wie lib/db/index.ts: Neon spricht ueber
  // HTTP, ein gewoehnliches Postgres (z.B. lokal) braucht den pg-Treiber.
  const isNeonUrl = /neon\.(tech|build)/i.test(url);

  let execute;
  let schliessen = async () => {};

  if (isNeonUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    // Die von neon() gelieferte Funktion wird DIREKT mit dem SQL-String
    // aufgerufen. Eine Methode .query() gibt es an ihr nicht (nachgesehen in
    // node_modules/@neondatabase/serverless/index.d.ts, NeonQueryFunction hat
    // nur die Tagged-Template-Form, die gewoehnliche Aufrufform und
    // .transaction). Der Griff nach .query() waere hier still gescheitert und
    // haette jeden Build abgebrochen.
    execute = (anweisung) => sql(anweisung);
  } else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    execute = (anweisung) => pool.query(anweisung);
    schliessen = () => pool.end();
  }

  const ergebnis = await applyMigrations(execute);
  await schliessen();

  if (!ergebnis.ok) {
    // Ein echter Fehler (nicht "gibt es schon") soll den Deploy stoppen,
    // statt Code auszuliefern, der gegen eine unfertige Datenbank laeuft --
    // genau das Problem, das diese Automatisierung eigentlich loesen soll.
    console.error(`[atlas-migrate] Fehler in ${ergebnis.datei ?? "Journal"}: ${ergebnis.error}`);
    process.exit(1);
  }

  let neuGesamt = 0;
  for (const zeile of ergebnis.bericht) {
    console.log(`[atlas-migrate] ${zeile.datei}: ${zeile.neu} neu, ${zeile.schonDa} bereits vorhanden`);
    neuGesamt += zeile.neu;
  }
  console.log(`[atlas-migrate] Fertig: ${ergebnis.bericht.length} Dateien, ${neuGesamt} neue Anweisungen`);
}
