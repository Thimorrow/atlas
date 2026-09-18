# Atlas: vollständige Funktionslandkarte

Stand: 18. September 2026
Untersuchter Stand: Commit `df9ad46` auf Branch `codex/vokabeln-verbessern`, vor der anschließenden visuellen Überarbeitung des Vokabelbereichs. Die folgenden Dateizeilen beziehen sich auf diesen Analysestand.

## 1. Was Atlas in einfachen Worten ist

Atlas ist ein persönlicher Schulplaner für einen einzelnen Schüler. Die Webanwendung verbindet sechs große Arbeitsbereiche:

1. **Stundenplan und aktuelle Stunde** aus WebUntis
2. **Aufgaben und Prüfungen** mit Fälligkeit, Erledigt-Status und Bearbeitung
3. **Fächer** mit Notizen, Dateien, Noten, Lehrplan und OneNote-Verknüpfung
4. **Hefte** mit Seiten, Kapiteln, Freihandzeichnung, Text, Bildern und PDF-Seiten
5. **Lernen** mit allgemeinen Karteikarten, Themen, KI-Tutor und Prüfungslernplänen
6. **Vokabeln** als eigener Sechs-Boxen-Lernkasten für Latein und Englisch

Ein Atlas-Bot liegt über diesen Bereichen. Er kann Daten lesen und bestimmte Dinge wie Aufgaben, Notizen und Lernkarten anlegen oder ändern. Die Daten liegen überwiegend in PostgreSQL; hochgeladene Dateien liegen in Vercel Blob. Einige Entwürfe und persönliche Anzeigeoptionen werden zusätzlich im Browser gespeichert.

Die Anwendung ist **keine Mehrbenutzerplattform**. Es gibt keine Rollen wie Schüler, Lehrer oder Administrator. Ein gemeinsames Passwort-Gate schützt die gesamte Installation; danach arbeitet jeder Zugriff mit demselben Datenbestand. Belegt ist das in `lib/gate.ts:1-14`, `proxy.ts:11-49` und `lib/db/schema.ts:284-311`.

## 2. So ist diese Landkarte zu lesen

- **Im Code bestätigt** bedeutet: Oberfläche, API und/oder Speicherung sind im untersuchten Branch direkt vorhanden.
- **Praktisch geprüft** bedeutet: in diesem Durchgang wirklich gestartet und bedient.
- **Unklar oder fehlend** bedeutet: im Code nicht auffindbar, nur teilweise umgesetzt oder ohne aktuelle Laufzeitprüfung.

In diesem Durchgang wurden alle **21 Seiten**, **70 API-Routendateien**, **106 exportierten HTTP-Handler** und **60 TSX-Dateien unter `components/` (einschließlich einer Testkomponente)** inventarisiert. `node_modules` und `.env.local` fehlen in diesem Worktree. Deshalb wurde die App nicht gestartet und keine echte Datenbank, kein WebUntis, kein Microsoft-Konto, kein Blob-Speicher und kein KI-Anbieter angesprochen. Es gab bewusst keine private oder externe Datenänderung. Die Prüfung ist vollständig auf Codeebene, aber keine aktuelle End-to-End-Laufzeitfreigabe.

Die in `AGENTS.md` erwähnte lokale Next.js-Dokumentation unter `node_modules/next/dist/docs/` war wegen des fehlenden `node_modules`-Ordners nicht verfügbar. Da hier kein Next.js-Produktcode geändert wurde, war keine Installation nötig.

## 3. Zugang, Rahmen und Navigation

### Passwort-Gate

- Ohne `ATLAS_PASSWORD` ist Atlas offen, was für lokale Entwicklung gedacht ist.
- Mit Passwort werden alle Seiten außer `/login`, statischen Next-Dateien und `/api/login` durch `proxy.ts` geschützt.
- Nicht angemeldete Seitenaufrufe werden mit dem ursprünglichen Ziel als `?weiter=` nach `/login` geleitet; API-Aufrufe erhalten `401` als JSON.
- Das Login hat genau ein Passwortfeld und einen Anmeldeknopf. Fehler sind unter anderem falsches Passwort, Rate-Limit und fehlende Serververbindung. Nach Erfolg wird per vollständigem Seitenwechsel zum geprüften internen Ziel gewechselt (`app/login/page.tsx:12-49`).
- Das Cookie ist HMAC-signiert, `httpOnly`, `sameSite=lax`, in Produktion `secure` und ein Jahr gültig. Pro Prozess/IP gelten höchstens zehn Loginversuche in zehn Minuten (`app/api/login/route.ts:11-95`).
- `/api/session` nennt Gate-Status und Ablaufzeit. Die Weboberfläche benutzt diese Route derzeit nicht sichtbar; die Android-App erwähnt sie als noch nicht ausgerollten Vertrag (`app/api/session/route.ts:8-33`, `android/app/src/main/java/dev/atlas/schule/data/AtlasApi.kt:98-103`).

### Desktop-Navigation

Die feste Sidebar enthält diese direkten Ziele: Stundenplan, Stunde, Aufgaben, Fächer, Hefte, Lernen und Vokabeln. Zusätzlich gibt es optional das Namensschild, den Bot-Auslöser „Atlas fragen“ und im Profilmenü Einstellungen (`components/app-sidebar.tsx:34-47`, `components/app-sidebar.tsx:273-399`).

Bedienelemente der Sidebar:

- ein- und ausklappen; Zustand wird in einem Cookie gespeichert;
- Breite von 180 bis 420 Pixel ziehen, per Pfeiltasten ändern, mit `Home` oder Doppelklick auf 248 Pixel zurücksetzen;
- Atlas-Logo anklicken;
- Bot per Button oder `⌘K` öffnen;
- Profilmenü mit fest eingeblendeten persönlichen Angaben und Link zu Einstellungen.

### Mobile Navigation

Die untere Leiste zeigt Plan, Stunde, Aufgaben, Hefte und Lernen. „Mehr“ öffnet Bot, Fächer, optional Namensschild und Einstellungen (`components/mobile-header.tsx:30-64`). Ein eigener direkter Vokabel-Tab fehlt mobil; Vokabeln sind über Lernen erreichbar.

### Globaler Bot

Ein schwebender Bot-Knopf beziehungsweise `⌘K` öffnet ein Dialogpanel. Das Panel kann geschlossen werden, einen neuen Chat beginnen oder den Verlauf öffnen (`components/bot-launcher.tsx:35-198`). `/bot` bietet denselben Chat als eigene Seite.

## 4. Vollständiger Seitenkatalog

### 4.1 `/` – Stundenplan und Fokus

**Zweck:** Wochenplan oder automatisch gewählter Fokus-Tag. Auf schmalen Bildschirmen ist Fokus die Vorgabe; eine gemerkte oder per URL gesetzte Wahl hat Vorrang (`app/page.tsx:428-446`).

**Sichtbare Funktionen:**

- zwischen **Woche** und **Fokus** wechseln;
- vorige/nächste Woche und „Heute“ wählen;
- Stunden als Blöcke mit Zeit, Fach, Raum/Lehrer, Entfall/Vertretung und Markern für Notiz, Aufgabe und Meldung ansehen;
- einen Stundenblock öffnen und aus seinem Menü Hausaufgabe, Prüfung, Stundennotiz oder Meldungszähler starten;
- fällige Aufgaben als Punkte im Tag und als Zeile sehen;
- im Fokus laufende/nächste Stunden, fällige Aufgaben, Prüfungen, heutige Lerneinheiten sowie Materialien der Tagesfächer sehen;
- Lerneinheiten direkt abhaken und zu Fach/Lernplan/Stunde springen.

**Daten und Speicherung:** Kalender, offene Aufgaben und Fächer werden getrennt mit clientseitigem Cache geladen. WebUntis wird beim Laden und in festgelegten Zeitfenstern im Hintergrund synchronisiert. Ein Fehlschlag lässt vorhandene Daten stehen, zeigt einen Hinweis und sperrt automatische Wiederholungen fünf Minuten; manuelles Wiederholen bleibt möglich (`app/page.tsx:458-560`). Der Fokus-Tag wird serverseitig aus heute, noch anstehenden Stunden und einem 14-Tage-Ausblick bestimmt (`app/api/morgen/route.ts:69-194`).

**Zustände:** Skelett beim Erstladen, unterscheidbarer Ladefehler mit „Erneut versuchen“, „Keine Daten“, alter Datenstand mit Auffrischhinweis und Untis-Sync-Hinweis.

### 4.2 `/stunde` – Stunden-Cockpit

**Zweck:** die gerade laufende, nächste, letzte oder bewusst über `?block=` gewählte Stunde in einem Arbeitsbildschirm bündeln (`components/stunden-cockpit.tsx:43-113`).

**Sichtbare Funktionen:**

- Tagesleiste zum Wechseln zwischen den Stunden;
- Status „Läuft“, „Beginnt“ oder „Vorbei“, Restzeit und bei laufender Stunde Fortschrittsbalken;
- Raum und Lehrkraft;
- Link zur nächsten Prüfung im Lernbereich;
- „Fällig jetzt“: Aufgaben optimistisch abhaken;
- „Heute lernen“: Lernplan-Einheiten abhaken oder öffnen;
- letzte Stundennotiz aufklappen und aktuelle Notiz mit Autosave schreiben;
- Meldungen mit Minus/Plus erfassen; explizit „Da gewesen, keine Meldung“ oder „Erfassung löschen“;
- Hausaufgabe für die nächste Fachstunde schnell anlegen;
- Fachdateien hochladen, ansehen, herunterladen oder löschen.

Das Cockpit lädt jede Minute neu und reagiert auf Stundenwechsel. Gibt es heute keine wählbare Stunde, zeigt es einen ruhigen Leerzustand und den Link zum Stundenplan (`components/stunden-cockpit.tsx:68-168`).

### 4.3 `/aufgaben` – Aufgaben und Prüfungen

**Zweck:** eine gemeinsame Datenquelle, aber zwei Ansichten „Offen“ und „Prüfungen“ (`app/aufgaben/page.tsx:34-203`).

**Offene Aufgaben:**

- schnelle Hausaufgabe über Titelfeld anlegen;
- beim Fokus des Felds Fach, Schnelltermine, eigenes Datum und „Mehr Optionen“ einblenden;
- ausführlicher Dialog mit Typ Hausaufgabe/Sonstiges, Fach, Titel, Fälligkeitsdatum und Notiz;
- Aufgaben nach überfällig/heute/demnächst/ohne Termin gruppieren;
- abhaken und wieder öffnen;
- Zeilenmenü „Bearbeiten“ und „Löschen“;
- erledigte Aufgaben über einen Schalter ein- oder ausblenden.

**Prüfungen:**

- Klassenarbeit, Test oder Referat anlegen;
- Fach, Titel, Termin und Notiz erfassen;
- kommende Prüfungen nach Nähe darstellen;
- vorhandenen Lernplan öffnen oder einen neuen Plan starten;
- Lernplan-Einheiten und Sicherheit einsehen.

**Zustände:** Lade-Skelett, Teilfehler mit bestehender Liste, vollständiger Fehler mit Retry, „Nichts offen“, leere Prüfungsansicht und Formularfehler. Formulare bleiben bei einem Speicherfehler offen (`components/assignment-composer.tsx:170-193`).

### 4.4 `/faecher` – Fächerübersicht

**Zweck:** aktive oder archivierte Fächer mit Notenüberblick und letzten Noten anzeigen.

**Bedienelemente:**

- aktive/archivierte Fächer umschalten;
- Fächer aus bereits importiertem Untis-Stundenplan abgleichen;
- manuelles Fach anlegen mit Name, optional Lehrer und Raum sowie Farbe;
- bei noch nie angelegten Fächern Kandidaten aus dem Stundenplan auswählen, alle an/abwählen und speichern;
- Karten öffnen das Fachdetail;
- Gesamtpunkteschnitt und zuletzt eingetragene Noten ansehen.

Der Abgleich schreibt nicht nach WebUntis, sondern normalisiert vorhandene Stunden und gleicht daraus Atlas-Fächer ab (`app/api/subjects/reconcile/route.ts:9-23`).

### 4.5 `/faecher/[id]` – Fachdetail

**Kopf und Stammdaten:** Fachname, Farbe, Lehreranrede, Lehrer, Raum, nächster Termin und Punkteschnitt. Das Menü öffnet „Bearbeiten“, „Archivieren/Wieder aktivieren“ und endgültiges Löschen. Textfelder speichern beim Verlassen des Felds optimistisch; bei Fehler wird der jeweilige alte Wert zurückgesetzt (`components/subject-detail.tsx:187-290`, `components/subject-detail.tsx:704-816`).

**Tabs und ihre Funktionen:**

- **Übersicht:** nächste Stunden, offene Aufgaben, Schnellanlage, Lehrplan und Noten-/Meldungszusammenfassung.
- **Noten:** mündlich/schriftlich gewichten; Note mit 0–15 Punkten, Bezeichnung, Datum und Gewicht 0/1/2 anlegen; Note löschen; Gruppen- und Gesamtschnitt sehen; Rechner „Was brauche ich noch?“ mit Zielpunkten, nächster Art und Gewicht.
- **Aufgaben:** Hausaufgabe oder Prüfung anlegen, bearbeiten, abhaken und löschen; leere Liste wird erklärt.
- **Notizen:** Fach- und Stundennotizen in einer Chronik; Suche; lesen; neue Fachnotiz; Titel/Text bearbeiten; Löschen mit rückgängig machbarer Toast-Phase; bei eingerichteter Verbindung an OneNote senden.
- **Material:** Dateien und OneNote-Zielabschnitt.

**Lehrplan:** Markdown anzeigen/bearbeiten, NRW-G9-Vorlage laden, auf Vorlage zurücksetzen oder Inhalt entfernen. Der Text wird escape-first gerendert (`components/subject-detail.tsx:875-1069`, `lib/markdown.ts`).

**Dateien:** bis zu einer begrenzten Anzahl gleichzeitig auswählen oder ablegen; maximal drei Uploads parallel; einzelne Fehlschläge wiederholen oder verwerfen; Vorschau für Bilder, PDF und DOCX; Download; Löschen mit Bestätigung. Fehlt der Blob-Token, erscheint ein neutraler Einrichtungshinweis (`components/subject-files.tsx:46-507`). DOCX wird im Browser in einem isolierten Frame gerendert (`components/docx-preview.tsx:17-105`).

### 4.6 `/hefte` – digitale Fachhefte

**Einstieg und Struktur:**

- Fach auswählen;
- Inhaltsleiste auf Desktop ein-/ausblenden und mobil öffnen;
- Seiten nach Titel suchen;
- nach Reihenfolge oder letzter Bearbeitung sortieren;
- Kapitel ein-/ausklappen, auswählen, anlegen und umbenennen;
- Seite in einem Kapitel oder „Ohne Kapitel“ anlegen;
- zwischen Seiten wechseln (`components/notebook.tsx:22-163`).

**Seiteneditor:**

- Seitentitel direkt ändern;
- Papier Blanko, liniert oder kariert;
- Seite in ein anderes Kapitel verschieben;
- Werkzeuge Stift, Radierer, Auswählen und Blatt verschieben;
- Stiftfarben Schwarz, Blau, Rot und Grün sowie Fein/Mittel/Breit;
- Rückgängig/Wiederholen für bis zu 50 Inhaltsstände;
- Textfeld einfügen, automatisch fokussieren, verschieben, skalieren und löschen;
- Bild hochladen und als Block einsetzen;
- PDF öffnen, einzelne PDF-Seite wählen und einsetzen;
- Blatt zwischen 50 und 250 Prozent zoomen, auf 100 Prozent zurücksetzen, mit zwei Fingern zoomen und mit einem Finger verschieben;
- Freihandstriche mit Pointer-Druck speichern; Radierer entfernt ganze berührte Striche (`components/notebook.tsx:168-402`, `components/notebook-canvas.tsx:10-296`).

**Speicherverhalten:** Jede Änderung landet zuerst in `localStorage`, danach nach 700 ms seriell auf dem Server. Online-Rückkehr, Tab-Verbergen und Komponentenabbau lösen einen weiteren Speicherungsversuch aus. `expectedUpdatedAt` verhindert unbemerktes Überschreiben zwischen Geräten. Bei `409` kann der Nutzer Serverstand oder eigenen Entwurf wählen (`lib/notebook-drafts.ts:14-92`, `components/notebook.tsx:214-258`, `components/notebook.tsx:329-342`).

**Fehlende sichtbare Aktionen:** Eine Heftseite kann über die API gelöscht werden, im untersuchten UI gibt es dafür keinen Knopf. Kapitel können weder in der UI noch über einen DELETE-Handler gelöscht werden. Marker, Formen, Lasso und Teilradierer sind im aktuellen Branch nicht vorhanden; der sichtbare Radierer entfernt ganze Striche.

### 4.7 `/lernen` – Lernübersicht

**Zweck:** heutige Karten, nahe Prüfungen und alle Fächer bündeln.

- Kopf zeigt Anzahl/geschätzte Minuten heute und heute bereits gelernte Karten;
- „Heute“-Einträge führen direkt in eine auf Thema begrenzte Sitzung;
- Prüfungen zeigen Fach, Termin, Themenbereitschaft und Aktionen „Lernen“ und „Probe“;
- ohne Themen führt „Themen festlegen“ zum Fach;
- alle Fächer zeigen fällige Karten und Bereitschaft;
- eine eigene prominente Karte führt zum separaten Vokabelkasten (`app/lernen/page.tsx:5-22`, `components/lernen-uebersicht.tsx:42-262`).

### 4.8 `/lernen/[subjectId]` – Lernfach

- Lernart automatisch oder manuell auf Aufgaben, Vokabeln, Wissen oder Texte setzen;
- Fortschritt in neu, lernend, sicher und fällig sehen;
- normale Lernrunde oder „Schwache üben“ starten;
- Themen mit Prüfungszuordnung und Bereitschaft öffnen;
- Karten ohne Thema unter „Allgemein“ öffnen;
- neues Thema anlegen, optional einer bevorstehenden Prüfung zuordnen (`components/lernen-fach.tsx:91-258`, `components/lernen-fach.tsx:291-401`).

### 4.9 `/lernen/[subjectId]/themen/[topicId]` – Lernthema

Für echte Themen stehen Titel, Prüfungszuordnung, Lernzettel und Tutor bereit. `topicId=allgemein` zeigt Karten ohne Thema und hat keinen eigenen Titel/Lernzettel.

**Bedienelemente:**

- Thementitel bearbeiten und Prüfung zuordnen;
- Lernen oder Probe für genau dieses Thema starten;
- neue Tutor- oder Probe-Session starten, vorhandene Sessions öffnen oder nach Bestätigung löschen;
- Lernzettel als Markdown bearbeiten oder per KI aus Notizen, Dateien, Lehrplan oder allem erzeugen;
- Quellen auf einzelne Notizen/Dateien beschränken;
- Karten per KI erzeugen: Quelle, Art automatisch/Frage/Vokabel/Aufgabe und Anzahl 8/12/20;
- einzelne Karte manuell schreiben;
- Karten aufklappen, bearbeiten, einem anderen Thema zuordnen und endgültig löschen (`components/lernen-thema.tsx:116-1237`, `components/lernen-quellen.tsx:56-205`).

### 4.10 `/lernen/[subjectId]/session` – allgemeine Kartensitzung

Queryparameter begrenzen die Sitzung auf `thema`, `pruefung` und optional eine Lernplan-`einheit`; `modus` ist `lernen`, `schwach` oder `probe` (`app/lernen/[subjectId]/session/page.tsx:6-24`).

**Auswahl der Karten:**

- Lernen: fällige Karten zuerst, dann neue; maximal 20. Wenn nichts fällig ist, werden schwächste Karten angeboten.
- Schwach: viele Fehler zuerst, dann niedrige Box und alte Fälligkeit; maximal 20.
- Probe: alle aktiven Karten deterministisch nach Tagesdatum gemischt; maximal 25 (`lib/lernen.ts:119-157`).

**Je Kartenart:**

- Wissen: Antwort aufdecken, optional eigene Antwort vom KI-Modell prüfen lassen, gewusst/nicht gewusst.
- Aufgabe: Lösung aufdecken, eigene Lösung prüfen, gewusst/nicht gewusst, ähnliche Aufgabe per KI erzeugen.
- Vokabel: Antwort eintippen; normalisierte exakte Varianten werden automatisch richtig erkannt, sonst entscheidet der Nutzer manuell. Die Richtung Deutsch/Fremdsprache ist stabil pro Karten-ID gemischt (`components/lernen-session.tsx:58-67`, `components/lernen-session.tsx:1248-1335`).

**Gemeinsame Aktionen:** Erklärung streamen, Tutor zu dieser Karte öffnen, Karte bearbeiten oder archivieren, Tastenkürzel nutzen, Fortschritt sehen, falsche Karten erneut lernen. Antworten werden sofort weitergeschaltet und im Hintergrund gespeichert; ein Fehlschlag erscheint als Toast, aber die lokale Ergebniszählung wird in dieser allgemeinen Sitzung nicht zurückgerollt (`components/lernen-session.tsx:176-203`). Eine abgeschlossene Lernplan-Einheit wird automatisch abgehakt; bei Netzfehler einmal wiederholt und danach sichtbar als Fehler gemeldet.

### 4.11 `/lernen/[subjectId]/tutor` – KI-Tutor und Probe

Ohne `thema` oder `pruefung` erscheint „Kein Thema angegeben“. Der Tutor kann für ein Thema, eine Karte, eine Lerneinheit oder als Simulation eines ganzen Prüfungsplans gestartet werden (`app/lernen/[subjectId]/tutor/page.tsx:9-55`).

**Funktionen:**

- gespeicherte Session fortsetzen oder neue Session anlegen;
- gestreamte Tutorantworten und Status sehen;
- Auswahlfragen mit Einfach-/Mehrfachauswahl oder Freitext beantworten;
- Quick-Aktionen „Überspringen“, „Erklären lassen“, „Verstanden“;
- Stream stoppen und nach Unterbrechung fortsetzen;
- Checkliste auf- und zuklappen;
- Session mit „Beenden“ in ein Fazit führen;
- Fazit mit Stärken, Lücken, Punktzahl/Prozent/Note und bei Simulation punktweisem Ergebnis;
- vorgeschlagene Karten aus den Lücken anlegen;
- erneut üben (`components/lernen-tutor.tsx:115-943`).

Der Server speichert Gespräch, Nachrichten, Werkzeuge, Checkliste und Fazit. Antworten kommen als NDJSON-Ereignisse `status`, `text`, `widget`, `checkliste`, `fazit`, `error`, `done`. Ein Turn ist auf rund 115 Sekunden Clientzeit begrenzt; Unterbrechung erhält den Verlauf.

### 4.12 `/lernen/[subjectId]/plan/[assignmentId]/neu` – Lernplan erstellen

Der Assistent besteht aus drei Schritten (`components/lernplan-erstellen.tsx:590-644`):

1. **Material:** Checkliste als hochgeladene PDF/Bilddatei, vorhandene Fachdatei oder eingefügter Text; weitere Blätter wählen; KI liest Checkliste und erkennt Lernpunkte.
2. **Punkte prüfen:** Titel, Details, Seiten, Dateien und Zeitschätzung je Punkt bearbeiten; Punkte hinzufügen, löschen, zwei Punkte zusammenlegen und per Toast rückgängig machen; Zeitbudget für Schultag und Wochenende von 10 bis 240 Minuten setzen.
3. **Diagnosetest:** erkannte Fragen beantworten, per KI bewerten, Ergebnis prüfen und Plan erzeugen.

Maximal 20 Punkte sind erlaubt. Ein vorhandener Plan zu derselben Prüfung wird ausdrücklich als Ersetzung behandelt. Lokale Entwürfe bleiben über Reload/Schrittwechsel erhalten und werden nach erfolgreicher Anlage markiert, damit Reload nicht versehentlich einen zweiten Plan erzeugt (`components/lernplan-erstellen.tsx:215-403`). Der Plan verteilt Phasen Lernen, Üben, Probe und Simulation auf verfügbare Tage und berücksichtigt Schul-/Wochenendbudget (`lib/lernplan.ts:61-299`).

### 4.13 `/lernen/[subjectId]/plan/[assignmentId]` – Lernplan ausführen

Die Planseite zeigt Prüfung, verbleibende Tage, Gesamtfortschritt, Sicherheit und Tages-/Punktstruktur. Sichtbare Aktionen aus `components/lernplan-seite.tsx` und `components/lernplan-ui.tsx`:

- heutige und überfällige Einheiten öffnen oder abhaken;
- Kartenübung, Tutor, Probe und Simulation je Phase starten;
- Ergebnis einer Einheit erfassen;
- Sicherheit je Punkt sehen und teilweise selbst ändern;
- Blätter/Dateien eines Punkts öffnen;
- Karten für noch offene Punkte erzeugen und Queue-Fehler wiederholen;
- überfällige oder alle offenen Einheiten neu verteilen;
- Zeitbudget ändern und Plan neu rechnen;
- Plan neu erstellen oder löschen.

Die Datenbank hält Plan, Punkte, Diagnosetest-Fragen und datierte Einheiten getrennt (`lib/db/schema.ts:541-657`).

### 4.14 `/lernen/vokabeln` – separater Vokabelkasten

Dieser Bereich wird in Kapitel 5 vollständig beschrieben. Er ist technisch und fachlich vom allgemeinen Lernkartenmodell getrennt.

### 4.15 `/bot` – Atlas-Bot als Seite

Kopf mit Verlauf und „Neuer Chat“, darunter derselbe Chat wie im Overlay (`app/bot/page.tsx:1-32`). Der Chat:

- lädt kontextabhängige Begrüßung und Vorschlagschips;
- bewahrt aktuellen Gesprächsstand und Texteingabe lokal über Schließen, Reload und Navigation;
- streamt Denken, Text, Status und Werkzeugergebnisse;
- kann einen laufenden Stream abbrechen;
- zeigt Aktionen als Karten;
- kann angelegte/geänderte Aufgabe oder Notiz rückgängig machen;
- zeigt Notenvorschläge, die ausdrücklich eingetragen oder verworfen werden müssen;
- zeigt Lade-, Verbindungs-, Abbruch- und Maximalrundenfehler (`components/bot-chat.tsx:195-985`).

Der Bot darf Stundenplan, Aufgaben, Fächer, Notizen, Noten, Lehrplan, Dateien, aktuelle Stunde, Lernstand und Lernpläne lesen. Er darf Aufgaben und Fachnotizen anlegen/ändern sowie Lernkarten erzeugen/anlegen. Er hat **kein Löschwerkzeug**. Noten werden nur vorgeschlagen und brauchen UI-Bestätigung (`lib/bot/tools.ts:1-412`).

### 4.16 `/bot/verlauf` – Gesprächsliste

Listet nichtleere Gespräche mit Titel, Zeitpunkt und Kennzeichen „hat etwas angelegt“. Eine Zeile öffnet das Detail. Zustände: Skelett, leer, Ladefehler (`app/bot/verlauf/page.tsx:19-162`). Ein sichtbarer Retry fehlt im Fehlerzustand.

### 4.17 `/bot/verlauf/[id]` – Gesprächsdetail

Zeigt gespeicherte Nutzerfragen, Botantworten und Schreibaktionskarten. Bei zwischenzeitlich gelöschten Ergebnissen wird der Zustand als nicht mehr vorhanden markiert. Zustände: Laden, nicht gefunden, Fehler, Inhalt (`components/bot-verlauf-detail.tsx:21-127`). Diese Ansicht ist nur lesend.

### 4.18 `/settings` – Einstellungen und Integrationen

- Darstellung auf Hell, Dunkel oder System stellen;
- Link zur internen Designsystem-Seite;
- Namensschild in der Navigation ein-/ausblenden;
- WebUntis für das Standardfenster „letzte Woche bis in drei Wochen“ synchronisieren;
- Sync-Ergebnis mit geladenen/aktualisierten Stunden, Zeitraum und Hinweis sehen;
- einen Tag live und **lesend** zwischen Untis und Atlas vergleichen;
- genau die Woche des Prüftags nachladen;
- Microsoft/OneNote verbinden, Kontoinfo sehen und Verbindung trennen (`app/settings/page.tsx:126-656`, `components/microsoft-connection.tsx:32-145`).

Die Konto-Sektion behauptet derzeit „keine Anmeldung nötig“ und bietet kein Abmelden, obwohl ein Passwort-Gate und `DELETE /api/login` existieren. Das ist eine erkennbare Inkonsistenz zwischen Text/UI und Zugriffsschicht.

### 4.19 `/namensschild` – Klassen-Namensschild

- Name bis 40 Zeichen eingeben; sofort lokal speichern;
- auf „Thimofej“ zurücksetzen;
- nativen Vollbildmodus starten;
- wenn die Fullscreen-API fehlt oder ablehnt, eigenes Vollbild-Overlay verwenden;
- Vollbild schließen (`app/namensschild/page.tsx:18-139`).

Sichtbarkeit in der Navigation und Name sind nur gerätelokal gespeichert.

### 4.20 `/login` – Zugang

Siehe Passwort-Gate in Kapitel 3. Es ist eine Vollbildfläche über dem normalen Layout; Navigation ist dadurch nicht bedienbar (`app/login/page.tsx:51-100`).

### 4.21 `/design-system` – interne Referenz

Zeigt Buttonvarianten samt deaktiviertem Zustand sowie Beispieloberflächen. Die Seite ist aus Einstellungen verlinkt, aber kein Fachmodul (`app/design-system/page.tsx:1-50`).

## 5. Vokabelbereich: vollständiger Ablauf

### 5.1 Einstieg und Trennung

`/lernen/vokabeln` lädt den eigenständigen `VokabelBereich`. Startsprache ist Latein. Die Umschaltung Latein/Englisch setzt Abschnitt und Suche zurück. Latein wird nach **Lektionen**, Englisch nach **Buchseiten** gruppiert (`components/vokabeln/bereich.tsx:44-98`, `lib/vokabeln.ts:29-31`).

Das Modell ist unabhängig von allgemeinen `study_cards`: eigene Tabelle `vokabeln`, Boxen 1–6, eigener Revisionszähler und eigener eindeutiger Schlüssel Sprache + Abschnitt + Wort + Deutsch (`lib/db/schema.ts:680-689`, `drizzle/0022_vokabeln.sql:1-11`).

### 5.2 Übersicht

**Ohne Karten:** Erklärung, dass ein Foto geladen, automatisch gelesen und danach geprüft wird; Knopf „Foto auswählen“.

**Mit Karten:**

- Abschnittskarten zeigen Lektion/Seite, Prozent, Zahl der Vokabeln und Zahl vollständig gelernter Vokabeln;
- numerische Sortierung sorgt dafür, dass 2 vor 10 steht;
- Klick öffnet direkt den Abschnitt;
- Detail zeigt Richtung Fremdsprache → Deutsch, gelernt/gesamt, Prozentbalken, Sechs-Boxen-Verteilung und komplette Wortliste;
- Suche filtert nur innerhalb des gewählten Abschnitts nach Fremdwort oder deutscher Bedeutung;
- „Vokabeln lernen“ nimmt nur Box 1–5; sind alle Box 6, heißt die Aktion „Gelernte wiederholen“ und nimmt alle Karten des Abschnitts (`components/vokabeln/bereich.tsx:71-98`, `components/vokabeln/bereich.tsx:195-439`, `lib/vokabeln.ts:81-90`).

**Umfang der Zahlen:** Abschnittskarten rechnen pro Abschnitt. Im geöffneten Abschnitt beziehen sich gelernt, Prozent, Boxdiagramm und Liste auf genau diesen Abschnitt. Es gibt keine sprachübergreifende Gesamtzahl und keine Zeitreihe.

### 5.3 Fotoimport

1. Import übernimmt die aktuell gewählte Sprache.
2. Auswahl/Drag-and-drop akzeptiert bis zu fünf Dateien. Das Dateifeld nennt JPG, PNG, WebP, HEIC und HEIF.
3. Der Browser öffnet das Bild mit `createImageBitmap`, begrenzt die lange Kante auf 2.000 Pixel und wandelt es mit Qualität 0,85 in JPEG um (`lib/bild-verkleinern.ts:5-47`).
4. Nach der Konvertierung sind höchstens 3 MB erlaubt.
5. Jedes Foto wird nacheinander an `/api/vokabeln/lesen` gesendet; bereits gelesene Fotos/Zeilen bleiben stehen, wenn ein späteres Foto scheitert.
6. Die API schickt das Bild an das konfigurierte KI-Modell. Der Prompt behandelt das Bild als Daten, fordert ausschließlich JSON, verbietet Raten, verlangt Latein-Stammformen/Genus und begrenzt auf 300 Einträge (`app/api/vokabeln/lesen/route.ts:6-58`).
7. Die Originalansichten bleiben als lokale Objekt-URLs unter „Fotos zum Gegenprüfen“ sichtbar, bis die Importansicht verlassen wird.

**Wichtige Formatgrenze:** Der Browser bietet HEIC/HEIF an, aber tatsächliche Unterstützung hängt davon ab, ob `createImageBitmap` dieses Format auf dem Gerät öffnen kann. Die Serverroute akzeptiert nur JPEG, PNG oder WebP; das ist korrekt, weil der Browser vorher zu JPEG wandeln soll. Auf Browsern ohne HEIC-Decodierung erscheint die allgemeine Formatfehlermeldung (`components/vokabeln/import.tsx:39-83`, `components/vokabeln/import.tsx:154-190`).

### 5.4 Strukturieren und Korrigieren

Nach dem Lesen entsteht ein **Entwurf**, noch kein Datenbankeintrag:

- jede Zeile hat Abschnitt, Fremdwort und deutsche Bedeutung;
- Abschnitt darf während der Erkennung leer sein, vor dem Speichern nicht;
- Abschnitt für alle Zeilen gemeinsam setzen;
- jede Zeile einzeln ändern;
- unbrauchbare Zeile entfernen;
- fehlende Zeile manuell ergänzen;
- Fotos parallel zum Entwurf gegenprüfen (`components/vokabeln/import.tsx:191-331`).

Validierung: 1–300 Zeilen; Abschnitt maximal 80, Wort 400, Bedeutung 1.000 Zeichen; alle Felder vor Speicherung ausgefüllt. Werte werden getrimmt. Eingeschleuste Felder wie `box` werden verworfen (`lib/vokabeln.ts:33-65`, `lib/vokabeln-api.test.ts:75-99`).

### 5.5 Speichern

`POST /api/vokabeln` validiert Sprache und Entwurf nochmals. Neue Einträge starten durch Datenbankdefault in Box 1 mit Revision 0. Der eindeutige Index überspringt exakte Dubletten still. Die Erfolgsmeldung nennt die wirklich hinzugefügte Zahl und erklärt, dass vorhandene Einträge übersprungen wurden (`app/api/vokabeln/route.ts:19-46`, `components/vokabeln/bereich.tsx:100-111`).

Bei einem Fehler bleibt der Entwurf in der gemounteten Importansicht erhalten. Vor bewusstem Zurückgehen wird bei nichtleerem Entwurf mit `window.confirm` gefragt. Ein Reload oder Browserabsturz löscht den Entwurf, weil er nicht in `localStorage` gespeichert wird (`components/vokabeln/import.tsx:123-139`).

### 5.6 Lernrunde und Bedienung

Jede Karte zeigt zuerst Fremdsprache und Abschnitt/Box. Antippen oder „Umdrehen“ zeigt Deutsch. Erst nachdem die Antwort einmal sichtbar war, werden Falsch/Richtig aktiv.

Bewertung geht über:

- Knöpfe „Falsch“ und „Richtig“;
- Wischen links/rechts nach mindestens 90 Pixeln oder 30 Pixeln mit hoher Geschwindigkeit;
- Pfeiltasten links/rechts;
- mittleren Knopf „Umdrehen“ oder direktes Antippen der Karte (`components/vokabeln/lernkarte.tsx:60-113`, `components/vokabeln/lernkarte.tsx:140-296`).

Wischrichtung: links = falsch, rechts = richtig. `prefers-reduced-motion` und Tastaturbedienung überspringen die Ausflugsanimation. Die neue Karte erscheint nach der kurzen Animation, ohne auf den Server zu warten.

### 5.7 Bewertung und Fortschritt

- richtig: genau eine Box höher, maximal Box 6;
- falsch: sofort Box 1;
- Box 1 zählt 0 %, dann 20/40/60/80/100 %;
- Abschnittsfortschritt ist der Mittelwert aller Karten;
- 100 % wird nur gezeigt, wenn wirklich jede Karte in Box 6 ist (`lib/vokabeln.ts:14-27`).

Die Rundenstatistik zählt richtige Antworten dieser Runde und zeigt den Fortschritt genau der in der Runde enthaltenen Karten. „Noch eine Runde“ nimmt danach verbleibende Karten unter Box 6; sind alle gelernt, wieder alle. Das ist nicht zwingend identisch mit dem Fortschritt des gesamten Abschnitts, wenn die Session ursprünglich nur offene Karten enthielt (`components/vokabeln/session.tsx:181-217`).

### 5.8 Optimistische Speicherung und Fehlerfälle

Beim Bewerten wird die Karte lokal sofort hoch-/zurückgestuft und die nächste Karte gezeigt. Parallel sendet der Client ID, alte Revision und Bewertung mit `keepalive` sowie 30-Sekunden-Timeout (`components/vokabeln/session.tsx:50-115`).

Der Server:

- prüft UUID, Boolean und nichtnegative Ganzzahl-Revision;
- liest den aktuellen Datensatz;
- aktualisiert nur, wenn die gesendete Revision noch stimmt;
- erhöht Revision um eins;
- gibt bei veraltetem Stand `409`, bei fehlender Karte `404` und bei Datenbankfehler `503` (`app/api/vokabeln/bewerten/route.ts:7-57`).

Bei Fehler setzt der Client **nur diese Karte** auf ihren vorherigen Stand zurück, korrigiert gegebenenfalls die Richtig-Zahl, sammelt sie unter „nicht bestätigt“ und lässt spätere erfolgreiche Antworten bestehen. Am Rundenende lädt „Nicht gespeicherte Vokabeln wiederholen“ zuerst den echten Serverstand und startet nur diese Karten neu (`components/vokabeln/session.tsx:68-83`, `components/vokabeln/session.tsx:118-146`, `components/vokabeln/session.tsx:230-265`).

Solange Hintergrundspeicherungen laufen, wird `beforeunload` registriert. Das schützt Reload, Tab-/Fensterschließen und externe Navigation, bietet aber **keinen eigenen bestätigten Schutz für jeden clientseitigen Next-Link oder den globalen Navigationsrahmen**. Der Zurück-Knopf der Session ist gesperrt, solange `pending > 0`; Sidebar/Mobilnavigation bleiben im Code unabhängig davon bedienbar (`components/vokabeln/session.tsx:41-48`, `components/vokabeln/session.tsx:148-160`).

### 5.9 Was im Vokabelbereich fehlt

- keine Bearbeitung gespeicherter Vokabeln;
- kein Löschen einzelner gespeicherter Vokabeln oder ganzer Lektionen/Seiten;
- kein Zurücksetzen eines Boxstands;
- keine Importhistorie oder Herkunft pro Foto;
- kein gespeicherter Importentwurf über Reload;
- keine Einstellungen für Lernrichtung, Rundengröße, Mischen oder Aussprache;
- keine Audiofunktion;
- kein PDF-Import, obwohl frühere Produktideen ihn nahelegen;
- keine Frist-/Intervalllogik: Das System ist bewusst nur Box 1–6 und bietet offene Karten bei jedem Start wieder an;
- keine Mehrbenutzertrennung; alle Vokabeln gehören zum gemeinsamen Atlas-Datenbestand.

## 6. Datenflüsse und Persistenz

| Bereich | Hauptspeicher | Zusätzlicher lokaler Zustand | Konflikt-/Fehlerstrategie |
|---|---|---|---|
| Stundenplan | PostgreSQL `school_blocks` | letzter Sync/Fehler im `localStorage` | alter Plan bleibt sichtbar; Retry |
| Aufgaben | PostgreSQL `assignments` | Cache der GET-Antworten | optimistische Haken mit Rollback |
| Fächer/Notizen/Noten | PostgreSQL | GET-Cache | feldweises Rollback, Toasts |
| Dateien | Vercel Blob + PostgreSQL-Metadaten | Uploadqueue im Komponentenstate | Einzeldatei-Retry/Verwerfen |
| Hefte | PostgreSQL `notebook_pages`, `notebook_chapters` | vollständiger Entwurf je Seite in `localStorage` | serielle Saves, `expectedUpdatedAt`, 409-Auswahl |
| allgemeine Lernkarten | PostgreSQL `study_cards`, `study_reviews` | Sitzung im React-State | optimistisches Weiterschalten; Toast bei Reviewfehler |
| Tutor/Lernplan | PostgreSQL | Lernplan-Erstellentwurf lokal | gespeicherte Sessions, Retry/Resume |
| Vokabelkasten | PostgreSQL `vokabeln` | nur laufende Ansicht | Revision pro Karte, gezieltes Rollback |
| Bot | PostgreSQL-Verlauf | aktueller Snapshot und Eingabe lokal | Stream abbrechen, Verlauf wiederherstellen |
| Anzeigeoptionen | Cookies oder `localStorage` | Sidebar, Theme, Namensschild | lokale Fallbacks |

Die DB-Verbindung läuft über `lib/db/index.ts`, Schema und Relationen stehen in `lib/db/schema.ts`. GET-Caches werden über `lib/fetch-cache.ts` und `lib/use-cached-json.ts` mit Deduplizierung, Ablaufzeiten, Abbruch und gezielter Invalidierung geführt.

## 7. Integrationen

### WebUntis

WebUntis ist reine Importquelle. Stunden werden anhand `(untis_lesson_id, date)` idempotent gespeichert. Der Standard-Sync umfasst letzte Woche bis drei Wochen voraus. Ein separater Check vergleicht einen Tag live, ohne Daten zu ändern (`lib/untis/client.ts`, `lib/untis/sync.ts`, `app/api/sync/untis/check/route.ts`).

### Microsoft und OneNote

OAuth nutzt Authorization Code mit PKCE sowie kurzlebige `state`-/Verifier-Cookies. Tokens werden mit AES-256-GCM verschlüsselt gespeichert. Atlas liest Profil und OneNote-Abschnitte und legt aus einer Fachnotiz eine **neue** OneNote-Seite an; es synchronisiert bestehende Seiten nicht zurück (`lib/microsoft.ts`, `app/api/microsoft/*`, `app/api/notes/[id]/onenote/route.ts`).

### Vercel Blob

Fachdateien liegen extern, die DB speichert URL, Pfad, Größe und Typ. Kleine Dateien können serverseitig, größere über vorbereiteten direkten Upload hochgeladen werden (`lib/datei-upload.ts`, `app/api/subjects/[id]/files/*`).

### KI-Anbieter

Atlas-Bot, Lernkarten-/Lernzettelgenerator, Lernplan-Erkennung, Freitextbewertung, Tutor und Vokabelfotoerkennung hängen an `ZAI_API_KEY` und `lib/bot/model.ts`. Fehlt der Schlüssel, liefern die jeweiligen Routen verständliche 503-/„nicht eingerichtet“-Zustände. Die Vokabelfotoerkennung sendet den Bildinhalt als Data-URL an den Modellanbieter.

### Vercel Analytics

Analytics und Speed Insights werden global im Root-Layout geladen (`app/layout.tsx:51-58`).

## 8. API-Katalog: alle 70 Routendateien

Die Tabelle nennt alle Routen. Mehrere Methoden in einer Zeile sind getrennte Handler; zusammen sind es 106.

### Zugang, System und Kalender

| Route | Methoden | Funktion |
|---|---|---|
| `/api/login` | POST, DELETE | Passwort prüfen/Cookie setzen; Cookie löschen |
| `/api/session` | GET | Gate-Status und Cookie-Ablauf |
| `/api/admin/migrate` | POST | Datenbankmigrationen ausführen |
| `/api/home` | GET | Woche, offene Aufgaben, Fächer und Sync-Stand bündeln |
| `/api/calendar` | GET | Tages- oder Wochenkalender für Datum |
| `/api/morgen` | GET | automatisch gewählter Fokus-Tag samt Unterricht, Aufgaben, Prüfungen, Material, Lernen |
| `/api/stunde` | GET | aktueller/gewählter Stundenkontext |
| `/api/colors` | GET | Fachfarben liefern |
| `/api/sync/untis` | GET, POST | Sync-Stand lesen; Standard-/Datumsfenster synchronisieren |
| `/api/sync/untis/check` | GET | einen Tag live Untis gegen Atlas vergleichen |

### Aufgaben, Stunden und Noten

| Route | Methoden | Funktion |
|---|---|---|
| `/api/assignments` | GET, POST | Aufgaben filtern/listen; anlegen |
| `/api/assignments/[id]` | GET, PATCH, DELETE | einzelne Aufgabe lesen, ändern, löschen |
| `/api/assignments/[id]/complete` | POST, DELETE | erledigen; wieder öffnen |
| `/api/lessons/[id]/next-due` | GET | nächste echte Fachstunde als Fälligkeit |
| `/api/lessons/[id]/note` | GET, PUT, DELETE | Stundennotiz lesen, speichern, leeren |
| `/api/lessons/[id]/participation` | GET, PUT, DELETE | Meldungszahl lesen, speichern, Erfassung entfernen |
| `/api/grades` | GET | fachübergreifender Notenüberblick |
| `/api/grades/[id]` | PATCH, DELETE | Note ändern oder löschen |

### Fächer, Notizen und Dateien

| Route | Methoden | Funktion |
|---|---|---|
| `/api/subjects` | GET, POST | aktive/archivierte/alle Fächer lesen; Fach anlegen |
| `/api/subjects/[id]` | GET, PATCH, DELETE | Fachdetail lesen; Stammdaten ändern; endgültig löschen |
| `/api/subjects/candidates` | GET | Fachnamen aus Stundenplan ableiten |
| `/api/subjects/setup` | POST | Auswahl aktivieren, übrige Kandidaten archivieren |
| `/api/subjects/reconcile` | POST | bestehende Stunden/Fächer normalisieren und abgleichen |
| `/api/subjects/[id]/notes` | GET, POST | Fachnotizen lesen/anlegen |
| `/api/notes/[id]` | GET, PATCH, DELETE | einzelne Fachnotiz lesen, ändern, löschen |
| `/api/notes/[id]/onenote` | POST | Notiz als neue OneNote-Seite senden |
| `/api/subjects/[id]/files` | GET, POST | Dateiliste; Upload/Metadatenregistrierung |
| `/api/subjects/[id]/files/upload` | POST | direkten Blob-Upload vorbereiten/abschließen |
| `/api/files/[id]` | GET, DELETE | Vorschau/Download ausliefern; Datei samt Blob löschen |
| `/api/subjects/[id]/grades` | GET, POST | Fachnoten/Schnitt lesen; Note anlegen |
| `/api/subjects/[id]/curriculum` | GET, PUT, DELETE | Lehrplan lesen, speichern, entfernen |
| `/api/subjects/[id]/curriculum/seed` | POST | Vorlage für ein Fach einsetzen |
| `/api/subjects/curriculum/seed` | POST | Vorlagen für mehrere Fächer einsetzen |

### Hefte

| Route | Methoden | Funktion |
|---|---|---|
| `/api/notebooks` | GET, POST | Seiten/Kapitel eines Fachs listen; Seite mit optional vorgegebener UUID anlegen |
| `/api/notebooks/[id]` | GET, PATCH, DELETE | Seite laden, versionsgeprüft speichern, löschen |
| `/api/notebook-chapters` | POST | Kapitel anlegen |
| `/api/notebook-chapters/[id]` | PATCH | Kapitel umbenennen |

### Allgemeines Lernen, Karten und Themen

| Route | Methoden | Funktion |
|---|---|---|
| `/api/lernen` | GET | Lernübersicht |
| `/api/lernen/[subjectId]` | GET | Lernfach mit Karten, Themen, Quellen und Prüfungen |
| `/api/lernen/themen` | POST | Thema anlegen |
| `/api/lernen/themen/[id]` | PATCH, DELETE | Thema ändern/löschen; Karten fallen bei Löschen zu Allgemein |
| `/api/lernen/themen/[id]/lernzettel` | POST | Lernzettel per KI erzeugen |
| `/api/lernen/karten` | GET, POST | Karten filtern/listen; manuelle Karte anlegen |
| `/api/lernen/karten/[id]` | PATCH, DELETE | Karte ändern/verschieben/archivieren; endgültig löschen |
| `/api/lernen/karten/[id]/antwort` | POST | Leitner-Bewertung speichern und Review protokollieren |
| `/api/lernen/karten/[id]/bewerten` | POST | Freitextantwort per KI beurteilen |
| `/api/lernen/karten/[id]/erklaeren` | POST | Erklärung streamen |
| `/api/lernen/karten/[id]/variante` | POST | ähnliche Aufgabenkarte erzeugen |
| `/api/lernen/generieren` | POST | Karten aus gewählten Quellen generieren |

### Tutor

| Route | Methoden | Funktion |
|---|---|---|
| `/api/lernen/tutor` | POST, GET | Session anlegen; Sessions eines Themas listen |
| `/api/lernen/tutor/[id]` | GET, POST, DELETE | Verlauf laden; nächsten NDJSON-Turn ausführen; Session löschen |
| `/api/lernen/tutor/[id]/karten` | POST | Fazit-Kartenvorschläge einmalig anlegen |

### Lernplan

| Route | Methoden | Funktion |
|---|---|---|
| `/api/lernen/plan` | POST | validierten Lernplan anlegen/ersetzen |
| `/api/lernen/plan/[id]` | GET, PATCH, DELETE | Plan nach Prüfung lesen; Budget ändern; Plan löschen |
| `/api/lernen/plan/lesen` | POST | Checkliste/Material per KI in Punkte zerlegen |
| `/api/lernen/plan/bewerten` | POST | Diagnosetest-Antworten per KI bewerten |
| `/api/lernen/plan/[id]/verteilen` | POST | überfällige oder alle offenen Einheiten neu verteilen |
| `/api/lernen/plan/items/[id]` | PATCH | Einheit erledigen/öffnen, optional Ergebnis setzen |
| `/api/lernen/plan/points/[id]` | PATCH | Kartenstatus/Themenzuordnung eines Punkts setzen |

### Separater Vokabelkasten

| Route | Methoden | Funktion |
|---|---|---|
| `/api/vokabeln` | GET, POST | alle Vokabeln laden; validierten Entwurf dedupliziert speichern |
| `/api/vokabeln/lesen` | POST | Bild prüfen und per KI als Vokabelentwurf lesen |
| `/api/vokabeln/bewerten` | POST | Box mit Revisionsschutz ändern |

### Atlas-Bot

| Route | Methoden | Funktion |
|---|---|---|
| `/api/bot` | GET, POST | Begrüßung/Vorschläge; Chat mit Werkzeugschleife als NDJSON streamen |
| `/api/bot/verlauf` | GET | nichtleere Gespräche listen |
| `/api/bot/verlauf/[id]` | GET | Gespräch samt Ergebnisstatus laden |
| `/api/bot/proposals/[id]` | POST | Notenvorschlag bestätigen oder verwerfen |

### Microsoft

| Route | Methoden | Funktion |
|---|---|---|
| `/api/microsoft/login` | GET | PKCE-Anmeldung starten |
| `/api/microsoft/callback` | GET | Callback prüfen, Token tauschen, Konto speichern |
| `/api/microsoft/status` | GET, DELETE | Verbindung/Konto lesen; Tokens entfernen |
| `/api/microsoft/sections` | GET | OneNote-Abschnitte laden |

## 9. Android-App im selben Repository

Neben der Webanwendung existiert eine native Jetpack-Compose-App unter `android/`. Sie spricht dieselben HTTP-APIs gegen die fest eingetragene Produktionsadresse `https://atlas-ten-orpin.vercel.app` (`android/app/src/main/java/dev/atlas/schule/data/AtlasApi.kt:18-34`).

Bestätigte native Hauptreiter: Stundenplan, Aufgaben, Atlas, Fächer und Einstellungen (`android/app/src/main/java/dev/atlas/schule/ui/AtlasViewModel.kt:37-43`). Der Stundenplan hat Woche/Fokus; Aufgaben können angelegt, bearbeitet und abgehakt werden; Fachdetail enthält Notizen, Dateien, Noten und Stundendetails; Einstellungen enthalten Sync, Fächerabgleich, Darstellung und Abmelden. Der Bot-Chat selbst ist laut Zustand derzeit eine Web-Weiterleitung, während Verlauf nativ ist (`android/app/src/main/java/dev/atlas/schule/ui/AtlasViewModel.kt:93-99`).

Die App speichert Gate-Cookie und ausgewählte API-Antworten privat auf dem Gerät. Bei `401` werden Cookie und Cache gelöscht und die Anmeldung wieder gezeigt (`android/app/src/main/java/dev/atlas/schule/data/CookieSpeicher.kt:19-77`, `android/app/src/main/java/dev/atlas/schule/data/AtlasApi.kt:46-76`).

Vokabelkasten, Hefte und der vollständige allgemeine Lernbereich sind in der nativen Hauptnavigation nicht vorhanden. Sie bleiben Webfunktionen.

Das README erwähnt zusätzlich eine Electron-App unter `desktop/`; in diesem Branch existiert kein solcher Ordner. Deshalb ist diese Desktop-Hülle hier nicht prüfbar und die README-Angabe offenbar veraltet oder unvollständig.

## 10. Funktionslücken und Risiken

### Hoch

1. **Ein Passwort für den ganzen gemeinsamen Datenbestand.** Es gibt keine Nutzer- oder Rollenisolierung. Wer das Cookie besitzt, kann nahezu jede API lesen und ändern. Das ist beabsichtigter Single-User-Betrieb, aber keine Grundlage für mehrere Schüler (`lib/gate.ts:1-14`).
2. **Vokabelverwaltung endet nach dem Import.** Gespeicherte Vokabeln können weder korrigiert noch gelöscht werden. Ein OCR-Fehler, der beim Prüfen übersehen wird, bleibt ohne direkten Datenbankeingriff bestehen.
3. **Allgemeine Lernsession speichert Bewertungen optimistisch ohne fachlichen Rollback.** Bei einem fehlgeschlagenen `/antwort` bleibt die Karte in der lokalen Ergebnisliste als richtig/falsch und die Sitzung läuft weiter; nur ein Toast meldet den Fehler (`components/lernen-session.tsx:176-203`). Der separate Vokabelkasten löst das robuster.
4. **Admin-Migrationsroute liegt hinter demselben allgemeinen Gate.** Es gibt keine zusätzliche Adminrolle. Der genaue Schutz hängt vollständig am gemeinsamen Passwort (`app/api/admin/migrate/route.ts`, `proxy.ts:23-49`).

### Mittel

5. **Vokabel-Pending-Warnung ist nicht global.** Der Session-Zurückknopf ist gesperrt und `beforeunload` ist vorhanden, aber Sidebar-/Mobile-Links prüfen `pending` nicht. Ein schneller interner Wechsel kann laufende Requests verlassen; `keepalive` hilft, garantiert die Bestätigung aber nicht.
6. **Importentwurf ist flüchtig.** Speicherfehler bewahren ihn in der Ansicht, Reload/Crash nicht.
7. **Heft-Löschpfade sind unvollständig.** Seiten-DELETE existiert ohne UI; Kapitel-DELETE fehlt vollständig. Damit kann der Nutzer Fehlanlagen nicht normal aufräumen.
8. **Hefte-Werkzeugumfang ist kleiner als erwartbar.** Kein Marker, keine Formen, kein Lasso, kein Teilradierer; „Radierer“ löscht ganze Striche.
9. **Settings-Text widerspricht dem Gate.** „Ein Nutzer, keine Anmeldung nötig“ und fehlendes Web-Abmelden passen nicht zur Passwortseite und zur vorhandenen Logout-API (`app/settings/page.tsx:632-643`).
10. **Bot-Schreibaktionen können vor einer abschließenden Textantwort schon gespeichert sein.** Stop/Timeout erklärt dies zwar, aber Nutzer müssen die Aktionskarten beziehungsweise den Verlauf prüfen (`app/api/bot/route.ts:153-231`).
11. **KI ist ein gemeinsamer Ausfallpunkt für mehrere Komfortfunktionen.** Foto-OCR, Lernzettel, Karten, Freitextbewertung, Tutor und Bot hängen am selben Schlüssel/Modellpfad.
12. **Themen-Löschung ist nur als API vorhanden.** Die Themen-API kann ein Thema löschen und dessen Karten zu „Allgemein“ verschieben; in Fach- und Themenseite gibt es dafür keinen sichtbaren Knopf (`app/api/lernen/themen/[id]/route.ts:63-69`).

### Niedrig oder Produktentscheidung

13. **Vokabeln haben keine Zeitintervalle.** Die sechs Boxen messen Fortschritt, planen aber keine Fälligkeit. Das ist im Schema ausdrücklich getrennt vom allgemeinen Leitner-Modell.
14. **Mobile Navigation hat keinen direkten Vokabelpunkt.** Zwei Schritte über Lernen sind nötig.
15. **Bot-Verlaufsfehler haben keinen sichtbaren Retry.** Neu laden ist der einzige direkte Ausweg.
16. **Designsystem-Seite ist über normale Einstellungen erreichbar.** Für einen einzelnen technisch betreuten Nutzer harmlos, aber als Produktfunktion erklärungsbedürftig.
17. **Android-Funktionsumfang hinkt der Webanwendung hinterher.** Hefte, Vokabelkasten und vollständiges Lernen fehlen nativ; Produktions-URL ist fest einkompiliert.

## 11. Was praktisch geprüft wurde und was offen bleibt

**In diesem Durchgang geprüft:**

- Branch und sauberer Ausgangsstatus;
- Dateiinventar und Vollständigkeitszahlen: 21 Seiten, 70 API-Routen, 106 Handler, 60 TSX-Komponenten;
- vollständige statische Verfolgung der Vokabeloberfläche durch API, Validierung, Datenbank und Tests;
- statische Verfolgung aller übrigen Seiten, Navigationen, Hauptaktionen, Zustände, APIs, Speicher und Integrationen;
- keine Produktdatei verändert; nur dieses Dokument neu angelegt.

**Laufzeitprüfung nicht durchgeführt:**

- Rendern/Interaktion im Browser;
- responsive Verhalten auf echtem Handy/iPad und Apple Pencil;
- echte Neon-, Blob-, WebUntis-, Microsoft- oder KI-Verbindung;
- Android-Build und Bedienung;
- Test- und TypeScript-Lauf, weil die Abhängigkeiten fehlen.

Vor einer Aussage „alles funktioniert live“ braucht es deshalb einen installierten lokalen Stand oder eine bewusst freigegebene Testumgebung, Testdaten, mindestens Desktop + Mobil + iPad sowie echte Integrations-Smoke-Tests.
