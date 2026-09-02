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

## Stand 02:00, Nacht auf den 2. September

Beide Durchgaenge sind committet und gepusht (4f6aa0e, 57e4cec, eef807e).

Android, Bedienbarkeit:
- Der Haken meldete Talkback seinen Zustand nicht (Role.Checkbox in clickable
  erzeugt keinen checkable-Knoten), jetzt toggleable.
- Zeilen zerfielen beim Vorlesen in Einzelteile, jede ist jetzt ein Halt.
- Bei fontScale 2.0 war mehrfach etwas abgeschnitten: Reiterbeschriftung,
  Tagesknopf zeigte "3" statt "31", "Lehrkraft" brach mitten im Wort.
- Der Skelett-Puls lief bei abgeschalteten Systemanimationen weiter, jetzt aus.
  50 gegen 5 Frames, gemessen mit dumpsys gfxinfo.
- Offen und bewusst nicht behoben: Fachnamen im Wochenraster bleiben bei
  fontScale 2.0 gekuerzt. Fuenf Spalten geben nicht mehr her, der volle Name
  steht in der Vorlese-Beschreibung.

Web, Handy:
- Der Stundenplan startet unterhalb von md in der Tagesagenda. Im Wochenraster
  blieb jede Spalte 53px breit und jedes Fach schrumpfte auf drei Buchstaben.
- Vertretung-Badge hatte keinen Breiten-Guard und lief aus dem Block.
- Kopfzeile lief ueber, Pfeile wurden auf 33px gequetscht. Der Titel kuerzt
  sich jetzt zu "Mi, 2. Sept. · Heute" statt abgeschnitten zu werden.
- Safe-Area war unverdrahtet, kein viewportFit und kein env() im Projekt.

APK: ~/Desktop/Atlas.apk, 12,1 MB, aus Commit eef807e.
Am Emulator von Hand durchgespielt: installieren, anmelden, echter
Stundenplan aus der Produktion mit Farben, Vertretung und Ausfall.

Korrektur zur Ehrlichkeit: die Commit-Nachricht von 4f6aa0e nennt 61
Unit-Tests, es sind 48. Die Zahl war falsch, die Tests sind gruen.

## Abschluss der Nacht, 02:30

Ein Gegenlesen der ganzen Nachtarbeit hat fuenf Fehler gefunden, alle behoben
und am Geraet belegt (Commit 53b1726):
- holeDetail trug seine Antwort ein, ohne zu pruefen, ob noch dasselbe Fach
  offen ist. Antippen, zurueck, anderes Fach antippen zeigte danach das erste.
- Notiz-Links ohne Schema gingen roh an den Android-Uri-Handler. `#kapitel-3`
  reichte. Beim Beheben kam noch ein zweiter Fehler ans Licht: ohne
  Schraegstrich am Ende der Basis haengt java.net.URI den Pfad direkt an den
  Hostnamen, aus notes/2024.pdf wurde vercel.appnotes.
- Die Standzeile behauptete "keine Verbindung" auch bei einem 500.
- Eine neu angelegte Aufgabe zaehlte nicht in die Zahl auf der Fachkachel.
- Der Offline-Speicher schrieb nicht atomar.

Zwei Korrekturen am Befund, weil der Agent sie am Geraet gegengeprueft hat:
Der behauptete Absturz bei schemalosen Links reproduziert auf API 34 nicht,
dort passiert beim Tippen nichts. Und die Ueberschrift kann nicht vom Inhalt
abweichen, beide kommen aus derselben Antwort; der Schaden war, dass das
komplett falsche Fach dastand.

56 Unit-Tests gruen. Die Testaufgabe "Badge-Probe Mathe", die der Agent auf
dem Server angelegt hatte, ist geloescht.

Dunkelmodus am Emulator angesehen: eigene Fachfarben als dunkle Toenungen mit
farbigem Rand, kein Material-Flieder, Ausfaelle durchgestrichen, der heutige
Tag hell hervorgehoben. Nichts zu tun.

APK: ~/Desktop/Atlas.apk aus Commit 53b1726, installiert und durchgeklickt.

Damit ist der Loop zu Ende. Was noch auf Sid wartet, steht oben unter
"Wartet auf eine Freigabe des Nutzers": der OneNote-Zweig braucht einen Lauf
von POST /api/admin/migrate gegen Neon, dann git merge onenote.
