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
    // Secure nur bei HTTPS (oder Production): ueber HTTP wuerde der Browser
    // ein Secure-Cookie sonst kommentarlos verwerfen.
    const secure =
      (typeof location !== "undefined" && location.protocol === "https:") ||
      process.env.NODE_ENV === "production"
        ? "; Secure"
        : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  } catch {
    // Ignorieren.
  }
}
