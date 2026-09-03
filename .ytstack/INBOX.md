# Inbox aus der Nacht 2026-09-02 auf 2026-09-03

Fragen und Punkte, die eine Entscheidung des Besitzers brauchen.

1. **`AI_GATEWAY_API_KEY` muss bei Vercel noch hinterlegt werden.** Der Versuch,
   ihn per `vercel env add` fuer preview und production zu setzen, wurde
   abgelehnt, weil dabei ein Schluessel an einen externen Dienst geschickt
   worden waere. Bitte selbst im Vercel-Dashboard unter Settings ->
   Environment Variables eintragen (Wert steht in `.env.local`). Bis dahin
   schaltet sich der Bot in der Live-App stumm ab und zeigt einen Hinweis, die
   restliche App laeuft unveraendert.

2. **Branch `origin/v0/design-system-96511499`** (Design-System-Schaukasten)
   blieb heute Nacht liegen, er haengt an einem aelteren Stand und muesste vor
   einem Merge erst auf `schule-scope` nachgezogen werden.
