// Kleine Helfer, die beide Backup-Skripte brauchen.
//
// Bewusst kein Datum ueber toISOString().slice(0, 10): das waere UTC und damit
// am Abend einen Tag daneben -- derselbe Fehler, den das Projekt an anderer
// Stelle schon einmal hatte. Datum und Uhrzeit kommen aus der Europe/Berlin-
// Zeitzone, wie in lib/zeit.ts.

export function heute() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

// pg-Executor fuer die Skripte. Dieselbe Form, die lib/backup.ts erwartet.
export function pgExecutor(pool) {
  return async (text, params = []) => {
    const ergebnis = await pool.query(text, params);
    return { rows: ergebnis.rows };
  };
}
