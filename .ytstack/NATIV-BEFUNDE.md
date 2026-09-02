# Native App: Befunde aus dem Emulator, 2. September 2026

Aufgenommen auf gymlinator-api34 mit der ausgelieferten Atlas-Nativ.apk.
Screenshots: scratchpad/shots/01-start.png, 02-aufgaben.png, 03-faecher.png

## Blockierend (Funktion fehlt ganz)

1. **Keine Einstellungen.** Keiner der drei Reiter hat ein Zahnrad oder ein
   Menue. Damit fehlt alles, was in der Web-App unter /settings haengt:
   Untis-Sync ausloesen, Erscheinungsbild hell/dunkel/System, OneNote,
   Profil. Der Nutzer hat genau das zuerst genannt.
2. **Kein Untis-Sync.** Die App kann ihre Datenquelle nicht aktualisieren,
   sie zeigt nur, was der Server gerade hat.
3. **Keine Noten.** In Arbeit.

## Aussehen: der Kern ist Leere

4. **Aufgaben:** zwei Eintraege, danach rund 60 Prozent leerer Bildschirm.
   Kein Faelligkeitsdatum an der Zeile, keine erledigten Aufgaben, kein
   Filter. Der Bildschirm hat nichts zu tun.
5. **Stundenplan:** die Achse laeuft von 07 bis 16 Uhr, nach 13 Uhr steht
   fast nichts. Ein Drittel der Flaeche ist leeres Raster. Die Woche ist auf
   einem Telefon in fuenf Spalten gequetscht, waehrend die Web-App auf
   Mobil standardmaessig den Tag zeigt. Das ist der groesste einzelne
   Treiber von "sieht schlecht aus".
6. **Kein Startbildschirm.** /api/home existiert. Eine Uebersicht (naechste
   Stunde, was heute ansteht, offene Aufgaben) wuerde die Leere fuellen und
   waere der einzige Bildschirm, der beim Oeffnen etwas zu sagen hat.

## Details

7. **Faecher ohne Farbe fallen aus dem System.** "Evangelische
   Religionslehre" hat einen fast unsichtbaren grauen Punkt, "Wirtschaft/..."
   im Stundenplan ist die einzige graue Karte zwischen elf farbigen.
   /api/colors existiert, die App kann keine Farbe zuweisen.
8. **Der Kreis vor einer Aufgabe** sieht aus wie ein Farbpunkt, nicht wie
   ein Kaestchen zum Abhaken. Nichts deutet an, dass er bedienbar ist.
9. **Chevron an jeder Faecher-Zeile** ist Dekor: die ganze Zeile ist
   klickbar, das Zeichen wiederholt nur, was die Zeile ohnehin tut.
10. **Zeitachse und Bloecke passen nicht zusammen.** Die Achse beschriftet
    volle Stunden, der Unterricht beginnt 07:50. Die Karten stehen dadurch
    zwischen den Beschriftungen, ohne eigene Zeitangabe.
11. **Der FAB** ist fast quadratisch mit hartem Schatten und folgt damit
    nicht der Rundung, die Material 3 dafuer vorsieht.

## Reihenfolge

Einstellungen samt Sync zuerst, dann Tagesansicht im Stundenplan, dann
Startbildschirm, dann die Details 7 bis 11.

## Entscheidungen von Sid, 2. September 2026

- **Woche bleibt.** Keine Tagesansicht, kein eigener Startbildschirm.
  Befund 5 wird also nicht durch einen Ansichtswechsel geloest, sondern
  die Wochenansicht selbst muss auf einem Telefon gut werden: Achse auf
  den tatsaechlich belegten Zeitraum beschneiden, Beschriftung an den
  echten Stundengrenzen statt an vollen Stunden, Spalten atmen lassen.
  Befund 6 (Startbildschirm) faellt weg.
- **Offline lesbar.** Zuletzt Geladenes wird lokal gehalten und beim Start
  sofort gezeigt, waehrend im Hintergrund aktualisiert wird. Room in der
  Datenschicht.
- **Autonom.** Kein Abstimmen zwischendurch, Bericht wenn Sid zurueck ist.

## Reihenfolge, neu

1. Einstellungen samt Untis-Sync und Erscheinungsbild (Befund 1 und 2)
2. Offline-Cache mit Room
3. Wochenansicht auf dem Telefon brauchbar machen (Befund 5, 10)
4. Aufgaben-Bildschirm fuellen: Faelligkeit an der Zeile, erledigte
   Aufgaben, Filter (Befund 4)
5. Farbe zuweisen fuer Faecher ohne Farbe (Befund 7)
6. Reste: 8, 9, 11

## Korrektur zu Befund 5, nach Blick in den Code

`tagesgrenzen()` in ui/Stundenplanlogik.kt beschneidet die Achse bereits auf
den belegten Zeitraum. Der Befund war ungenau. Die tatsaechliche Ursache: die
Achse ist linear, und eine einzelne Ausreisserstunde (Sport, Donnerstag 13:45
bis 15:30) streckt damit das gesamte Raster bis 16 Uhr, obwohl zwischen 13:00
und 13:45 an keinem Tag der Woche etwas liegt. Die dichten Vormittagsbloecke
werden gequetscht, damit ein leeres Band Platz bekommt.

Loesung in Arbeit: ueber die ganze Woche leere Baender ab 45 Minuten
bekommen eine feste kleine Hoehe statt ihrer anteiligen, mit der Dauer
angeschrieben. Eine Mittagspause bleibt sichtbar, kostet aber keinen
Bildschirm mehr.

## Stand

- [x] Politur-Durchgang: Tabellenziffern zentral, Druckskalierung 0.96 im
      Theme, Skeletthoehen nachgemessen (48 statt 64, 48 statt 67, 38 statt
      57 waren die Spruenge), geschuetztes Leerzeichen vor "Uhr". 67 Tests.
- [ ] Noten und Schnitt (laeuft)
- [ ] Wochenraster stauchen und an echten Stundengrenzen ausrichten (laeuft)
- [ ] Einstellungen samt Untis-Sync (wartet auf die Datenschicht)
- [ ] Offline auf Aufgaben- und Faecherliste ausweiten. Der Speicher
      existiert schon (data/AntwortSpeicher.kt) und ist an Startdaten und
      Fach-Detail verdrahtet, an den beiden Listen nicht. Kein Room noetig.

## Stand, spaeter am 2. September

- [x] Noten und Schnitt: Datenschicht, Fach-Detail, Eingabeblatt, 8 Tests.
      Der Agent hatte die Verdrahtung in MainActivity offen gelassen, das
      Blatt liess sich in der echten App also gar nicht oeffnen. Selbst
      nachgezogen und am Emulator geprueft.
- [x] Fehler im ViewModel selbst gefunden: nach dem Eintragen einer Note
      setzte noteAnlegen ueber ladeNoten den ganzen Zustand zurueck, die
      Liste fiel sichtbar auf das Skelett. Jetzt bleibt die alte Liste
      stehen, bis die neue da ist.
- [x] "fuer" statt "für" in einem sichtbaren Text. Statt nur zu korrigieren
      gibt es jetzt UmlautWaechterTest: er liest die Quellen und wird rot,
      sobald ein sichtbarer String ein Wort ohne Umlaut enthaelt.
      Kommentare, Zeichenkettenschablonen und interne Namen sind
      ausgenommen, damit er keinen Fehlalarm schlaegt.
- [x] Uhrzeiten im Fach-Detail standen in FontFamily.Monospace. Das haelt
      sie zwar in einer Flucht, gibt aber auch dem Doppelpunkt eine volle
      Ziffernbreite, und "09:40-10:25" fiel sichtbar auseinander; ausserdem
      wechselte mitten auf der Seite die Schriftart. Jetzt Tabellenziffern
      auf der normalen Schrift. Vorher und nachher als Lupenausschnitt
      verglichen (shots/05, shots/09).
- [ ] Wochenraster stauchen (laeuft, zwei Tests dort gerade rot)
- [ ] Einstellungen samt Untis-Sync und Erscheinungsbild (laeuft)
- [ ] Offline auf Aufgaben- und Faecherliste ausweiten

## Wochenraster, nach dem Umbau

Die Stauchung wirkt: derselbe 45-Minuten-Block bekommt bei gleicher
Bildschirmhoehe rund 23 Prozent mehr Hoehe (8,33 auf 10,25 Prozent der
Spanne), weil die Achse jetzt minutenexakt ist statt stundengerundet und
das leere Band 13:00 bis 13:45 eine feste kleine Hoehe hat statt seiner
anteiligen. Die Rasterlinien liegen auf den Blockkanten, nicht mehr
daneben.

Drei Fehler, die der Umbau erzeugt hat und die ich nachgezogen habe:

- Die Zeitspalte war mit 38dp auf "08" ausgelegt. Mit der neuen
  Beschriftung ist "11:10" der laengste Fall, und der brach dort auf zwei
  Zeilen um ("11:1" ueber "0"). Spalte auf 48dp, maxLines 1, kein
  Umbruch.
- Die Achsenbeschriftung lief in FontFamily.Monospace zusaetzlich zu den
  Tabellenziffern. Das macht sie nur breiter und trug zum Umbruch bei.
- Die Raumangaben in den Stundenbloecken liefen ebenfalls in Monospace,
  daher las sich "CH 2" wie mit doppeltem Leerzeichen. Ein Raumkuerzel
  steht in keiner Spalte und braucht keine Ziffernflucht.

## Abschluss der zweiten Runde

- [x] Einstellungen samt Untis-Abgleich, Erscheinungsbild ueber den Neustart
      hinaus, OneNote-Status, Profil, Konto.
- [x] Offline auf allen drei Listen. Kein Code noetig: Aufgaben und Faecher
      zeichnen ohnehin aus denselben Startdaten, die schon von der Platte
      wiederhergestellt werden. Im Flugmodus nachgewiesen, mit Stand-Zeile.
- [x] Erledigte Aufgaben als eingeklappter Abschnitt am Listenende, mit
      Abhaken und Zuruecknehmen ohne Neuladen.
- [x] Befund 7 war zwei verschiedene Dinge. "Evangelische Religionslehre"
      traegt Weiss, weil das in lib/subject-colors.ts als Wunschfarbe von
      Sid steht -- das ist eine Entscheidung, kein Loch, und bleibt.
      "Wirtschaft/Politik" dagegen zog Weiss per Hash-Zufall. Weiss ist im
      Hellmodus absichtlich ein sehr helles Grau, damit ein reinweisser
      Punkt nicht verschwindet; als Los ist es dadurch der eine Wert, der
      wie ein Fehler aussieht. Weiss ist jetzt aus der Auslosung genommen,
      in beiden Fassungen (lib/subject-colors.ts und Fachfarben.kt), und
      "Wirtschaft/Politik" ist hellblau. Wer Weiss selbst waehlt, bekommt
      es weiterhin.
- [x] Ausserdem gefunden: fachfarbeFuerStunde prueft auf != null, ein leerer
      String ist aber nicht null, also griff der Rueckfall nie.
- [x] Befund 8 war schlimmer als gedacht. Der Kreis war nicht nur
      undeutlich, er zeigte den erledigten Zustand ueberhaupt nicht an:
      [erledigt] ging nur an die Vorlesefunktion, gezeichnet wurde immer
      dasselbe. Eine abgehakte Aufgabe sah aus wie eine offene. Jetzt wie
      in components/assignment-checkbox.tsx: offen ein Ring, erledigt
      gefuellt mit Haken.
- [x] Befund 9, Chevron in der Faecherliste entfernt.

Offen und bewusst nicht angefasst:
- Der Aufgaben-Bildschirm bleibt bei zwei Aufgaben leer, weil es genau
  zwei gibt und null erledigte. Das ist die Datenlage, nicht die
  Gestaltung. Fuellmaterial dagegen waere unehrlich.
- Befund 11, die Form des schwebenden Knopfes. Kleinste Wirkung von allen.
