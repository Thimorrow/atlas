// Tag-Vergleich Untis-live gegen Atlas-DB: "Warum ist Mittwoch 5./6. leer?"
//
// Rein und ohne DB-Import, damit es ohne DATABASE_URL testbar ist -- gleiches
// Muster wie lib/morgen-view.ts. Die API-Route fuettert beide Listen (Untis roh
// gemappt, school_blocks aus der DB); hier steht nur der Vergleich.
//
// Abgleichschluessel ist die Startzeit: Im EIGENEN Stundenplan gibt es zu einer
// Uhrzeit hoechstens einen Eintrag, und eine verschobene Stunde (11:30 ->
// 11:35) soll als fehlend+zusaetzlich auffallen statt still zu matchen.

export type TagStunde = {
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  subject: string;
  room: string | null;
  teacher: string | null;
  status: string; // regular | cancelled | substituted
};

export type TagDiff = {
  // In Untis, nicht in Atlas -- der Fall "Atlas zeigt Luecke, Untis Unterricht".
  fehltInAtlas: TagStunde[];
  // In Atlas, nicht mehr in Untis -- veraltete Reste nach Planwechsel.
  nurInAtlas: TagStunde[];
  // Gleiche Startzeit, aber Fach, Status oder Endzeit weichen ab.
  statusWeichtAb: { untis: TagStunde; atlas: TagStunde }[];
};

const hm = (t: string) => t.slice(0, 5);

export function vergleichTag(untis: TagStunde[], atlas: TagStunde[]): TagDiff {
  const atlasNachStart = new Map<string, TagStunde>();
  for (const a of atlas) {
    if (!atlasNachStart.has(hm(a.startTime))) atlasNachStart.set(hm(a.startTime), a);
  }
  const untisNachStart = new Map<string, TagStunde>();
  for (const u of untis) {
    if (!untisNachStart.has(hm(u.startTime))) untisNachStart.set(hm(u.startTime), u);
  }

  const fehltInAtlas = untis.filter((u) => !atlasNachStart.has(hm(u.startTime)));
  const nurInAtlas = atlas.filter((a) => !untisNachStart.has(hm(a.startTime)));

  const statusWeichtAb: TagDiff["statusWeichtAb"] = [];
  for (const u of untis) {
    const a = atlasNachStart.get(hm(u.startTime));
    if (!a) continue;
    if (u.subject !== a.subject || u.status !== a.status || hm(u.endTime) !== hm(a.endTime)) {
      statusWeichtAb.push({ untis: u, atlas: a });
    }
  }

  return { fehltInAtlas, nurInAtlas, statusWeichtAb };
}
