import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

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

// 42P07 Relation existiert bereits, 42701 Spalte existiert bereits,
// 42710 Objekt wie Typ, Index oder Constraint existiert bereits.
const SCHON_DA = new Set(["42P07", "42701", "42710"]);

function istSchonDa(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && SCHON_DA.has(code)) return true;
  // Neon reicht den Fehlercode nicht immer durch, dann bleibt nur der Text.
  return String((err as Error)?.message ?? "")
    .toLowerCase()
    .includes("already exists");
}

export async function POST() {
  const ordner = path.join(process.cwd(), "drizzle");

  let tags: string[];
  try {
    const journal = JSON.parse(
      await readFile(path.join(ordner, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    tags = journal.entries.map((e) => e.tag);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Das Journal liess sich nicht lesen: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const bericht: { datei: string; neu: number; schonDa: number }[] = [];

  for (const tag of tags) {
    let inhalt: string;
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
        await db.execute(sql.raw(anweisung));
        neu++;
      } catch (e) {
        if (istSchonDa(e)) {
          schonDa++;
          continue;
        }
        return NextResponse.json(
          {
            ok: false,
            datei: tag,
            anweisung: anweisung.slice(0, 200),
            error: (e as Error).message,
            bericht,
          },
          { status: 500 },
        );
      }
    }
    bericht.push({ datei: tag, neu, schonDa });
  }

  return NextResponse.json({ ok: true, bericht });
}
