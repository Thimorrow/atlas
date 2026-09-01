import { WebUntisSecretAuth } from "webuntis";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export type Schoolyear = { name: string; start: string; end: string };

export type TimetableResult = {
  lessons: unknown[];
  schoolyear: Schoolyear | null;
  // Der tatsaechlich abgefragte Zeitraum, nachdem er ins Schuljahr geschoben
  // wurde. Weicht er vom gewuenschten ab, soll das sichtbar sein.
  window: { start: string; end: string } | null;
  hinweis: string | null;
};

function isoTag(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Server-only: loggt sich per Untis-Mobile-Secret ein, holt den Stundenplan
// fuer einen Zeitraum, loggt wieder aus. Das Secret darf nie in den Client.
export async function fetchTimetable(start: Date, end: Date): Promise<TimetableResult> {
  // Die webuntis-Typen verlangen einen 6. Argument (authenticator); zur Laufzeit
  // faellt die Lib auf ihr internes otplib zurueck (im Spike mit 5 Args verifiziert).
  // @ts-expect-error -- Laufzeit-Default fuer authenticator, siehe Kommentar oben.
  const untis = new WebUntisSecretAuth(
    env("WEBUNTIS_SCHOOL"),
    env("WEBUNTIS_USER"),
    env("WEBUNTIS_SECRET"),
    env("WEBUNTIS_SERVER"),
    "Atlas",
  );

  // Die Bibliothek wirft fuer JEDE JSON-RPC-Antwort ohne "result" denselben
  // Satz: "Server didn't return any result." Untis' eigene Begruendung steht
  // daneben in data.error und geht dabei verloren. Genau die braucht man aber,
  // um zu wissen, ob ein Recht fehlt, die Sitzung abgelaufen ist oder der
  // Zeitraum ausserhalb des Schuljahres liegt.
  let untisFehler: string | null = null;
  let untisCode: number | null = null;
  const mitAxios = untis as unknown as {
    axios: { interceptors: { response: { use: (f: (r: unknown) => unknown) => void } } };
  };
  mitAxios.axios.interceptors.response.use((res) => {
    const fehler = (res as { data?: { error?: { message?: string; code?: number } } })?.data?.error;
    if (fehler) {
      untisCode = fehler.code ?? null;
      untisFehler = [fehler.message, fehler.code != null ? `Code ${fehler.code}` : null]
        .filter(Boolean)
        .join(", ");
    }
    return res;
  });

  const mitGrund = (satz: string, err: unknown) =>
    new Error(`${satz}: ${untisFehler ?? (err as Error).message}`);

  try {
    await untis.login();
  } catch (err) {
    throw mitGrund("Anmeldung bei WebUntis fehlgeschlagen", err);
  }

  try {
    // Untis lehnt jeden Abruf ab, der ueber die Grenze eines Schuljahres geht
    // ("startDate and endDate are not within a single school year", Code -8507),
    // und ebenso jedes Datum ausserhalb ("no allowed date", Code -7004). Das
    // Standardfenster von einer Woche zurueck bis drei Wochen voraus reisst
    // beides regelmaessig, besonders im September. Deshalb wird der Zeitraum
    // erst ins laufende Schuljahr geschoben und nur der Rest abgefragt.
    let jahr: Schoolyear | null = null;
    try {
      const j = await untis.getCurrentSchoolyear();
      jahr = { name: j.name, start: isoTag(j.startDate), end: isoTag(j.endDate) };
    } catch {
      // Ohne Schuljahr wird ungeschnitten abgefragt. Schlaegt das fehl, sagt
      // die Fehlermeldung weiter unten warum.
    }

    let von = start;
    let bis = end;
    let hinweis: string | null = null;

    if (jahr) {
      const jahrVon = new Date(`${jahr.start}T00:00:00`);
      const jahrBis = new Date(`${jahr.end}T00:00:00`);
      if (von < jahrVon) von = jahrVon;
      if (bis > jahrBis) bis = jahrBis;

      if (bis < von) {
        return {
          lessons: [],
          schoolyear: jahr,
          window: null,
          hinweis: `Der Zeitraum liegt außerhalb des Schuljahres ${jahr.name} (${jahr.start} bis ${jahr.end}).`,
        };
      }
      if (isoTag(von) !== isoTag(start) || isoTag(bis) !== isoTag(end)) {
        hinweis = `Der Zeitraum wurde auf das Schuljahr ${jahr.name} beschnitten.`;
      }
    }

    let lessons: unknown[];
    try {
      lessons = (await untis.getOwnTimetableForRange(von, bis)) as unknown[];
    } catch (err) {
      // Nicht jede Absage von Untis ist ein Fehler auf unserer Seite. Fuer
      // einen Zeitraum ohne Freigabe (-8509) oder ausserhalb des erlaubten
      // Bereichs (-7004) gibt es schlicht nichts zu holen. Das als 500 zu
      // melden waere falsch: es ist eine Auskunft, kein Defekt.
      if (untisCode === -8509 || untisCode === -7004) {
        return {
          lessons: [],
          schoolyear: jahr,
          window: { start: isoTag(von), end: isoTag(bis) },
          hinweis:
            untisCode === -8509
              ? "Untis gibt den Stundenplan für diesen Zeitraum noch nicht frei."
              : "Untis nimmt diesen Zeitraum nicht an, er liegt außerhalb des erlaubten Bereichs.",
        };
      }
      throw err;
    }

    return {
      lessons: lessons as unknown[],
      schoolyear: jahr,
      window: { start: isoTag(von), end: isoTag(bis) },
      hinweis,
    };
  } catch (err) {
    throw mitGrund("Stundenplan konnte nicht geladen werden", err);
  } finally {
    await untis.logout().catch(() => {});
  }
}
