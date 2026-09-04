-- Lehrplan an den Faechern vorbelegen (erzeugt von scripts/gen-lehrplan-sql.mts,
-- nicht von Hand aendern -- Quelle ist lib/lehrplan/nrw-g9-klasse-10.ts).
--
-- Trifft ueber den Anzeigenamen ODER den Untis-Wert, jeweils case-insensitiv,
-- weil Faecher aus dem Sync oft nur "M" oder "BI" heissen. Setzt ausschliesslich
-- dort, wo noch nichts steht: ein selbst geschriebener Lehrplan bleibt.

-- Deutsch
UPDATE "subjects" SET
  "curriculum" = '## Sprache

- Strukturen in Texten: Kohärenz, Textaufbau, sprachliche Mittel
- Sprachebenen: Sprachvarietäten, Sprachstile, Diskriminierung durch Sprache
- Sprachgeschichte und Sprachwandel
- Mehrsprachigkeit

## Texte

- Konfiguration, Handlungsführung und Textaufbau: Roman, Erzählung, Drama, kurze epische Texte
- Literarische Sprache und bildliche Ausdrucksformen: Gedichte
- Sachtexte
- Textübergreifende Zusammenhänge: Gattungen, Produktions- und Rezeptionsgeschichte
- Schreibprozess
- Literarische Texte: Fiktionalität, Literarizität

## Kommunikation

- Kommunikationssituationen: Präsentation, Bewerbungsgespräch, formalisierte Diskussionsformen
- Kommunikationsrollen
- Kommunikationskonventionen
- Gesprächsstrategien

## Medien

- Medien als Hilfsmittel
- Medienrezeption: audiovisuelle Texte
- Qualität und Darstellung von Informationen
- Meinungsbildung als medialer Prozess

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_d_klp_3409_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('deutsch', 'd') OR lower("untis_subject") IN ('deutsch', 'd'));
--> statement-breakpoint
-- Mathematik
UPDATE "subjects" SET
  "curriculum" = '## Arithmetik/Algebra

- Zahlbereichserweiterung reelle Zahlen
- Potenzen, Wurzeln, Logarithmen
- Potenz- und Wurzelgesetze
- Lösungsverfahren quadratischer Gleichungen: quadratische Ergänzung, p-q-Formel, Satz von Vieta
- Exponentialgleichungen

## Funktionen

- Quadratische Funktionen: Normalform, Scheitelpunktform, faktorisierte Form
- Exponentielle Funktionen
- Sinusfunktionen

## Geometrie

- Kreis: Umfang, Flächeninhalt, Tangente
- Körper: Kugel, Zylinder, Prisma, Kegel, Pyramide
- Zentrische Streckung und Aehnlichkeit
- Satz des Pythagoras, Kosinussatz
- Trigonometrie: Sinus, Kosinus, Tangens

## Stochastik

- Statistische Daten: Erhebung, Diagramm, Manipulation
- Bedingte Wahrscheinlichkeit, stochastische Unabhängigkeit
- Vierfeldertafel, Baumdiagramme, Pfadregeln

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_m_klp_3401_2019_06_23_0.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('mathematik', 'm', 'ma', 'mathe') OR lower("untis_subject") IN ('mathematik', 'm', 'ma', 'mathe'));
--> statement-breakpoint
-- Englisch
UPDATE "subjects" SET
  "curriculum" = '## Persönliche Lebensgestaltung

- Lebenssituation, Alltag, Freizeitgestaltung Jugendlicher
- Lernen und Arbeiten
- Digitale Medien
- Peer group, Jugendkulturen
- Liebe und Freundschaften

## Ausbildung/Schule

- Schulsystem und Schulalltag in einem weiteren anglophonen Land
- Schulisches Lernen im digitalen und globalisierten Zeitalter
- Schüleraustausch

## Teilhabe am gesellschaftlichen Leben

- Anglophone Lebenswirklichkeiten global: geografisch, wirtschaftlich-technologisch, kulturell, sozial, politisch
- Migration und Mobilität
- Digitale Medien für die Gesellschaft
- Werbung, Konsum, Verbraucherschutz
- Gesellschaftliches Engagement
- Demokratie und Menschenrechte

## Berufsorientierung

- Schülerjobs, Praktika
- Berufsprofile im digitalen Zeitalter
- Bewerbungsverfahren

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_e_klp_3417_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('englisch', 'e', 'eng') OR lower("untis_subject") IN ('englisch', 'e', 'eng'));
--> statement-breakpoint
-- Latein
UPDATE "subjects" SET
  "curriculum" = '## Antike Welt

- Gesellschaft: Stände, soziale Spannungen
- Staat und Politik: Republik/Prinzipat, Herrschaftsanspruch, Expansion
- Philosophie: Stoa, Epikureismus
- Literatur: zentrale Autoren und Werke

## Textgestaltung

- Textstruktur: Argumentationsstrategien, Erzählperspektive, Leserlenkung
- Sprachlich-stilistische Gestaltung: Hypotaxe/Parataxe, Stilmittel
- Textsorten: Fabel, Gedicht, Bericht, politische Rede

## Sprachsystem

- Erweiterter Grundwortschatz
- e- und u-Deklination
- Futur I
- Konjunktiv Präsens und Perfekt
- Deponentien
- Ablativus absolutus
- Gerundium und Gerundivum
- Konjunktivische Hauptsätze
- Komparation

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_l_klp_3402_2019_06_23_0.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('latein', 'l') OR lower("untis_subject") IN ('latein', 'l'));
--> statement-breakpoint
-- Biologie
UPDATE "subjects" SET
  "curriculum" = '## Oekologie und Naturschutz

- Merkmale eines Oekosystems: heimisches Oekosystem, charakteristische Arten und Angepasstheiten, biotische Wechselwirkungen
- Energiefluss und Stoffkreisläufe: Fotosynthese, Kohlenstoffkreislauf, Nahrungsnetze
- Naturschutz und Nachhaltigkeit: Eingriffe des Menschen, Biotop- und Artenschutz

## Evolution

- Grundzüge der Evolutionstheorie: Variabilität, natürliche Selektion, Fortpflanzungserfolg
- Entwicklung des Lebens auf der Erde: Erdzeitalter, Leitfossilien, biologischer Artbegriff
- Evolution des Menschen: Hominidenevolution

## Genetik

- Cytogenetik: DNA, Chromosomen, Mitose, Meiose, Karyogramm, Genommutation, Pränataldiagnostik
- Regeln der Vererbung: Gen- und Allelbegriff, Familienstammbäume

## Mensch und Gesundheit

- Hormonelle Regulation: Blutzuckerregulation, Diabetes
- Immunbiologie: Infektionskrankheiten, Immunreaktion, Allergien, Impfungen, Antibiotika
- Neurobiologie: Neuron und Synapse, Drogenkonsum, Stress

## Sexualerziehung

- Hormonelle Steuerung des Zyklus
- Verhütung, Schwangerschaftsabbruch
- Umgang mit der eigenen Sexualität

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_bi_klp_-3413_2019_06_23_0.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('biologie', 'bi', 'bio') OR lower("untis_subject") IN ('biologie', 'bi', 'bio'));
--> statement-breakpoint
-- Chemie
UPDATE "subjects" SET
  "curriculum" = '## Elemente und ihre Ordnung

- Eigenschaften von Alkalimetallen, Halogenen, Edelgasen
- Periodensystem der Elemente
- Differenzierte Atommodelle, Elektronenkonfiguration

## Salze und Ionen

- Ionenbindung: Anionen, Kationen, Ionengitter
- Eigenschaften von Ionenverbindungen: Kristalle, Leitfähigkeit
- Verhältnisformel, Gesetz der konstanten Massenverhältnisse, Reaktionsgleichung

## Chemische Reaktionen durch Elektronenübertragung

- Oxidation, Reduktion
- Galvanisches Element, Akkumulator, Batterie, Brennstoffzelle
- Elektrolyse

## Molekülverbindungen

- Unpolare und polare Elektronenpaarbindung
- Elektronenpaarabstossungsmodell, räumliche Strukturen, Dipolmoleküle
- Zwischenmolekulare Wechselwirkungen: Wasserstoffbrücken
- Katalysator

## Saure und alkalische Lösungen

- Eigenschaften saurer und alkalischer Lösungen
- Neutralisation und Salzbildung
- Einfache stöchiometrische Berechnungen: Stoffmenge, Stoffmengenkonzentration
- Protonenabgabe und -aufnahme

## Organische Chemie

- Alkane und Alkanole
- Makromoleküle: ausgewählte Kunststoffe
- Zwischenmolekulare Wechselwirkungen: Van-der-Waals-Kräfte
- Treibhauseffekt

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ch_klp_3415_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('chemie', 'ch', 'che') OR lower("untis_subject") IN ('chemie', 'ch', 'che'));
--> statement-breakpoint
-- Physik
UPDATE "subjects" SET
  "curriculum" = '## Optische Instrumente

- Spiegelungen: Reflexionsgesetz, Bildentstehung am Planspiegel
- Lichtbrechung: Totalreflexion, Lichtleiter, Sammellinsen, Auge
- Licht und Farben: Spektralzerlegung, Farbmischung

## Sterne und Weltall

- Sonnensystem: Mondphasen, Finsternisse, Jahreszeiten, Planeten
- Universum: Himmelsobjekte, Sternentwicklung

## Bewegung, Kraft und Energie

- Geschwindigkeit, Beschleunigung
- Kraft: Wechselwirkungsprinzip, Gewichtskraft und Masse, Kräfteaddition, Reibung
- Goldene Regel der Mechanik: einfache Maschinen
- Energieformen und Energieumwandlung, Leistung

## Druck und Auftrieb

- Druck in Flüssigkeiten und Gasen: Dichte, Schweredruck, Auftrieb
- Archimedisches Prinzip, Luftdruck

## Elektrizität

- Elektrostatik: Ladungen und Felder, Spannung
- Elektrische Stromkreise: Widerstand, Reihen- und Parallelschaltung
- Elektrische Energie und Leistung

## Ionisierende Strahlung und Kernenergie

- Alpha-, Beta-, Gamma-Strahlung, radioaktiver Zerfall, Halbwertszeit
- Wechselwirkung von Strahlung mit Materie, Strahlenschutz
- Kernspaltung, Kernfusion, Kernkraftwerke, Endlagerung

## Energieversorgung

- Induktion und Elektromagnetismus: Elektromotor, Generator, Transformator
- Bereitstellung und Nutzung von Energie: Kraftwerke, regenerative Anlagen, Wirkungsgrad

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ph_klp_3411_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('physik', 'ph', 'phy') OR lower("untis_subject") IN ('physik', 'ph', 'phy'));
--> statement-breakpoint
-- Geschichte
UPDATE "subjects" SET
  "curriculum" = '## Lebenswelten im Mittelalter

- Städte und ihre Bewohnerinnen und Bewohner
- Begegnungen von Christen, Juden und Muslimen
- Transkontinentale Handelsbeziehungen zwischen Europa, Asien und Afrika

## Frühe Neuzeit: Neue Welten, neue Horizonte

- Renaissance, Humanismus, Reformation
- Hexenverfolgungen und Dreißigjähriger Krieg
- Entdeckungen und Eroberungen
- Vernetzung und Verlagerung globaler Handelswege

## Das lange 19. Jahrhundert

- Französische Revolution und Wiener Kongress
- Revolution von 1848/49 und deutsche Reichsgründung
- Industrialisierung und Arbeitswelten

## Imperialismus und Erster Weltkrieg

- Imperialistische Expansionen in Afrika
- Ursachen, Merkmale und Verlauf des Ersten Weltkriegs
- Epochenjahr 1917
- Pariser Friedensverträge

## Weimarer Republik

- Etablierung einer Demokratie
- Innen-, aussenpolitische und gesellschaftliche Chancen und Belastungen
- Massenmedien, Konsumgesellschaft, Kunst und Kultur
- Weltwirtschaftskrise

## Nationalsozialismus und Zweiter Weltkrieg

- Ende des Rechts- und Verfassungsstaats 1933/34
- Ideologie und Herrschaftssystem des Nationalsozialismus
- Alltagsleben in der NS-Diktatur: Zustimmung, Unterdrückung, Verfolgung, Widerstand
- Zweiter Weltkrieg, Vernichtungskrieg und Holocaust
- Flucht und Vertreibung im europäischen Kontext

## Internationale Verflechtungen seit 1945

- Aufteilung der Welt in Blöcke, Stellvertreterkriege
- Wiedererlangung staatlicher Souveränität beider deutscher Staaten
- Entkolonialisierung
- Ende des Ost-West-Konflikts, Wiedervereinigung

## Gesellschaftspolitische und wirtschaftliche Entwicklungen in Deutschland seit 1945

- Aufarbeitung der NS-Vergangenheit in Ost und West
- Bundesrepublik und DDR in der geteilten Welt
- Deutsch-deutsche Beziehungen: Konfrontation, Entspannungspolitik, Wiedervereinigung
- Gesellschaftliche und wirtschaftliche Transformationsprozesse

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ge_klp_3407_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('geschichte', 'ge', 'ges') OR lower("untis_subject") IN ('geschichte', 'ge', 'ges'));
--> statement-breakpoint
-- Erdkunde
UPDATE "subjects" SET
  "curriculum" = '## Aufbau und Dynamik der Erde

- Schalenbau der Erde: Erdkern, Erdmantel, Erdkruste
- Plattentektonik: Konvergenz, Divergenz, Subduktion
- Naturereignisse: Erdbeben, Seebeben, Vulkanismus
- Leben und Wirtschaften in Risikoräumen

## Wetter und Klima

- Schrägstellung der Erdachse, Beleuchtungszonen, Jahreszeiten
- Klima und Klimasystem: Atmosphäre, Klimaelemente, Wasserkreislauf
- Ursachen und Auswirkungen globaler Klimaschwankungen

## Landwirtschaftliche Produktion in unterschiedlichen Landschaftszonen

- Naturräumliche Bedingungen in Tropen, Subtropen, Mittelbreiten
- Wirtschaftsformen: Ackerbau, Viehwirtschaft, Plantagenwirtschaft, Subsistenzwirtschaft
- Folgen unangepasster Nutzung: Regenwaldzerstörung, Desertifikation, Erosion
- Nachhaltiges Wirtschaften

## Innerstaatliche und globale Disparitäten

- Entwicklungsindikatoren: Bildung, Demografie, Ernährung, Gesundheit, HDI
- Länder und Regionen unterschiedlichen Entwicklungsstandes
- Entwicklungszusammenarbeit, Handelsabkommen

## Wachstum und Verteilung der Weltbevölkerung

- Entwicklung und räumliche Verteilung der Weltbevölkerung
- Tragfähigkeit, Ernährungssicherung
- Migration: Push- und Pull-Faktoren

## Verstädterung und Stadtentwicklung

- Merkmale und Wandel von Städten
- Urbanisierung, Megacities, Metropolisierung, Segregation
- Mobilität, Umweltbelastung, demografischer und sozialer Wandel

## Räumliche Strukturen unter dem Einfluss von Globalisierung und Digitalisierung

- Merkmale der Globalisierung
- Standortgefüge, multinationale Konzerne, Global Cities
- Wandel von Unternehmen durch Digitalisierung

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ek_klp_3408_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('erdkunde', 'ek', 'geographie', 'geo') OR lower("untis_subject") IN ('erdkunde', 'ek', 'geographie', 'geo'));
--> statement-breakpoint
-- Politik/Wirtschaft
UPDATE "subjects" SET
  "curriculum" = '## Wirtschaftliches Handeln in der marktwirtschaftlichen Ordnung

- Markt, Marktprozesse, Wirtschaftskreislauf
- Freie und Soziale Marktwirtschaft, Wettbewerb
- Geld und seine Funktionen im digitalen Zeitalter
- Wachstum und nachhaltige Entwicklung

## Sicherung und Weiterentwicklung der Demokratie

- Demokratische Institutionen auf Landes- und Bundesebene
- Wahlen und Parlamentarismus im föderalen System
- Gewaltenteilung, Verfassungsstaatlichkeit
- Gefährdungen der Demokratie, Rolle der Medien

## Identität und Lebensgestaltung

- Individuelle Lebensgestaltung und soziale Verantwortung
- Selbstbestimmung in der digitalisierten Welt
- Jugendkriminalität und Jugendstrafrecht

## Unternehmen und Gewerkschaften in der Sozialen Marktwirtschaft

- Ziele, Grundfunktionen und Strukturen von Unternehmen
- Strukturwandel der Arbeitswelt durch Digitalisierung
- Gewerkschaften, Arbeitgeberverbände, betriebliche Mitbestimmung
- Berufswahl, Existenzgründung

## Soziale Sicherung in Deutschland

- Soziale Ungleichheit
- Prinzipien der sozialen Sicherung
- Säulen des Sozialversicherungssystems

## Handeln als Verbraucherinnen und Verbraucher

- Verbraucherrechte und -pflichten
- Einnahmen, Ausgaben, Verschuldung
- Verbraucherschutz, nachhaltiges Handeln
- Werbung, Algorithmen und Filter

## Die Europäische Union als wirtschaftliche und politische Gemeinschaft

- Europa als Wertegemeinschaft
- Institutionen der EU
- Grundfreiheiten des EU-Binnenmarktes
- Europäische Währungsunion

## Globalisierte Strukturen und Prozesse in der Wirtschaft

- Internationalisierung von Unternehmen, internationale Arbeitsteilung
- Staaten und Organisationen als Akteure der Weltwirtschaft
- Nachhaltiges Wirtschaften in der globalisierten Welt

## Globalisierte Strukturen und Prozesse in der Politik

- UN-Menschenrechtscharta
- Sicherheitspolitik und internationale Friedenssicherung: Bundeswehr, NATO, UNO
- Migration

Quelle: https://www.schulministerium.nrw/system/files/media/document/file/3429_wirtschaft-politik.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('politik/wirtschaft', 'pk', 'sw', 'politik', 'sozialwissenschaften', 'wirtschaft-politik') OR lower("untis_subject") IN ('politik/wirtschaft', 'pk', 'sw', 'politik', 'sozialwissenschaften', 'wirtschaft-politik'));
--> statement-breakpoint
-- Evangelische Religionslehre
UPDATE "subjects" SET
  "curriculum" = '## Menschliches Handeln in Freiheit und Verantwortung

- Leben in partnerschaftlichen Beziehungen
- Prophetischer Protest
- Diakonisches Handeln

## Die Frage nach Gott

- Reformatorische Grundeinsichten als Grundlagen der Lebensgestaltung
- Auseinandersetzung mit der Gottesfrage zwischen Bekenntnis, Indifferenz und Bestreitung

## Jesus, der Christus

- Jesu Botschaft vom Reich Gottes
- Kreuzestod und Auferstehung Jesu Christi

## Kirche und andere Formen religiöser Gemeinschaft

- Kirche und religiöse Gemeinschaften im Wandel
- Verhältnis von Kirche, Staat und Gesellschaft
- Kirche in totalitären Systemen

## Zugänge zur Bibel

- Biblische Texte als gedeutete Glaubenserfahrungen

## Religionen und Weltanschauungen im Dialog

- Weltbild und Lebensgestaltung in Religionen und Weltanschauungen

## Religion in Alltag und Kultur

- Religiöse Symbole in Kultur und Gesellschaft
- Umgang mit Tod und Trauer
- Fundamentalismus und Religion

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_er_klp_3414_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('evangelische religionslehre', 'er', 'ev. religion', 'evangelische religion') OR lower("untis_subject") IN ('evangelische religionslehre', 'er', 'ev. religion', 'evangelische religion'));
--> statement-breakpoint
-- Sport
UPDATE "subjects" SET
  "curriculum" = '## Bewegungsstruktur und Bewegungslernen

- Wahrnehmung und Körpererfahrung
- Informationsaufnahme und -verarbeitung
- Struktur und Funktion von Bewegungen
- Motorisches Lernen

## Bewegungsgestaltung

- Variation von Bewegung
- Präsentation von Bewegungsgestaltungen
- Ausgangspunkte von Gestaltungen
- Gestaltungskriterien

## Wagnis und Verantwortung

- Handlungssteuerung
- Motive sportlichen Handelns in Wagnissituationen

## Leistung

- Faktoren sportlicher Leistungsfähigkeit
- Leistungsverständnis im Sport
- Trainingsplanung und -organisation

## Kooperation und Konkurrenz

- Gestaltung von Spiel- und Sportgelegenheiten
- Interaktion im Sport

## Gesundheit

- Unfall- und Verletzungsprophylaxe
- Gesundheitlicher Nutzen und Risiken
- Gesundheitsverständnis und Körperbilder

## Bewegungsfelder und Sportbereiche (verbindlich für die gesamte Sek I)

- Den Körper wahrnehmen und Bewegungsfähigkeiten ausprägen
- Das Spielen entdecken und Spielräume nutzen
- Laufen, Springen, Werfen: Leichtathletik
- Bewegen im Wasser: Schwimmen
- Bewegen an Geräten: Turnen
- Gestalten, Tanzen, Darstellen: Gymnastik/Tanz, Bewegungskünste
- Spielen in und mit Regelstrukturen: Sportspiele
- Gleiten, Fahren, Rollen: Rollsport/Bootssport/Wintersport
- Ringen und Kämpfen: Zweikampfsport

Quelle: https://www.schulsport-nrw.de/fileadmin/user_upload/g9_sp_klp_3426_2019_06_23.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('sport', 'sp') OR lower("untis_subject") IN ('sport', 'sp'));
--> statement-breakpoint
-- Informatik
UPDATE "subjects" SET
  "curriculum" = '## Information und Daten

- Daten und ihre Codierung
- Verschlüsselungsverfahren
- Erfassung, Verarbeitung und Verwaltung von Daten

## Algorithmen

- Algorithmen und algorithmische Grundkonzepte
- Variablen
- Implementation von Algorithmen

## Automaten und formale Sprachen

- Aufbau und Wirkungsweise von Automaten
- Erstellung und Analyse von Quelltexten

## Künstliche Intelligenz und maschinelles Lernen

- Ueberwachtes Lernen
- Unüberwachtes Lernen
- Bestärkendes Lernen

## Informatiksysteme

- Anwendung von Informatiksystemen
- Logische Schaltungen

## Informatik, Mensch und Gesellschaft

- Informatiksysteme in der Lebens- und Berufswelt
- Datenschutz und Datensicherheit

Quelle: https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_wpif_klp_2023_06_01.pdf',
  "curriculum_source" = 'Kernlehrplan NRW G9, Klasse 10',
  "curriculum_updated_at" = now(),
  "updated_at" = now()
WHERE "curriculum" IS NULL
  AND (lower("name") IN ('informatik', 'if', 'info') OR lower("untis_subject") IN ('informatik', 'if', 'info'));
