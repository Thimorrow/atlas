# Nacht-Loop, 1. September 2026

Auftrag: so lange arbeiten, bis die App wirklich gut ist. Neue Funktionen ja,
aber nichts Ueberladenes, und alles poliert. Der Nutzer schlaeft, ich
entscheide selbst.

## Feste Entscheidungen des Nutzers
- Native Android-App (Kotlin, Compose). Er hat meinen Einwand gehoert und sich
  bewusst dagegen entschieden, es soll nativ sein.
- Die APK bekommt er als Datei, kein Play Store, kein Release noetig.
- Anmeldung gilt ein Jahr statt 30 Tagen. Erledigt.
- OneNote wird gebaut, die Azure-Registrierung macht er spaeter selbst.
- Kostenlos bleiben, er will im Loop nichts einrichten muessen.

## Zugang
- Live: https://atlas-ten-orpin.vercel.app, Passwort Thimofej11!
- Branch: schule-scope, wird zugleich nach main gepusht.
- Lokal fehlen DATABASE_URL und die WEBUNTIS-Werte, die hat der Vercel-CLI
  beim Anlegen des Blob-Stores ueberschrieben. Nur der Blob-Token liess sich
  zurueckholen. Getestet wird deshalb live.

## Stand, Nacht auf den 2. September

Erledigt und live geprueft:
- Dateianhaenge im privaten Blob-Store, Upload bis 9 MB am 4,5-MB-Nadeloehr vorbei.
- otplib fehlte in der Vercel-Funktion, /api/sync/untis war komplett kaputt.
- Untis' echte Fehlermeldung wird durchgereicht. Damit kam die Ursache ans
  Licht: der Abgleich lief ueber eine Schuljahresgrenze (Code -8507). Der
  Zeitraum wird jetzt ins Schuljahr geschoben.
- Untis meldet fuer das neue Schuljahr "no right for timetable" (-8509), der
  Plan ist dort noch nicht freigegeben. Das ist keine Sache, die sich im Code
  loesen laesst. Es endet jetzt in einem deutschen Hinweis statt in einem 500.
- Kalender nimmt nur noch existierende Daten an, 2026-13-99 stuerzte vorher ab.
- Ein ruhiger Hinweis auf der Startseite, wenn der Stundenplan veraltet.
- Fuenf neue Endpunkte fuer den nativen Client: session, home, colors,
  sync-Stand, multipart-Upload.
- Native Android-App: Werkzeugkette, Design-System aus den echten Atlas-Farben,
  Netzwerk mit persistentem Cookie, Anmeldung. Baut zu einer APK.
- Anmeldung gilt ein Jahr.

Wartet auf eine Freigabe des Nutzers:
- **Der OneNote-Zweig liegt auf dem Branch `onenote`, nicht in der Produktion.**
  Grund: die Migration 0006 legt zwei Spalten an `subjects` an, ohne sie faellt
  jede Fachabfrage um. Migrationen gegen die Produktionsdatenbank sind hier
  gesperrt und brauchen eine ausdrueckliche Freigabe. Der Weg steht bereit:
  `POST /api/admin/migrate` hinter dem Passwort, beliebig oft wiederholbar.
  Danach `git merge onenote` und pushen.

Offen:
- Untis: sobald die Schule den Plan freigibt, sollte der Abgleich von selbst
  wieder laufen. Nichts zu tun, nur zu beobachten.

## Runde in der Nacht auf den 2. September, zweiter Teil

Fertig und auf dem Geraet geprueft:
- Die drei Bildschirme stehen: Wochenraster mit Fachfarben, Aufgaben nach
  Faelligkeit gruppiert, Faecherliste mit Detailseite.
- Adaptives App-Icon.
- Ein Durchgang gegen den echten Emulator hat Fehler gefunden, die kein
  Compiler sieht: fliederfarbene Material-Standardchips, ein Feld mit Kerbe,
  "VERTRETUN" mitten im Zeichen abgeschnitten (maxLines ohne overflow),
  beschnittene Chipreihen, ein Absendeknopf, den der Autofokus aus dem Bild
  schob. Alle behoben.
- Offline: die zuletzt erfolgreiche Antwort liegt als JSON auf der Platte. Beim
  Start steht der Plan sofort, ohne Netz bleibt er stehen und bekommt darueber
  die Zeile "Stand von HH:MM Uhr, keine Verbindung". Bei 401 und beim Abmelden
  wird der Speicher geleert. Mit abgeschaltetem WLAN und Mobilfunk am Emulator
  nachgestellt.
- Notizen werden als Markdown gerendert, nach demselben Regelwerk wie
  lib/markdown.ts. Links nur http, https, mailto.
- 61 Unit-Tests, gruen.

Laeuft gerade:
- Ein Durchgang Bedienbarkeit an der Android-App (Antippflaechen, TalkBack,
  grosse Systemschrift, reduzierte Bewegung).
- Ein Durchgang Handy-Ansicht an der Web-App.
