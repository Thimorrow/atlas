-- Lehrplan an den Faechern vorbelegen (erzeugt von scripts/gen-lehrplan-sql.mts,
-- nicht von Hand aendern -- Quelle ist lib/lehrplan/nrw-g9-klasse-10.ts).
--
-- Trifft ueber den Anzeigenamen ODER den Untis-Wert, jeweils case-insensitiv,
-- weil Faecher aus dem Sync oft nur "M" oder "BI" heissen. Setzt ausschliesslich
-- dort, wo noch nichts steht: ein selbst geschriebener Lehrplan bleibt.

-- Deutsch
UPDATE "subjects" SET
  "curriculum" = '## Sprache

- Strukturen in Texten: Kohaerenz, Textaufbau, sprachliche Mittel
- Sprachebenen: Sprachvarietaeten, Sprachstile, Diskriminierung durch Sprache
- Sprachgeschichte und Sprachwandel
- Mehrsprachigkeit

## Texte

- Konfiguration, Handlungsfuehrung und Textaufbau: Roman, Erzaehlung, Drama, kurze epische Texte
- Literarische Sprache und bildliche Ausdrucksformen: Gedichte
- Sachtexte
- Textuebergreifende Zusammenhaenge: Gattungen, Produktions- und Rezeptionsgeschichte
- Schreibprozess
- Literarische Texte: Fiktionalitaet, Literarizitaet

## Kommunikation

- Kommunikationssituationen: Praesentation, Bewerbungsgespraech, formalisierte Diskussionsformen
- Kommunikationsrollen
- Kommunikationskonventionen
- Gespraechsstrategien

## Medien

- Medien als Hilfsmittel
- Medienrezeption: audiovisuelle Texte
- Qualitaet und Darstellung von Informationen
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
- Loesungsverfahren quadratischer Gleichungen: quadratische Ergaenzung, p-q-Formel, Satz von Vieta
- Exponentialgleichungen

## Funktionen

- Quadratische Funktionen: Normalform, Scheitelpunktform, faktorisierte Form
- Exponentielle Funktionen
- Sinusfunktionen

## Geometrie

- Kreis: Umfang, Flaecheninhalt, Tangente
- Koerper: Kugel, Zylinder, Prisma, Kegel, Pyramide
- Zentrische Streckung und Aehnlichkeit
- Satz des Pythagoras, Kosinussatz
- Trigonometrie: Sinus, Kosinus, Tangens

## Stochastik

- Statistische Daten: Erhebung, Diagramm, Manipulation
- Bedingte Wahrscheinlichkeit, stochastische Unabhaengigkeit
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
  "curriculum" = '## Persoenliche Lebensgestaltung

- Lebenssituation, Alltag, Freizeitgestaltung Jugendlicher
- Lernen und Arbeiten
- Digitale Medien
- Peer group, Jugendkulturen
- Liebe und Freundschaften

## Ausbildung/Schule

- Schulsystem und Schulalltag in einem weiteren anglophonen Land
- Schulisches Lernen im digitalen und globalisierten Zeitalter
- Schueleraustausch

## Teilhabe am gesellschaftlichen Leben

- Anglophone Lebenswirklichkeiten global: geografisch, wirtschaftlich-technologisch, kulturell, sozial, politisch
- Migration und Mobilitaet
- Digitale Medien fuer die Gesellschaft
- Werbung, Konsum, Verbraucherschutz
- Gesellschaftliches Engagement
- Demokratie und Menschenrechte

## Berufsorientierung

- Schuelerjobs, Praktika
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

- Gesellschaft: Staende, soziale Spannungen
- Staat und Politik: Republik/Prinzipat, Herrschaftsanspruch, Expansion
- Philosophie: Stoa, Epikureismus
- Literatur: zentrale Autoren und Werke

## Textgestaltung

- Textstruktur: Argumentationsstrategien, Erzaehlperspektive, Leserlenkung
- Sprachlich-stilistische Gestaltung: Hypotaxe/Parataxe, Stilmittel
- Textsorten: Fabel, Gedicht, Bericht, politische Rede

## Sprachsystem

- Erweiterter Grundwortschatz
- e- und u-Deklination
- Futur I
- Konjunktiv Praesens und Perfekt
- Deponentien
- Ablativus absolutus
- Gerundium und Gerundivum
- Konjunktivische Hauptsaetze
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
- Energiefluss und Stoffkreislaeufe: Fotosynthese, Kohlenstoffkreislauf, Nahrungsnetze
- Naturschutz und Nachhaltigkeit: Eingriffe des Menschen, Biotop- und Artenschutz

## Evolution

- Grundzuege der Evolutionstheorie: Variabilitaet, natuerliche Selektion, Fortpflanzungserfolg
- Entwicklung des Lebens auf der Erde: Erdzeitalter, Leitfossilien, biologischer Artbegriff
- Evolution des Menschen: Hominidenevolution

## Genetik

- Cytogenetik: DNA, Chromosomen, Mitose, Meiose, Karyogramm, Genommutation, Praenataldiagnostik
- Regeln der Vererbung: Gen- und Allelbegriff, Familienstammbaeume

## Mensch und Gesundheit

- Hormonelle Regulation: Blutzuckerregulation, Diabetes
- Immunbiologie: Infektionskrankheiten, Immunreaktion, Allergien, Impfungen, Antibiotika
- Neurobiologie: Neuron und Synapse, Drogenkonsum, Stress

## Sexualerziehung

- Hormonelle Steuerung des Zyklus
- Verhuetung, Schwangerschaftsabbruch
- Umgang mit der eigenen Sexualitaet

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
- Eigenschaften von Ionenverbindungen: Kristalle, Leitfaehigkeit
- Verhaeltnisformel, Gesetz der konstanten Massenverhaeltnisse, Reaktionsgleichung

## Chemische Reaktionen durch Elektronenuebertragung

- Oxidation, Reduktion
- Galvanisches Element, Akkumulator, Batterie, Brennstoffzelle
- Elektrolyse

## Molekuelverbindungen

- Unpolare und polare Elektronenpaarbindung
- Elektronenpaarabstossungsmodell, raeumliche Strukturen, Dipolmolekuele
- Zwischenmolekulare Wechselwirkungen: Wasserstoffbruecken
- Katalysator

## Saure und alkalische Loesungen

- Eigenschaften saurer und alkalischer Loesungen
- Neutralisation und Salzbildung
- Einfache stoechiometrische Berechnungen: Stoffmenge, Stoffmengenkonzentration
- Protonenabgabe und -aufnahme

## Organische Chemie

- Alkane und Alkanole
- Makromolekuele: ausgewaehlte Kunststoffe
- Zwischenmolekulare Wechselwirkungen: Van-der-Waals-Kraefte
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
- Kraft: Wechselwirkungsprinzip, Gewichtskraft und Masse, Kraefteaddition, Reibung
- Goldene Regel der Mechanik: einfache Maschinen
- Energieformen und Energieumwandlung, Leistung

## Druck und Auftrieb

- Druck in Fluessigkeiten und Gasen: Dichte, Schweredruck, Auftrieb
- Archimedisches Prinzip, Luftdruck

## Elektrizitaet

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

- Staedte und ihre Bewohnerinnen und Bewohner
- Begegnungen von Christen, Juden und Muslimen
- Transkontinentale Handelsbeziehungen zwischen Europa, Asien und Afrika

## Fruehe Neuzeit: Neue Welten, neue Horizonte

- Renaissance, Humanismus, Reformation
- Hexenverfolgungen und Dreissigjaehriger Krieg
- Entdeckungen und Eroberungen
- Vernetzung und Verlagerung globaler Handelswege

## Das lange 19. Jahrhundert

- Franzoesische Revolution und Wiener Kongress
- Revolution von 1848/49 und deutsche Reichsgruendung
- Industrialisierung und Arbeitswelten

## Imperialismus und Erster Weltkrieg

- Imperialistische Expansionen in Afrika
- Ursachen, Merkmale und Verlauf des Ersten Weltkriegs
- Epochenjahr 1917
- Pariser Friedensvertraege

## Weimarer Republik

- Etablierung einer Demokratie
- Innen-, aussenpolitische und gesellschaftliche Chancen und Belastungen
- Massenmedien, Konsumgesellschaft, Kunst und Kultur
- Weltwirtschaftskrise

## Nationalsozialismus und Zweiter Weltkrieg

- Ende des Rechts- und Verfassungsstaats 1933/34
- Ideologie und Herrschaftssystem des Nationalsozialismus
- Alltagsleben in der NS-Diktatur: Zustimmung, Unterdrueckung, Verfolgung, Widerstand
- Zweiter Weltkrieg, Vernichtungskrieg und Holocaust
- Flucht und Vertreibung im europaeischen Kontext

## Internationale Verflechtungen seit 1945

- Aufteilung der Welt in Bloecke, Stellvertreterkriege
- Wiedererlangung staatlicher Souveraenitaet beider deutscher Staaten
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
- Leben und Wirtschaften in Risikoraeumen

## Wetter und Klima

- Schraegstellung der Erdachse, Beleuchtungszonen, Jahreszeiten
- Klima und Klimasystem: Atmosphaere, Klimaelemente, Wasserkreislauf
- Ursachen und Auswirkungen globaler Klimaschwankungen

## Landwirtschaftliche Produktion in unterschiedlichen Landschaftszonen

- Naturraeumliche Bedingungen in Tropen, Subtropen, Mittelbreiten
- Wirtschaftsformen: Ackerbau, Viehwirtschaft, Plantagenwirtschaft, Subsistenzwirtschaft
- Folgen unangepasster Nutzung: Regenwaldzerstoerung, Desertifikation, Erosion
- Nachhaltiges Wirtschaften

## Innerstaatliche und globale Disparitaeten

- Entwicklungsindikatoren: Bildung, Demografie, Ernaehrung, Gesundheit, HDI
- Laender und Regionen unterschiedlichen Entwicklungsstandes
- Entwicklungszusammenarbeit, Handelsabkommen

## Wachstum und Verteilung der Weltbevoelkerung

- Entwicklung und raeumliche Verteilung der Weltbevoelkerung
- Tragfaehigkeit, Ernaehrungssicherung
- Migration: Push- und Pull-Faktoren

## Verstaedterung und Stadtentwicklung

- Merkmale und Wandel von Staedten
- Urbanisierung, Megacities, Metropolisierung, Segregation
- Mobilitaet, Umweltbelastung, demografischer und sozialer Wandel

## Raeumliche Strukturen unter dem Einfluss von Globalisierung und Digitalisierung

- Merkmale der Globalisierung
- Standortgefuege, multinationale Konzerne, Global Cities
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
- Wahlen und Parlamentarismus im foederalen System
- Gewaltenteilung, Verfassungsstaatlichkeit
- Gefaehrdungen der Demokratie, Rolle der Medien

## Identitaet und Lebensgestaltung

- Individuelle Lebensgestaltung und soziale Verantwortung
- Selbstbestimmung in der digitalisierten Welt
- Jugendkriminalitaet und Jugendstrafrecht

## Unternehmen und Gewerkschaften in der Sozialen Marktwirtschaft

- Ziele, Grundfunktionen und Strukturen von Unternehmen
- Strukturwandel der Arbeitswelt durch Digitalisierung
- Gewerkschaften, Arbeitgeberverbaende, betriebliche Mitbestimmung
- Berufswahl, Existenzgruendung

## Soziale Sicherung in Deutschland

- Soziale Ungleichheit
- Prinzipien der sozialen Sicherung
- Saeulen des Sozialversicherungssystems

## Handeln als Verbraucherinnen und Verbraucher

- Verbraucherrechte und -pflichten
- Einnahmen, Ausgaben, Verschuldung
- Verbraucherschutz, nachhaltiges Handeln
- Werbung, Algorithmen und Filter

## Die Europaeische Union als wirtschaftliche und politische Gemeinschaft

- Europa als Wertegemeinschaft
- Institutionen der EU
- Grundfreiheiten des EU-Binnenmarktes
- Europaeische Waehrungsunion

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

## Kirche und andere Formen religioeser Gemeinschaft

- Kirche und religioese Gemeinschaften im Wandel
- Verhaeltnis von Kirche, Staat und Gesellschaft
- Kirche in totalitaeren Systemen

## Zugaenge zur Bibel

- Biblische Texte als gedeutete Glaubenserfahrungen

## Religionen und Weltanschauungen im Dialog

- Weltbild und Lebensgestaltung in Religionen und Weltanschauungen

## Religion in Alltag und Kultur

- Religioese Symbole in Kultur und Gesellschaft
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

- Wahrnehmung und Koerpererfahrung
- Informationsaufnahme und -verarbeitung
- Struktur und Funktion von Bewegungen
- Motorisches Lernen

## Bewegungsgestaltung

- Variation von Bewegung
- Praesentation von Bewegungsgestaltungen
- Ausgangspunkte von Gestaltungen
- Gestaltungskriterien

## Wagnis und Verantwortung

- Handlungssteuerung
- Motive sportlichen Handelns in Wagnissituationen

## Leistung

- Faktoren sportlicher Leistungsfaehigkeit
- Leistungsverstaendnis im Sport
- Trainingsplanung und -organisation

## Kooperation und Konkurrenz

- Gestaltung von Spiel- und Sportgelegenheiten
- Interaktion im Sport

## Gesundheit

- Unfall- und Verletzungsprophylaxe
- Gesundheitlicher Nutzen und Risiken
- Gesundheitsverstaendnis und Koerperbilder

## Bewegungsfelder und Sportbereiche (verbindlich fuer die gesamte Sek I)

- Den Koerper wahrnehmen und Bewegungsfaehigkeiten auspraegen
- Das Spielen entdecken und Spielraeume nutzen
- Laufen, Springen, Werfen: Leichtathletik
- Bewegen im Wasser: Schwimmen
- Bewegen an Geraeten: Turnen
- Gestalten, Tanzen, Darstellen: Gymnastik/Tanz, Bewegungskuenste
- Spielen in und mit Regelstrukturen: Sportspiele
- Gleiten, Fahren, Rollen: Rollsport/Bootssport/Wintersport
- Ringen und Kaempfen: Zweikampfsport

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
- Verschluesselungsverfahren
- Erfassung, Verarbeitung und Verwaltung von Daten

## Algorithmen

- Algorithmen und algorithmische Grundkonzepte
- Variablen
- Implementation von Algorithmen

## Automaten und formale Sprachen

- Aufbau und Wirkungsweise von Automaten
- Erstellung und Analyse von Quelltexten

## Kuenstliche Intelligenz und maschinelles Lernen

- Ueberwachtes Lernen
- Unueberwachtes Lernen
- Bestaerkendes Lernen

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
