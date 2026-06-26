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

  await untis.login();
  try {
    return await untis.getOwnTimetableForRange(start, end);
  } finally {
    await untis.logout().catch(() => {});
  }
}
