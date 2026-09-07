# UI-Loop Lernpfad: bauen bis 95 Prozent

Auftrag von Sid, 2026-09-05: den Lernpfad (Lernplan plus Lernbereich) so lange
im Loop verbessern, bis ein **unabhaengiger** Agent die UI und UX mit
mindestens **95 Prozent** bewertet.

## Warum eine feste Rubrik

Ein Bewerter ohne Rubrik vergibt bei jeder Runde eine andere Zahl, und der
Loop waere trivial zu gewinnen, indem der Auftrag an ihn weicher formuliert
wird. Deshalb: dieselbe Rubrik, dieselben Gewichte, derselbe Wortlaut in
jeder Runde. Der Bewerter bekommt **nicht** zu sehen, was in der Runde davor
geaendert wurde, und keine Zielzahl.

## Rubrik

**Ab Runde 5 geaendert** auf Anweisung von Sid: "die reviewer sollen auch
genau das UI und die LOGIK davon behandeln". Logik bekommt eine eigene,
schwer gewichtete Dimension, die uebrigen wurden anteilig gekuerzt. Noten
aus Runde 1 bis 4 sind mit denen ab Runde 5 daher **nicht direkt
vergleichbar**.

### Runde 5 und danach (100 Punkte)

| Dimension | Punkte | Was zaehlt |
|---|---|---|
| Platzierung und Daseinsberechtigung | 20 | Sitzt jedes Element an der richtigen Stelle, und muss es ueberhaupt auf den Screen? Fuer jedes Element: Warum ist es hier? Wer braucht es in genau diesem Moment? Was ginge verloren, wenn es weg waere? Steht das Wichtigste oben, das Seltene unten oder gar nicht? Wird Maschinen-Innenleben gezeigt, das den Nutzer nichts angeht? Wird etwas abgefragt, was die App selbst wissen koennte? |
| Logik und Datenfluss | 10 | Rechnet der Code das Richtige? Stimmen Zustandsuebergaenge, Grenzfaelle, Datumslogik? Zeigen Links auf Routen, die es gibt? Gehen Daten still verloren? |
| Interaktion korrekt | 16 | Jedes Bedienelement tut seine Aufgabe mit Maus, Tastatur und Finger. Enter/Escape verdrahtet, kein Feld das sich gegen Eingabe wehrt, kein doppelter Absendepfad, ueberholende Antworten abgesichert. |
| Barrierefreiheit (Floor) | 14 | 44x44 Trefflaechen ohne Ueberlappung, Icon-Knoepfe benannt, Fokus sichtbar und nie verloren, reduced-motion, Kontrast, Rollen und Namen, Fokusfalle in Dialogen. |
| Zustaende vollstaendig | 8 | Laden, leer, Fehler, absendend, deaktiviert je eigens gestaltet; Fehler nennen den Ausweg und den richtigen Grund. |
| Hierarchie und Abstaende | 8 | Eine primaere Aktion pro Ansicht, Abschnitte lesen sich als Abschnitte, destruktives abgesetzt. |
| Layout-Stabilitaet | 6 | Kein Sprung durch nachladende Inhalte, tabular-nums, reservierter Platz, keine Breitenwechsel, die Nachbarn schieben. |
| Motion | 4 | Begruendet, unter 300 ms, Projekt-Kurve, nur transform/opacity, reduced-motion. |
| Text und Copy | 6 | Spezifisch statt generisch, deutsche Rechtschreibung im sichtbaren Text, Knopf nennt das Ergebnis. |
| Polish | 4 | Truncation mit Tooltip, typografische Zeichen, Fokusring neutral, dekoratives inert. |

Abzugsregel: pro belegtem Befund werden Punkte in seiner Dimension abgezogen,
gewichtet nach Schwere. Ein blockierender Befund in "Platzierung",
"Interaktion" oder "Barrierefreiheit" deckelt die Gesamtnote bei 85.

### Runde 1 bis 4 (historisch)

Interaktion 25, Barrierefreiheit 20, Layout 12, Hierarchie 12, Zustaende 10,
Motion 8, Copy 8, Polish 5. Keine eigene Logik-Dimension — das war die
Luecke, die Sid bemaengelt hat.

## Geltungsbereich

Ab Runde 5 erweitert um die Logik hinter den Screens:

- `components/lernplan-erstellen.tsx` (vier Schritte)
- `components/lernplan-seite.tsx` (Planseite)
- `components/lernplan-ui.tsx`, `components/lernplan-karten-queue.tsx`
- Lernplan-Bloecke in `components/pruefungen-view.tsx`,
  `components/morgen-panel.tsx`, `components/stunden-cockpit.tsx`
- **neu:** `lib/lernplan.ts`, `lib/lernplan-sicherheit.ts`,
  `lib/lernplan-karten-queue.ts`, `lib/lernplan-generieren.ts`,
  `lib/lernplan-types.ts`
- **neu:** die Routen unter `app/api/lernen/plan/**` und die Seiten unter
  `app/lernen/[subjectId]/plan/**`

## Runden

### Runde 0 (Ausgangslage, vor dem Loop)

Von der Hauptsession selbst gefunden und behoben, bevor der erste Bewerter
lief:

- **Bug:** fuenf Links schrieben `prüfung=` als Query-Parameter, die Seiten
  lesen `sp.pruefung`. "Karten ueben", "Probe im Tutor", "Simulation im
  Tutor" und beide Links der Lernuebersicht verloren still den
  Pruefungsbezug. Ursache: der Umlaut-Durchgang (c951612) hat auch
  Query-Parameter transliteriert.
- **Netz dagegen:** `lib/query-parameter-ascii.test.ts` scannt app,
  components, lib und verbietet Umlaute in Parameternamen.
- `SicherheitsBalken` hat einen zugaenglichen Namen bekommen.
- Akzeptanzkriterien A1 bis A23 der Lernplan-SPEC abgehakt, A23 live belegt.

### Runde 1

Zwei Implementierungs-Auftraege ausgefuehrt (Planseite 14 Punkte,
Erstell-Seite 10 Punkte).

Planseite: Tage stehen jetzt vor der Sicherheits-Uebersicht, diese ist
einklappbar; Button-Hierarchie mit abgesetztem Loeschen; Balken statt nackter
Prozentzahl im Kopf; Abschnitts-Ueberschriften mit eigenem Gewicht;
44px-Floor auf Chevrons und Blatt-Chips; ein Dialog auf Seitenebene statt
einer Instanz je Einheit; Fokusfalle im Dialog; Menue mit role/menuitem,
Pfeiltasten und Fokusrueckgabe; Skeleton bildet die echte Struktur ab.

Erstell-Seite: **Blocker behoben** -- die Minuten-Felder klemmten ihren Wert
bei jedem Tastendruck, Feld leeren und "60" tippen war unmoeglich (sprang
sofort auf 10). Neue Komponente `MinutenFeld` haelt den rohen String und
klemmt erst bei Blur. Dazu: Label statt blossem Placeholder am Textarea,
Cmd+Enter, Zaehler erst ab 80 Prozent, aria-label an Titel/Seiten, kein
Autofokus auf Touch-Geraeten, Rueckgaengig beim Punkt-Loeschen,
Ladezustand am Upload-Knopf, "Erneut" an fehlgeschlagenen Uploads.

Gates nach der Runde selbst geprueft: `npx tsc --noEmit` fehlerfrei,
`npx vitest run` 648 gruen / 40 skipped, `npx next build` 0 Errors.

**Bewertung Runde 1: 67 von 100.**

Interaktion 14/25, Barrierefreiheit 11/20, Layout-Stabilitaet 8/12,
Hierarchie 10/12, Zustaende 6/10, Motion 8/8 (volle Punkte), Copy 6/8,
Polish 4/5. Drei blockierende Befunde deckelten die Note bei 85.

Die drei Blocker, alle von der Hauptsession vorher uebersehen:

1. **Schritt 3 ist eine Sackgasse ohne Diagnosefragen.** Der erste Mount
   setzt `checks: []` und springt weiter; wer aus Schritt 4 zurueckgeht,
   landet auf einer Seite mit Ueberschrift und Fortschrittsleiste und sonst
   nichts. Die Auto-Weiterleitung greift nicht mehr, weil `checks` jetzt `[]`
   statt `null` ist. Nur die Browser-Zurueck-Taste rettet.
2. **Plan loeschen wird per Toast bestaetigt**, der nach 4000 ms
   verschwindet. Wer ueberlegt, verliert die Bestaetigung ersatzlos, der
   Klick wirkt folgenlos. Tastaturnutzer erreichen den Knopf nur, wenn sie
   ihn binnen 4 Sekunden ertabben.
3. **Ueberlappende Trefflaechen** in Pruefungskarte, Morgen-Panel und
   Cockpit: 44px-Flaechen auf rund 38px Rasterabstand. Ein Tipp 16 bis 22px
   unter einer Checkbox hakt die naechste Einheit ab, mit sofortigem PATCH.

### Runde 2

Vier Auftraege entlang der Dateigrenzen, damit sie sich nicht ins Gehege
kommen: Erstell-Seite (Blocker 1 plus SOLLTE 3/5/8/9/13 plus 4 Nits),
Planseite (Blocker 2 plus SOLLTE 1/4/6/10/11 plus 1 Nit), die drei
Lernbloecke (Blocker 3 plus SOLLTE 7 plus Tooltips), Karten-Queue
(SOLLTE 2/10/12).

**Bewertung Runde 2: 80 von 100** (frischer Bewerter, gleiche Rubrik).

Interaktion 17/25, Barrierefreiheit 15/20, Layout 11/12, Hierarchie 11/12,
Zustaende 9/10, Motion 7/8, Copy 6/8, Polish 4/5. Beide Blocker aus Runde 1
waren weg — dafuer zwei neue, **beide durch Auftraege der Hauptsession
verursacht**:

1. Der Auftrag "Knopf waehrend des Ladens `disabled`" nimmt dem Trigger den
   Fokus: der Browser wirft den Fokus von einem deaktivierten Element ab,
   `document.activeElement` wird `body`, das naechste Tab beginnt oben.
2. Der Nit "Fokus an den Ausloeser zurueckgeben" liess die Ansicht bei jedem
   Aussenklick zum Punkt zurueckspringen.
3. Dazu das sichtbare Wort "Scrollbar" in der UI, ebenfalls aus einer
   ungluecklichen Formulierung der Hauptsession.

Lehre fuer kuenftige Auftraege: `disabled` waehrend eines Ladevorgangs nur,
wenn der Knopf den Fokus nicht halten kann. Sonst `aria-disabled` plus
`aria-busy` plus Klick-Guard, damit das Element fokussierbar bleibt.

### Runde 3

Drei Auftraege plus eine Aenderung der Hauptsession selbst.

- Planseite: beide Fokus-Fallen behoben (`aria-disabled`/`aria-busy` statt
  `disabled`, Fokusziele fuer Knoepfe, die nach Erfolg aus dem DOM
  verschwinden), Pluralformen, `motion-safe:` auf den Chevrons,
  Hintergrund per `aria-hidden` unerreichbar, solange ein Dialog offen ist.
- Erstell-Seite: Fokus-Rueckgabe nur noch bei Escape, "Scrollbar" ersetzt
  durch eine Fade-Kante mit `pointer-events-none`, dritte Markierung
  verdraengt jetzt FIFO statt still zu verweigern, echte `sr-only`-Live-
  Region statt der toten auf der `<ol>`, kein Fokussprung beim Erstmount,
  Feedback-Knopf auf 44px, Menue mit role/menuitem und Pfeiltasten.
- Lernbloecke: Trefflaeche des Plan-Links per Playwright im echten DOM
  gemessen statt gerechnet — dabei kam heraus, dass die Ueberlappung schon
  vorher bestand, Ursache war ein `-mt-1`, nicht das Inset. Nachzieh-Effekt
  fuer den lokalen Item-Zustand ergaenzt; im Cockpit bewusst an eine
  Signatur aus den Erledigt-Zeitstempeln gehaengt statt an die
  Objektreferenz, weil der 60-Sekunden-Poll sonst jeden frisch gesetzten
  Haken zurueckgeworfen haette.
- Karten-Queue (Hauptsession selbst): der 2,5-Sekunden-Timer, der die Karte
  unter dem lesenden Nutzer wegzog, ist ersatzlos raus. Die Abschluss-
  meldung bleibt stehen und hat jetzt denselben Aufbau wie die laufende
  Leiste, damit die Hoehe erhalten bleibt.

Gates nach Runde 3 selbst geprueft: tsc fehlerfrei, 648 Tests gruen,
`next build` 0 Errors.

Bewertung Runde 3: laeuft.

### Runde 4

Redaktionsrunde. Die Frage war nicht mehr "sieht es gut aus", sondern
"steht das Ding an der richtigen Stelle und muss es ueberhaupt auf den
Schirm". Entsprechend viel ist geflogen statt hinzugekommen.

- Planseite: Minuten-Zaehler, Sicherheits-Kasten im Kopf, `QUELLE_LABEL`-
  Badges, Karten-Zaehler und die Punkte-Liste in der Simulationszeile raus.
  Reihenfolge jetzt Heute, Ueberfaellig, Kommende Tage, Erledigte
  eingeklappt. Drei-Punkte-Menue im Kopf statt drei gleichlauter Knoepfe.
- Erstell-Seite: Schritt 4 in Schritt 3 aufgegangen, der Auswerten-Screen
  ersatzlos raus (wertet selbst aus), Ergebnisliste hinter "Antworten
  ansehen", die Minuten-Felder fuer Schultag und Wochenende raus (Vorgaben
  30/60 bleiben still stehen), globaler Arbeitsblatt-Bereich raus, Upload
  wandert in `BlattHinzufuegen`, Zusammenlegen hinter einen Auswahlmodus.
- Pruefungsseite: der dreiteilige Lernplan-Block ist weg, es bleibt eine
  Zeile Sicherheit plus der Weg zum ganzen Plan. Entscheidung von Sid.
- Karten-Queue: die ganze Leiste ist raus. Der Redaktions-Reviewer hatte
  recht, dass die Abschlussmeldung aus Runde 3 nur existierte, um einen
  Sprung zu verhindern, den es ohne die Leiste gar nicht gibt. Damit sind
  Runde 3 und 4 an dieser Stelle zwei Runden Politur an etwas gewesen,
  das gehoert hat geloescht zu werden.

### Runde 5

Bewertung: **60 von 100**, mit der neuen, haerteren Rubrik (Platzierung und
Logik zaehlen jetzt mit). Nicht mit der 78 aus Runde 2 vergleichbar.

Platzierung 13/20, Interaktion 9/16, Barrierefreiheit 10/14, Logik 5/10,
Zustaende 5/8, Hierarchie 7/8, Layout 4/6, Copy 3/6, Motion 3/4, Polish 4/4.

Bestaetigt wurde der strukturelle Gewinn: der Kopf steht auf etwa 190px,
danach kommt sofort Heute, die Reihenfolge nach Dringlichkeit sitzt.

Drei blockierende Befunde:

1. Die Kartenerzeugung laeuft nie an. Beim Umbau der Queue von einer
   Komponente zu einem Hook wanderte der Aufruf vor die fruehen Returns,
   also in einen Moment, in dem `plan` noch `null` ist. `offenZaehler` ist
   0, der Effekt kehrt frueh zurueck, und danach aendert sich keine
   Dependency mehr. "Karten werden erzeugt" steht dauerhaft, der Link
   "Karten üben" erscheint nie, der Reparaturknopf haengt an einem
   Fehlerzustand, den es ohne Lauf nicht gibt. **Von der Hauptsession
   selbst verursacht**, in Runde 4, durch einen Auftrag, der die
   Verschiebung des Aufrufpunkts nicht mitbedacht hat.
2. Ein Punkt-Edit nach dem Diagnosetest verschiebt alle Sicherheiten um
   eine Position, weil `pointIndex` eine Position im damaligen Array ist
   und die Mutatoren `checks` nicht zuruecksetzen. Still, ohne Meldung.
3. Leerer Punkt-Titel wird erst ganz am Ende vom Server abgelehnt, der
   Code `"punkte"` fehlt in `FEHLER_TEXT`, und "Erneut versuchen" schickt
   denselben Body endlos weiter.

Lehre: ein Auftrag, der eine Komponente in einen Hook umbaut, muss
ausdruecklich sagen, an welcher Stelle des Renderbaums der Aufruf danach
sitzt und welche Daten dort schon da sind. "Zieh die Logik in einen Hook"
allein hat hier ein funktionierendes Feature abgeschaltet, ohne dass ein
Test, tsc oder der Build angeschlagen haetten.

### Runde 6

Gebaut: die drei Blocker aus Runde 5 plus die dreizehn SOLLTE-Befunde,
verteilt auf drei Agenten entlang der Dateigrenzen.

- Karten-Queue: der Effekt haengt jetzt an `offenZaehler` und springt an,
  sobald offene Punkte da sind. Gegen Doppellaeufe sichert ein
  ausdrueckliches `laeuftRef` statt fehlender Dependencies; der Abbruch
  beim Unmount hat einen eigenen Effekt, damit er nicht jeden laufenden
  Lauf abwuergt, wenn sich die Zahl mitten drin aendert. Drei Faelle selbst
  durchgespielt: frischer Plan laeuft an, fertiger Plan startet nicht,
  Reload mitten im Lauf startet keinen zweiten.
- Erstell-Flow: `checks` werden beim Loeschen und Zusammenlegen
  zurueckgesetzt, leere Titel direkt am Feld abgefangen, `"punkte"` in
  `FEHLER_TEXT`, und "Erneut versuchen" fuehrt bei einem Eingabefehler
  zurueck in die Liste statt denselben Body zu wiederholen.
- Planseite: keine Maschinen-Enums mehr im Toast, ein fehlgeschlagener
  Hintergrund-Reload loescht nicht mehr die Seite, Kopf-Knopf nur noch bei
  Ueberfaelligem und ohne primaeres Gewicht, "Heute nichts geplant".
- Fokus und Cockpit: die Einheiten fuehren direkt in die Karten und in den
  Tutor statt nur Text zu sein.

Von der Hauptsession zurueckgenommen: der Agent hat auf meine Anweisung hin
auch beim reinen Anhaengen eines Punktes den fertigen Test verworfen.
Anhaengen verschiebt keine Indizes, und `lib/lernplan-store.ts:311` faengt
einen Index ausserhalb der Liste ohnehin ab — der neue Punkt bekommt
`ohne_test`. Datenverlust ohne Gegenwert, verursacht durch eine zu grobe
Formulierung im Auftrag.

Gates selbst gefahren: tsc fehlerfrei, 650 Tests gruen bei 40
uebersprungenen, `next build` 0 Errors und 0 Warnings.

Bewertung Runde 6: **64 von 100**, frischer Bewerter, gleiche Rubrik.

Platzierung 15/20, Logik 6,5/10, Interaktion 8/16, Barrierefreiheit 6,5/14,
Zustaende 4/8, Hierarchie 6,5/8, Layout 5/6, Motion 4/4, Copy 4,5/6,
Polish 3,5/4.

Drei neue Blocker: eine Sackgasse im Erstell-Flow, aus der auch ein Reload
nicht herausfuehrt (`checks: []` liegt im sessionStorage, derselbe Weg
landet wieder dort); der Fokus faellt auf `body`, sobald "Ueberfaelliges
nachholen" seine eigene Bedingung erfuellt und aus dem DOM verschwindet;
und eine Trefflaechen-Ueberlappung von 10 px zwischen dem Chip-X und dem
"+ Blatt"-Ausloeser, weil die Y-Achse durchgerechnet wurde und die X-Achse
bei 6 px stehen blieb.

Eine Entscheidung aus Runde 4 wird zurueckgedreht: die beiden
Minuten-Felder kommen wieder. Ich hatte sie als Redaktion gestrichen, weil
Vorgaben zu reichen schienen. Sie bestimmen aber in `lib/lernplan.ts:115`
das Tagesbudget und damit, was gestrichen wird und ob der Plan "knapp"
heisst, sind nirgends im UI beschreibbar, und auch "Neu verteilen" liest
sie nur aus der Datenbank. Ein Schueler mit 15 Minuten am Tag bekommt sonst
denselben Plan wie einer mit zwei Stunden.

Lehre: "muss das ueberhaupt auf den Screen" hat eine Gegenfrage, die ich in
Runde 4 nicht gestellt habe — kann die App es selbst wissen? Wenn nein und
es steuert die Rechnung, muss es bleiben, egal wie beilaeufig es aussieht.

### Runde 7

Die drei Blocker aus Runde 6 plus die zehn SOLLTE-Befunde, wieder auf drei
Agenten entlang der Dateigrenzen.

- Erstell-Flow: die Sackgasse ist an beiden Enden dicht (Effekt-Guard
  akzeptiert jetzt auch das leere Array, und der Fehlerschirm setzt `checks`
  zurueck); alle vier Warteschirme der Datei einzeln daraufhin geprueft, ob
  sie einen Ausweg haben. Chip-Zeile auf `gap-x-6`, Ueberlappung damit null.
  `checks` werden beim Loeschen und Zusammenlegen umindiziert statt
  verworfen, womit auch "Rueckgaengig" wieder stimmt. "Weiter" ist bei
  leerem Feld gesperrt, damit ein versehentliches Enter keine Lerneinheit
  mehr kostet. Der Geisterplan nach dem Rueckgaengig ist weg.
- Planseite: der Fokus faellt nicht mehr auf `body`, wenn ein Knopf durch
  seine eigene Wirkung verschwindet. Der Agent hat von sich aus eine zweite
  Stelle desselben Musters gefunden ("Karten erneut erzeugen"). Die
  Tageszeile zeigt bei fehlgeschlagener Kartenerzeugung die Wahrheit samt
  Ausweg statt "Karten werden erzeugt"; der dafuer noetige Zustand kam aus
  dem bis dahin toten Rueckgabewert der Queue. Die Checkliste ist kein
  Overlay mehr, sondern ein Abschnitt im Seitenfluss -- damit erledigt sich
  die Frage nach Escape und Aussenklick, statt sie zu beantworten. Kopf auf
  Titel und Countdown eingedampft.
- Route und Meldungen: `?schritt=2.5` traf keinen der drei Zweige und
  hinterliess eine leere Fortschrittsleiste, jetzt gerundet und geklemmt.
  "Knapp: 3 Einheiten gestrichen." nennt jetzt die Folge statt der
  Maschinen-Groesse.

Von der Hauptsession korrigiert: der Agent hatte alle Hinweis-Meldungen auf
Fehler-Rot gestellt, weil ein gekuerztes Arbeitsblatt eine Einbusse ist.
Damit sah ein erfolgreich angelegter Plan nach einem Fehlschlag aus. Die
eigentliche Luecke lag im Toast-System, das nur Erfolg und Fehler kannte.
Dritte Variante "warning" in Amber ergaenzt (die Farbe, die das Projekt fuer
Warnungen ohnehin nutzt) und die beiden Aufrufstellen darauf gesetzt.

### Runde 8: Touch und Barrierefreiheit flaechendeckend

Neuer Ansatz auf Sids Hinweis, es mal mit einer `/ask-emil`-Runde zu
versuchen. Der Router schickt fuer Interaktion und Barrierefreiheit auf
`touch-and-accessibility`, ausdruecklich als Boden und nicht als Politur.
Statt einzelne Befunde abzuarbeiten, laeuft diesmal eine feste Acht-Punkte-
Liste ueber jede Datei: Hover-Gating, `touch-action`, 44x44 ohne
Ueberlappung, `aria-label` an Icon-Knoepfen, Zugeklapptes aus dem Tab-Order,
Fokus ins Bild scrollen, `prefers-reduced-motion`, Tastenkuerzel je System.

Begruendung fuer den Wechsel: sechs Runden lang wurden nur die Befunde
behoben, die ein Bewerter zufaellig gefunden hat. Diese acht Regeln gelten
an jedem Knopf. Und weil ein Blocker in Interaktion oder Barrierefreiheit
die Note auf 85 deckelt, ist das der einzige Weg Richtung 95.

Zwei Erkenntnisse aus dem ersten Lauf, die den anderen Agenten sofort
weitergegeben wurden:

- Tailwind 4 kapselt `hover:` bereits selbst in `@media (hover:hover)` --
  im kompilierten CSS nachgesehen, nicht vermutet. Punkt 1 entfaellt
  projektweit.
- `app/globals.css` setzt `touch-action` global auf `button` und `a`.

Gefundene echte Luecken:

- Die Checkbox der Planseite hatte mit ihrem asymmetrischen Inset nur
  32x36 px statt 44x44. Das asymmetrische Inset stammte aus Runde 6, wo es
  eine Ueberlappung mit dem Karten-Link beseitigen sollte -- dabei ist die
  Flaeche unter das Minimum gerutscht. Jetzt 46x48 ohne Ueberlappung.
- Die Blaetter-Chips ueberlappten sich untereinander um 8 px, weil
  `before:-inset-1.5` bei `gap-1` mehr Platz frisst als da ist.
- Beide Dialoge blieben waehrend der Ausblend-Animation von
  `AnimatePresence` fokussierbar und im Accessibility-Baum, obwohl der
  Fokus schon zurueckgesprungen war. Jetzt dauerhaft gemountet mit
  `inert={!offen}`.
- Neun fehlende Trefflaechen in Fokus und Cockpit, dazu eine Stelle, an der
  die vergroesserte Flaeche 12 px in die naechste Zeile geragt haette.

Lehre: eine Korrektur an einer Trefflaeche kann eine andere Regel brechen.
Runde 6 hat die Ueberlappung beseitigt und dabei die Mindestgroesse
verletzt, und sechs Runden lang hat das niemand gemerkt, weil immer nur die
eine Regel geprueft wurde, um die es gerade ging.

## Zielmarke gesenkt: 90 statt 95

Sid, nach Runde 9: "ok bis 90 prozent".

Praktisch verschiebt das weniger als die Zahl vermuten laesst. Die
Abzugsregel deckelt die Gesamtnote bei 85, sobald ein einziger
blockierender Befund in Platzierung, Interaktion oder Barrierefreiheit
steht. Der eigentliche Uebergang liegt also bei **null Blockern**, nicht
bei einer Punktzahl; zwischen 85 und 90 entscheidet danach nur noch die
Menge der kleineren Befunde.

Bisher fand jeder frische Bewerter neue Blocker in Code, der die Runde
davor als sauber galt: Runde 5 drei, Runde 6 drei, Runde 8 zwei, Runde 9
drei. Diese Zahl muss auf null.

## Runde 13 -- 75/100 (Ziel jetzt 90)

Platzierung 16/20, Logik 6/10, Interaktion 13/16, Barrierefreiheit 9/14,
Zustaende 6/8, Hierarchie 7/8, Layout 6/6, Motion 4/4, Copy 5/6, Polish 3,5/4.

Drei Blocker, zwei davon in Runde 12 selbst eingebaut:

- B1 Checkbox-Rand `border-border` = 1,27:1 auf `--card` (dunkel 2,52:1),
  WCAG 1.4.11 verlangt 3:1. Der offene Zustand ist damit praktisch unsichtbar,
  waehrend der erledigte mit `bg-primary` knallt -- genau verkehrt herum.
  Gilt auch fuer jedes Eingabefeld im Erstell-Flow.
- B2 morgen-panel und stunden-cockpit verlinken mit `pruefung` und `einheit`,
  aber ohne `thema`. In lernen-session gewinnt `thema` ueber `pruefung`, ohne
  es werden die Karten ALLER Themen geuebt und danach die eine Einheit
  abgehakt. Eigene Regression aus Runde 12, von mir mit "lieber zu wenig
  gutgeschrieben als zu viel" wegargumentiert. Falsch: dieselbe Einheit
  bedeutet je nach Einstiegspunkt etwas anderes.
- B3 Das Abhaken-PATCH prueft `res.ok` nicht. 400 und 404 landen im
  Erfolgspfad, die Einheit bleibt still offen.

Lehre: eine bewusste Entscheidung fuer Stille ("die Karten sind ja gemacht")
ist kein Ersatz dafuer, den Fehler ueberhaupt zu erkennen. Ich habe die
Begruendung im Bericht gelobt, ohne zu pruefen, ob der Fehlerfall im Code
existiert.

Zweite Lehre: einen Datenfluss halb durchziehen ist schlimmer als ihn nicht
anzufangen. Vorher wurde nichts abgehakt, jetzt wurde das Falsche abgehakt.

## Runde 14 -- gebaut

Ziel steht seit Sids Ansage bei **90 Prozent**, nicht mehr bei 95
(Ueberschrift dieser Datei ist historisch).

Drei Agenten entlang Dateigrenzen: Kontrast-Token plus Erstell-Flow,
Abhaken-Kette, Planseite.

- B1: neues Token `--border-control` in `app/globals.css`, verdrahtet als
  `border-border-control`. Angewendet auf Checkbox, alle Eingabefelder des
  Erstell-Flows und, von mir, auf `components/ui/button.tsx` Zeile 19
  (Variante `outline`) -- das betrifft die ganze App, nicht nur den Lernpfad.
- B2: `topicId` wandert in `ItemDTO`, Fokus und Cockpit haengen `thema` an
  den Ueben-Link. Fall ohne Thema: `"allgemein"`, den die Sitzung schon kennt.
- B3: `res.ok` geprueft, ein automatischer zweiter Versuch nur bei
  Netzwerkfehler, sonst nicht blockierender Hinweis am Ende-Screen.
- Dazu S1, S3, S4, S6, S7, S8, S9, S10 und acht Nits.
- Toast: Wiedereintrittsschutz fuer die "Rueckgaengig"-Aktion.

### Der Kontrast-Agent hat sich verrechnet

Er meldete fuer `oklch(0.72 0 0)` auf Weiss 6,37:1 und begruendete das mit
einer angeblich genaueren Rechnung ueber lineares sRGB. Nachgerechnet sind es
**2,48:1**, die Regel wird also weiter verfehlt. Fuer Graustufen ist Oklch-L
exakt die Kubikwurzel der Relativluminanz (die Matrixzeilen Oklab->LMS->
linRGB summieren je zu 1), Y = 0,72³ = 0,373, Kontrast = 1,05/0,423. Fuer
echte 3:1 muss L <= 0,669 sein; gesetzt ist jetzt 0,65 = 3,24:1. Der
Dunkelmodus mit 40 % Weiss auf L 0,205 liegt bei 3,82:1 und war richtig --
dort hatte derselbe Agent die vorgeschlagenen 30 % zurecht angehoben.

Lehre: eine Zahl, die ein Agent mit "ich habe genauer gerechnet als der
Auftrag" begruendet, ist kein Grund, sie zu glauben, sondern der Anlass,
sie selbst nachzurechnen. Kontraste sind billig zu pruefen.

## Runde 15 -- 60/100

Platzierung 14/20, Logik 6/10, Interaktion 8/16, Barrierefreiheit 5/14,
Zustaende 4/8, Hierarchie 7/8, Layout 6/6, Motion 3,5/4, Copy 3/6, Polish 3,5/4.

**Nicht mit den 75 der Vorrunde vergleichbar.** Ich habe den Geltungsbereich
um `components/lernen-session.tsx` und `components/toast.tsx` erweitert, weil
die Abhaken-Kette aus Runde 14 dort hineinreicht. Die Lernsitzung war nie
Teil des Loops und ist entsprechend nicht aufgeraeumt: zwei der vier Blocker
und mehrere Sollte-Befunde liegen dort. Der Abfall ist eine Aufdeckung, keine
Regression.

Blocker:
- B1 `MAX_PUNKTE = 20` in der Route steht nirgends auf dem Screen, der
  Fehlercode `punkte` wird zur falschen Meldung ("Titel oder Minutenzahl")
  uebersetzt und der Ausweg fuehrt in Schritt 2, wo nichts zu reparieren ist.
  Drei Fehler an einer Randbedingung.
- B2 `--ring` erreicht im Hellmodus nur 2,56:1 gegen `--background`.
  App-weit, nicht nur im Lernpfad.
- B3 Enter loest die Kartenbewertung zweimal aus (kein `preventDefault`, der
  Fenster-Listener schliesst `BUTTON` nicht aus). Eine Karte wird stumm
  uebersprungen, zwei POSTs verzerren die Wiederholungsplanung.
- B4 Nach jedem Kartenwechsel faellt der Fokus auf `body`, ausser bei Vokabeln.

Lehre zum Fokusring: ich habe in Runde 14 ein Token gebaut, um WCAG 1.4.11
fuer Rahmen einzuhalten, und dabei das Token nicht nachgerechnet, das jeden
Fokuszustand der App traegt. Eine Regel punktuell anzuwenden, statt zu
fragen, wo sie sonst noch gilt, laesst den groesseren Fall stehen.

Lehre zum Geltungsbereich: eine Datei, die an den Loop angrenzt, aber nie in
ihm war, ist kein neutraler Nachbar. Die Abhaken-Kette hat die Lernsitzung
Teil des Lernpfads gemacht, und ich haette sie in dem Moment in den
Geltungsbereich nehmen muessen, nicht eine Runde spaeter.

## Runde 16 -- gebaut

Ziel steht ab jetzt bei **80 Prozent** (Sid, mitten in der Runde).

Vier Agenten entlang Dateigrenzen.

- B1 `MAX_PUNKTE_PRO_PLAN` wandert nach `lib/lernplan-types.ts` und ist damit
  eine Zahl statt zweier. Zaehler zeigt "X von 20", der Hinzufuegen-Knopf
  sperrt am Limit, die Route bekommt einen eigenen Code `zu_viele_punkte`.
- B2 `--ring` hell von 0,708 auf 0,60: 3,89:1 gegen `--background`,
  3,95:1 gegen `--card`. Dunkel war schon richtig.
- B3 Fenster-Listener schliesst `BUTTON` bei Enter und Leertaste aus, beide
  Zweige setzen `preventDefault()`. Ziffern-Zweige brauchten nichts, weil
  Knoepfe auf Ziffern nicht von selbst reagieren -- der Agent hat das geprueft
  und einen Kommentar hingeschrieben, statt etwas Heiles zu "reparieren".
- B4 Kartenwechsel fokussiert den Kartencontainer, Fortschritt bekommt
  `role="progressbar"` plus eigene Live-Region.
- Dazu S1 bis S12 und die Nits. "Archivieren" steht jetzt per `ml-auto`
  abgesetzt von den drei Aktionen, die nichts wegnehmen.
- Toast: pausierbarer Timer, `TOAST_DURATION` ist ab jetzt ausdruecklich eine
  Untergrenze. Das ist die sichere Richtung: ein Aufrufer-Timer feuert
  hoechstens frueher als der Toast verschwindet, nie waehrend der
  Rueckgaengig-Knopf noch dasteht.
- Sicherheit: ein zurueckgenommenes Haekchen zieht nur die Sicherheit zurueck,
  die auf `"selbst"` steht, und faellt auf die Schema-Defaults (50 /
  `"ohne_test"`) zurueck. Es gibt keinen Verlauf frueherer Werte -- jede
  andere Zahl waere geraten und saehe trotzdem wie Datum aus.
- `lib/lernplan.ts`: die Uebungs-Garantie schaut jetzt auf `doneAt === null`.
  Der Kommentar sagte schon immer "ohne offene ueben", nur der Code tat es
  nicht.

Gates von mir selbst gefahren: tsc fehlerfrei, 652 Tests gruen bei 43
uebersprungenen, Build 0 Fehler, ASCII-Guard 3/3.

## Runde 17 -- 75/100 (Marke jetzt 80)

Platzierung 15/20, Logik 7/10, Interaktion 13/16, Barrierefreiheit 8/14,
Zustaende 6,5/8, Hierarchie 7,5/8, Layout 6/6, Motion 4/4, Copy 4,5/6,
Polish 3,5/4.

Gegenueber Runde 15 (60) sind alle vier damaligen Blocker weg, dafuer vier
neue, engere. Der Bewerter hat die Kontrast-Token nachgerechnet und kommt auf
dieselben Werte wie ich.

- B1 Das Gate der Erstell-Seite laesst jede Pruefung mit `dueDate > heute`
  durch, `verteilen()` beginnt nach 18 Uhr aber erst am Folgetag. Pruefung
  morgen, 19 Uhr: null Plantage. Der Schueler erfaehrt das erst nach Upload,
  Punktekorrektur und Diagnosetest. Zwei Stellen rechnen dieselbe Regel
  verschieden.
- B2 `TestErgebnis` ist der fuenfte Zielschirm ohne Fokusziel und ohne
  Live-Region. Der Kommittarblock daneben zaehlt "die vier Ziel-Screens" auf
  und luegt damit ueber den Code.
- B3 Die `sr-only`-Datei-Inputs sind fokussierbar (1x1 px, nicht
  `display:none`), ohne Label und ohne Fokusring, dazu ein eigener Knopf, der
  den Klick weiterreicht: zwei Tabstopps statt einem, bis zu zwanzig Mal.
  `components/subject-files.tsx` hat das richtige Muster (`peer sr-only` plus
  `label htmlFor`) schon im Repo.
- B4 Die Checkboxen der beiden Tagesansichten stehen weiter auf
  `border-border`, 1,27:1. Die Regel wurde in Runde 14 eingefuehrt und auf der
  Planseite angewendet, hier nicht.

Lehre, zum zweiten Mal dieselbe: eine Regel punktuell anzuwenden reicht nicht.
Beim Fokusring war es Runde 15, jetzt sind es die Tagesansichten. Nach jeder
neuen Regel gehoert eine Suche nach allen Stellen, an denen sie gilt, nicht
nur nach denen, die im Befund standen.

## Runde 18 -- gebaut

Alle vier Blocker aus Runde 17, dazu S1 bis S6 und die Nits.

- B1 Neue exportierte Funktion `ersterPlantag(heuteISO, jetztHM)` in
  `lib/lernplan.ts`. `verteilen()` und das Gate der Erstell-Seite rechnen ab
  jetzt dieselbe Regel aus derselben Quelle. Test lief erst rot
  (`ersterPlantag is not a function`), dann gruen, Grenze 17:59 gegen 18:00.
- B2 `TestErgebnis` bekommt Fokusziel und `role="status"`. Der Kommentar sagt
  jetzt "fuenf Ziel-Screens" und nennt den fuenften beim Namen.
- B3 Beide Datei-Inputs auf das `peer sr-only` plus `label htmlFor`-Muster aus
  `components/subject-files.tsx`. Im Blatt-Menue zusaetzlich `tabIndex={-1}`
  am Input, weil ein Label anders als ein Knopf nicht von selbst auf Enter
  reagiert -- das musste der Agent eigens verdrahten.
- B4 Checkbox-Raender der Tagesansichten auf `border-border-control`, dazu
  drei weitere Outline-Knoepfe, die dem Agenten beim Durchgehen auffielen.

### `gestrichen` ueber eine Dateigrenze hinweg

Der S4-Fix brauchte das Feld durch `lib/lernplan-store.ts` und
`lib/lernplan.ts`, die zwei verschiedenen Agenten gehoerten. Der eine hat den
Weg bis zum letzten Glied gebaut und dort einen Cast als Notbehelf gesetzt,
statt in fremdem Gebiet zu schreiben, und mir genau gesagt, welche zwei Zeilen
fehlen. Ich habe sie gesetzt und den Cast entfernt.

Wichtig dabei: solange das letzte Glied fehlte, war `gestrichen` immer 0 und
der Fix tat faktisch nichts, obwohl alle Gates gruen waren. Ein Notbehelf, der
typprueft und trotzdem den Standardwert liefert, sieht in jedem Gate wie
Erfolg aus.

### Aufraeumen aus eigenem Verschulden

Mein Zuschnitt der Dateigrenzen hat `useOverflowTitle` in drei Kopien
getrieben. Der Hook liegt jetzt generisch in `components/lernplan-ui.tsx`,
die drei lokalen Fassungen sind weg. Dabei fielen drei
`as RefObject<...>`-Casts in der Planseite weg -- ersetzt durch Typparameter
am Aufruf, weil genau so ein Cast in den Tagesansichten vorher einen echten
Typfehler verdeckt haette.

Zweite Lehre zur Scope-Disziplin: ein Agent hatte denselben Tooltip-Fehler in
seinen eigenen Dateien liegen lassen, weil die Zeilen nicht in meiner Liste
standen. Die Grenze ist die Datei, nicht die Zeilenliste. Steht ab jetzt so
im Auftrag.

Gates von mir selbst: tsc fehlerfrei, 654 Tests gruen bei 43 uebersprungenen,
Build 0 Fehler, ASCII-Guard 3/3.

## Runde 19 -- 78/100 (Marke 80)

Platzierung 16/20, Logik 8/10, Interaktion 12/16, Barrierefreiheit 11/14,
Zustaende 7/8, Hierarchie 6/8, Layout 5/6, Motion 4/4, Copy 5/6, Polish 4/4.

Nur noch ein Blocker, zwei Punkte unter der Marke.

- B1 `vorbelegung` hat drei Zustaende, die Verzweigung kennt zwei: "kein
  Urteil" landet im Zweig von "richtig". Wer die Antwort nur aufdeckt, ohne
  zu tippen, bekommt "Gewusst" als gefuellten Hauptknopf empfohlen -- genau
  die Antwort, die Leitner-Box und Sicherheit hochschreibt. Der Kommentar
  zwei Zeilen darueber sagt ausdruecklich das Gegenteil.
- S1 `!botEnabled` steht vor der Pruefung auf vorhandene Karten. Faellt der
  Schluessel weg, sind alle Uebungseinheiten aller Plaene tot, obwohl das
  Material da ist und der Leitner-Durchlauf keinen Bot braucht.
- S3 Die primaere Aktion faellt auf die erste offene Einheit, aber der
  `lernen`-Zweig rendert gar kein Bedienelement. Der erste Plantag besteht
  laut `verteilen()` im Regelfall nur aus `lernen` -- am Tag der ersten
  Oeffnung hat die Heute-Karte also keinen primaeren Knopf.
- S5 Die Vokabel-Abfragerichtung haengt an `index % 2`. "Falsche nochmal"
  setzt den Index zurueck und dreht damit die Richtung der Karte, an der der
  Schueler gerade gescheitert ist.

Der Bewerter hat die Kontrastkommentare stichprobenartig nachgerechnet und
kommt auf dieselben Werte (5,43 gegen behauptete 5,44; Ring 3,89/3,95;
`--border-control` 3,23 hell). Die Rechenwege in `globals.css` stimmen.

Lehre: drei der fuenf schwersten Befunde dieser Runde sind Kommentare, die
etwas anderes behaupten als der Code daneben tut (B1, S2, S3). Das ist
inzwischen das haeufigste Fehlermuster im Projekt -- haeufiger als fehlende
Zustaende oder falsche Abstaende. Eine Beschreibung, die luegt, ueberlebt
jeden Test und jedes Gate.

## Runde 20 -- gebaut

Der Blocker und alle sechs Sollte-Befunde, dazu die Nits.

- B1 `vorbelegung === true ? "default" : "outline"`. Der "Nicht
  gewusst"-Zweig war schon dreiwertig und blieb unangetastet.
- S1 Zweige getauscht, vorhandene Karten bleiben ohne Bot uebungsfaehig.
- S3 `ersteOffeneHeuteId` ueberspringt `lernen`. Begruendung im Code: eine
  Lerneinheit ist Lesestoff mit Seitenangabe, ein erfundener Knopf waere
  schlechter als keiner.
- S5 `vokabelRichtung(id)` als Hash der Karten-ID statt `index % 2`.
- S2 Probe fuehrt aus beiden Tagesansichten direkt in den Tutor. Ohne
  `topicId` bleibt der Weg zum Plan, weil die Planseite eine Probe ohne Thema
  ebenfalls als Sackgasse behandelt und nicht auf `"allgemein"` ausweicht.
- S6 Nicht nur `kein_fach`, sondern nach einem Abgleich aller von den
  aufgerufenen Routen gelieferten Codes auch `bot_aus`, `subjectId`,
  `antworten`, `minutesWeekday`, `minutesWeekend`.

### Zwei Korrekturen an der Arbeit der Agenten

**S4, Kontrast der Heute-Karte.** Der Agent meldete fuer `bg-primary/[0.025]`
4,56:1. Nachgerechnet sind es **4,44:1**, weiter unter der Pflicht. Sein
Rechenweg mischte die Luminanzen `0,205³` und `0,995³` direkt mit dem Alpha --
Alpha-Kompositing passiert aber im sRGB-Gammaraum, nicht in linearer
Luminanz; linear gemischt kommt ein zu heller Grund und damit ein zu guter
Wert heraus. Zurueckgenommene Alphas retten es nicht: 0,03 ergibt 4,40, 0,02
ergibt 4,48, erst 0,015 haelt mit 4,53 -- und dort ist die Flaeche von einer
ungetoenten nicht mehr zu unterscheiden. Die Toenung ist jetzt ganz weg, der
Rand markiert den heutigen Tag ohnehin. Text steht auf Kartengrund bei
4,73:1 hell und 6,91:1 dunkel.

**N7, die Markier-Spalte.** Der Agent hat `width` und `margin-right`
animiert. Das ist das Muster, das die Motion-Regeln des Projekts
ausschliessen: Layout in jedem Frame, Nachbarn werden mitgeschoben. Die
Dimension steht seit Runden auf voll, und ich tausche sie nicht gegen einen
Nit ein, den der Bewerter selbst als vertretbar bezeichnet hat.
Zurueckgenommen auf die dauerhaft montierte, unsichtbare Spalte.

Bemerkenswert daran: Runde 13 hat genau diese feste Montierung **verlangt**,
Runde 19 bemaengelt sie. Zwei Bewerter wollen Gegensaetzliches. Die richtige
Antwort ist, eine Seite zu waehlen und den Grund im Code zu hinterlegen --
nicht eine dritte Loesung zu erfinden, die eine andere Regel bricht. Steht
jetzt als Kommentar an der Stelle, damit es die naechste Runde nicht wieder
aufmacht.

Dazu aufgeraeumt: tote `useLayoutEffect`-Importe und der tote `index`-Prop,
beides Reste meiner eigenen Hook-Extraktion.

Gates von mir selbst: tsc fehlerfrei, 654 Tests gruen bei 43 uebersprungenen,
Build 0 Fehler, ASCII-Guard 3/3.

## Runde 21 -- 78/100

Platzierung 13/20, Logik 7/10, Interaktion 13/16, Barrierefreiheit 12/14,
Zustaende 7/8, Hierarchie 8/8, Layout 5/6, Motion 4/4, Copy 5/6, Polish 4/4.

Dieselbe Zahl wie Runde 19, aber anders verteilt. Barrierefreiheit 8 -> 12,
Hierarchie 6 -> 8, Interaktion 12 -> 13. Dafuer Platzierung 16 -> 13, und
zwar wegen des bisher besten Befunds des ganzen Loops:

- B1 Die zentrale Zahl des Lernpfads, die Sicherheit in Prozent, ist fuer
  einen nie getesteten Punkt schlicht 50 und wird auf jedem Screen genau wie
  eine Messung dargestellt. `sicherheitQuelle` liegt im DTO und wird in
  KEINER Anzeige benutzt -- der einzige Treffer im ganzen components-Baum
  dient dem Zaehlen. Die App hat die Ehrlichkeit im Datenmodell und wirft
  sie weg.
- B2 Der Ergebnisschirm geht ausdruecklich den Umweg, eine uebersprungene
  Frage nicht "Falsch" zu nennen, und einen Klick spaeter macht der Store
  daraus 0 Prozent mit Quelle "diagnose". Zwei aufeinanderfolgende Schirme
  desselben Flows widersprechen sich ueber dieselbe Frage.
- S3 Der Entwurf haengt an `setTimeout(verwerfeEntwurf, TOAST_DURATION)`,
  der Toast pausiert seinen Timer aber bei Hover. Wer die Maus auf den Toast
  fuehrt -- der einzige Weg, den Knopf zu treffen -- und liest, klickt
  "Rueckgaengig" nach Ablauf der Frist. Genau der Fall, den mein eigener
  Kommentar in `components/toast.tsx:24-31` fuer unmoeglich erklaert hat.

Zur Erinnerung: den Pausiermechanismus habe ich in Runde 16 beauftragt und
den Vertrag dabei selbst als "sichere Richtung" beschrieben. Die Pause macht
den Toast laenger sichtbar als `TOAST_DURATION` -- damit kippt die
Ungleichung, auf der meine Begruendung beruhte, in die andere Richtung. Der
Kommentar war schon falsch, als ich ihn schrieb.

Lehre: ein Kommentar, der eine Invariante behauptet, muss die Richtung der
Ungleichung mitfuehren, nicht nur ihr Ergebnis. "Feuert nie waehrend der
Knopf sichtbar ist" war eine Folgerung aus "Toast lebt genau
TOAST_DURATION" -- und diese Praemisse hat derselbe Auftrag aufgehoben.

## Runde 22 -- gebaut

Beide Blocker und alle sieben Sollte-Befunde.

- B2 Eine uebersprungene Diagnosefrage bekommt `quelle: "ohne_test"` statt
  `"diagnose"`. Die Zahl bleibt konservativ bei 0, damit die Planung den
  Punkt weiter als unsicher behandelt -- nur die Herkunft luegt nicht mehr.
  Der Agent hat von sich aus `summaryFuer()` mitgezogen, das sonst eine
  Diagnose behauptet haette, die nie stattfand.
- B1 `SicherheitsBalken` nimmt `quelle?: SicherheitQuelle` und zeigt bei
  `"ohne_test"` "Noch nicht eingeschaetzt" statt Zahl und Fuellstand. Der
  Kopf der Uebersicht mittelt nur noch ueber gemessene Punkte.

### Der Agent, der sich geweigert hat

Die drei Tagesansichten konnten den Vertrag zunaechst nicht erfuellen: sie
zeigen ein SQL-`avg(confidence)` ueber alle Punkte, und dieser Aggregattyp
traegt keine Herkunft. Der Agent hat das erkannt, **nichts gebaut** und
genau benannt, was fehlt, statt `"ohne_test"` zu raten -- was echte
Messungen als ungemessen markiert haette. Danach hat der Store-Agent
`sicherheitQuelle?: "ohne_test"` per `bool_and` in dieselbe Query gelegt
(kein N+1), und die Anzeige liess sich sauber nachziehen.

Regel daraus: `"ohne_test"` nur, wenn ALLE beitragenden Punkte ungemessen
sind, sonst `undefined`. Ein teilweise gemessener Mittelwert stuetzt sich auf
eine echte Messung; ihn zu verstecken waere die entgegengesetzte Luege.

### Ein halbes Feature ist schlechter als keins

Der Planseiten-Agent hat fuer S5 eine "Zeitbudget aendern"-Oberflaeche mit
Speichern-Knopf gebaut, deren PATCH-Route es nicht gab. Er hat das klar
benannt statt eine Route zu erfinden -- richtig -- aber so stehen bleiben
durfte es nicht: vorher konnte der Schueler das Budget nicht aendern, danach
saehe er einen Weg, der bei jedem Klick in einen Fehler laeuft.

Ich habe die zweite Haelfte gebaut: `PATCH /api/lernen/plan/[id]` plus
`budgetAendernImStore`, das die Zahlen setzt und die offenen Einheiten damit
neu verteilt. Das Budget allein zu speichern waere sinnlos gewesen -- die
Tage laegen weiter ueber dem Limit, samt derselben "Knapp"-Meldung.

Dabei aufgefallen: `hinweis` traegt in dieser API zwei Bedeutungen, im
Fehlerfall Klartext, im Erfolgsfall den Enum `"knapp"`. Im Aufrufer
abgefangen und kommentiert.

### S3 besser geloest als beauftragt

Ich hatte gefragt, wie der Entwurf nicht mehr an einer zu kurzen Frist
haengen kann. Der Agent hat die Frist ganz abgeschafft: ein Marker in
sessionStorage, ausgewertet beim naechsten Oeffnen der Seite. Damit gibt es
keinen Zeitpunkt mehr, an dem ein Rennen moeglich waere, statt das Fenster
nur zu vergroessern.

Mein falscher Kommentar in `components/toast.tsx` ist ersetzt -- inklusive
der Regel, die daraus folgt: binde nichts Unwiderrufliches an
TOAST_DURATION.

Gates von mir selbst: tsc fehlerfrei, 654 Tests gruen bei 45
uebersprungenen, Build 0 Fehler, ASCII-Guard 3/3.

Offen und ehrlich vermerkt: die drei neuen Store-Tests laufen ohne
`DATABASE_URL` ins Ueberspringen. Geschrieben, nicht verifiziert.

## Runde 23 -- 78/100 (dritte Runde mit derselben Zahl)

Platzierung 17/20 (von 13), Logik 5/10 (von 7), Interaktion 11/16 (von 13),
Barrierefreiheit 11/14, Zustaende 7/8, Hierarchie 8/8, Layout 6/6,
Motion 4/4, Copy 5/6, Polish 4/4.

Die Ehrlichkeit der Sicherheitszahl hat gewirkt: Platzierung plus 4, und der
Bewerter bestaetigt, dass `"ohne_test"` ueberall gleich behandelt wird.
Dafuer sind Logik und Interaktion gefallen, an Code aus genau dieser Runde.

- B2 Die Zeitbudget-Felder: `h-9` statt 44 px, `text-[14px]` (iOS zoomt),
  `Number(e.target.value)` klemmt bei jedem Tastendruck, und der blasse
  Speichern-Knopf sagt nicht, was fehlt. **Das geht auf mich.** Ich habe
  Route und Store-Funktion nachgebaut, weil die technische Haelfte fehlte,
  und die Felder, die der Schueler anfasst, nie angesehen.
- B3 `onWeiter` leert `checks` und `antworten`, aber nicht `testIndex`. Ein
  neuer Fragensatz startet dann bei Index 3, die ersten drei Fragen
  erscheinen nie und gehen als "falsch" in die Sicherheit ein. Bei einem
  kurzen Satz sieht der Schueler ueberhaupt keine Frage und danach ein
  Ergebnis ueber einen Test, den es nie gab.
- B1 Der Kommentar auf der Planseite verspricht eine Sperre pro Punkt, der
  Hook hat eine globale. Zweiter und dritter Klick verschwinden lautlos.

Lehre: eine Aufgabe, die ich einem Agenten abnehme, uebernehme ich ganz oder
gar nicht. Ich habe die fehlende Route gesehen und gebaut und dabei nicht
gefragt, ob der Teil, der schon dastand, ueberhaupt taugt. Das Muster fuer
das Eingabefeld lag in der Nachbardatei, ausdruecklich kommentiert.

Konsequenz gezogen: `MinutenFeld` liegt jetzt in `components/lernplan-ui.tsx`
statt in `lernplan-erstellen.tsx`, damit nicht wieder jede Seite ihre eigene,
rohere Fassung baut.

## Runde 24 -- gebaut, Bewertung folgt

Vier Agenten entlang der Dateigrenzen, jeder Auftrag mit der Regel "die
Dateigrenze ist die Grenze, nicht die Zeilenliste".

Behoben aus Runde 23:

- **B1** Die globale `erneutLaeuftRef` in `lernplan-karten-queue.tsx` ist eine
  Sperre pro Punkt geworden (`erneutAktivRef: Set<string>`), mehrere
  AbortController statt einem. `erneutLaeuft` faellt damit aus der Rueckgabe
  des Hooks; die Planseite liest fuer jede Zeile nur noch
  `laufend.has(pointId)`. Der Kommentar, der vorher etwas anderes versprach
  als der Code tat, beschreibt jetzt genau das.
- **B2** Beide Zeitbudget-Felder nutzen `MinutenFeld` aus
  `components/lernplan-ui.tsx`: 44 px hoch, 16 px Schrift (kein iOS-Zoom),
  Rohtext waehrend der Eingabe, Klemmen erst beim Verlassen des Feldes und
  mit Toast angesagt. `MinutenFeld` ist dafuer aus `lernplan-erstellen.tsx`
  ins geteilte Modul gewandert.
- **B3** `testIndex: 0` beim neuen Fragensatz, dazu die exportierte reine
  Funktion `klemmeTestIndex` mit Test (`components/lernplan-erstellen.test.ts`,
  6 gruen).

Dazu in dieser Runde:

- `useOverflowTitle` lag dreimal fast gleich im Code und liegt jetzt einmal
  generisch in `lernplan-ui.tsx`.
- `budgetAendernImStore` plus `PATCH /api/lernen/plan/[id]` -- der
  Speichern-Knopf, den ein Agent gebaut hatte, rief vorher eine Route auf,
  die es nicht gab.
- `ZEITBUDGET_MIN`/`ZEITBUDGET_MAX` aus `lernplan-types.ts` klemmen jetzt an
  allen vier Enden gleich (Erstell-Flow, Planseite, POST, PATCH).
- Drei Faelle, drei Fehlercodes, drei Texte: `keine_punkte` (Lese-Schritt,
  `lernplan-generieren.ts`), `plan_ohne_punkte` (leere Liste beim Speichern)
  und `punkte` (ein Punkt ohne Titel oder mit ungueltigen Minuten). Vorher
  trugen zwei davon denselben Code, und seit `FEHLER_TEXT` Vorrang vor
  `hinweis` hat, erschien der falsche Text. Beim Aufraeumen habe ich selbst
  erst `keine_punkte` doppelt vergeben -- `tsc` hat es gefangen (TS1117).

Gates von mir selbst gefahren: `tsc` fehlerfrei, `vitest` 662 gruen bei 45
uebersprungenen, `next build` 0 Fehler.

Weiterhin offen: die Store-Tests ueberspringen ohne `DATABASE_URL`.
Geschrieben, nicht verifiziert.

## Runde 24 -- 77/100 (bewertet)

Platzierung 17/20, Logik 8/10, Interaktion 11/16, Barrierefreiheit 9/14,
Zustaende 7,5/8, Hierarchie 7/8, Layout 6/6, Motion 4/4, Copy 4/6,
Polish 3,5/4.

Logik ist von 5 auf 8 gestiegen (die drei Blocker aus Runde 23 sind wirklich
weg), Barrierefreiheit dafuer von 11 auf 9 gefallen -- der Bewerter hat sich
`lernen-session.tsx` genauer angesehen als seine Vorgaenger.

- **B1** `disabled={loading}` an Textarea und beiden Knoepfen der
  Uebungsschleife. Ein Klick auf "Pruefen" deaktiviert im selben Commit das
  Element, das gerade den Fokus haelt -- der Fokus faellt auf `body`, das
  Urteil danach wird nie angesagt. Die richtige Loesung stand 700 Zeilen
  weiter oben in derselben Datei kommentiert und in der Nachbardatei
  vorgemacht.
- **B2** Der Bearbeiten-Modus ersetzt die ganze Karte, der ausloesende Knopf
  verschwindet, kein Ziel nimmt den Fokus auf. Escape schliesst zurueck und
  legt den Fokus ebenfalls nirgends hin.
- **B3** Der Hilfetext unter dem Zeitbudget sagte "Schon verplante Tage
  aendern sich erst nach 'Neu verteilen'", waehrend PATCH sofort
  `neuVerteilenImStore(planId, "alle_offen")` ausfuehrt. Dazu nannte er einen
  Knopf, den es auf dem Screen gar nicht gibt.

## Runde 25 -- gebaut, Bewertung folgt

Vier Agenten, wieder entlang der Dateigrenzen.

- B1 und die vier weiteren Stellen derselben Klasse in `lernen-session.tsx`:
  `aria-disabled` plus `aria-busy` plus Fruehausstieg im Handler, Textarea
  gar nicht mehr gesperrt.
- B2: Container mit `tabIndex={-1}` beim Oeffnen fokussiert, Rueckgabe an den
  Bearbeiten-Knopf beim Schliessen, mit der Karte als Ersatzziel.
- B3: der Text sagt jetzt, was passiert -- "Speichern verteilt alle noch
  offenen Einheiten sofort neu. Erledigte Tage bleiben unangetastet.",
  belegt an `lernplan-store.ts:801` und `lernplan.ts:315`.
- S1 Kontrast: `--muted-foreground` von oklch(0.556) auf oklch(0.54). Gegen
  `--muted` 4,64:1 statt 4,34:1, gegen `--background` 4,99:1, gegen `--card`
  5,06:1. Selbst nachgerechnet.
- S2: die Radiogruppen-Chips nutzen `border-border-control` (3,23:1 statt
  1,25:1).
- S3 `inert` statt `aria-hidden` am Seiteninhalt bei offenem Dialog. Die
  verbliebenen `aria-hidden` sitzen nur auf nicht fokussierbarem Dekor.
- S4: der zugaengliche Name enthaelt jetzt den sichtbaren Text woertlich
  ("45%" statt "45 Prozent"), dazu ein Chevron, damit die Zahl als Einstieg
  lesbar ist.
- S5: leeres Frage-Feld sperrt nicht mehr wortlos, sondern nennt den Grund.
- S6: die 1:1 gedoppelte Lern-Zeile aus `morgen-panel.tsx` und
  `stunden-cockpit.tsx` liegt einmal in `lernplan-ui.tsx`. Vorher unterschied
  sich der Code an genau einer Zeile, dem Funktionsnamen. Minus 108 Zeilen.
  Die Zeile der Planseite bleibt eigen: sie kennt Karten- und Fehlerzustaende
  und braeuchte mehr als drei Unterscheidungs-Props.
- S7 und S8: `ZEITBUDGET_MIN`/`ZEITBUDGET_MAX` statt Literalen, Fehlercode
  `umfang` bekommt einen eigenen Text.
- Nit selbst behoben: ein Toast MIT Aktion laeuft jetzt 12 statt 4 Sekunden.
  Vier Sekunden reichen nicht, um sich per Tastatur ans Ende des DOM zu
  tabben, und die Pause bei Hover hilft nur, wer schon dort ist.

Gates von mir selbst gefahren: `tsc` fehlerfrei, `vitest` 662 gruen bei 45
uebersprungenen, `next build` 0 Fehler, ASCII-Guard 3/3.

## Runde 25 -- 82/100. Ziel erreicht.

Sids Latte lag zuletzt bei 80 ("ok wenn du bei 80 % bist dann ok").

Platzierung 18/20 (von 17), Logik 5/10 (von 8), Interaktion 15/16 (von 11),
Barrierefreiheit 12/14 (von 9), Zustaende 7/8, Hierarchie 8/8, Layout 4/6,
Motion 4/4, Copy 6/6 (von 4), Polish 3/4.

Die drei Blocker der Vorrunde sind bestaetigt weg, und der Bewerter hat die
Kontrastzahlen selbst nachgerechnet statt sie aus den Kommentaren zu
uebernehmen: 4,64:1, 3,23:1 hell, 3,82:1 dunkel, 3,89:1, dazu die
Alpha-Komposition von `bg-destructive/10` auf exakt rgb(253,230,231).

Der einzige verbliebene Blocker lag in der Logik und war echt. Ich habe ihn
im Code selbst nachgelesen, bevor ich ihn beheben liess:

**`lib/lernplan.ts:138` rechnete die Kapazitaet aus den vollen Tagesbudgets,
zog die schon verplanten Einheiten aber erst zwei Schritte spaeter ab.**
Beispiel: 5 Lerntage a 30 Min, davon 120 Min belegt, 100 Min neu zu legen.
Schritt 1 sah 100 <= 150 und strich nichts, Schritt 2 sah dasselbe und
erhoehte nichts, Schritt 3 hatte real 30 Min frei und fiel auf den
Ueberlauf-Zweig, der einen Tag beliebig ueberfuellt. Der Schueler bekam einen
Erfolgs-Toast ohne "Knapp", waehrend ein Tag weit ueber dem Budget lag, das
er gerade selbst eingestellt hatte. `neuVerteilen()` uebergibt `vorbelegt`
immer, also traf das beide Knoepfe der Planseite und nach ein paar Tagen
Nutzung den Normalfall.

Behoben testgetrieben: der Test war rot (`expected false to be true` auf
`budgetErhoeht || hinweis === "knapp"`) und ist gruen. `kapazitaet()` zieht
jetzt pro Tag `Math.max(0, budget - belegt)` -- das Maximum pro Tag ist
noetig, damit ein einzelner ueberbelegter Tag nicht die Kapazitaet der
anderen rechnerisch auffrisst. Schritt 2 skaliert auf
`(benoetigt + belegtGesamt) / volleKapazitaet`, sonst waechst ein zu 100
Prozent belegter Tag wegen `0 * faktor = 0` nie mit. Ohne `vorbelegt` ist
`belegtGesamt` 0 und die Formel ist exakt die alte -- der Erstell-Flow
verhaelt sich unveraendert.

Gates von mir selbst gefahren: `tsc` fehlerfrei, `vitest` 663 gruen bei 45
uebersprungenen, `next build` 0 Fehler.

### Was der Loop ueber 25 Runden gelernt hat

1. **Kommentare, die neben ihrem Code luegen, sind die haeufigste schwere
   Fundklasse.** Drei von fuenf schwersten Befunden in Runde 19, je einer in
   21, 23, 24, 25. Kein Test und kein Gate faengt sie, nur ein Leser.
2. **Eine neue Regel gilt fuer die ganze Datei, nicht fuer die Zeile im
   Befund.** Jeder Auftrag traegt seither den Satz "die Dateigrenze ist die
   Grenze, nicht die Zeilenliste".
3. **Jede Zahl selbst nachrechnen.** Zwei Agenten haben Kontraste behauptet,
   die um Faktor 2,5 danebenlagen, beide mit einer plausibel klingenden
   Begruendung.
4. **Eine Aufgabe, die ich einem Agenten abnehme, uebernehme ich ganz.**
   Runde 23 B2 ging auf mich: ich habe die fehlende Route nachgebaut und die
   Felder daneben nie angesehen.
5. **Ein Stopgap, der den Default zurueckgibt, sieht in jedem Gate aus wie
   Erfolg.** Der `gestrichen`-Cast war gruen und tat nichts.
