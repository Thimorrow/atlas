# Tiefenanalyse: Hefte und Notebook-Werkzeuge

Stand: 18. September 2026

Diese Analyse ist bewusst vor der Umsetzung entstanden. Sie verbindet Quellcodeprüfung, bestehende automatisierte Tests und eine praktische Browserprüfung mit festen Testdaten. Anwendungscode wurde dabei nicht verändert.

## Ergebnis

Das Notebook wirkt nicht nur wegen einzelner Abstände oder Farben inkonsistent. Die eigentliche Ursache ist ein uneinheitliches Bedienmodell:

- Handschrift und eingefügte Elemente haben zwei getrennte Auswahl-Systeme.
- `Text & Elemente` bedeutet gleichzeitig Text einfügen, Text bearbeiten und Elemente auswählen.
- `Verschieben` bedeutet je nach Ziel Blatt verschieben, Element auswählen oder sogar Text bearbeiten.
- Einstellungen öffnen an mehreren unterschiedlichen Stellen und verändern teilweise die Höhe des Editors.
- Neue Inhalte erscheinen häufig an festen Koordinaten statt dort, wo der Nutzer gerade arbeitet.
- Beim Seitenwechsel werden Werkzeug, Zoom und Werkzeugoptionen zurückgesetzt.

Die einzelnen Funktionen bestehen ihre bisherigen Happy-Path-Tests. Als zusammenhängender Schreibfluss ergeben sie aber kein vorhersehbares System.

## Priorität 0: Das Bedienmodell ist widersprüchlich

### 1. Textmodus, Auswahlmodus und Elementmodus sind vermischt

Ein Tippen auf eine freie Stelle erzeugt im Werkzeug `Text & Elemente` immer ein neues Textfeld. Dieselbe Betriebsart dient aber auch dazu, vorhandene Texte, Bilder und PDFs auszuwählen. Es gibt daher keinen einfachen Weg, durch Tippen auf das Blatt nur die aktuelle Auswahl aufzuheben.

Vorhandene Blöcke gelten sowohl im Werkzeug `text` als auch in `move` als bearbeitbar. Dadurch kann das Werkzeug `Verschieben` ein Textfeld fokussieren und die Bildschirmtastatur öffnen, obwohl der Nutzer das Blatt bewegen wollte.

Zusätzlich fokussiert `PageBlock` jedes ausgewählte Textfeld automatisch, sobald es wieder bearbeitbar wird. Im Browser ließ sich das reproduzieren:

1. Textfeld auswählen.
2. Zu `Stift` wechseln: Der Fokus liegt erwartbar auf dem Stift-Knopf.
3. Zu `Text & Elemente` zurückkehren: Der Fokus springt ohne weiteren Tipp wieder in das Textfeld.

Auf dem iPad würde das voraussichtlich die Tastatur erneut öffnen.

Quellen: `components/notebook-canvas.tsx:338-345`, `components/notebook-canvas.tsx:343-345`, `components/notebook-canvas.tsx:366-370`.

### 2. Es gibt zwei unvereinbare Auswahl-Systeme

Das Lasso verwaltet ausschließlich IDs von Freihand-Strichen. Text, Bilder und PDFs werden über `selectedBlock` separat ausgewählt. Daraus entstehen zwei verschiedene Regeln für eine Handlung, die aus Nutzersicht immer „auswählen“ heißt:

- Lasso kann Handschrift und Formen auswählen, aber keine Elemente.
- `Text & Elemente` kann Elemente auswählen, aber keine Handschrift.
- Das Lasso wählt einen Strich nur, wenn alle Punkte vollständig innerhalb des Polygons liegen. Ein teilweise umkreister oder kreuzender Strich wird ignoriert.
- Die Lasso-Auswahl wird beim Werkzeugwechsel nicht gelöscht und kann beim späteren Zurückkehren unerwartet wieder erscheinen.

Quellen: `components/notebook-canvas.tsx:37-45`, `components/notebook-canvas.tsx:127`, `components/notebook-canvas.tsx:147-158`, `components/notebook-canvas.tsx:199-205`, `lib/notebook-geometry.ts:35-38`.

### 3. Neue Inhalte erscheinen an festen, häufig unsichtbaren Stellen

`Einfügen → Textfeld` erzeugt ein Feld immer bei den Notebook-Koordinaten `(100, 120)`. Bilder und PDFs erscheinen immer bei `(70, 80)`. Das Einfügen wechselt anschließend für jeden Blocktyp automatisch zum Werkzeug `text`.

Die Browserprüfung bestätigte:

- Ein Textfeld, das durch Tippen auf das Blatt gesetzt wurde, erschien an der angetippten Höhe. Bei x wurde es bereits durch die feste Obergrenze begrenzt.
- Ein anschließend über `Einfügen → Textfeld` erstelltes Feld erschien bei `left: 10 %` und `top: 8,57 %`, unabhängig vom sichtbaren Arbeitsbereich.

Wenn der Nutzer weiter unten auf einer vergrößerten Seite arbeitet, kann das neue Objekt damit außerhalb des sichtbaren Bereichs entstehen. Das ist die stärkste technische Erklärung für „Sachen poppen an komischen Stellen auf“.

Quellen: `components/notebook.tsx:285-305`.

### 4. Seitenwechsel setzt das Arbeitswerkzeug zurück

Der `NotebookEditor` wird über `key={currentId}` für jede Seite neu gemountet. Werkzeug, Farbe, Stärke, Radieroptionen, Formerkennung und Zoom liegen als lokaler Zustand in dieser Komponente.

Browserbeweis:

- Vor dem Seitenwechsel: `Textmarker`, Zoom `125 %`.
- Nach dem Wechsel von „Algebra 1“ zu „Algebra 2“: `Stift`, Zoom `100 %`.

Das unterbricht besonders beim handschriftlichen Mitschreiben den Fluss. Die bestehende Draft- und Speicherlogik ist davon getrennt und soll erhalten bleiben.

Quellen: `components/notebook.tsx:159`, `components/notebook.tsx:170-200`.

## Priorität 0 bis 1: Popover und Layout wirken zufällig

### 5. Das Zahnrad öffnet ein zu großes Sammelmenü

Ein einziges Menü enthält drei verschiedene Themen:

- Seite in ein Kapitel verschieben
- Papierart ändern
- Ansicht beziehungsweise Zoom ändern

Gemessene Geometrie:

| Ansicht | Auslöser | Menü |
| --- | --- | --- |
| Desktop, 1280 × 900 | 44 × 44 bei x 1184 / y 191 | 208 × 600 bei x 1020 / y 243 |
| Mobil, 390 × 844 | 44 × 44 bei x 326 / y 187 | ca. 198 × 570 bei x 172 / y 231 |

Auf dem Handy liegt das Menü damit über ungefähr der Hälfte des Blatts und reicht bis in den Bereich der unteren App-Navigation. Escape und Tippen außerhalb schließen Radix-Menüs grundsätzlich korrekt; das Problem ist ihre Größe und inhaltliche Mischung.

Beleg: `/tmp/atlas-notebook-mobile-settings-settled.png` und `/tmp/atlas-notebook-settings-popover.png`.

Quelle: `components/notebook.tsx:420-431`.

### 6. Kontext erscheint in drei verschiedenen Mustern

- Beim Lasso erscheint eine zusätzliche 48 Pixel hohe Aktionszeile zwischen Werkzeugleiste und Blatt. Dadurch springt das Blatt nach unten.
- Beim PDF-Import erscheint eine komplette Zeile zwischen Werkzeugleiste und Blatt.
- Beim Umbenennen eines Kapitels erscheint das Formular ganz unten in der Seitenleiste, nicht beim angeklickten Kapitel.

Diese Offenlegungen erfüllen ähnliche Aufgaben, erscheinen aber an drei weit voneinander entfernten Orten. Das erschwert das Lernen der Oberfläche.

Quellen: `components/notebook-canvas.tsx:326-332`, `components/notebook.tsx:127-153`, `components/notebook.tsx:435`.

### 7. Mobile Werkzeuge sind unsichtbar im horizontalen Scrollbereich

Bei 390 Pixel Breite misst der sichtbare Werkzeugbereich 250 Pixel, sein Inhalt aber 332 Pixel. `Text & Elemente` und `Verschieben` liegen außerhalb des sichtbaren Bereichs. Es gibt keinen Verlauf, Pfeil oder `Mehr`-Knopf als Hinweis.

Der vorhandene E2E-Test prüft nur, dass das Dokument selbst nicht breiter als der Viewport ist. Er erkennt deshalb den intern abgeschnittenen Werkzeugbereich nicht.

Beleg: `/tmp/atlas-notebook-mobile.png`.

### 8. Elementgriffe wechseln abhängig von der Position ihren Ort

Der Verschiebegriff erscheint oberhalb des Elements, wenn genug Raum vorhanden ist, sonst innerhalb des Elements. Der Größen-Griff liegt immer unten rechts. Da das Blatt `overflow-hidden` verwendet, verändern Kantenpositionen das Verhalten. Besonders beim Textfeld verdeckt der Griff dann Inhalt.

Quellen: `components/notebook-canvas.tsx:336`, `components/notebook-canvas.tsx:395-406`.

## Bewertung der einzelnen Werkzeuge

### Stift

Der Stift ist ein Kernwerkzeug und technisch am weitesten: Pointer-Druck, koaleszierte Ereignisse und die Übernahme einer Touch-Geste durch den Pencil sind berücksichtigt. Nicht geprüft werden konnte das reale Gefühl auf einem iPad.

Ein technisches Risiko bleibt: Während eines langen Strichs wird der gesamte wachsende Pfad pro Animationsframe neu gezeichnet. Das kann erst bei langen echten Mitschriften auffallen.

Quellen: `components/notebook-canvas.tsx:90-110`, `components/notebook-canvas.tsx:160-193`.

### Textmarker

Der Textmarker ist als primäres Werkzeug sinnvoll. Transparenz und eigene Breiten funktionieren. Unklar ist, warum seine Einstellungen weiterhin `Stiftfarbe und Stärke` heißen und warum auch der Textmarker eine Formerkennung durch Halten besitzt.

### Radierer

Der Radierer ist notwendig, entfernt aber nur vollständige Striche. Er kann weder einen Teil eines Strichs noch Text, Bilder oder PDFs löschen. `Nur Marker` ist eine sinnvolle Zusatzoption, gehört aber nicht in die primäre Hierarchie.

### Formen

Die Formen funktionieren und die Tests decken Linie, Rechteck und Formerkennung ab. Als dauerhaft sichtbares Primärwerkzeug konkurriert der Modus jedoch mit der bereits vorhandenen Formerkennung durch Halten. Formen sollten sekundär erreichbar sein.

### Lasso

Ein Lasso ist sinnvoll, wenn es Handschrift und Elemente gemeinsam auswählen kann. In der heutigen Form ist es unvollständig, erzeugt eine Layoutverschiebung und kann eine alte Auswahl behalten.

### Verschieben

Auf Touch-Geräten verschiebt ein Finger das Blatt bereits in jedem Werkzeug. Dadurch ist die Hand dort weitgehend redundant. Auf Desktop ist eine temporäre Hand sinnvoll, etwa per Leertaste und Ziehen. Der heutige Name kollidiert mit dem Verschieben ausgewählter Elemente.

### Text und Elemente

Dieses Werkzeug verursacht die meiste Verwirrung. Es sollte in zwei klare Handlungen getrennt werden:

- `Text` startet eine Platzierung und danach genau einmal die Texteingabe.
- `Auswahl` wählt Handschrift, Text, Bilder und PDFs, ohne automatisch den Bearbeitungsfokus zu öffnen.

## Priorität 1: Warum es nicht so hochwertig wie die Hauptseiten wirkt

Das Notebook weicht an mehreren Stellen vom vorhandenen Atlas-Designsystem ab:

- Die gemeinsame Klasse `control` fügt immer einen Hover-Hintergrund hinzu, auch bei ausgewählten Werkzeugen und Seiten. Das Designsystem verlangt, dass ausgewählte Zustände stabil bleiben.
- Lasso-Aktionen verwenden eigene `hover:bg-muted`-Klassen ohne die gemeinsamen Interaction-, Press- und Fokuszustände.
- Auswahlrahmen und Elementgriffe verwenden festes Blau, Weiß und Slate statt der semantischen Atlas-Farben. Das bricht besonders im Dunkelmodus.
- Die Hauptseiten arbeiten mit ganzen, verständlichen Klickflächen, stabilen Karten, 150 Millisekunden Interaktionsrhythmus, Fokus-Ringen und gezielten Bewegungen. Das Notebook mischt rohe Buttons mit der Button-Komponente und blendet ganze Zeilen abrupt ein und aus.
- Die Werkzeugleiste ist visuell flach und gleichzeitig dicht. Auf Touch sind die Symbolnamen nicht sichtbar; native `title`-Hinweise helfen nur mit Maus.
- Die Formerkennung meldet ihren Erfolg ausschließlich über einen Screenreader-Status und nicht sichtbar.

Ein hochwertiger Schreibbereich braucht dabei nicht mehr Schmuck. Er braucht weniger Bewegung im Layout, stabilere Positionen, klare Zustände und unmittelbares Feedback.

Quellen: `components/notebook.tsx:21-22`, `components/notebook.tsx:360-405`, `components/notebook-canvas.tsx:142-143`, `components/notebook-canvas.tsx:327-331`, `components/notebook-canvas.tsx:395-406`, `docs/design-system.md:19-27`, `app/globals.css:16-24` sowie als Referenz `components/morgen-panel.tsx:373-387` und `components/morgen-panel.tsx:467-505`.

Außerdem erzeugen `app/hefte/layout.tsx` und `app/hefte/page.tsx` verschachtelte `<main>`-Landmarks.

## Vorgeschlagenes einheitliches Interaktionsmodell

### Stabile Hauptleiste

Die primäre Leiste enthält dauerhaft:

1. Stift
2. Textmarker
3. Radierer
4. Auswahl

Sekundäre Werkzeuge liegen unter `+` oder `Mehr`:

- Text
- Bild oder PDF
- Form

Undo und Redo behalten feste Positionen. Auf 390 Pixel Breite müssen alle vier Hauptwerkzeuge mit echten 44-Pixel-Zielen sichtbar sein.

Die Hand entfällt auf iPad als Hauptwerkzeug, weil ein Finger ohnehin verschiebt und zwei Finger zoomen. Auf Desktop kann Leertaste plus Ziehen oder eine temporäre Hand unter `Mehr` dienen.

### Eine Auswahl für alle Inhalte

Eine Auswahl-Engine behandelt Handschrift und Blöcke gleich:

- Tippen wählt ein Objekt.
- Ziehen mit Lasso wählt mehrere Objekte.
- Tippen auf eine freie Stelle hebt die Auswahl auf.
- Escape hebt die Auswahl auf.
- Delete löscht die Auswahl.
- Verschieben, Duplizieren und Löschen erscheinen in einem stabilen Kontextbereich, der den Canvas nicht nach unten drückt.

Textbearbeitung startet nur nach einer ausdrücklichen Bearbeitungshandlung, etwa Doppeltipp oder `Text bearbeiten`. Auswahl allein öffnet keine Tastatur.

### Platzierungsbewusstes Einfügen

`Text` startet zunächst einen klaren Platzierungszustand. Der nächste Tipp legt das Feld an dieser Stelle ab und fokussiert es genau einmal. Wenn kein Tipp nötig sein soll, wird das Element in der Mitte des gerade sichtbaren Blattbereichs platziert.

Bilder und PDFs werden nach ihrer Vorschau ebenfalls im sichtbaren Bereich oder an einer ausgewählten Position abgelegt. Einfügen darf nicht stillschweigend zu einem überladenen Textmodus wechseln.

### Zustände mit richtiger Lebensdauer

Über Seiten hinweg erhalten bleiben:

- aktives Schreibwerkzeug
- Stift- und Markerfarbe
- Breite
- Radieroption
- Zoom beziehungsweise bevorzugte Ansicht

Beim Seitenwechsel zurücksetzen:

- ausgewählte Objekte
- offene Kontextflächen
- laufender Platzierungsmodus

Die bestehende Draft-Warteschlange, optimistische lokale Speicherung und Konfliktbehandlung bleiben erhalten.

### Einstellungen trennen

- Papier und Kapitel gehören in ein kompaktes Seitenmenü oder auf kleinen Bildschirmen in ein Bottom Sheet.
- Zoom bleibt bei den unteren Ansichtsreglern.
- Kapitel werden direkt in ihrer Zeile umbenannt oder über einen kleinen, daran verankerten Dialog.
- Werkzeugoptionen belegen einen festen Bereich und verändern nicht die Höhe oder den Ursprung des Blatts.

### Designsystem konsequent anwenden

- Globaler 150-Millisekunden-Interaktionsrhythmus.
- Semantische Farben statt festem Blau, Weiß und Slate.
- Hover, Press und Fokus für alle Bedienelemente.
- Ausgewählte Zustände bleiben beim Hover unverändert erkennbar.
- Kontextflächen sind begrenzt, kollisionssicher und kehren nach dem Schließen mit dem Fokus zum Auslöser zurück.
- Keine Werkzeugänderung verschiebt das Blatt.

## Abnahme und Verifikation nach der Umsetzung

1. Viewport-Prüfung bei 390, 768, 834, 1024 und 1280 Pixel: alle Hauptwerkzeuge sichtbar, keine versteckte Werkzeugleiste, stabiler Canvas-Ursprung.
2. Jedes Menü: am Auslöser verankert, kein Überlappen der unteren Navigation, Escape und Außentipp schließen, Fokus kehrt zurück.
3. Textfluss: `Einfügen → Platzieren → einmaliger Fokus`; freier Tipp hebt Auswahl auf; Werkzeugwechsel öffnet die Tastatur nicht erneut.
4. Seitenwechsel erhält Werkzeug, Pinsel und Zoom, löscht aber Auswahl und laufende Platzierung.
5. Gemeinsame Auswahl kann gemischte Handschrift, Text, Bild und PDF auswählen, verschieben, duplizieren und löschen. Undo fasst jede Transformation als einen Schritt zusammen.
6. Reale iPad-Prüfung: Druck, lange Handschrift, Handballen plus Pencil, Finger-Pan bei aktivem Stift, Pinch-Anker und versehentliche Berührungen.
7. Fünfminütiger Schreibtest und lange Striche: keine verlorenen Endpunkte, kein zunehmendes Ruckeln.
8. Hell, Dunkel, reduzierte Bewegung und reine Tastaturbedienung prüfen; alle Touch-Ziele mindestens 44 × 44 Pixel.
9. PDF- und Bildplatzierung samt Fehler und Wiederholen im aktuellen sichtbaren Bereich prüfen; der Canvas darf nicht springen.
10. Bestehende Draft-, Zeichen- und Geometrie-Tests sowie beide Browser-Fixtures erneut ausführen.

## Bereits geprüfte Basis

- `scripts/notebook-editing-e2e.mjs`: bestanden für Radierer, Lasso, Formerkennung, Textplatzierung, Fokus, Wachstum, Undo/Redo, Verschieben, Größe, Löschen, Reload und einfache mobile Breite.
- `scripts/notebook-drawing-e2e.mjs`: bestanden für Stift, Marker, Formen, Undo/Redo, Fixture-Speichern, Reload und einfache mobile Breite.
- Notebook-Unit-Tests: 23 von 23 Tests in Drafts, Drawing und Geometry bestanden.
- Browserkonsole während der vorhandenen Fixture-Tests: keine Seitenfehler.

Diese Tests bestätigen die technische Funktion einzelner Werkzeuge. Sie bestätigen nicht die Verständlichkeit des Gesamtablaufs, die Qualität auf einem echten iPad oder die Performance langer Mitschriften.

## Bildbelege

- `/tmp/atlas-notebook-desktop-baseline.png`
- `/tmp/atlas-notebook-insert-popover.png`
- `/tmp/atlas-notebook-settings-popover.png`
- `/tmp/atlas-notebook-mobile.png`
- `/tmp/atlas-notebook-mobile-insert.png`
- `/tmp/atlas-notebook-mobile-settings-settled.png`
- `/tmp/atlas-hefte-editing.png`
- `/tmp/atlas-hefte-drawing.png`

## Grenzen der Analyse

- Es stand kein physisches iPad mit Apple Pencil zur Verfügung. Druck, Handballenerkennung, Tastaturverhalten und gefühlte Latenz müssen auf echter Hardware geprüft werden.
- Die Browserprüfung nutzte lokale Fixture-Daten und hat keine echten Notebook-Inhalte in Neon verändert.
- Der lokale Entwicklungsserver erzeugte die übliche Änderung an `next-env.d.ts`. Anwendungscode wurde durch die Analyse nicht verändert.
