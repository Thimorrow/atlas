// Sichere Wrapper um localStorage/document.cookie -- Safaris privater Modus
// wirft bei localStorage-Zugriffen, das darf die Seite nicht mitreissen.

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignorieren -- z.B. privater Modus oder voller Speicher.
  }
}

export function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {
    // Ignorieren.
  }
}
