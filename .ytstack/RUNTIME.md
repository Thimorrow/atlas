# Runtime

Services, APIs, env vars, and ports used by Atlas. (Noch nichts gebaut, alles geplant.)

## Services

- **WebUntis** (geplant) — Stundenplan-Quelle. Inoffizielle JSON-RPC, Auth über
  Untis-Mobile-Secret. Server-seitiger Sync. Adapter dünn + austauschbar halten.
- **Neon** (geplant) — serverless Postgres, eigener Event-Store für Atlas, via Drizzle ORM.
- **Vercel** (geplant) — Hosting/Deploy, Account Thimorrow.

## Environment variables

(geplant, Namen vorläufig)

- `WEBUNTIS_SERVER` — Untis-Server der Schule (z.B. `xyz.webuntis.com`).
- `WEBUNTIS_SCHOOL` — Schul-Identifier.
- `WEBUNTIS_USER` — Untis-Benutzername.
- `WEBUNTIS_SECRET` — Untis-Mobile-Secret (TOTP-Basis), nur server-seitig.
- `DATABASE_URL` — Postgres-Connection-String.

## Ports

- Dev: `3000` (Next.js Default).

## Deploy target

- Vercel (Account Thimorrow). Git-Identität Thimorrow prüfen vor jedem Push.
