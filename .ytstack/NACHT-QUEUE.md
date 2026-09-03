# Nacht-Queue

| # | Feature | Status | Commit | Notiz |
|---|---------|--------|--------|-------|
| 0 | Lokale Entwicklungsdatenbank (Treiberwahl neon/pg) | fertig | 2dba570 | Vorarbeit, kein Nachtfeature |
| 1 | Atlas-Bot | fertig | b3ae85f | gesetzt, hoechste Prioritaet |
| 2 | Notenuebersicht `/noten` | fertig | 0c64824 | es gibt `/api/grades`, aber keine Seite dazu |
| 3 | Zielnoten-Rechner ("Was brauche ich noch?") | fertig | 358684f | baut auf 2 auf |
| 4 | Pruefungsplan mit Countdown | fertig | b38083a | alle Arbeiten und Tests auf einen Blick |
| 5 | Morgen-Ansicht (Packliste fuer den naechsten Schultag) | fertig | 339513f | Faecher morgen, faellige Aufgaben, Arbeiten |
| 6 | Hausaufgabe direkt aus der Schulstunde eintragen | fertig | af51038 | Faelligkeit automatisch = naechste Stunde des Fachs |
| 7 | Navigation fuer die neuen Seiten | fertig | e9715a1 | Vorarbeit, kein eigenes Feature |
| 8 | Bot-Verlauf zum Nachlesen | fertig | b8dbcb1 | die API gibt es schon, es fehlt die Oberflaeche |

## Bewusst nicht gebaut

- **Lernkarten / Abfragemodus aus Notizen** -- gutes Feature, aber mit ehrlicher UI (Kartenstapel, Wiederholungslogik, Fortschritt) deutlich mehr als zwei Stunden. Halb gebaut waere es schlechter als gar nicht.
- **Push-Benachrichtigungen fuer faellige Aufgaben** -- braucht Service Worker, VAPID-Schluessel und eine Erlaubnisabfrage, die der Besitzer selbst am Geraet erteilen muss. Ueber Nacht nicht verifizierbar.
- **Pomodoro-/Lerntimer** -- klingt nett, spart aber keinen Handgriff, den ein Zehntklaessler heute wirklich macht. Dafuer gibt es jede Uhr.
- **Fehlzeiten und Krankmeldung** -- die Daten liegen in Untis hinter Zugaengen, die Atlas nicht hat. Ohne echte Datenquelle nur eine Attrappe.
- **Tafelfoto mit Texterkennung in die Stundennotiz** -- der Bot kann Bilder lesen, aber der Upload-Weg an der Schulstunde (Blob, Vorschau, Zuordnung) ist ein eigenes Feature. Der Bot deckt den Kern schon ab.
- **Eigene globale Suche per Cmd+K** -- Cmd+K gehoert dem Bot, und der findet dieselben Inhalte, nur mit Antwort statt Trefferliste.
