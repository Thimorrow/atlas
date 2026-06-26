# Decisions

Append-only architectural and product decisions for Atlas. Never rewrite past entries. If a decision is reversed, add a new entry that supersedes.

Format for each entry:

## YYYY-MM-DD: <Short title>

**Context:** <what forced the decision>
**Options considered:** <A, B, C>
**Chose:** <selected option>
**Reason:** <why>
**Supersedes:** <link to earlier entry if this reverses a prior decision>

---

## 2026-06-26: Builder-Modus + Web/Desktop zuerst

**Context:** Greenfield-Start, office-hours. Frage: echtes Produkt für viele vs. Tool für sich selbst, und welche Plattform zuerst.
**Options considered:** Startup-Modus / Builder-Modus; PWA+Mobile / Desktop-Web / native.
**Chose:** Builder-Modus, erst eine perfekte App für sich selbst (Launch-Entscheidung später). Web/Desktop zuerst, kein PWA, kein Mobile, keine native App am Anfang.
**Reason:** Erster und einziger Nutzer ist der Builder. Native/Mobile bringen am Anfang nur Aufwand ohne Wert.

## 2026-06-26: Kern-Wert = Aggregation, Kalender ist Modul 1

**Context:** Im Review wurde der Auto-Planer faelschlich zum Hauptwert erklaert. Builder hat korrigiert.
**Options considered:** Wert = Auto-Planer (sharp calendar) / Wert = Aggregation (super-app).
**Chose:** Wert = Aggregation (alles an einem Ort). Kalender = Modul 1, nicht das Produkt. Auto-Planer ist ein Feature. Modul-Reihenfolge: 1. Kalender -> 2. Nachrichten (spaeter). n=1 ist fuer jetzt ok.
**Reason:** Der Grund, Atlas zu oeffnen, ist dass alle Sachen drin sind. Aggregation liefert ab Modul 2 echten Wert; relevante Metrik = Zeit bis zur ersten ersetzten App (Nachrichten).

## 2026-06-26: Architektur = Atlas-nativer Kalender (Approach B)

**Context:** v0-Bau-Ansatz. Untis-Mirror vs. eigener Kalender vs. Plugin-Shell zuerst.
**Options considered:** A) Untis-Mirror MVP, B) Atlas-nativer Kalender mit eigenem Event-Modell, C) Local-first Super-App-Shell zuerst.
**Chose:** B, mit einer duennen Scheibe Disziplin aus C. Eigenes Event-Datenmodell (SchoolBlock{status}/Routine/Task/FreeSlot), Untis als duenner austauschbarer Importer-Adapter. KEIN generisches Plugin-Framework und KEINE spekulative offene API im v0 (Modul-Grenze ist Design-Wert, nicht v0-Deliverable, Rule of Three).
**Reason:** Entspricht "der ganze Kalender Atlas", bestes Fundament fuer Module + Agent, kein Rebuild fuer Modul 2. Plugin-Framework/Spekulativ-API waeren Plattform-vor-Produkt-Falle.

## 2026-06-26: WebUntis-Zugang via Untis-Mobile-Secret, Sync server-seitig

**Context:** WebUntis hat keine offizielle End-User-API; viele Schulen mit M365/SSO + 2FA.
**Options considered:** User/Passwort-Login / Untis-Mobile-Secret (QR).
**Chose:** Login ueber Untis-Mobile-Secret/QR (Profil -> Freigaben -> "Zugriff ueber Untis Mobile", WebUntisSecretAuth). Sync laeuft server-seitig (Next.js API-Route / scheduled function), Secret in env/verschluesseltem Store, niemals im Client (CORS + Sicherheit). Importer-Adapter duenn halten (Sunset-Risiko der inoffiziellen API ~2027).
**Reason:** Passwort-Login scheitert oft bei SSO/2FA-Schulen; das Secret funktioniert unabhaengig vom SSO-Web-Flow. Der Browser kann WebUntis ohnehin nicht direkt aufrufen.

## 2026-06-26: Stack = Next.js + Postgres auf Vercel

**Context:** Eigener Event-Store noetig; Frontend ist erklaerte oberste Prioritaet.
**Options considered:** Local-first IndexedDB / hosted Postgres (Supabase, Neon).
**Chose:** Next.js / React (Desktop), Persistenz = Postgres (Supabase oder Neon), Hosting/Deploy Vercel (Account Thimorrow). Git-Identitaet Thimorrow beachten (sonst Vercel-Deploy BLOCKED).
**Reason:** Atlas hat einen eigenen Event-Store, und der Agent greift spaeter server-seitig darauf zu, also braucht es ein echtes Backend, nicht nur Frontend-State.

## 2026-06-26: Persistenz = Neon (serverless Postgres) + Drizzle ORM

**Context:** Stack-Entscheidung liess Supabase vs. Neon offen. Builder hat um Empfehlung gebeten.
**Options considered:** Supabase (Postgres + Auth + Auto-APIs + Realtime + Storage) / Neon (reines serverless Postgres mit DB-Branching).
**Chose:** Neon, mit Drizzle als ORM.
**Reason:** Atlas schreibt seine Backend-Routen ohnehin selbst (Untis-Sync, eigenes Event-Modell, spaeter offene API fuer Hermes); Supabases Auto-APIs/Auth werden dafuer jetzt nicht gebraucht, und bei n=1 keine Auth noetig. Neon ist minimal, schnell, Vercel-nativ, DB-Branching hilft beim Schema-Iterieren. Auth/Multi-User spaeter nachruestbar (beides Postgres, Migration easy).
**Supersedes:** verfeinert "Stack = Next.js + Postgres (Supabase/Neon)" vom 2026-06-26.

## 2026-06-26: Routinen-Modell M001 = feste Wochen-Regeln

**Context:** Routine kann als feste Wochen-Regel oder als flexibles "X mal pro Woche"-Ziel modelliert werden.
**Options considered:** A) feste Wochen-Regel (fester Tag + Zeit, offenes Ende moeglich) / B) flexibles Ziel (Atlas sucht die Slots).
**Chose:** A fuer M001 (Kalender). B (flexible Ziele) erst mit dem Auto-Planer (Modul 2+).
**Reason:** Der Kalender braucht nur wiederkehrende Eintraege mit Tag/Zeit. Flexible Ziele ergeben erst Sinn, wenn ein Planer die Slots selbst fuellt.

## 2026-06-26: Routinen-Modell unterstuetzt A UND B ab M001

**Context:** Builder hat klargestellt, dass er BEIDE Routine-Arten im Alltag hat ("a und b muss da sein habe beides").
**Options considered:** nur A (fest) in M001 / beide ab M001.
**Chose:** Das Datenmodell traegt ab M001 BEIDE: A) fixed-schedule (fester Tag/Zeit, offenes Ende) und B) flexible-goal ("X mal pro Woche", ohne feste Zeit). In M001 rendern fixed-Routinen als wiederkehrende Events; flexible-goal-Routinen werden als Ziel/Target gespeichert und angezeigt (manuelles Platzieren moeglich). Die automatische Slot-Platzierung von B kommt mit dem Auto-Planer (Modul 2+).
**Reason:** Builder hat beide Arten real; das Modell muss beide von Anfang an abbilden, sonst Rebuild. Nur die Auto-Platzierung von B ist spaeter.
**Supersedes:** "Routinen-Modell M001 = feste Wochen-Regeln" (2026-06-26).

## 2026-06-26: Next.js 16.2.9 (stable), Floor ^16.2.0

**Context:** Builder wollte Next 16.2/16.3 minimum statt der zuerst installierten 15.5.
**Options considered:** 16.2.9 (latest stable) / 16.3.0-preview.5 (Pre-Release, kein Stable).
**Chose:** 16.2.9 stable, Floor `^16.2.0`.
**Reason:** 16.3 gibt es nur als canary/preview, nicht stable. Die 16.3-Aenderungen (Cache Components, instant()-Prefetch-Tuning, Turbopack-Internals) betreffen nichts, was Atlas in M001 nutzt, also kein Vorteil bei Preview-Instabilitaet. Bump auf 16.3, sobald stable.
**Supersedes:** die Initial-Wahl next ^15.0.0 (war Auto-Resolve auf 15.5.19).
