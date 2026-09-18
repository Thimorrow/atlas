# Notebook: Umbauplan nach UX-Analyse

Stand: 18. September 2026. Grundlage: Sol-Analyse des aktuellen Codes und Browserprüfung; Nutzerfeedback zu unlogischen Abläufen, fehlendem Premium-Gefühl und schlecht nutzbaren Schreibwerkzeugen.

## Ziel

Hefte soll sich wie ein ruhiger, verlässlicher Teil von Atlas bedienen. Jede Aktion hat eine eindeutige Wirkung. Häufige Schreibaktionen bleiben sichtbar, seltene Optionen beanspruchen keinen dauerhaften Platz. Maßstab ist das vorhandene Atlas-Designsystem, nicht ein neuer Stil.

**Präzisierung des Nutzers nach der Analyse:** Es gibt insgesamt zu viele Funktionen und gleiche Aktionen an verschiedenen Orten. Reduktion und Entfernen von Doppelungen sind deshalb vorrangig. Jede Aktion erhält genau einen verständlichen Ort; keine zusätzliche umfangreiche Werkzeuglandschaft als Ersatz.

## 1. Werkzeuge und Auswahl

- Feste Hauptwerkzeuge: Stift, Textmarker, Radierer, Auswahl. Rückgängig/Wiederholen behalten feste Plätze. Alle Hauptwerkzeuge sind bei 390px ohne horizontales Verstecken erreichbar, mit 44px Trefferflächen und verständlichen Namen.
- Text, Bild/PDF und Formen gehören in Einfügen. Formen bleiben als bewusst aktivierter Zeichenmodus verfügbar. Hand/Pan ist eine sekundäre Aktion; Finger verschiebt weiterhin, zwei Finger zoomen. Keine Textbearbeitung im Hand-Modus.
- Auswahl ist ein einheitliches Modell für Striche und Text/Bild/PDF-Blöcke: Anklicken, Einkreisen, Verschieben, Duplizieren, Löschen. Leere Fläche und Escape heben auf. Ein Werkzeugwechsel entfernt alte Auswahl und beendet Textbearbeitung.
- Auswahl allein öffnet keine Tastatur. Textbearbeitung beginnt explizit durch Doppelklick/-tippen oder Bearbeiten. Neu platzierter Text bekommt genau einmal Fokus.
- Ganze Striche radieren bleibt ehrlich beschriftet; Nur Textmarker ist eine nachgeordnete Einstellung. Keine vorgetäuschte Pixelradierung. Formen erhalten einen einzigen bewussten Zugang über Einfügen; automatische Formerkennung durch Halten entfällt im Notebook, damit sich Schreiben und Formen nicht doppeln oder überraschend ineinander wechseln.

## 2. Einfügen und Arbeitszustand

- Text wird ausschließlich durch Einfügen aktiviert und anschließend an der gewünschten Stelle auf dem Blatt platziert. Kein zusätzliches Texterstellungswerkzeug an anderer Stelle. Ein sichtbarer kurzer Hinweis erklärt den nächsten Schritt; Escape bricht ab.
- Bild/PDF wird im sichtbaren Blattbereich platziert oder durch eine explizite Platzierung eingefügt; keine festen Koordinaten oben links. PDF-Auswahl und Fehler erscheinen in einer kohärenten, begrenzten Importoberfläche.
- Stift-/Markerfarbe, Breite, Radiereroptionen, letzter Arbeitsmodus und Zoom bleiben beim Seitenwechsel erhalten. Auswahl, laufende Gesten, Textfokus und offene Dialoge sind seitenbezogen und werden zurückgesetzt.
- Bestehende Entwurfswarteschlange, lokales Sichern, sofortige UI-Aktualisierung und Konfliktbehandlung bleiben erhalten.

## 3. Ruhiges Layout und Menüs

- Werkzeugoptionen und Auswahlaktionen verwenden einen festen Bereich. Kein zusätzlicher Lasso-Balken, der die Blattposition verschiebt.
- Papier/Kapitel sind Seiteneinstellungen; Zoom bleibt ausschließlich bei den Ansichtssteuerungen. Doppelte Zoom-Menüpunkte entfallen. Werkzeugoptionen haben jeweils einen einzigen Zugang. Menüs bleiben im sichtbaren Bereich. Auf kleinen Displays erhalten komplexe Einstellungen eine begrenzte, zugängliche Oberfläche statt einer überlangen Liste.
- Kapitel umbenennen erscheint direkt beim Kapitel oder in einem klaren Dialog; nicht am anderen Ende der Seitenleiste.
- Menü-/Dialogbedienung: Escape, Außenklick sofern angemessen, sauberer Fokusrücksprung, keine verdeckten Kernaktionen.

## 4. Atlas-Qualität

- Erneute ausdrückliche Nutzeranforderung: Die bisherige Typografie wirkt kaputt. Schriftfamilie, Größen, Gewichte, Zeilenhöhen und Abstände müssen als zusammenhängende Hierarchie an den ersten Atlas-Seiten ausgerichtet und im Browser überprüft werden; nur Serif zu entfernen reicht als Abnahme nicht aus.
- Bestehende Geist-Typografie, semantische Farben, Abstände und Flächen übernehmen. Notebook-Chrome erhält keine eigenständige Serif-/Slate-/Blau-Gestaltung. Weißes Papier und tatsächliche Stiftfarben bleiben Dokumentinhalt.
- Einheitliches Hover-/Press-/Focus-Feedback gemäß docs/design-system.md. Aktive Auswahl bleibt beim Hover erkennbar. Keine zusätzlichen Effekte auf häufigen Schreibgesten.
- Objektgriffe und Kontextaktionen verwenden dieselben Tokens und verständliche Zustände wie der Rest der App. Light/Dark und reduzierte Bewegung prüfen.
- Doppelte main-Landmarks korrigieren. Werkzeugnamen auch ohne Maus verständlich halten.

## Umsetzung und Prüfgrenzen

Ein neuer Sol-Agent implementiert den Plan zusammenhängend. Vor Änderungen die relevanten lokalen Next.js-Dokumente lesen. Vorhandene fremde Änderungen an README.md, package.json und desktop/ erhalten. Kein Commit, Push oder Deployment beauftragt.

Prüfung: Typecheck; relevante Notebook-Unit-Tests; bestehende Zeichnungs-/Bearbeitungs-Browsertests an neue bewusste Abläufe anpassen; neue Regressionen für gemischte Auswahl, Textplatzierung/Fokus, Seitenwechsel, stabile Toolbar, Menüs und kleine Displays. Browserdaten sind Fixtures, keine echten Hefte. Desktop, 390px, Tablet, Dark Mode, Tastatur, reduzierte Bewegung und lange Striche prüfen. Keine reale Apple-Pencil-/Server-Synchronisation behaupten, wenn nur simuliert geprüft.

Ausgangszustand: Typecheck bestanden; 23 Tests für Entwürfe, Zeichnen und Geometrie bestanden; Sol meldet beide vorhandenen Browser-Skripte bestanden. Abschluss erfordert zusätzliche Prüfung der neuen Abläufe und sichtbare Kontrolle des Ergebnisses.

## Ergebnis der Umsetzung und Abnahme

Der neue Sol-Agent hat die Anwendung umgesetzt; der Hauptagent hat die Änderungen unabhängig im Browser überprüft und `scripts/notebook-ux-e2e.mjs` ergänzt. Vier benannte Hauptwerkzeuge, ein gemeinsames Auswahlmodell, bewusste Text-/Medienplatzierung, erhaltene Werkzeugeinstellungen beim Seitenwechsel, ein einzelner Zoom-Zugang, direkte Kapitelumbenennung und Geist-Typografie sind umgesetzt. PDF-Import verwendet einen nativen Modal-Dialog mit Escape und Fokusrückkehr.

Bestanden: 25 relevante Unit-Tests; Typprüfung; die angepassten Zeichnungs- und Bearbeitungs-Browsertests; der neue UX-Test mit sechs Breiten von 320 bis 1280 Pixeln, tatsächlicher Sichtbarkeit von Tinte über einem undurchsichtigen Bild, gemischter Auswahl/ Duplizieren/Undo, Texteingabe und Fokus, Menügrenzen, PDF-Dateiauswahl und Dialogbedienung, Dark Mode und reduzierter Bewegung. Die geprüften Daten waren lokale Browser-Fixtures.

Grenzen: Kein physisches iPad-/Apple-Pencil-Gerät geprüft, keine reale geräteübergreifende Serversynchronisation oder längere Schreib-Lastmessung bestätigt. Die visuelle Nähe zur vorhandenen Atlas-Gestaltung wurde auf Desktop und Mobil kontrolliert; das subjektive Schreibgefühl bleibt am echten Gerät zu beurteilen.
