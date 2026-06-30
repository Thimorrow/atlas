import { toast } from "sonner";

// Optimistic-Write-Helfer. Muster: das UI hat schon umgeschaltet (positive
// state), der Schreib-Request laeuft im Hintergrund. WICHTIG: fetch rejectet
// NICHT bei 4xx/5xx -- nur bei echtem Netzwerk-Abbruch. Darum hier res.ok
// pruefen, sonst schlucken wir DB-/Server-Fehler still und das Haekchen luegt.
//
// Bei Fehler: onFail() rollt den optimistischen State zurueck (i.d.R. ein
// Re-Fetch der Wahrheit aus der DB) und ein Toast bietet "Erneut versuchen" an,
// das die komplette Aktion (optimistic + Write) noch einmal ausloest.
export function persistWrite(
  send: () => Promise<Response>,
  opts: { message: string; onFail: () => void; retry: () => void },
) {
  send()
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
    .catch(() => {
      opts.onFail();
      toast.error(opts.message, {
        action: { label: "Erneut versuchen", onClick: opts.retry },
      });
    });
}

// Wie persistWrite, aber fuer eine Gruppe von Writes (z.B. "alle Vorschlaege
// annehmen"): schlaegt EINER fehl, rollt onFail die ganze Gruppe zurueck und es
// kommt EIN Sammel-Toast statt eines pro Item.
export function persistBatch(
  sends: Array<() => Promise<Response>>,
  opts: { message: string; onFail: () => void; retry: () => void },
) {
  Promise.all(
    sends.map((send) =>
      send().then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }),
    ),
  ).catch(() => {
    opts.onFail();
    toast.error(opts.message, {
      action: { label: "Erneut versuchen", onClick: opts.retry },
    });
  });
}
