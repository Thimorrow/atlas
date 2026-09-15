// Grenzen fuer Datei-Uploads, geteilt zwischen Client und Server.
// Client-sicher: keine DB-Imports, damit sich diese Datei bedenkenlos aus
// Client-Komponenten importieren laesst.

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const MAX_FILES_PER_UPLOAD = 10;

export const LEARNING_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
] as const;

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet", txt: "text/plain", md: "text/markdown",
  csv: "text/csv", rtf: "application/rtf", zip: "application/zip",
};
export const ACCEPTED_TYPES = [...new Set(Object.values(EXTENSION_TYPES)), "application/octet-stream"];
export const ACCEPT_ATTR = [...ACCEPTED_TYPES, ...Object.keys(EXTENSION_TYPES).map((ext) => `.${ext}`)].join(",");

export function uploadContentType(file: { name: string; type: string }): string {
  if (file.type !== "application/octet-stream" && ACCEPTED_TYPES.includes(file.type)) return file.type;
  return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function canPreview(contentType: string): boolean {
  return ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain", "text/markdown", "text/csv"].includes(contentType);
}
