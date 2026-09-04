// Grenzen fuer Datei-Uploads, geteilt zwischen Client und Server.
// Client-sicher: keine DB-Imports, damit sich diese Datei bedenkenlos aus
// Client-Komponenten importieren laesst.

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const MAX_FILES_PER_UPLOAD = 10;

export const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");
