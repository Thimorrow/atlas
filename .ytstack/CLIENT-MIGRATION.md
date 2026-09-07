# Client-Migration: 10 groesste Client Components

Stand: 2026-09-07. NICHT migriert, nur Analyse. Sortiert nach Zeilen.

## 1. components/lernplan-erstellen.tsx (2808 Zeilen)
Interaktiver 3-Schritt-Wizard (Material, Punkte, Auswertung) mit viel useState,
Fetches und Animationen. Vorschlag: Huelle als Server Component (Titel, statische
Texte, initiale Daten per fetch auf dem Server laden), nur Schritt-Logik und
Formulare als eingebettete Client Islands behalten.

## 2. components/lernplan-seite.tsx (2063 Zeilen)
Planseite mit Kopf, Sicherheits-Uebersicht und Tageslisten. Vorschlag: Kopf und
Tageslisten als Server Components rendern (reine Darstellung aus geladenen
Daten), nur Expand/Collapse, Filter und Aktionen als Client Islands.

## 3. components/lernen-session.tsx (1419 Zeilen)
Karteikarten-Sitzung, arbeitet nach dem Laden rein clientseitig (Queue lokal).
Vorschlag: schwer migrierbar, Session-State bleibt Client. Allenfalls Lade- und
Fehler-Rahmen sowie statische Kopfzeile als Server Component auslagern.

## 4. components/lernen-thema.tsx (1235 Zeilen)
Themen-Seite mit Lernzettel (Markdown) und Kartenlisten. Vorschlag: guter
Kandidat. Lernzettel-HTML auf dem Server rendern (renderMarkdown laeuft
serverseitig), nur Bearbeiten-Dialog und Karten-Aktionen bleiben Client.

## 5. components/subject-detail.tsx (1106 Zeilen)
Fach-Detailseite, haelt Noten- und Datei-State. Vorschlag: Kopf, Notenliste und
Dateiliste initial als Server Components (Daten direkt aus DB/Store), nur
Composer-Dialoge und Delete-Bestaetigungen als Client Islands.

## 6. components/bot-chat.tsx (967 Zeilen)
Chat mit Stream-Parser und Verlauf. Vorschlag: nicht migrieren, Streaming und
Eingabe-State sind genuin clientseitig. Allenfalls Verlauf-Historie initial vom
Server liefern und per Hydration uebernehmen.

## 7. components/subject-notes.tsx (894 Zeilen)
Notizen mit Editor und Suche. Vorschlag: Lesemodus (gerendertes Markdown, Liste)
als Server Component, nur Editor, Suche und Autosave als Client Island.

## 8. components/lernen-tutor.tsx (867 Zeilen)
Tutor-Chat mit Widgets und Checkliste. Vorschlag: wie bot-chat behandeln, bleibt
Client. Statische Einleitung und Checklisten-Startwerte koennte der Server
liefern.

## 9. components/stunden-cockpit.tsx (569 Zeilen) und 10. morgen-panel.tsx (584 Zeilen)
Cockpit und Fokus-Ansicht, datengetrieben mit wenig Edit-State. Vorschlag: beste
Kandidaten fuer den Anfang. Listen und Kennzahlen auf dem Server rendern, nur
Quick-Add-Zeile, Dropdowns und Dialoge bleiben Client.

## Fazit
Zuerst morgen-panel / stunden-cockpit (darstellend, kleiner Blast-Radius), dann
lernen-thema und subject-notes im Lesemodus. Sitzung, Chat und Wizard bleiben
Client.
