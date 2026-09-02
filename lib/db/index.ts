import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// In der Produktion steht hinter DATABASE_URL immer Neon, das ueber HTTP
// spricht. Zeigt die Variable dagegen auf ein gewoehnliches Postgres (lokale
// Entwicklung), ist der Neon-Treiber der falsche und es braucht den normalen
// node-postgres-Treiber. Beide liefern dieselbe Drizzle-Oberflaeche.
function isNeonUrl(url: string): boolean {
  return /neon\.(tech|build)/i.test(url);
}

// DATABASE_URL kommt aus .env.local (Neon).
//
// Frueher stand hier ein modul-globales `neon(process.env.DATABASE_URL!)` mit
// dem Kommentar, das sei lazy und schade zur Build-Zeit nicht. Das stimmt
// nicht: `neon()` validiert den Connection-String SOFORT beim Aufruf und wirft
// "No database connection string was provided". Lokal faellt das nie auf, weil
// .env.local existiert -- auf einem Build-Server ohne die Variable bricht
// dagegen `next build` ab, sobald das Sammeln der Page-Daten die erste
// API-Route importiert.
//
// Deshalb entsteht die Verbindung jetzt wirklich erst bei der ersten Query.
// Der Build importiert die Routen dann gefahrlos, und eine fehlende Variable
// meldet sich zur Laufzeit mit einem verstaendlichen Fehler statt mit einem
// abgebrochenen Build.

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;

function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL ist nicht gesetzt. Trage den Neon-Connection-String in .env.local ein (Vorlage: .env.example).",
      );
    }
    instance = isNeonUrl(url)
      ? drizzle(neon(url), { schema })
      : (drizzlePg(new Pool({ connectionString: url }), { schema }) as unknown as Db);
  }
  return instance;
}

// Nach aussen bleibt `db` ein ganz normales Drizzle-Objekt -- der Proxy
// existiert nur, damit der erste Zugriff die Verbindung aufbaut. Methoden
// werden an die echte Instanz gebunden, sonst verlieren sie ihr `this`.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
}) as Db;
