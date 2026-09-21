import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { exportieren, type Executor } from "@/lib/backup";
import { heuteISO } from "@/lib/zeit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vollstaendiger Datenexport als JSON-Datei.
//
// Warum als Route und nicht nur als Skript: die Zugangsdaten der Datenbank
// liegen auf Vercel als "sensitiv" und sind von aussen nicht lesbar. Ein
// Skript auf dem Mac kommt an Neon also gar nicht heran -- genau dasselbe
// Problem, aus dem /api/admin/migrate entstanden ist. Der Server hat die
// Verbindung, also liefert er den Dump aus.
//
// Die Route liegt unter /api/ und damit hinter der Passwortsperre aus
// proxy.ts. Das ist hier wichtiger als bei jeder anderen Route: ein Dump
// enthaelt alles -- Notizen, Noten, Heftseiten, Bot-Verlaeufe.
//
// Kein Parameter, keine Nutzereingabe: die Anfrage richtet sich ausschliesslich
// nach information_schema. Deshalb reicht sql.raw, ohne Platzhalter.
const ausfuehren: Executor = async (text) => {
  const ergebnis = (await db.execute(sql.raw(text))) as unknown as {
    rows?: Record<string, unknown>[];
  };
  return { rows: ergebnis.rows ?? [] };
};

export async function GET() {
  try {
    const dump = await exportieren(ausfuehren, new Date().toISOString());
    return new NextResponse(JSON.stringify(dump), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="atlas-dump-${heuteISO()}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (fehler) {
    console.error("[atlas-export] fehlgeschlagen:", fehler);
    return NextResponse.json({ error: "Der Export ist fehlgeschlagen." }, { status: 500 });
  }
}
