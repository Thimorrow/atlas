# Nachtbericht 2026-09-02 auf 2026-09-03

Alles gemergt, live und geprueft. Lesezeit rund fuenf Minuten.

## Das ist neu

1. Atlas hat einen Assistenten, den Atlas-Bot. Er kennt deinen Stundenplan, deine Aufgaben, Notizen, Noten und die Dateien an den Faechern.
2. Du erreichst ihn von jeder Seite mit Cmd+K oder ueber die Seite Atlas-Bot in der Seitenleiste. Beim Oeffnen steht dort kein leeres Feld, sondern dein naechster Schultag und drei Fragen zum Antippen.
3. Er legt Aufgaben und Notizen selbst an und zeigt sie als Karte mit einem Rueckgaengig daneben. Noten schlaegt er nur vor, eintragen musst du sie mit einem Klick. Loeschen kann er nichts.
4. Unter "Verlauf" kannst du nachlesen, welche Aufgabe er auf welche Bitte hin angelegt hat.
5. Neu ist die Seite "Morgen": was morgen ansteht, was bis dahin faellig ist und was Atlas zu den Faechern des Tages hinterlegt hat, alles an einer Stelle.
6. Neu ist die Seite "Pruefungen": alle Arbeiten, Tests und Referate nach Naehe geordnet, mit einem Hinweis, wenn sich mehrere in einer Woche haeufen.
7. Neu ist die Seite "Noten": dein Gesamtschnitt und jedes Fach mit muendlichem und schriftlichem Schnitt, das schwaechste zuerst.
8. In jedem Fach steht jetzt ein Rechner: Wunschnote einstellen, und du siehst, was du in der naechsten Arbeit brauchst.
9. Aus einer Schulstunde heraus laesst sich eine Hausaufgabe eintragen, mit dem Fach und der naechsten Stunde als Faelligkeit schon vorbelegt.
10. Das Modell hinter dem Bot ist kostenlos, es entstehen keine laufenden Kosten.

## Feature 1: Der Atlas-Bot

**Commit:** `b3ae85f`
**Wo:** Cmd+K von jeder Seite, oder die Seite `/bot`, oder der Eintrag "Atlas-Bot" in der Seitenleiste.
**Screenshots:** `.ytstack/shots/bot/runde-3-01-start.png` bis `runde-3-06-overlay.png`

Der Bot liest alles, was in Atlas liegt: Stundenplan, Aufgaben, Faecher, Notizen,
Noten und die Dateien an den Faechern (Text und Markdown direkt, PDF ueber die
Bibliothek `unpdf`, Bilder ueber das Modell selbst). In seinen Antworten nennt er
die Quelle. Anlegen und aendern darf er Aufgaben und Notizen. Noten schlaegt er
nur vor, eintragen kannst nur du. Ein Loesch-Werkzeug gibt es bewusst nicht.

Die Antwort laeuft Wort fuer Wort ein, darueber steht in einer Zeile, was er
gerade tut ("liest Mathe-Notizen", "legt Aufgabe an"). Legt er etwas an,
erscheint der Datensatz als echte Karte im Verlauf, mit einem Rueckgaengig
daneben, statt dass ein Satz das Anlegen bloss behauptet.

**Modell:** `minimax/minimax-m3-free` ueber das Vercel AI Gateway. Von 368
Modellen im Gateway sind fuenf kostenlos; dieses hat als einziges davon
1 Million Zeichen Kontext, kann Werkzeuge aufrufen und Bilder lesen. Belegt
durch einen echten Aufruf, der `"cost": 0` zurueckmeldet. Ist es ausgelastet
(das kam beim Bauen mehrfach vor), sagt Atlas das in ruhigem Deutsch und
versucht einmal `minimax/minimax-m2.7-free`, ebenfalls kostenlos und ebenfalls
mit einem echten Aufruf geprueft.

Ohne hinterlegten Schluessel schaltet sich der Bot stumm ab und zeigt einen
Hinweis, genau wie die Microsoft-Anbindung es heute schon macht. Die App laeuft
davon unberuehrt weiter.

**Emil-Runden:** 3 in der abschliessenden Sequenz, dazu eine vorgezogene Runde
und eine Review-Runde von mir. Gefunden und behoben wurden unter anderem: ein
fehlender Umlaut in einem Vorschlagstext, ein leerer Startzustand mit 600 Pixeln
toter Flaeche, ein Abbrechen-Knopf ohne erkennbares Symbol, verlorene
Absatzumbrueche in den Antworten, ein zu starker Weichzeichner im Overlay, und
ein Fehler in der geteilten Toast-Komponente, die Erfolgsmeldungen mit einem
roten Warnsymbol zeigte und das Eingabefeld ueberlagerte.

**Zuletzt offen:** das kostenlose Modell laesst gelegentlich ein Leerzeichen
zwischen zwei Saetzen weg. Das kommt aus dem Modell selbst und laesst sich in
der Oberflaeche nicht sauber reparieren.

## Feature 2: Notenuebersicht

**Commit:** `0c64824`
**Wo:** Seitenleiste, Eintrag "Noten", oder die Seite `/noten`
**Screenshots:** `.ytstack/shots/noten/runde-3-01-uebersicht.png`

Atlas rechnet Fachschnitte schon lange, aber es gab keine Seite, die sie
zusammen zeigt. Wer wissen wollte, wie er insgesamt dasteht, musste jedes Fach
einzeln aufmachen.

Oben steht der Gesamtschnitt in Punkten und als Note, dazu, woraus er sich
rechnet. Darunter jedes Fach mit muendlichem und schriftlichem Schnitt
getrennt, das schwaechste zuerst, damit auffaellt, wo es eng wird. Die elf
Faecher ohne Note stehen nicht als leere Kacheln dazwischen, sondern als eine
ruhige Zeile darunter. Ganz unten die zuletzt eingetragenen Noten. Stehen zu
wenige Noten fuer eine ehrliche Aussage da, sagt die Seite das, statt eine Zahl
zu erfinden. Eingetragen werden Noten weiter im Fach, dorthin fuehrt jede Zeile.

**Emil-Runden:** 3. Runde 1 fand fehlende Schatten auf drei Kartenflaechen und
Skeleton-Hoehen, die vom echten Layout abwichen und beim Laden einen Sprung
verursachten. Runde 2 und 3 fanden nichts Substanzielles mehr.

## Feature 3: Zielnoten-Rechner

**Commit:** `358684f`
**Wo:** in jedem Fach unter der Notenliste, Abschnitt "Was brauche ich noch?"
**Screenshots:** `.ytstack/shots/zielnote/runde-2-01-erreichbar.png`, `runde-2-02-unerreichbar.png`

Vor jeder Klassenarbeit dieselbe Frage: "Ich stehe auf 9 Punkten und will auf
11, was muss ich schreiben?" Atlas hatte alle Zahlen dafuer, hat sie aber nie
zusammengebracht.

Wunschnote einstellen, dazu ob die naechste Note schriftlich oder muendlich
zaehlt und ob sie einfach oder doppelt gewichtet ist, und die noetige
Punktzahl steht sofort da, ohne Absenden. Die Rechnung kehrt den vorhandenen
Fachschnitt um statt sich eine eigene Notenlogik auszudenken, samt der
Gewichtung von muendlich zu schriftlich, die am Fach hinterlegt ist. Ist das
Ziel schon erreicht, sagt sie das. Ist es selbst mit 15 Punkten nicht mehr zu
schaffen, sagt sie auch das, samt der Zahl, die dann herauskaeme. Neun Tests
decken die Randfaelle ab.

**Emil-Runden:** 2. Runde 1 fand, dass der Ergebnissatz zwischen drei
unterschiedlich langen Texten wechselt und dabei die Seite springen laesst.
Runde 2 bestaetigte den Fix.

**Von mir nachgebessert:** im Auswahlfeld stand ein Gedankenstrich
(zwischen Punktzahl und Note), der gehoert nicht in Oberflaechentexte.
Dort steht jetzt "15 Punkte (Note 1+)".

## Feature 4: Pruefungsplan

**Commit:** `b38083a`
**Wo:** Seitenleiste, Eintrag "Pruefungen", oder die Seite `/pruefungen`
**Screenshots:** `.ytstack/shots/pruefungen/runde-4-01-liste.png`

Klassenarbeiten, Tests und Referate standen bisher zwischen allen Hausaufgaben
in einer langen Liste. Die naechste Pruefung steht jetzt gross oben mit Fach,
Art, Datum und den verbleibenden Tagen, danach die weiteren nach Woche
gruppiert. Fallen drei in eine Woche oder zwei auf denselben Tag, steht das
dezent daneben, denn genau das ist die eigentliche Information, die eine reine
Liste verschluckt. Vergangenes verschwindet aus der Liste und bleibt unten
aufklappbar. Eintragen geht direkt von der Seite aus.

**Emil-Runden:** 4. Gefunden wurden unter anderem eine tote Hover-Animation
ohne Wirkung, eine Dialog-Ueberschrift "Neue Aufgabe" hinter einem Knopf
"Neue Pruefung", und ein Warnrot fuer eine Information, die keine Warnung ist.

**Von mir nachgebessert:** Zeilen ohne Fach haben keinen Pfeil und verschoben
damit die Tagesangaben der Nachbarzeilen. Der Platz bleibt jetzt stehen.

## Feature 5: Morgen-Ansicht

**Commit:** `339513f` (Navigation: `f7e8fa9`)
**Wo:** Seitenleiste, Eintrag "Morgen", oder die Seite `/morgen`
**Screenshots:** `.ytstack/shots/morgen/runde-2-01-morgen.png`

Abends kommt jeden Tag dieselbe Frage: was ist morgen, was muss ich noch
machen, was gehoert in die Tasche. Steht eine Pruefung an, steht sie oben,
denn dann ist alles andere zweitrangig. Darunter die Stunden des Tages mit
Raum und Lehrer, Ausfaelle und Vertretungen sichtbar statt stillschweigend
fehlend. Dann alles, was bis dahin faellig ist, zum Abhaken, Ueberfaelliges
deutlich gekennzeichnet. Zuletzt, was Atlas zu den Faechern des Tages
hinterlegt hat. Was Atlas nicht weiss, behauptet es auch nicht: welches Buch
im Regal steht, kann es nicht sagen. Ist morgen Wochenende oder schulfrei,
zeigt die Seite den naechsten Schultag.

**Emil-Runden:** 2. Runde 1 fand einen echten Fehler: eine Pruefung am Zieltag
erschien doppelt, gross in der Pruefungskarte und noch einmal in der
Faellig-Liste. Runde 2 bestaetigte den Fix.

**Zuletzt offen:** der Fall "morgen ist Wochenende" liess sich am echten
Datum nicht abfotografieren, weil morgen ein Schultag ist. Die Logik dafuer
ist durch Tests abgedeckt.

## Feature 6: Hausaufgabe direkt aus der Schulstunde

**Commit:** `af51038`
**Wo:** im Stundenplan, aus einer einzelnen Schulstunde heraus
**Screenshots:** `.ytstack/shots/stunde-aufgabe/runde-2-02-formular-vorbelegt.png`, `runde-2-06-tagesansicht-marker.png`

Der Lehrer sagt "bis naechste Stunde Seite 84", und der Stundenplan liegt
offen. Bisher hiess das trotzdem: auf die Aufgabenseite wechseln, etwas Neues
anlegen, das Fach aus einer Liste suchen, das Datum von Hand raussuchen.

Jetzt geht es aus der Stunde heraus. Das Fach steht fest, und die Faelligkeit
ist mit der naechsten Stunde desselben Fachs vorbelegt, ermittelt aus dem
echten Plan. Faellt die naechste Stunde aus, wird die uebernaechste genommen.
Ist keine weitere bekannt, wird nichts geraten, sondern das Feld bleibt leer.
Damit die Aufgabe spaeter nicht untergeht, zeigt die Stunde, an der sie
faellig ist, einen Punkt, so wie eine Stunde mit Notiz es heute schon tut.

**Emil-Runden:** 1 mit Funden, 1 zur Bestaetigung. Gefunden wurden ein
Fachname mit Schraegstrich, der den Hinweistext zerbrach
("Wirtschaft/Politik-Stunde"), ein irrefuehrendes Symbol, und ein Hinweis,
der nicht mit seinem Eingabefeld verknuepft war.

**Von mir nachgebessert:** der Punkt an der Stunde war ein nacktes Zeichen
ohne jede Erklaerung. Er hat jetzt eine Beschriftung, fuer die Maus und fuer
Vorleseprogramme.

## Feature 7: Bot-Verlauf

**Commit:** `b8dbcb1`
**Wo:** aus dem Bot heraus ueber "Verlauf", oder die Seite `/bot/verlauf`
**Screenshots:** `.ytstack/shots/bot-verlauf/runde-2-01-liste.png`, `runde-2-02-schreibend.png`

Der Bot darf Aufgaben und Notizen selbst anlegen, und jedes Gespraech wurde
schon mitgeschrieben. Nur ansehen konnte man es nicht, dafuer musste man die
Schnittstelle direkt abfragen. Bei einem Assistenten, der Daten schreibt, ist
das die wichtigste Kontrollmoeglichkeit, deshalb kam die Ansicht noch dazu.

Gespraeche, in denen etwas angelegt oder geaendert wurde, sind auf einen Blick
von reinen Fragen zu unterscheiden. Ein geoeffnetes Gespraech liest sich wie
der Chat selbst, samt der Karten der angelegten Aufgaben an der Stelle, an der
sie entstanden. Was der Bot gelesen hat, steht als ruhige Zeile dabei und
laesst sich aufklappen. Der Verlauf beschoenigt nichts: gescheiterte
Schreibversuche stehen als gescheitert da, und eine Aufgabe, die es nicht mehr
gibt, wird als nicht mehr vorhanden gekennzeichnet.

**Emil-Runden:** 2. Runde 1 fand zwei echte Probleme: fehlgeschlagene
Schreibversuche waren wie Erfolge formuliert, und beim Lesen einer Datei
landete der komplette Rohinhalt ungekuerzt in der Ansicht.

## Zwei Fehler, die erst die Schlusspruefung fand

Nach allen Features lief eine unabhaengige Pruefung ueber den gesamten Stand,
gezielt auf das, was Typpruefung, Tests und Build nicht finden. Sie fand einen
Weg zu Datenverlust, ich selbst danach noch einen zweiten derselben Art. Beide
sind behoben, beide haben jetzt Tests.

**`09a4c01` Der Bot durfte eine Notiz leer schreiben.** Beim Aendern einer
Notiz war der Titel gegen leere Werte geschuetzt, der Text nicht. Ein Modell,
das versehentlich ein leeres Textfeld mitschickt, haette den kompletten Inhalt
einer Notiz ueberschrieben, ohne Rueckgaengig und ohne dass es auffaellt. Der
Bot soll nichts loeschen, und ein leerer Text ist genau das.

**`bf53cda` Ein unverstandenes Datum loeschte die Faelligkeit.** "Verschieb
die Mathe-Hausaufgabe auf nach den Ferien" liess sich nicht in ein Datum
aufloesen, und das Ergebnis war eine Aufgabe ganz ohne Faelligkeit. Sie waere
damit stillschweigend aus dem Pruefungsplan und der Morgen-Ansicht
verschwunden. Jetzt bleibt eine unverstandene Angabe wirkungslos, und der Bot
kann nachfragen.

Dabei entstanden die ersten Tests fuer die Schreibwerkzeuge des Bots. Sie
belegen unter anderem, dass es weiterhin kein Loeschwerkzeug gibt.

Die Pruefung fand ausserdem **nichts** bei: einem Weg, Noten ohne Bestaetigung
einzutragen, Geheimnissen in Code, Logs oder Fehlermeldungen, ungeschuetzten
neuen Routen (alle liegen hinter der Passwortsperre), Abstuerzen bei kaputten
Modellantworten, und Rechenfehlern an Tages- oder Zeitzonengrenzen.

## Nach dem Bauen: der Bot im echten Gebrauch

Zum Schluss habe ich dem fertigen Bot Fragen gestellt, deren Antwort ich vorher
aus der Datenbank kannte. Drei Dinge kamen dabei heraus.

**Er erfindet nichts.** Auf "Fass mir meine Mathe-Notizen zusammen", wo gar
keine Mathe-Notiz existiert, antwortete er: "Du hast aktuell keine Notizen im
Fach Mathe angelegt", und bot an, eine anzulegen. Auf die Frage nach der
Biologie-Note nannte er die richtige Zahl, die richtige Art und den richtigen
Fachschnitt.

**Das Rate-Limit gilt fuer das ganze Konto, nicht je Modell.** Alle vier
kostenlosen Modelle im Gateway antworten gleichzeitig mit 429. Der Wechsel auf
ein Ausweichmodell hilft also nur, wenn ein Modell ausfaellt, nicht wenn das
Limit greift. Ich habe gemessen, wie lange es haelt: rund 80 Sekunden. Damit
waere ein automatischer Wiederversuch sinnlos, er wuerde nur die ehrliche
Meldung verzoegern. Die bestehende Antwort "Das kostenlose Modell ist gerade
ausgelastet, versuch es in einer Minute noch einmal" trifft es zeitlich genau,
und deshalb bleibt es dabei.

**`c1766fc` Zwei Luecken, die erst dabei auffielen.** Der Bot wusste nichts von
den Seiten, die heute Nacht entstanden sind, und konnte auf die Frage "wo sehe
ich die anstehenden Arbeiten" nicht auf den Pruefungsplan verweisen. Und dem
Werkzeug fuer Aufgaben fehlte ein Filter nach Art, weshalb er alle Aufgaben las,
von Hand nachsortierte und dem Nutzer dabei sein eigenes Werkzeugproblem
erklaerte ("Ich hab den Typ-Filter nicht wie erwartet unterstuetzt bekommen").
Beides ist behoben und mit einem echten Aufruf belegt.

## Der Zustand, in dem du die App morgen frueh vorfindest

Weil der Gateway-Schluessel bei Vercel noch nicht hinterlegt ist, laeuft die
Live-App zunaechst **ohne** Bot. Genau diesen Zustand habe ich geprueft, indem
ich den Schluessel lokal herausgenommen habe:

- Der Build laeuft ohne den Schluessel durch.
- Alle Seiten antworten weiter mit 200, auch `/bot` und `/bot/verlauf`.
- Der Bot zeigt statt eines Eingabefelds einen ruhigen Hinweis und stuerzt
  nirgends ab.

Dabei fiel auf, dass ausgerechnet dieser Satz, das Einzige, was vom Bot dann zu
sehen ist, mit "Dafuer" statt "Dafür" dastand und offen liess, was das fuer den
Rest der App bedeutet. Behoben in `e3dae08`. Screenshot dieses Zustands:
`.ytstack/shots/bot-ohne-key.png`.

Sobald du den Schluessel eintraegst, ist der Bot ohne weiteres Zutun da.

## Bewusst nicht gebaut

- **Lernkarten mit Abfragemodus aus den Notizen** -- gutes Feature, aber mit
  ehrlicher Oberflaeche (Kartenstapel, Wiederholungslogik, Fortschritt)
  deutlich mehr als zwei Stunden. Halb gebaut waere es schlechter als gar nicht.
- **Push-Benachrichtigungen fuer faellige Aufgaben** -- braucht einen Service
  Worker, VAPID-Schluessel und eine Erlaubnis, die du selbst am Geraet erteilen
  musst. Ueber Nacht nicht verifizierbar.
- **Pomodoro- oder Lerntimer** -- klingt nett, spart aber keinen Handgriff, den
  du wirklich machst. Dafuer gibt es jede Uhr.
- **Fehlzeiten und Krankmeldung** -- die Daten liegen in Untis hinter
  Zugaengen, die Atlas nicht hat. Ohne echte Quelle waere es eine Attrappe.
- **Tafelfoto mit Texterkennung in der Stundennotiz** -- der Bot kann Bilder
  lesen, aber der Upload-Weg an der Schulstunde ist ein eigenes Feature. Der
  Bot deckt den Kern schon ab.
- **Eigene globale Suche per Cmd+K** -- Cmd+K gehoert dem Bot, und der findet
  dieselben Inhalte, nur mit Antwort statt Trefferliste.

## Gescheitert

Nichts. Alle sieben begonnenen Features sind fertig geworden.

## Neue npm-Pakete

- **`pg`** und **`@types/pg`** -- der Postgres-Treiber fuer die lokale
  Entwicklung. In der Produktion laeuft weiter Neon.
- **`unpdf`** -- damit liest der Bot PDF-Dateien. Gratis.
- **`@playwright/test`** (nur Entwicklung) -- der echte Browser fuer die
  Screenshot-Runden.

Alle vier sind kostenlos und verbreitet. Keine kostenpflichtigen Dienste, keine
laufenden Kosten.

## Neue Migration

**`drizzle/0012_fluffy_lady_bullseye.sql`** legt `bot_conversations` und
`bot_messages` an. Rein additiv: nur neue Tabellen, kein DROP, kein RENAME,
keine Aenderung an bestehenden Spalten. Sie wurde lokal zweimal hintereinander
ueber `/api/admin/migrate` gefahren, beide Male fehlerfrei.

## Neue Umgebungsvariable

**`AI_GATEWAY_API_KEY`** -- der Schluessel fuer den Bot, in `.env.example`
dokumentiert. Ohne ihn schaltet sich der Bot stumm ab, alles andere laeuft
unveraendert. **Er ist bei Vercel noch nicht hinterlegt**, siehe offene Fragen.

## Was von mir eine Entscheidung braucht

1. **Den Gateway-Schluessel bei Vercel eintragen.** Der Versuch per
   `vercel env add` wurde abgelehnt, weil dabei ein Schluessel an einen
   externen Dienst gegangen waere. Bitte im Vercel-Dashboard unter Settings ->
   Environment Variables fuer preview und production eintragen, der Wert steht
   in `.env.local`. Bis dahin zeigt der Bot in der Live-App nur seinen Hinweis.
2. **Der Branch `origin/v0/design-system-96511499`** (Design-System-Schaukasten)
   blieb liegen. Er haengt an einem aelteren Stand und muesste vor einem Merge
   erst nachgezogen werden.

## Zustand von `main` und der Live-App

**`main` ist aktuell und laeuft.** Der Branch hatte acht Commits Rueckstand und
hat sie mit diesem Merge alle aufgeholt, dazu die vierzehn Commits der Nacht.
Vor dem Push liefen die drei Pruefungen **auf `main` selbst** noch einmal, alle
gruen: `npx tsc --noEmit` ohne Fehler, `npm test` mit 277 Tests, `npm run build`
erfolgreich. Kein Commit hat eine Datei unter `android/` beruehrt.

Reihenfolge wie vorgesehen: `nacht/2026-09-03` -> `schule-scope` (sauberes
Fast-Forward) -> `main` (ohne einen einzigen Konflikt). Alle drei Branches
stehen jetzt auf `61d35a5`.

**Live-URL:** https://atlas-ten-orpin.vercel.app
**Deploy-Status: READY.** Der Push hat den Production-Deploy ausgeloest, er ist
durchgelaufen.

**Die Migration auf Production war tatsaechlich noetig.** Der Aufruf von
`/api/admin/migrate` meldet: `0011` (die Stundennotizen) wurde mit fuenf
Anweisungen **zum ersten Mal** angewendet, sie war also wie vermutet nie live.
`0012` (die Bot-Tabellen) ebenfalls neu. Alles davor lag schon an.

**Danach echt nachgeprueft, alles mit Anmeldung gegen die Live-App:**

- `/api/home` antwortet mit dem echten Stundenplan der laufenden Woche.
- `/api/morgen` antwortet und nennt richtig den 4. September als "Morgen".
- `/api/bot` meldet `enabled: false` mit dem Hinweis auf den fehlenden
  Schluessel, genau wie es soll.
- `/api/bot/verlauf` antwortet mit einer leeren Liste, die Tabellen sind da.
- Die Seiten `/morgen`, `/pruefungen`, `/noten`, `/bot` und `/bot/verlauf`
  liefern alle 200.

**Was du beim ersten Aufmachen sehen wirst.** In deiner echten Datenbank steht
bisher **keine einzige Aufgabe**. Der Stundenplan ist da (morgen Englisch,
Mathematik und Physik, live geprueft), aber Aufgaben, Pruefungen und Noten sind
leer. Die neuen Seiten zeigen deshalb zunaechst ihre Leerzustaende, und das ist
richtig so, nicht kaputt. Die Screenshots im Bericht zeigen dagegen volle
Ansichten, weil dafuer eine lokale Datenbank mit Beispieldaten lief. Sobald du
die erste Hausaufgabe eintraegst, am schnellsten aus der Schulstunde heraus
oder ueber den Bot, fuellen sich Morgen-Ansicht und Pruefungsplan von selbst.

**`.env.local` wurde zurueckgesetzt** auf den Zustand vor der Nacht, gepruefte
Gleichheit mit der Kopie von 23:57. Waehrend der Nacht standen dort eine lokale
`DATABASE_URL` und ein lokal erzeugtes `ATLAS_SESSION_SECRET`, beide sind
wieder leer. Die echte Neon-Datenbank wurde nie beschrieben, nur einmal lesend
abgefragt und am Ende migriert.
