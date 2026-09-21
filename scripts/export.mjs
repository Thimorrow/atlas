// Holt einen vollstaendigen Datenbankdump.
//
//   node scripts/export.mjs [datei]        ueber die laufende Instanz
//                                          (ATLAS_URL, sonst Production;
//                                          ATLAS_PASSWORD noetig)
//   node scripts/export.mjs --db [datei]   direkt ueber DATABASE_URL
//
// Zwei Wege, weil es zwei Lagen gibt: die echten Zugangsdaten liegen nur auf
// Vercel, ein Skript auf dem Mac kommt an Neon also nicht heran -- dort ist der
// Weg ueber die Route der einzige. Lokal dagegen (eigenes Postgres) waere der
// Umweg ueber einen laufenden Server nur Ballast, dort geht es direkt.
//
// Standard-Datei: backups/atlas-dump-<heute>.json. Der Ordner ist in
// .gitignore -- in einem Dump stehen Notizen, Noten, Heftseiten und
// Bot-Verlaeufe, das gehoert nicht in ein Repository.
//
// Laeuft mit Node >= 22.18: die Dump-Logik liegt in lib/backup.ts und wird
// ohne Uebersetzung importiert (Typen werden von Node selbst entfernt).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportieren } from "../lib/backup.ts";
import { heute, pgExecutor } from "./backup-netz.mjs";

const argumente = process.argv.slice(2);
const direkt = argumente.includes("--db");
const datei = argumente.find((a) => !a.startsWith("--")) ?? path.join("backups", `atlas-dump-${heute()}.json`);

async function ueberInstanz() {
  const basis = (process.env.ATLAS_URL ?? "https://atlas-ten-orpin.vercel.app").replace(/\/$/, "");
  const passwort = process.env.ATLAS_PASSWORD;
  if (!passwort) throw new Error("ATLAS_PASSWORD fehlt -- ohne Passwort gibt die Instanz nichts heraus.");

  const anmeldung = await fetch(`${basis}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: passwort }),
    redirect: "manual",
  });
  if (!anmeldung.ok) throw new Error(`Anmeldung fehlgeschlagen (${anmeldung.status}).`);
  const cookie = anmeldung.headers.getSetCookie?.()[0] ?? anmeldung.headers.get("set-cookie");
  if (!cookie) throw new Error("Die Anmeldung hat kein Cookie gesetzt.");

  const antwort = await fetch(`${basis}/api/admin/export`, { headers: { cookie } });
  if (!antwort.ok) throw new Error(`Export fehlgeschlagen (${antwort.status}): ${await antwort.text()}`);
  return antwort.json();
}

async function direktAusDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt.");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url });
  try {
    return await exportieren(pgExecutor(pool), new Date().toISOString());
  } finally {
    await pool.end();
  }
}

const dump = direkt ? await direktAusDb() : await ueberInstanz();
const zeilen = dump.tabellen.reduce((summe, t) => summe + t.daten.length, 0);

await mkdir(path.dirname(datei), { recursive: true });
await writeFile(datei, JSON.stringify(dump, null, 2), "utf8");

console.log(
  `[atlas-export] ${dump.tabellen.length} Tabellen, ${zeilen} Zeilen ` +
    `(${dump.tabellen.filter((t) => t.daten.length > 0).length} mit Inhalt)`,
);
console.log(`[atlas-export] geschrieben: ${datei}`);
