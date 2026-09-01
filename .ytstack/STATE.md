---
project: Atlas
slug: Atlas
last_updated: 2026-09-01T21:00:00Z
current_milestone: M003
active_slice: null
active_task: null
---

# State

**Status:** Atlas ist nach der Scope-Reduktion vom 2026-09-01 (Commits `0461c9b`,
`f120a38`, `36f031b`, Branch `schule-scope`) ein reiner Stundenplan: Tabelle
`school_blocks`, Routen `/api/calendar` und `/api/sync/untis`, Seiten `/` und
`/settings`, ein Sidebar-Eintrag. Das M002-To-Dos-Modul samt Auto-Planer, Routinen,
manuellen Events und Kalender-Integration wurde dabei **vollstaendig entfernt** --
M002 und dessen Slices S02 bis S04 sind damit hinfaellig, nicht offen. Die letzten
sechs Commits waren reine Design-Politur (Foundations, Motion, Surfaces, Elevation).

## Next action

**M003 ist umgesetzt** (Schritte 1 bis 6 der `.ytstack/SPEC.md`). Neu: Tabellen
`subjects`, `subject_notes`, `assignments`, `subject_files` (Migration
`drizzle/0005_deep_nuke.sql`, auf Neon angewendet), elf API-Routen, die Module
`/aufgaben` und `/faecher` samt Detailseite, Notizen mit Markdown, Anlegen aus
der Schulstunde heraus, subtile Aufgaben-Spur im Stundenplan und Datei-Anhaenge
ueber Vercel Blob (laeuft ohne `BLOB_READ_WRITE_TOKEN` im Hinweis-Zustand).

Basis gruen: `npx tsc --noEmit` fehlerfrei, `npm test` 65 Tests in 6 Dateien,
`npm run build` listet alle neuen Routen. Verhaltens- und Sichtkriterien wurden
im laufenden `next dev` per Playwright belegt (Screenshots liegen im
Session-Scratchpad).

Faecher sind eingerichtet: 13 aktive Faecher mit Sids Wunschfarben,
`Informatik/ang. Mathematik` archiviert. Die Farbzuordnung ist als Vorbelegung
in `lib/subject-colors.ts` (`PRESETS`) hinterlegt, nicht fest verdrahtet.

Live auf Vercel: https://atlas-ten-orpin.vercel.app (Projekt `atlas`, GitHub
`Thimorrow/atlas`, oeffentlich). Zwei Stolpersteine dabei geloest:

1. `lib/db/index.ts` rief `neon(process.env.DATABASE_URL!)` beim Modul-Laden
   auf. `neon()` validiert sofort, deshalb scheiterte jeder Build ohne die
   Variable. Jetzt ein Proxy, der die Verbindung erst bei der ersten Query
   aufbaut -- belegt mit `env -u DATABASE_URL npx next build`.
2. Die Bereitstellung war ohne jede Pruefung erreichbar, die Deploy-URLs stehen
   ohne Login in der GitHub-Deployments-API. Vercel Authentication gibt es im
   Hobby-Plan nicht fuer Production, daher `proxy.ts` + `lib/gate.ts`: ein
   Passwort, danach ein HMAC-signiertes Cookie. Ohne `ATLAS_PASSWORD` bleibt
   alles offen, das ist der lokale Fall.

Env bei Vercel gesetzt (Production und Preview): DATABASE_URL, WEBUNTIS_*,
ATLAS_PASSWORD, ATLAS_SESSION_SECRET. `BLOB_READ_WRITE_TOKEN` fehlt weiterhin,
der Dateibereich laeuft im Hinweis-Zustand.

## Open decisions

- ~~Fehlermeldungen im UI~~: entschieden, schlanke Eigenloesung `components/toast.tsx`,
  `sonner` bleibt draussen.
- ~~Markdown-Bibliothek~~: entschieden, `marked` mit escape-first in `lib/markdown.ts`
  (HTML im Body wird als Text dargestellt, nicht ausgefuehrt).
- Vercel-Deploy bleibt weiter zurueckgestellt; ohne `.vercel` und ohne
  `BLOB_READ_WRITE_TOKEN` laeuft Schritt 6 im Hinweis-Zustand.

## Historie

M001 (Stundenplan) funktional fertig. M002 (To-Dos) gebaut und in der Scope-Reduktion
wieder entfernt -- der Code liegt in der History bei `b34dab2` und dient M003 als
Vorlage, nicht als Basis.
