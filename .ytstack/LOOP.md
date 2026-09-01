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

## Stand
- Dateianhaenge liegen im privaten Blob-Store, Upload laeuft am 4,5-MB-
  Nadeloehr vorbei, live geprueft bis 9 MB.
- otplib fehlte in der Vercel-Funktion, /api/sync/untis war live kaputt.
  Zweiter Anlauf mit vollstaendiger Abhaengigkeitshuelle laeuft im Deploy.

## Offen
- Untis-Abgleich live bestaetigen.
- Android: Werkzeugkette, dann Design, dann Screens.
- OneNote: eine Notiz nach OneNote schicken.
- Befunde aus der Fehlerjagd abarbeiten.
