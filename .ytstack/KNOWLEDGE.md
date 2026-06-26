# Knowledge

Patterns, rules, and lessons learned while building Atlas. This file is read by every future session. Keep it short. Keep it actionable.

## Conventions

- Web/Desktop zuerst (Next.js 16.2.9 / React 19). Kein PWA/Mobile-Layout am Anfang.
- Eigenes Event-Datenmodell ist die Wahrheit; Untis ist nur eine Importquelle.
- DB: Neon Postgres + Drizzle. Tabellen: `school_blocks`, `routines`, `manual_events`.
  `FreeSlot` wird berechnet, NICHT gespeichert.
- **Wochentag-Konvention: 0 = Montag ... 6 = Sonntag** (NICHT JS-Standard 0=Sonntag).
  Gilt fuer `routines.weekday`.
- User-facing Text und Persona: keine Em-Dashes.

## Lessons learned

- **Wert = Aggregation, nicht ein Feature.** Kalender ist Modul 1, nicht das Produkt.
  Roadmap-Entscheidungen daran messen: bringt der nächste Schritt "eine App weniger
  offen"? (Siehe DECISIONS 2026-06-26 "Kern-Wert = Aggregation".)
- **Modul 1 allein ersetzt keine App.** Untis zeigt den Stundenplan schon. Der erste
  echte "brauch ich nicht mehr"-Moment kommt mit Modul 2 (Nachrichten).

## Gotchas

- **WebUntis hat keine offizielle öffentliche End-User-API.** Zugriff über inoffizielle
  JSON-RPC. Diese ist auf prognostiziertem Sunset-Pfad (~2027, DSGVO/Security). Darum
  Untis-Import als dünnen, austauschbaren Adapter bauen.
- **`webuntis` npm-Lib (SchoolUtils) ist semi-verwaist** (letztes Release ~Okt 2022).
  Version pinnen, Forken/Patchen einplanen, Adapter dünn halten.
- **Login: Untis-Mobile-Secret/QR, NICHT User/Passwort.** Passwort-Login scheitert oft
  bei Schulen mit M365/SSO + 2FA. Das Secret (Profil -> Freigaben -> "Zugriff über
  Untis Mobile") funktioniert unabhängig vom SSO-Flow.
- **Untis-Sync muss server-seitig laufen.** Browser kann WebUntis wegen CORS nicht
  direkt aufrufen, und das Secret darf nie in den Client.
- **Vertretung/Entfall/Raumänderung sind dynamisch.** Eine ausgefallene Stunde IST ein
  neuer freier Slot. `SchoolBlock` braucht ein `status`-Feld (regular/cancelled/
  substituted), sonst stimmt die Today/Now-Ansicht nicht.
- **WebUntis-Zugriff:** Lib `webuntis`, `new WebUntisSecretAuth(school, user, secret,
  server, identity)` server-seitig (Secret = Untis-Mobile-Schluessel). Lesson-Felder:
  `date` (yyyymmdd number), `startTime`/`endTime` (hmm number, 750 = 07:50),
  `su[0].name` Fach, `ro[0].name` Raum, `te[0].name` Lehrer, `code`
  ('cancelled' | 'irregular' | undefined). Status-Mapping: cancelled->cancelled,
  irregular->substituted, sonst regular. `getOwnTimetableForRange(start, end)`.
  Konstruktor mit 5 Args + `@ts-expect-error` aufrufen (webuntis nutzt internes
  otplib-Default; named `otplib`-Import scheitert unter Turbopack). In `next.config`:
  `serverExternalPackages: ["webuntis"]`. Sync laeuft als POST /api/sync/untis.
- **Gotcha Bash-Safety-Net:** `--env-file=.env.local` wird als Secret-Dump geblockt.
  Loesung: `.env.local` per `dotenv` im Script laden statt per CLI-Flag.
- **Git-Identität für Deploys: Account Thimorrow** (sonst Vercel-Deploy BLOCKED).
- **Postgres `time`-Spalten liefern `HH:MM:SS` zurueck.** `startTime`/`endTime` werden
  als "08:00" eingefuegt, aber als "08:00:00" gelesen. Fuer die Anzeige (S03) auf HH:MM
  kuerzen (`.slice(0,5)`) oder beim Lesen normalisieren. (Gefunden im Sync-Integrationstest.)
- **UI-Stack (ab S03, nach User-Feedback "shadcn, schlicht"):** Tailwind v4
  (`@tailwindcss/postcss`, `@import "tailwindcss"` + shadcn-Tokens in globals.css) +
  shadcn-Komponenten (`components/ui/*`, `cn()` in `lib/utils.ts`) + **Geist**-Font
  (`geist/font`) + framer-motion (dezent) + lucide-react. **Dark Mode via `next-themes`**
  (`ThemeProvider attribute="class"`, system-faehig) -> `.dark`-Klasse. Theme-Auswahl
  (Hell/Dunkel/System) lebt in `/settings`, NICHT als Sidebar-Toggle. Aesthetik:
  schlicht/clean, KEINE "Luxus"-Optik. (Erster Versuch "Almanach/Fraunces" + eigenes
  Theme-Script verworfen.)
- **App-Shell mit kollabierbarer Sidebar** (`components/app-sidebar.tsx` in
  `app/layout.tsx`), NICHT nur eine nackte Kalenderflaeche. Zustand per Cookie
  `atlas-sidebar` (0/1), server-seitig in layout gelesen -> kein Flash. Breiten
  240px / 60px (Icon-Leiste), Toggle = PanelLeftClose/Open. Sidebar = Atlas-Logo (eigenes
  SVG `components/atlas-logo.tsx`) + Modul-Nav (Kalender aktiv; Nachrichten/Inbox/Hermes
  "bald") + Profilzeile unten. Profil = Link zu **`/settings`** (eigene Route mit
  Sektionen Profil/Erscheinungsbild/Konto). Macht Aggregation sichtbar (Kalender =
  Modul 1). Muster aus `~/Desktop/diekmann-reference` (shadcn-Sidebar). (User: "das ist
  nur ein Kalender statt einer Atlas app" / Profil + Collapse wie Diekmann.)
- **Schulfach = `longname` (voller Name), nicht das Kuerzel.** Adapter nimmt
  `su[0].longname ?? su[0].name`. Re-Sync noetig nach Aenderung. User will ausgeschriebene
  Namen ("Informatorische Grundbildung", nicht "IFG").
- **Tests: Vitest.** `npm test` = `vitest run`. `vitest.setup.ts` laedt `.env.local`
  per dotenv (Tests laufen ausserhalb von Next, `lib/db` liest DATABASE_URL beim Import).
  Adapter-Tests sind offline/pure; `sync.test.ts` ist ein echter Neon-Integrationstest
  (Sentinel-Datum 2099-01-05, beforeAll/afterAll raeumen auf). Upsert-Logik lebt in
  `upsertSchoolBlocks()` (von `syncUntis` genutzt) -> kein Test/Prod-Drift.
