# To-do / Fehlerliste

Hier sammle ich alle Fehler, die du mir reinsprichst.

## Offen

## Erledigt

- [x] Profil-Dropdown im EINGEKLAPPTEN Zustand: oeffnete "wo die Sidebar waere" (~248px), weil der Trigger-Button `w-full` die volle geclippte Innenbreite behielt und Radix an dessen unsichtbarer rechter Kante verankerte. Fix: Button collapsed auf `w-10` (Avatar-Breite) -> Dropdown sitzt jetzt direkt neben dem Avatar.
- [x] Settings komplett neu: Section-Karten mit Icon-Headern, groessere Hierarchie, echter Untis-Sync (POST /api/sync/untis mit Status-Feedback), Theme-Tiles mit Mini-Preview, redundanter "Zurueck"-Link nur noch auf Mobile (md:hidden).
- [x] Profil-Dropdown (Sidebar) fixen: oeffnet ausgeklappt jetzt nach oben (verbunden) statt nach rechts ueber den Content, eingeklappt weiterhin nach rechts. ChevronsUpDown-Affordance am Trigger, concentric radius der Menue-Items (rounded-lg). (war im To-do als "Einstellungen > Allgemein / Dropdown-Teil")
- [x] Enter-Animation fuer Sections: split & stagger mit blur + opacity + translateY beim Reload. Wiederverwendbar als components/stagger.tsx (Stagger/StaggerItem), angewendet auf die Settings-Sections UND die Kalender-Hauptseite (Kopf, Wochenziele, Kalender-Card staggern beim Reload rein).
