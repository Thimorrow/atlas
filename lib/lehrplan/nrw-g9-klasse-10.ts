// Lehrplan-Orientierung fuer einen Schueler am Gymnasium in NRW, G9, Klasse 10.
//
// Quelle: Kernlehrplaene Sekundarstufe I Gymnasium NRW (G9, aufsteigend ab
// Schuljahr 2019/2020), abrufbar ueber den Lehrplannavigator NRW
// (lehrplannavigator.nrw.de, Nachfolger von schulentwicklung.nrw.de).
// Abgerufen/recherchiert am 2026-09-04.
//
// Die Kernlehrplaene gliedern die Inhaltsfelder meist nicht separat nach
// Klasse 9 und Klasse 10, sondern fuer den gesamten letzten Block der
// Sekundarstufe I (je nach Fach "Jgst. 9/10" oder "Jgst. 7-10" bzw.
// "bis Ende Sekundarstufe I"). Diese Datei listet deshalb den kompletten
// Block, der bis zum Ende der Sek I noch aussteht -- welches Inhaltsfeld
// konkret in Klasse 9 und welches in Klasse 10 behandelt wird, legt der
// schulinterne Lehrplan der jeweiligen Fachkonferenz fest, nicht der
// Kernlehrplan selbst.
//
// Das hier ist eine ORIENTIERUNG, keine verbindliche Ablaufplanung. Die
// tatsaechliche Reihenfolge und Gewichtung bestimmt die Lehrkraft. Bei
// Latein wird die Variante "zweite Fremdsprache" (Beginn Klasse 6)
// zugrunde gelegt; als dritte Fremdsprache (Beginn Klasse 8) setzt der
// Kernlehrplan teils andere Schwerpunkte im selben Inhaltsfeld -- das ist
// hier nicht abgebildet.
//
// Hier stehen NUR die Faecher, die dieser Schueler wirklich belegt hat
// (Stand Schuljahr 2026/27). Franzoesisch, Spanisch, Katholische
// Religionslehre, Praktische Philosophie, Kunst und Musik sind bewusst
// nicht enthalten: ein Lehrplan, der nie zu einem Fach passt, waere im
// Seed nur Rauschen. Kommt ein Fach dazu, gehoert sein Kernlehrplan hier
// ergaenzt.
//
// Auch die DATEN sind ohne Umlaute geschrieben (siehe CLAUDE.md): die
// Inhaltsfelder landen ueber den Seed in subjects.curriculum und damit
// direkt vor den Augen des Schuelers.
// Bei "Politik/Wirtschaft" lautet der offizielle Fachname im Kernlehrplan
// "Wirtschaft-Politik"; der gebraeuchlichere Name wurde als kanonischer
// Fachname gewaehlt, der offizielle als Alias mit aufgenommen.
//
// Was nicht aus der Primaerquelle belegt werden konnte, wurde entweder
// weggelassen oder mit `unsicher: true` gekennzeichnet -- keine erfundenen
// Inhalte, keine erfundenen Quellen-URLs.

import { vergleichbar } from "@/lib/umlaute";

export type LehrplanFach = {
  fach: string; // kanonischer Fachname, z. B. "Mathematik"
  aliase: string[]; // Schreibweisen und Untis-Kuerzel, z. B. ["Mathe", "M", "MA"]
  inhaltsfelder: {
    titel: string; // z. B. "Funktionen"
    schwerpunkte: string[]; // z. B. ["Quadratische Funktionen", "Exponentialfunktionen"]
  }[];
  quelle: string; // URL der Primaerquelle
  unsicher?: true; // nur gesetzt, wenn nicht aus der Primaerquelle belegt
};

export const LEHRPLAN_NRW_G9_KLASSE_10: LehrplanFach[] = [
  {
    fach: "Deutsch",
    aliase: ["D"],
    inhaltsfelder: [
      {
        titel: "Sprache",
        schwerpunkte: [
          "Strukturen in Texten: Kohaerenz, Textaufbau, sprachliche Mittel",
          "Sprachebenen: Sprachvarietaeten, Sprachstile, Diskriminierung durch Sprache",
          "Sprachgeschichte und Sprachwandel",
          "Mehrsprachigkeit",
        ],
      },
      {
        titel: "Texte",
        schwerpunkte: [
          "Konfiguration, Handlungsfuehrung und Textaufbau: Roman, Erzaehlung, Drama, kurze epische Texte",
          "Literarische Sprache und bildliche Ausdrucksformen: Gedichte",
          "Sachtexte",
          "Textuebergreifende Zusammenhaenge: Gattungen, Produktions- und Rezeptionsgeschichte",
          "Schreibprozess",
          "Literarische Texte: Fiktionalitaet, Literarizitaet",
        ],
      },
      {
        titel: "Kommunikation",
        schwerpunkte: [
          "Kommunikationssituationen: Praesentation, Bewerbungsgespraech, formalisierte Diskussionsformen",
          "Kommunikationsrollen",
          "Kommunikationskonventionen",
          "Gespraechsstrategien",
        ],
      },
      {
        titel: "Medien",
        schwerpunkte: [
          "Medien als Hilfsmittel",
          "Medienrezeption: audiovisuelle Texte",
          "Qualitaet und Darstellung von Informationen",
          "Meinungsbildung als medialer Prozess",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_d_klp_3409_2019_06_23.pdf",
  },
  {
    fach: "Mathematik",
    aliase: ["M", "MA", "Mathe"],
    inhaltsfelder: [
      {
        titel: "Arithmetik/Algebra",
        schwerpunkte: [
          "Zahlbereichserweiterung reelle Zahlen",
          "Potenzen, Wurzeln, Logarithmen",
          "Potenz- und Wurzelgesetze",
          "Loesungsverfahren quadratischer Gleichungen: quadratische Ergaenzung, p-q-Formel, Satz von Vieta",
          "Exponentialgleichungen",
        ],
      },
      {
        titel: "Funktionen",
        schwerpunkte: [
          "Quadratische Funktionen: Normalform, Scheitelpunktform, faktorisierte Form",
          "Exponentielle Funktionen",
          "Sinusfunktionen",
        ],
      },
      {
        titel: "Geometrie",
        schwerpunkte: [
          "Kreis: Umfang, Flaecheninhalt, Tangente",
          "Koerper: Kugel, Zylinder, Prisma, Kegel, Pyramide",
          "Zentrische Streckung und Aehnlichkeit",
          "Satz des Pythagoras, Kosinussatz",
          "Trigonometrie: Sinus, Kosinus, Tangens",
        ],
      },
      {
        titel: "Stochastik",
        schwerpunkte: [
          "Statistische Daten: Erhebung, Diagramm, Manipulation",
          "Bedingte Wahrscheinlichkeit, stochastische Unabhaengigkeit",
          "Vierfeldertafel, Baumdiagramme, Pfadregeln",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_m_klp_3401_2019_06_23_0.pdf",
  },
  {
    fach: "Englisch",
    aliase: ["E", "Eng"],
    inhaltsfelder: [
      {
        titel: "Persoenliche Lebensgestaltung",
        schwerpunkte: [
          "Lebenssituation, Alltag, Freizeitgestaltung Jugendlicher",
          "Lernen und Arbeiten",
          "Digitale Medien",
          "Peer group, Jugendkulturen",
          "Liebe und Freundschaften",
        ],
      },
      {
        titel: "Ausbildung/Schule",
        schwerpunkte: [
          "Schulsystem und Schulalltag in einem weiteren anglophonen Land",
          "Schulisches Lernen im digitalen und globalisierten Zeitalter",
          "Schueleraustausch",
        ],
      },
      {
        titel: "Teilhabe am gesellschaftlichen Leben",
        schwerpunkte: [
          "Anglophone Lebenswirklichkeiten global: geografisch, wirtschaftlich-technologisch, kulturell, sozial, politisch",
          "Migration und Mobilitaet",
          "Digitale Medien fuer die Gesellschaft",
          "Werbung, Konsum, Verbraucherschutz",
          "Gesellschaftliches Engagement",
          "Demokratie und Menschenrechte",
        ],
      },
      {
        titel: "Berufsorientierung",
        schwerpunkte: [
          "Schuelerjobs, Praktika",
          "Berufsprofile im digitalen Zeitalter",
          "Bewerbungsverfahren",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_e_klp_3417_2019_06_23.pdf",
  },
  {
    fach: "Latein",
    aliase: ["L"],
    inhaltsfelder: [
      {
        titel: "Antike Welt",
        schwerpunkte: [
          "Gesellschaft: Staende, soziale Spannungen",
          "Staat und Politik: Republik/Prinzipat, Herrschaftsanspruch, Expansion",
          "Philosophie: Stoa, Epikureismus",
          "Literatur: zentrale Autoren und Werke",
        ],
      },
      {
        titel: "Textgestaltung",
        schwerpunkte: [
          "Textstruktur: Argumentationsstrategien, Erzaehlperspektive, Leserlenkung",
          "Sprachlich-stilistische Gestaltung: Hypotaxe/Parataxe, Stilmittel",
          "Textsorten: Fabel, Gedicht, Bericht, politische Rede",
        ],
      },
      {
        titel: "Sprachsystem",
        schwerpunkte: [
          "Erweiterter Grundwortschatz",
          "e- und u-Deklination",
          "Futur I",
          "Konjunktiv Praesens und Perfekt",
          "Deponentien",
          "Ablativus absolutus",
          "Gerundium und Gerundivum",
          "Konjunktivische Hauptsaetze",
          "Komparation",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_l_klp_3402_2019_06_23_0.pdf",
  },
  {
    fach: "Biologie",
    aliase: ["BI", "Bio"],
    inhaltsfelder: [
      {
        titel: "Oekologie und Naturschutz",
        schwerpunkte: [
          "Merkmale eines Oekosystems: heimisches Oekosystem, charakteristische Arten und Angepasstheiten, biotische Wechselwirkungen",
          "Energiefluss und Stoffkreislaeufe: Fotosynthese, Kohlenstoffkreislauf, Nahrungsnetze",
          "Naturschutz und Nachhaltigkeit: Eingriffe des Menschen, Biotop- und Artenschutz",
        ],
      },
      {
        titel: "Evolution",
        schwerpunkte: [
          "Grundzuege der Evolutionstheorie: Variabilitaet, natuerliche Selektion, Fortpflanzungserfolg",
          "Entwicklung des Lebens auf der Erde: Erdzeitalter, Leitfossilien, biologischer Artbegriff",
          "Evolution des Menschen: Hominidenevolution",
        ],
      },
      {
        titel: "Genetik",
        schwerpunkte: [
          "Cytogenetik: DNA, Chromosomen, Mitose, Meiose, Karyogramm, Genommutation, Praenataldiagnostik",
          "Regeln der Vererbung: Gen- und Allelbegriff, Familienstammbaeume",
        ],
      },
      {
        titel: "Mensch und Gesundheit",
        schwerpunkte: [
          "Hormonelle Regulation: Blutzuckerregulation, Diabetes",
          "Immunbiologie: Infektionskrankheiten, Immunreaktion, Allergien, Impfungen, Antibiotika",
          "Neurobiologie: Neuron und Synapse, Drogenkonsum, Stress",
        ],
      },
      {
        titel: "Sexualerziehung",
        schwerpunkte: [
          "Hormonelle Steuerung des Zyklus",
          "Verhuetung, Schwangerschaftsabbruch",
          "Umgang mit der eigenen Sexualitaet",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_bi_klp_-3413_2019_06_23_0.pdf",
  },
  {
    fach: "Chemie",
    aliase: ["CH", "Che"],
    inhaltsfelder: [
      {
        titel: "Elemente und ihre Ordnung",
        schwerpunkte: [
          "Eigenschaften von Alkalimetallen, Halogenen, Edelgasen",
          "Periodensystem der Elemente",
          "Differenzierte Atommodelle, Elektronenkonfiguration",
        ],
      },
      {
        titel: "Salze und Ionen",
        schwerpunkte: [
          "Ionenbindung: Anionen, Kationen, Ionengitter",
          "Eigenschaften von Ionenverbindungen: Kristalle, Leitfaehigkeit",
          "Verhaeltnisformel, Gesetz der konstanten Massenverhaeltnisse, Reaktionsgleichung",
        ],
      },
      {
        titel: "Chemische Reaktionen durch Elektronenuebertragung",
        schwerpunkte: [
          "Oxidation, Reduktion",
          "Galvanisches Element, Akkumulator, Batterie, Brennstoffzelle",
          "Elektrolyse",
        ],
      },
      {
        titel: "Molekuelverbindungen",
        schwerpunkte: [
          "Unpolare und polare Elektronenpaarbindung",
          "Elektronenpaarabstossungsmodell, raeumliche Strukturen, Dipolmolekuele",
          "Zwischenmolekulare Wechselwirkungen: Wasserstoffbruecken",
          "Katalysator",
        ],
      },
      {
        titel: "Saure und alkalische Loesungen",
        schwerpunkte: [
          "Eigenschaften saurer und alkalischer Loesungen",
          "Neutralisation und Salzbildung",
          "Einfache stoechiometrische Berechnungen: Stoffmenge, Stoffmengenkonzentration",
          "Protonenabgabe und -aufnahme",
        ],
      },
      {
        titel: "Organische Chemie",
        schwerpunkte: [
          "Alkane und Alkanole",
          "Makromolekuele: ausgewaehlte Kunststoffe",
          "Zwischenmolekulare Wechselwirkungen: Van-der-Waals-Kraefte",
          "Treibhauseffekt",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ch_klp_3415_2019_06_23.pdf",
  },
  {
    fach: "Physik",
    aliase: ["PH", "Phy"],
    inhaltsfelder: [
      {
        titel: "Optische Instrumente",
        schwerpunkte: [
          "Spiegelungen: Reflexionsgesetz, Bildentstehung am Planspiegel",
          "Lichtbrechung: Totalreflexion, Lichtleiter, Sammellinsen, Auge",
          "Licht und Farben: Spektralzerlegung, Farbmischung",
        ],
      },
      {
        titel: "Sterne und Weltall",
        schwerpunkte: [
          "Sonnensystem: Mondphasen, Finsternisse, Jahreszeiten, Planeten",
          "Universum: Himmelsobjekte, Sternentwicklung",
        ],
      },
      {
        titel: "Bewegung, Kraft und Energie",
        schwerpunkte: [
          "Geschwindigkeit, Beschleunigung",
          "Kraft: Wechselwirkungsprinzip, Gewichtskraft und Masse, Kraefteaddition, Reibung",
          "Goldene Regel der Mechanik: einfache Maschinen",
          "Energieformen und Energieumwandlung, Leistung",
        ],
      },
      {
        titel: "Druck und Auftrieb",
        schwerpunkte: [
          "Druck in Fluessigkeiten und Gasen: Dichte, Schweredruck, Auftrieb",
          "Archimedisches Prinzip, Luftdruck",
        ],
      },
      {
        titel: "Elektrizitaet",
        schwerpunkte: [
          "Elektrostatik: Ladungen und Felder, Spannung",
          "Elektrische Stromkreise: Widerstand, Reihen- und Parallelschaltung",
          "Elektrische Energie und Leistung",
        ],
      },
      {
        titel: "Ionisierende Strahlung und Kernenergie",
        schwerpunkte: [
          "Alpha-, Beta-, Gamma-Strahlung, radioaktiver Zerfall, Halbwertszeit",
          "Wechselwirkung von Strahlung mit Materie, Strahlenschutz",
          "Kernspaltung, Kernfusion, Kernkraftwerke, Endlagerung",
        ],
      },
      {
        titel: "Energieversorgung",
        schwerpunkte: [
          "Induktion und Elektromagnetismus: Elektromotor, Generator, Transformator",
          "Bereitstellung und Nutzung von Energie: Kraftwerke, regenerative Anlagen, Wirkungsgrad",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ph_klp_3411_2019_06_23.pdf",
  },
  {
    fach: "Geschichte",
    aliase: ["GE", "Ges"],
    inhaltsfelder: [
      {
        titel: "Lebenswelten im Mittelalter",
        schwerpunkte: [
          "Staedte und ihre Bewohnerinnen und Bewohner",
          "Begegnungen von Christen, Juden und Muslimen",
          "Transkontinentale Handelsbeziehungen zwischen Europa, Asien und Afrika",
        ],
      },
      {
        titel: "Fruehe Neuzeit: Neue Welten, neue Horizonte",
        schwerpunkte: [
          "Renaissance, Humanismus, Reformation",
          "Hexenverfolgungen und Dreissigjaehriger Krieg",
          "Entdeckungen und Eroberungen",
          "Vernetzung und Verlagerung globaler Handelswege",
        ],
      },
      {
        titel: "Das lange 19. Jahrhundert",
        schwerpunkte: [
          "Franzoesische Revolution und Wiener Kongress",
          "Revolution von 1848/49 und deutsche Reichsgruendung",
          "Industrialisierung und Arbeitswelten",
        ],
      },
      {
        titel: "Imperialismus und Erster Weltkrieg",
        schwerpunkte: [
          "Imperialistische Expansionen in Afrika",
          "Ursachen, Merkmale und Verlauf des Ersten Weltkriegs",
          "Epochenjahr 1917",
          "Pariser Friedensvertraege",
        ],
      },
      {
        titel: "Weimarer Republik",
        schwerpunkte: [
          "Etablierung einer Demokratie",
          "Innen-, aussenpolitische und gesellschaftliche Chancen und Belastungen",
          "Massenmedien, Konsumgesellschaft, Kunst und Kultur",
          "Weltwirtschaftskrise",
        ],
      },
      {
        titel: "Nationalsozialismus und Zweiter Weltkrieg",
        schwerpunkte: [
          "Ende des Rechts- und Verfassungsstaats 1933/34",
          "Ideologie und Herrschaftssystem des Nationalsozialismus",
          "Alltagsleben in der NS-Diktatur: Zustimmung, Unterdrueckung, Verfolgung, Widerstand",
          "Zweiter Weltkrieg, Vernichtungskrieg und Holocaust",
          "Flucht und Vertreibung im europaeischen Kontext",
        ],
      },
      {
        titel: "Internationale Verflechtungen seit 1945",
        schwerpunkte: [
          "Aufteilung der Welt in Bloecke, Stellvertreterkriege",
          "Wiedererlangung staatlicher Souveraenitaet beider deutscher Staaten",
          "Entkolonialisierung",
          "Ende des Ost-West-Konflikts, Wiedervereinigung",
        ],
      },
      {
        titel: "Gesellschaftspolitische und wirtschaftliche Entwicklungen in Deutschland seit 1945",
        schwerpunkte: [
          "Aufarbeitung der NS-Vergangenheit in Ost und West",
          "Bundesrepublik und DDR in der geteilten Welt",
          "Deutsch-deutsche Beziehungen: Konfrontation, Entspannungspolitik, Wiedervereinigung",
          "Gesellschaftliche und wirtschaftliche Transformationsprozesse",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ge_klp_3407_2019_06_23.pdf",
  },
  {
    fach: "Erdkunde",
    aliase: ["EK", "Geographie", "Geo"],
    inhaltsfelder: [
      {
        titel: "Aufbau und Dynamik der Erde",
        schwerpunkte: [
          "Schalenbau der Erde: Erdkern, Erdmantel, Erdkruste",
          "Plattentektonik: Konvergenz, Divergenz, Subduktion",
          "Naturereignisse: Erdbeben, Seebeben, Vulkanismus",
          "Leben und Wirtschaften in Risikoraeumen",
        ],
      },
      {
        titel: "Wetter und Klima",
        schwerpunkte: [
          "Schraegstellung der Erdachse, Beleuchtungszonen, Jahreszeiten",
          "Klima und Klimasystem: Atmosphaere, Klimaelemente, Wasserkreislauf",
          "Ursachen und Auswirkungen globaler Klimaschwankungen",
        ],
      },
      {
        titel: "Landwirtschaftliche Produktion in unterschiedlichen Landschaftszonen",
        schwerpunkte: [
          "Naturraeumliche Bedingungen in Tropen, Subtropen, Mittelbreiten",
          "Wirtschaftsformen: Ackerbau, Viehwirtschaft, Plantagenwirtschaft, Subsistenzwirtschaft",
          "Folgen unangepasster Nutzung: Regenwaldzerstoerung, Desertifikation, Erosion",
          "Nachhaltiges Wirtschaften",
        ],
      },
      {
        titel: "Innerstaatliche und globale Disparitaeten",
        schwerpunkte: [
          "Entwicklungsindikatoren: Bildung, Demografie, Ernaehrung, Gesundheit, HDI",
          "Laender und Regionen unterschiedlichen Entwicklungsstandes",
          "Entwicklungszusammenarbeit, Handelsabkommen",
        ],
      },
      {
        titel: "Wachstum und Verteilung der Weltbevoelkerung",
        schwerpunkte: [
          "Entwicklung und raeumliche Verteilung der Weltbevoelkerung",
          "Tragfaehigkeit, Ernaehrungssicherung",
          "Migration: Push- und Pull-Faktoren",
        ],
      },
      {
        titel: "Verstaedterung und Stadtentwicklung",
        schwerpunkte: [
          "Merkmale und Wandel von Staedten",
          "Urbanisierung, Megacities, Metropolisierung, Segregation",
          "Mobilitaet, Umweltbelastung, demografischer und sozialer Wandel",
        ],
      },
      {
        titel: "Raeumliche Strukturen unter dem Einfluss von Globalisierung und Digitalisierung",
        schwerpunkte: [
          "Merkmale der Globalisierung",
          "Standortgefuege, multinationale Konzerne, Global Cities",
          "Wandel von Unternehmen durch Digitalisierung",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_ek_klp_3408_2019_06_23.pdf",
  },
  {
    fach: "Politik/Wirtschaft",
    aliase: ["PK", "SW", "Politik", "Sozialwissenschaften", "Wirtschaft-Politik"],
    inhaltsfelder: [
      {
        titel: "Wirtschaftliches Handeln in der marktwirtschaftlichen Ordnung",
        schwerpunkte: [
          "Markt, Marktprozesse, Wirtschaftskreislauf",
          "Freie und Soziale Marktwirtschaft, Wettbewerb",
          "Geld und seine Funktionen im digitalen Zeitalter",
          "Wachstum und nachhaltige Entwicklung",
        ],
      },
      {
        titel: "Sicherung und Weiterentwicklung der Demokratie",
        schwerpunkte: [
          "Demokratische Institutionen auf Landes- und Bundesebene",
          "Wahlen und Parlamentarismus im foederalen System",
          "Gewaltenteilung, Verfassungsstaatlichkeit",
          "Gefaehrdungen der Demokratie, Rolle der Medien",
        ],
      },
      {
        titel: "Identitaet und Lebensgestaltung",
        schwerpunkte: [
          "Individuelle Lebensgestaltung und soziale Verantwortung",
          "Selbstbestimmung in der digitalisierten Welt",
          "Jugendkriminalitaet und Jugendstrafrecht",
        ],
      },
      {
        titel: "Unternehmen und Gewerkschaften in der Sozialen Marktwirtschaft",
        schwerpunkte: [
          "Ziele, Grundfunktionen und Strukturen von Unternehmen",
          "Strukturwandel der Arbeitswelt durch Digitalisierung",
          "Gewerkschaften, Arbeitgeberverbaende, betriebliche Mitbestimmung",
          "Berufswahl, Existenzgruendung",
        ],
      },
      {
        titel: "Soziale Sicherung in Deutschland",
        schwerpunkte: [
          "Soziale Ungleichheit",
          "Prinzipien der sozialen Sicherung",
          "Saeulen des Sozialversicherungssystems",
        ],
      },
      {
        titel: "Handeln als Verbraucherinnen und Verbraucher",
        schwerpunkte: [
          "Verbraucherrechte und -pflichten",
          "Einnahmen, Ausgaben, Verschuldung",
          "Verbraucherschutz, nachhaltiges Handeln",
          "Werbung, Algorithmen und Filter",
        ],
      },
      {
        titel: "Die Europaeische Union als wirtschaftliche und politische Gemeinschaft",
        schwerpunkte: [
          "Europa als Wertegemeinschaft",
          "Institutionen der EU",
          "Grundfreiheiten des EU-Binnenmarktes",
          "Europaeische Waehrungsunion",
        ],
      },
      {
        titel: "Globalisierte Strukturen und Prozesse in der Wirtschaft",
        schwerpunkte: [
          "Internationalisierung von Unternehmen, internationale Arbeitsteilung",
          "Staaten und Organisationen als Akteure der Weltwirtschaft",
          "Nachhaltiges Wirtschaften in der globalisierten Welt",
        ],
      },
      {
        titel: "Globalisierte Strukturen und Prozesse in der Politik",
        schwerpunkte: [
          "UN-Menschenrechtscharta",
          "Sicherheitspolitik und internationale Friedenssicherung: Bundeswehr, NATO, UNO",
          "Migration",
        ],
      },
    ],
    quelle:
      "https://www.schulministerium.nrw/system/files/media/document/file/3429_wirtschaft-politik.pdf",
  },
  {
    fach: "Evangelische Religionslehre",
    aliase: ["ER", "Ev. Religion", "Evangelische Religion"],
    inhaltsfelder: [
      {
        titel: "Menschliches Handeln in Freiheit und Verantwortung",
        schwerpunkte: [
          "Leben in partnerschaftlichen Beziehungen",
          "Prophetischer Protest",
          "Diakonisches Handeln",
        ],
      },
      {
        titel: "Die Frage nach Gott",
        schwerpunkte: [
          "Reformatorische Grundeinsichten als Grundlagen der Lebensgestaltung",
          "Auseinandersetzung mit der Gottesfrage zwischen Bekenntnis, Indifferenz und Bestreitung",
        ],
      },
      {
        titel: "Jesus, der Christus",
        schwerpunkte: ["Jesu Botschaft vom Reich Gottes", "Kreuzestod und Auferstehung Jesu Christi"],
      },
      {
        titel: "Kirche und andere Formen religioeser Gemeinschaft",
        schwerpunkte: [
          "Kirche und religioese Gemeinschaften im Wandel",
          "Verhaeltnis von Kirche, Staat und Gesellschaft",
          "Kirche in totalitaeren Systemen",
        ],
      },
      {
        titel: "Zugaenge zur Bibel",
        schwerpunkte: ["Biblische Texte als gedeutete Glaubenserfahrungen"],
      },
      {
        titel: "Religionen und Weltanschauungen im Dialog",
        schwerpunkte: ["Weltbild und Lebensgestaltung in Religionen und Weltanschauungen"],
      },
      {
        titel: "Religion in Alltag und Kultur",
        schwerpunkte: [
          "Religioese Symbole in Kultur und Gesellschaft",
          "Umgang mit Tod und Trauer",
          "Fundamentalismus und Religion",
        ],
      },
    ],
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_er_klp_3414_2019_06_23.pdf",
  },
  {
    fach: "Sport",
    aliase: ["SP", "Sport"],
    inhaltsfelder: [
      {
        titel: "Bewegungsstruktur und Bewegungslernen",
        schwerpunkte: ["Wahrnehmung und Koerpererfahrung", "Informationsaufnahme und -verarbeitung", "Struktur und Funktion von Bewegungen", "Motorisches Lernen"],
      },
      {
        titel: "Bewegungsgestaltung",
        schwerpunkte: ["Variation von Bewegung", "Praesentation von Bewegungsgestaltungen", "Ausgangspunkte von Gestaltungen", "Gestaltungskriterien"],
      },
      {
        titel: "Wagnis und Verantwortung",
        schwerpunkte: ["Handlungssteuerung", "Motive sportlichen Handelns in Wagnissituationen"],
      },
      {
        titel: "Leistung",
        schwerpunkte: ["Faktoren sportlicher Leistungsfaehigkeit", "Leistungsverstaendnis im Sport", "Trainingsplanung und -organisation"],
      },
      {
        titel: "Kooperation und Konkurrenz",
        schwerpunkte: ["Gestaltung von Spiel- und Sportgelegenheiten", "Interaktion im Sport"],
      },
      {
        titel: "Gesundheit",
        schwerpunkte: ["Unfall- und Verletzungsprophylaxe", "Gesundheitlicher Nutzen und Risiken", "Gesundheitsverstaendnis und Koerperbilder"],
      },
      {
        titel: "Bewegungsfelder und Sportbereiche (verbindlich fuer die gesamte Sek I)",
        schwerpunkte: [
          "Den Koerper wahrnehmen und Bewegungsfaehigkeiten auspraegen",
          "Das Spielen entdecken und Spielraeume nutzen",
          "Laufen, Springen, Werfen: Leichtathletik",
          "Bewegen im Wasser: Schwimmen",
          "Bewegen an Geraeten: Turnen",
          "Gestalten, Tanzen, Darstellen: Gymnastik/Tanz, Bewegungskuenste",
          "Spielen in und mit Regelstrukturen: Sportspiele",
          "Gleiten, Fahren, Rollen: Rollsport/Bootssport/Wintersport",
          "Ringen und Kaempfen: Zweikampfsport",
        ],
      },
    ],
    quelle:
      "https://www.schulsport-nrw.de/fileadmin/user_upload/g9_sp_klp_3426_2019_06_23.pdf",
  },
  {
    fach: "Informatik",
    aliase: ["IF", "Info"],
    inhaltsfelder: [
      {
        titel: "Information und Daten",
        schwerpunkte: [
          "Daten und ihre Codierung",
          "Verschluesselungsverfahren",
          "Erfassung, Verarbeitung und Verwaltung von Daten",
        ],
      },
      {
        titel: "Algorithmen",
        schwerpunkte: ["Algorithmen und algorithmische Grundkonzepte", "Variablen", "Implementation von Algorithmen"],
      },
      {
        titel: "Automaten und formale Sprachen",
        schwerpunkte: ["Aufbau und Wirkungsweise von Automaten", "Erstellung und Analyse von Quelltexten"],
      },
      {
        titel: "Kuenstliche Intelligenz und maschinelles Lernen",
        schwerpunkte: ["Ueberwachtes Lernen", "Unueberwachtes Lernen", "Bestaerkendes Lernen"],
      },
      {
        titel: "Informatiksysteme",
        schwerpunkte: ["Anwendung von Informatiksystemen", "Logische Schaltungen"],
      },
      {
        titel: "Informatik, Mensch und Gesellschaft",
        schwerpunkte: ["Informatiksysteme in der Lebens- und Berufswelt", "Datenschutz und Datensicherheit"],
      },
    ],
    // Hinweis: Informatik ist am Gymnasium NRW Sek I kein Pflichtfach,
    // sondern Wahlpflichtfach ohne Gliederung nach Doppeljahrgangsstufen --
    // die Inhaltsfelder selbst sind aber aus der Primaerquelle belegt.
    quelle:
      "https://lehrplannavigator.nrw.de/system/files/media/document/file/g9_wpif_klp_2023_06_01.pdf",
  },
];

// Findet den Lehrplan zu einem Fachnamen: exakter Treffer auf `fach` oder auf
// einen Eintrag in `aliase`, jeweils case-insensitiv, getrimmt und ohne
// Umlaute. Die Fachnamen stehen hier transliteriert ("Franzoesisch"), aus dem
// Untis-Sync kommen sie aber mit Umlaut -- vergleichbar() macht beide gleich.
export function lehrplanFuer(fachname: string): LehrplanFach | null {
  const gesucht = vergleichbar(fachname);
  if (!gesucht) return null;

  for (const eintrag of LEHRPLAN_NRW_G9_KLASSE_10) {
    if (vergleichbar(eintrag.fach) === gesucht) return eintrag;
    if (eintrag.aliase.some((alias) => vergleichbar(alias) === gesucht)) return eintrag;
  }

  return null;
}
