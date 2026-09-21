// Typen zu scripts/doku-zahlen.mjs.
//
// Die Logik steht bewusst als .mjs da: das Skript laeuft als nacktes
// `node scripts/doku-zahlen.mjs` im Build und in der CI, ohne Loader. Weil
// lib/doku-zahlen.test.ts es aber importiert, braucht TypeScript diese
// Deklaration -- ohne sie faellt `npm run typecheck` mit "keine
// Deklarationsdatei" um.

export type Route = { pfad: string; methoden: string[] };

export type Zahlen = {
  routen: number;
  seiten: number;
  tabellen: number;
  testdateien: number;
  migrationen: number;
  migrationenVon: string;
  migrationenBis: string;
};

export const WURZEL: string;
export const DOKU_DATEIEN: string[];

export function pfadAusDatei(voll: string, appOrdner?: string): string;
export function methodenAusQuelltext(quelle: string): string[];
export function routenLesen(wurzel?: string): Promise<Route[]>;
export function apiMdPfade(wurzel?: string): Promise<string[]>;
export function zahlenLesen(wurzel?: string): Promise<Zahlen>;
export function blockInhalt(datei: string, z: Zahlen): string;
export function pruefen(wurzel?: string): Promise<string[]>;
export function schreiben(wurzel?: string): Promise<{ zahlen: Zahlen; geaendert: string[] }>;
