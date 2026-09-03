import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applyMigrations } from "@/scripts/migrate.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wendet die SQL-Dateien aus drizzle/ an.
//
// Der Grund fuer diese Route: die Zugangsdaten der Datenbank liegen nur auf
// Vercel und sind dort als "sensitiv" hinterlegt, also von aussen nicht mehr
// lesbar. Von hier aus laesst sich drizzle-kit deshalb nicht gegen Neon fahren.
// Der Server selbst hat die Verbindung aber, also macht er es.
//
// Bewusst NICHT Drizzles eigener Migrator: der fuehrt Buch in
// __drizzle_migrations, und dieses Buch gibt es hier nicht, weil die bisherigen
// Migrationen von Hand eingespielt wurden. Er wuerde bei 0000 anfangen und an
// einer laengst existierenden Tabelle scheitern.
//
// Stattdessen alles der Reihe nach ausfuehren und die drei Postgres-Fehler
// schlucken, die genau "gibt es schon" bedeuten. Damit ist der Aufruf beliebig
// oft wiederholbar, egal in welchem Zustand die Datenbank vorher war.
//
// Die Route liegt unter /api/ und damit hinter der Passwortsperre aus proxy.ts.
// Achtung: der Neon-HTTP-Treiber kennt keine Transaktionen.
//
// Die Ausfuehrungslogik selbst steht seit kurzem nicht mehr hier, sondern in
// scripts/migrate.mjs, weil der Regelweg jetzt der Build ist: `npm run build`
// fuehrt die Migration vor jedem Deploy automatisch aus. Diese Route bleibt
// nur noch als Notfall-Handweg, falls doch mal von Hand nachgeholt werden muss.

export async function POST() {
  const ergebnis = await applyMigrations((anweisung: string) => db.execute(sql.raw(anweisung)));
  return NextResponse.json(ergebnis, { status: ergebnis.ok ? 200 : 500 });
}
