import { NextResponse } from "next/server";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wendet ausstehende Migrationen an.
//
// Der Grund fuer diese Route: die Zugangsdaten der Datenbank liegen nur auf
// Vercel und sind dort als "sensitiv" hinterlegt, also von aussen nicht mehr
// lesbar. Von hier aus laesst sich `drizzle-kit push` deshalb nicht ausfuehren.
// Der Server selbst hat die Verbindung aber, also macht er es.
//
// Die Route liegt unter /api/ und damit hinter der Passwortsperre aus
// proxy.ts. Drizzle fuehrt jede Migration genau einmal aus und merkt sich das
// in __drizzle_migrations, ein zweiter Aufruf ist also folgenlos.
//
// Achtung: der Neon-HTTP-Treiber kennt keine Transaktionen. Bricht eine
// Migration in der Mitte ab, wird nichts zurueckgerollt.
export async function POST() {
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[migrate] fehlgeschlagen:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
