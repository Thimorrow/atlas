// Export und Restore der ganzen Datenbank.
//
// Warum es das ueberhaupt braucht: Neon hat eine eigene Sicherung, aber die
// liegt bei Neon und laesst sich nur dort zurueckspielen. Ein Dump in einer
// Datei ist der einzige Weg, den ein Mensch selbst in der Hand haelt -- und der
// einzige, mit dem sich eine Aenderung an Schema oder Daten vorher trocken
// ueben laesst, statt sie am lebenden Atlas auszuprobieren.
//
// Zwei Entscheidungen praegen diese Datei:
//
// 1. KEINE handgepflegte Tabellenliste. Tabellen, Spalten, Primaerschluessel und
//    Fremdschluessel kommen aus information_schema und pg_constraint. Eine neue
//    Migration ist damit automatisch mit drin. Eine Liste in dieser Datei waere
//    genau die Art Handarbeit, die in diesem Projekt schon zweimal veraltet ist
//    (siehe lib/doku-zahlen.ts).
//
// 2. Die Einfuege-Reihenfolge wird aus den Fremdschluesseln berechnet, nicht
//    geraten. Sonst scheitert das Zurueckspielen an einem Constraint, das nur
//    zufaellig noch nicht verletzt wurde.
//
// Die Datenbank selbst kennt diese Datei nicht: alles laeuft ueber den
// uebergebenen Executor. Damit funktioniert derselbe Code im Build-Skript
// (node-postgres), in der Route (Drizzle) und im Integrationstest.
//
// Zeitlose Wahrheit in diesem Projekt: ein Datum ist "YYYY-MM-DD" und keine
// Zeitangabe. Spalten vom Typ date werden deshalb per to_char gelesen. Ohne das
// kaeme aus node-postgres ein Date-Objekt zurueck, das als UTC-Zeitstempel
// serialisiert wuerde -- und aus dem 21.09. wuerde beim naechsten Mal der
// 20.09. Falls das je jemand "vereinfacht": genau dafuer gibt es den
// Rundlauf-Test in lib/backup.test.ts.

export type Executor = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export const DUMP_FORMAT = "atlas-dump";
export const DUMP_VERSION = 1;

export type DumpSpalte = { name: string; udt: string };

export type DumpTabelle = {
  name: string;
  spalten: DumpSpalte[];
  zeilen: number;
  daten: Record<string, unknown>[];
};

export type Dump = {
  format: string;
  version: number;
  erzeugtAm: string;
  tabellen: DumpTabelle[];
};

type SchemaTabelle = { name: string; spalten: DumpSpalte[]; pk: string[] };

function quote(name: string): string {
  // Alles, was hier durchkommt, stammt aus information_schema bzw. aus einem
  // eigenen Dump und wird zusaetzlich in Anfuehrungszeichen gesetzt.
  return `"${name.replace(/"/g, '""')}"`;
}

// Reihenfolge fuer das Einfuegen: Eltern vor Kindern. Kanten zeigen von der
// abhaengigen Tabelle auf die, die zuerst da sein muss.
//
// Selbstbezug (eine Tabelle verweist auf sich) wird ignoriert: fuer das
// Einfuegen in einer festen Reihenfolge spielt er keine Rolle, ein Zyklus
// daraus waere ein Fehlalarm. Findet sich ein echter Zyklus zwischen mehreren
// Tabellen, ist das kein Zufall, sondern ein Modellierungsproblem -- dann gibt
// es hier einen Fehler mit allen beteiligten Tabellen statt eines halb
// wiederhergestellten Datenbestands.
export function reihenfolge(tabellen: string[], kanten: [string, string][]): string[] {
  const bekannt = new Set(tabellen);
  const offenNach = new Map<string, Set<string>>();
  for (const t of tabellen) offenNach.set(t, new Set());
  for (const [kind, eltern] of kanten) {
    if (kind === eltern) continue;
    if (!bekannt.has(kind) || !bekannt.has(eltern)) continue;
    offenNach.get(kind)!.add(eltern);
  }

  const ergebnis: string[] = [];
  const erledigt = new Set<string>();

  while (ergebnis.length < tabellen.length) {
    const bereit = tabellen.filter((t) => !erledigt.has(t) && offenNach.get(t)!.size === 0);
    if (bereit.length === 0) {
      const uebrig = tabellen.filter((t) => !erledigt.has(t));
      throw new Error(
        `Zyklus in den Fremdschluesseln, Reihenfolge unklar: ${uebrig.join(" -> ")}`,
      );
    }
    // Alphabetisch innerhalb einer Stufe, damit der Dump bei gleicher
    // Datenbank immer gleich aussieht (wichtig fuer Vergleiche).
    bereit.sort((a, b) => a.localeCompare(b, "de"));
    for (const t of bereit) {
      ergebnis.push(t);
      erledigt.add(t);
      for (const set of offenNach.values()) set.delete(t);
    }
  }

  return ergebnis;
}

export async function schemaLesen(
  ausfuehren: Executor,
): Promise<{ tabellen: SchemaTabelle[]; kanten: [string, string][] }> {
  const spaltenRoh = (
    await ausfuehren(
      `select table_name, column_name, udt_name
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`,
    )
  ).rows as { table_name: string; column_name: string; udt_name: string }[];

  const tabellenKarte = new Map<string, SchemaTabelle>();
  for (const s of spaltenRoh) {
    if (!tabellenKarte.has(s.table_name)) tabellenKarte.set(s.table_name, { name: s.table_name, spalten: [], pk: [] });
    tabellenKarte.get(s.table_name)!.spalten.push({ name: s.column_name, udt: s.udt_name });
  }

  const pkRoh = (
    await ausfuehren(
      `select tc.table_name, kcu.column_name
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name
          and tc.table_schema = kcu.table_schema
        where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
        order by tc.table_name, kcu.ordinal_position`,
    )
  ).rows as { table_name: string; column_name: string }[];
  for (const s of pkRoh) tabellenKarte.get(s.table_name)?.pk.push(s.column_name);

  // Fremdschluessel ueber pg_constraint statt ueber constraint_column_usage:
  // dort ist bei mehrspaltigen Schluesseln nicht eindeutig, welche Spalte auf
  // welche zeigt. Hier zaehlt ohnehin nur, dass Tabelle A vor Tabelle B kommen
  // muss -- mehr braucht eine Einfuege-Reihenfolge nicht.
  const kantenRoh = (
    await ausfuehren(
      `select kind.relname as kind, eltern.relname as eltern
         from pg_constraint c
         join pg_class kind on kind.oid = c.conrelid
         join pg_class eltern on eltern.oid = c.confrelid
         join pg_namespace n on n.oid = kind.relnamespace
        where c.contype = 'f' and n.nspname = 'public'`,
    )
  ).rows as { kind: string; eltern: string }[];

  return {
    tabellen: [...tabellenKarte.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    kanten: kantenRoh.map((k) => [k.kind, k.eltern] as [string, string]),
  };
}

// Eine Spalte so lesen, dass der Dump verlustfrei zurueckgeht.
function leseSpalte(spalte: DumpSpalte): string {
  if (spalte.udt === "date") return `to_char(${quote(spalte.name)}, 'YYYY-MM-DD') as ${quote(spalte.name)}`;
  return quote(spalte.name);
}

export async function exportieren(ausfuehren: Executor, erzeugtAm: string): Promise<Dump> {
  const { tabellen, kanten } = await schemaLesen(ausfuehren);
  const reihe = reihenfolge(
    tabellen.map((t) => t.name),
    kanten,
  );
  const nachName = new Map(tabellen.map((t) => [t.name, t]));

  const dumpTabellen: DumpTabelle[] = [];
  for (const name of reihe) {
    const tabelle = nachName.get(name)!;
    const auswahl = tabelle.spalten.map(leseSpalte).join(", ");
    // Nach Primaerschluessel sortiert, damit derselbe Datenbestand immer
    // denselben Dump ergibt. Ohne das waere der Rundlauf-Test ein Muenzwurf.
    const sortierung = tabelle.pk.length > 0 ? ` order by ${tabelle.pk.map(quote).join(", ")}` : "";
    const { rows } = await ausfuehren(`select ${auswahl} from ${quote(name)}${sortierung}`);
    dumpTabellen.push({ name, spalten: tabelle.spalten, zeilen: rows.length, daten: rows });
  }

  return { format: DUMP_FORMAT, version: DUMP_VERSION, erzeugtAm, tabellen: dumpTabellen };
}

export function dumpPruefen(dump: unknown): string[] {
  const befunde: string[] = [];
  if (typeof dump !== "object" || dump === null) return ["Der Dump ist kein Objekt."];
  const d = dump as Partial<Dump>;
  if (d.format !== DUMP_FORMAT) befunde.push(`Unbekanntes Format: ${String(d.format)} (erwartet ${DUMP_FORMAT}).`);
  if (typeof d.version !== "number") befunde.push("Die Formatversion fehlt.");
  else if (d.version > DUMP_VERSION) {
    befunde.push(
      `Der Dump wurde mit einer neueren Version geschrieben (${d.version}, diese Atlas-Version kennt ${DUMP_VERSION}).`,
    );
  }
  if (!Array.isArray(d.tabellen)) {
    befunde.push("Die Tabellenliste fehlt.");
    return befunde;
  }
  for (const t of d.tabellen) {
    if (typeof t?.name !== "string" || !Array.isArray(t?.spalten) || !Array.isArray(t?.daten)) {
      befunde.push(`Tabelle ohne Namen, Spalten oder Daten: ${JSON.stringify(t)?.slice(0, 80)}`);
      continue;
    }
    if (typeof t.zeilen === "number" && t.zeilen !== t.daten.length) {
      befunde.push(`${t.name}: angekuendigt ${t.zeilen} Zeilen, enthalten sind ${t.daten.length}.`);
    }
  }
  return befunde;
}

// Ein Wert so aufbereiten, dass node-postgres ihn fuer DIESE Spalte richtig
// uebertraegt. Der wichtigste Fall: jsonb. node-postgres schickt ein JS-Array
// als Postgres-Array-Literal ("{a,b}") -- in einer jsonb-Spalte ist das kein
// gueltiges JSON. Deshalb jsonb-Werte ausdruecklich als Text. Echte
// Postgres-Arrays (udt beginnt mit "_") muessen dagegen Arrays bleiben.
function einfuegeWert(spalte: DumpSpalte, wert: unknown): unknown {
  if (wert === undefined) return null;
  if (wert === null) return null;
  if (spalte.udt === "json" || spalte.udt === "jsonb") {
    return typeof wert === "string" ? wert : JSON.stringify(wert);
  }
  return wert;
}

const MAX_PARAMETER = 1000;

export async function wiederherstellen(
  ausfuehren: Executor,
  dump: unknown,
): Promise<{ proTabelle: Record<string, number>; gesamt: number }> {
  const befunde = dumpPruefen(dump);
  if (befunde.length > 0) throw new Error(`Der Dump ist unbrauchbar:\n${befunde.join("\n")}`);
  const d = dump as Dump;

  // Alles loeschen, was drin ist. TRUNCATE ... CASCADE in einer Anweisung, weil
  // TRUNCATE keine Reihenfolge kennt -- die Reihenfolge braucht nur das
  // Einfuegen.
  const namen = d.tabellen.map((t) => t.name);
  if (namen.length > 0) {
    await ausfuehren(`truncate table ${namen.map(quote).join(", ")} cascade`);
  }

  const proTabelle: Record<string, number> = {};
  let gesamt = 0;

  for (const tabelle of d.tabellen) {
    if (tabelle.daten.length === 0) {
      proTabelle[tabelle.name] = 0;
      continue;
    }
    const spalten = tabelle.spalten;
    const spaltenListe = spalten.map((s) => quote(s.name)).join(", ");
    const proZeile = spalten.length;
    const zeilenProSatz = Math.max(1, Math.floor(MAX_PARAMETER / proZeile));

    for (let start = 0; start < tabelle.daten.length; start += zeilenProSatz) {
      const block = tabelle.daten.slice(start, start + zeilenProSatz);
      const platzhalter: string[] = [];
      const werte: unknown[] = [];
      for (const zeile of block) {
        const einer: string[] = [];
        for (const spalte of spalten) {
          werte.push(einfuegeWert(spalte, zeile[spalte.name]));
          einer.push(`$${werte.length}`);
        }
        platzhalter.push(`(${einer.join(", ")})`);
      }
      await ausfuehren(
        `insert into ${quote(tabelle.name)} (${spaltenListe}) values ${platzhalter.join(", ")}`,
        werte,
      );
    }

    proTabelle[tabelle.name] = tabelle.daten.length;
    gesamt += tabelle.daten.length;
  }

  return { proTabelle, gesamt };
}

// Kurzfassung fuer die Anzeige: welche Tabelle hat wie viele Zeilen.
export function dumpUebersicht(dump: Dump): { name: string; zeilen: number }[] {
  return dump.tabellen
    .map((t) => ({ name: t.name, zeilen: t.daten.length }))
    .filter((t) => t.zeilen > 0)
    .sort((a, b) => b.zeilen - a.zeilen);
}
