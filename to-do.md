# To-do / Fehlerliste

Hier sammle ich alle Fehler, die du mir reinsprichst.

## Offen

- [ ] **Atlas soll mehr ueber die echte Stunde wissen** (Idee, noch nicht
  zugeschnitten). Heute kennt Atlas eine Stunde nur als Untis-Zeile: Fach,
  Zeit, Raum, Lehrer, Status. Denkbare naechste Schritte, von billig nach teuer:
  - Chronik verdichten: was in dieser Stunde ueber die Wochen an Notizen,
    Meldungen, Hausaufgaben und Dateien entstanden ist, als Verlauf pro Fach
    lesbar machen (die Daten liegen alle schon in `lesson_notes`,
    `lesson_participations`, `assignments`, `subject_files`).
  - Thema der Stunde: ein Feld an der Stunde, gefuettert aus der Stundennotiz
    oder vom Bot aus dem Lehrplan vorgeschlagen (siehe `lib/lehrplan/`).
  - Rhythmus lernen: aus den vergangenen Stunden ableiten, wann in diesem Fach
    ueblicherweise Hausaufgaben kommen und wann Arbeiten geschrieben werden.
  - Untis tiefer auslesen: `substitutionText` und Stundeninhalte, soweit die
    Schule sie ueberhaupt pflegt.

## Erledigt

- [x] Bot-Systemprompt (`lib/bot/context.ts`) nannte noch die Seiten `/morgen`,
  `/pruefungen` und `/noten`, die es seit der Konsolidierung auf 3 Module nicht
  mehr gibt. Der Bot schickte damit auf 404-Seiten. Jetzt `/`, `/aufgaben`,
  `/faecher`, inklusive Hinweis auf den Stundenmodus im Fokus.

- [x] Profil-Dropdown im EINGEKLAPPTEN Zustand: oeffnete "wo die Sidebar waere" (~248px), weil der Trigger-Button `w-full` die volle geclippte Innenbreite behielt und Radix an dessen unsichtbarer rechter Kante verankerte. Fix: Button collapsed auf `w-10` (Avatar-Breite) -> Dropdown sitzt jetzt direkt neben dem Avatar.
- [x] Settings komplett neu: Section-Karten mit Icon-Headern, groessere Hierarchie, echter Untis-Sync (POST /api/sync/untis mit Status-Feedback), Theme-Tiles mit Mini-Preview, redundanter "Zurueck"-Link nur noch auf Mobile (md:hidden).
- [x] Profil-Dropdown (Sidebar) fixen: oeffnet ausgeklappt jetzt nach oben (verbunden) statt nach rechts ueber den Content, eingeklappt weiterhin nach rechts. ChevronsUpDown-Affordance am Trigger, concentric radius der Menue-Items (rounded-lg). (war im To-do als "Einstellungen > Allgemein / Dropdown-Teil")
- [x] Enter-Animation fuer Sections: split & stagger mit blur + opacity + translateY beim Reload. Wiederverwendbar als components/stagger.tsx (Stagger/StaggerItem), angewendet auf die Settings-Sections UND die Kalender-Hauptseite (Kopf, Wochenziele, Kalender-Card staggern beim Reload rein).
