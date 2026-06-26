import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// DATABASE_URL kommt aus .env.local (Neon). Die Verbindung ist lazy:
// neon-http baut erst bei der ersten Query eine Connection auf, daher
// schadet ein fehlender Wert zur Build-Zeit nicht (solange nichts queryt).
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
