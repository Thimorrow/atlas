// Atlas-Logo: gefaltete Pfeilspitze. Zwei Facetten (Licht/Schatten) teilen sich an
// einem Mittelgrat -> 3D-Faltung. Beide Toene aus currentColor (Opazitaet) -> bleibt
// theme-fest (passt sich der Marken-Vordergrundfarbe an).
export function AtlasLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      strokeLinejoin="round"
    >
      {/* rechte Facette = Schattenseite */}
      <path fill="currentColor" fillOpacity="0.5" d="M12 2.4 L20.6 21 L14.4 21 L12 14 Z" />
      {/* linke Facette = Lichtseite */}
      <path fill="currentColor" d="M12 2.4 L12 14 L9.6 21 L3.4 21 Z" />
    </svg>
  );
}
