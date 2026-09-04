# Loop: App fixen + Lernbereich (gestartet 2026-09-04)

## Auftrag
- App komplett fixen (Gates gruen: tsc ok, 354 Tests ok -> Bugs nur im Flow)
- Mehrfach-Datei-Upload (mehrere gleichzeitig, Drag&Drop)
- Designierter Lernbereich /lernen (UI-Skills: design-foundations -> forms-and-inputs -> ui-review)
- Live-Unterricht-Logik ueberdenken
- User: "vollkommen autonom"

## Stand
- Drei Audit-Agenten gestartet (Web-Audit, Bot/Lehrplan/Datenmodell, Android-Build)

## Offen
- Berichte abwarten, dann Fix-Liste + Lernbereich-Plan

## Verworfen

## Bausteine (Bericht 2, 2026-09-04)
- DB: assignments(type exam|test|presentation = Pruefung, dueDate, subjectId), subject_notes, lesson_notes(1:1 school_block), subject_files (nur Metadaten, kein Text), subjects.curriculum (Markdown). Letzte Migration 0015. Migrationen: `npm run db:generate`, angewendet durch scripts/migrate.mjs im Build.
- Bot: lib/bot/model.ts streamChatWithFallback(messages, tools, signal) -> Z.ai GLM (ZAI_API_KEY, glm-5.3 / -flash). Tools lib/bot/tools.ts. readSubjectFile(id) in lib/bot/files.ts (PDF via unpdf, 20k chars). listNotes / listSubjectLessonNotes.
- Pruefungen: lib/assignments-view.ts partitionExams / groupExamsByWeek.
- UI-Primitives: nur button, dropdown-menu, skeleton. Toast: useToast().show(msg, variant, action).
- Android: kompiliert, Tests gruen, kein Handlungsbedarf.

## Plan (2026-09-04, nach Audit)
- A Multi-Upload: components/subject-files.tsx, neu lib/file-limits.ts
- B Cockpit: neue Route /stunde + /api/stunde, components/stunden-cockpit.tsx, morgen-panel verlinkt statt Vollbild, jetzt-stunde.tsx entfaellt, lib/jetzt-stunde.ts erweitert, assignment-quick-add bekommt defaultDueDate
- C Lernen-Backend: Tabellen study_cards/study_reviews (Migration 0016), lib/lernen.ts (pure+Tests), lib/study-store.ts, lib/lernen-generieren.ts (Bot), /api/lernen/*
- D Lernen-UI (nach C): /lernen, /lernen/[subjectId], Session
- E Navigation (selbst): app-sidebar MODULES + mobile-header: Stunde, Lernen
- Audit-Fixes: api/calendar todayISO lokal; subject unresolved im Cockpit -> Hinweis statt stiller Wegfall

## Stand 2026-09-04 (Loop-Runde 3)
- Branch feature/lernbereich-und-cockpit; Android als eigener Commit e130b96
- A Upload fertig + reviewt; B Cockpit fertig + reviewt + Feinschliff; C Backend fertig + reviewt (untisSubject-Fix)
- E Navigation verdrahtet (Stunde, Lernen in Sidebar + Mobile-Header)
- D Lern-UI laeuft (Agent)
- Danach: tsc/vitest/build, ui-review, Commit, Push, PR, Vercel-Deploy pruefen (Migration 0016 laeuft im Build)

## Runde 4 (2026-09-04): "ist alles logisch?" + Bot-Ueberarbeitung
- Zeitzone: Server war UTC-abhaengig -> lib/zeit.ts (Europe/Berlin), app-weit verdrahtet, Commit 7f930d6, Tests gruen in UTC/Tokyo/lokal
- Bot-Agent laeuft: Cockpit-Kontext in lib/stunde-kontext.ts, System-Prompt mit Uhrzeit/Jetzt/5 Module, Begruessung zeitabhaengig, Tools jetzt_lesen/lernstand_lesen/lernkarten_erzeugen/lernkarte_anlegen, Tool-Replay der letzten 3 Turns, dates.ts TZ, Cache-Invalidierung
- Logik-Audit-Agent laeuft (Produktlogik aller Fluesse)
- Offen: PR #8 mergen (Merge wurde vom Berechtigungssystem blockiert -> User), danach Produktion pruefen (/api/stunde nowHM vs. echte Uhrzeit)
- Logik-Audit erledigt: #3 (Fokus -> "Heute nachtragen"), #10/#11 (Uebersicht Wiederholen, Plantext am Pruefungstag), #17 (Mitzunehmen ohne Entfall) lokal umgesetzt, noch nicht committet
- Nach Bot-Agent in lib/stunde-kontext.ts: #1/#2 Pruefungen nicht in "Faellig jetzt", #5 terminlose offene Aufgaben des Fachs zeigen, #12 fachlose faellige Aufgaben zeigen
- #4/#16 Notensystem 0-15 statt 1-6 (Sek I NRW): Entscheidung des Users, nur melden

## Runde 5 (2026-09-04): Lernbereich v2 (Auftrag: "KOMPLETT verbessern")
- Konzept + Vertrag: .ytstack/LERNEN-SPEC.md, lib/lernen-types.ts
- Branch feature/lernbereich-v2
- Agent A (Sonnet): Backend (Migration 0017, lernen.ts, study-store, generieren, API)
- Agent B (Sonnet): UI (uebersicht, fach, thema, session)
- Danach: tsc/vitest/build, ui-review, Bot-Tools, Commit, Push, PR
- Stand: Backend + UI gebaut, Review-Fixes (Vokabel-Tastatur/Fokus, 16px-Selects, Escape, Probe-Ergebnis, Probe-Seed pro Tag). tsc 0, 453 Tests, next build 0 Errors.
- Nebenbefund: Commit d04abb5 (Fach-Detailseite mit Tabs) kam aus einer parallelen Session auf diesen Branch.
- Naechste Schritte: Commit, Push, PR, Preview live pruefen (Migration 0017 laeuft im Build)
