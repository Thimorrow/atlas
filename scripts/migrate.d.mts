// Typdeklaration fuer migrate.mjs, weil TypeScript einen .mjs-Import sonst
// nicht typisiert (Parameter waeren implizit `any`). Muss zur tatsaechlichen
// Signatur in migrate.mjs passen.
export function applyMigrations(
  execute: (anweisung: string) => Promise<unknown>,
  ordner?: string,
): Promise<
  | { ok: true; bericht: { datei: string; neu: number; schonDa: number }[] }
  | {
      ok: false;
      datei?: string;
      anweisung?: string;
      error: string;
      bericht?: { datei: string; neu: number; schonDa: number }[];
    }
>;
