import { WebUntisSecretAuth } from "webuntis";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

// Server-only: loggt sich per Untis-Mobile-Secret ein, holt den Stundenplan
// fuer einen Zeitraum, loggt wieder aus. Das Secret darf nie in den Client.
export async function fetchTimetable(start: Date, end: Date) {
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
  const mitAxios = untis as unknown as {
    axios: { interceptors: { response: { use: (f: (r: unknown) => unknown) => void } } };
  };
  mitAxios.axios.interceptors.response.use((res) => {
    const fehler = (res as { data?: { error?: { message?: string; code?: number } } })?.data?.error;
    if (fehler) {
      untisFehler = [fehler.message, fehler.code != null ? `Code ${fehler.code}` : null]
        .filter(Boolean)
        .join(", ");
    }
    return res;
  });

  const mitGrund = (satz: string, err: unknown) =>
    new Error(`${satz}: ${untisFehler ?? (err as Error).message}`);

  // Zwei Schritte, zwei Fehlermeldungen. Die Lib wirft fuer beide dasselbe
  // "Server didn't return any result", und dann steht man da und weiss nicht,
  // ob die Zugangsdaten falsch sind oder ob Untis nur diesen einen Abruf
  // verweigert. Der Unterschied entscheidet, wo man sucht.
  try {
    await untis.login();
  } catch (err) {
    throw mitGrund("Anmeldung bei WebUntis fehlgeschlagen", err);
  }

  try {
    return await untis.getOwnTimetableForRange(start, end);
  } catch (err) {
    throw mitGrund("Stundenplan konnte nicht geladen werden", err);
  } finally {
    await untis.logout().catch(() => {});
  }
}
