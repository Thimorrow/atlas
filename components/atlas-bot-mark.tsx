// Zeichen des Atlas-Bots: Globus mit Orbit-Ring -- die Kugel zum Kartenwerk,
// der Ring fuer den Assistenten, der sie umkreist. Auf dem Ring sitzt eine
// Mini-Atlas-Pfeilspitze als Satellit (Anschluss ans App-Logo), oben links ein
// Funke als KI-Zeichen. Der Ring ist in drei Boegen geteilt: zwei aeussere
// hinter der Kugel, einer vorne drueber -- so wirkt er raeumlich statt
// aufgemalt. Alle Toene kommen aus currentColor ueber Opazitaet, damit es in
// beiden Themes und auf farbigem Grund traegt.
export function AtlasBotMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Orbit, hinterer Teil: linker und rechter Aussenbogen. Der obere
          Bogen hinter der Kugel bleibt unsichtbar -- die Kugel verdeckt ihn. */}
      <path
        d="M12.08 23.54 L11.35 23.66 L10.64 23.75 L9.95 23.81 L9.28 23.85 L8.64 23.85 L8.04 23.83 L7.46 23.78 L6.92 23.71 L6.42 23.60 L5.96 23.47 L5.53 23.31 L5.15 23.13 L4.82 22.92 L4.53 22.69 L4.28 22.43 L4.09 22.16 L3.94 21.86 L3.84 21.54 L3.80 21.20 L3.80 20.85 L3.85 20.48 L3.95 20.09 L4.10 19.70 L4.30 19.29 L4.55 18.87 L4.84 18.45 L5.18 18.02 L5.56 17.58 L5.99 17.14 L6.45 16.71 L6.96 16.27 L7.50 15.84"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.45"
      />
      <path
        d="M22.20 10.18 L22.80 10.15 L23.39 10.15 L23.94 10.17 L24.47 10.21 L24.98 10.28 L25.45 10.37 L25.88 10.48 L26.29 10.62 L26.66 10.77 L26.99 10.95 L27.28 11.15 L27.54 11.37 L27.75 11.61 L27.92 11.87 L28.06 12.14 L28.15 12.43 L28.20 12.74 L28.21 13.06 L28.17 13.40 L28.10 13.75 L27.98 14.11 L27.82 14.48 L27.62 14.86 L27.38 15.24 L27.10 15.63 L26.78 16.03 L26.43 16.43 L26.04 16.83 L25.61 17.23 L25.15 17.64 L24.66 18.03 L24.15 18.43"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.45"
      />
      {/* Koerper der Sphaere -- gedeckt, damit die Meridiane darauf sitzen */}
      <circle cx="16" cy="16" r="8.5" fill="currentColor" fillOpacity="0.14" />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeOpacity="0.95"
      />
      {/* Aequator: leicht angehoben, damit die Kugel von schraeg oben
          gesehen wirkt statt flach frontal */}
      <path
        d="M8.6 17.5 C11 18.9 21 18.9 23.4 17.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      {/* Laengsmeridian -- die eine Achse reicht; zwei machen das Zeichen in
          Favicon-Groesse zum Gitter */}
      <ellipse
        cx="16"
        cy="16"
        rx="4.1"
        ry="8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      {/* Orbit, vorderer Teil: laeuft ueber der Kugel, kraeftiger als hinten */}
      <path
        d="M24.15 18.43 L23.84 18.65 L23.53 18.87 L23.21 19.09 L22.88 19.30 L22.54 19.51 L22.19 19.72 L21.84 19.93 L21.49 20.13 L21.12 20.33 L20.75 20.53 L20.38 20.72 L20.00 20.91 L19.62 21.09 L19.23 21.27 L18.84 21.45 L18.45 21.62 L18.05 21.78 L17.65 21.94 L17.25 22.09 L16.85 22.24 L16.44 22.39 L16.04 22.52 L15.64 22.65 L15.23 22.78 L14.83 22.90 L14.43 23.01 L14.03 23.11 L13.64 23.21 L13.24 23.31 L12.85 23.39 L12.46 23.47 L12.08 23.54"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeOpacity="0.9"
      />
      {/* Satellit: die gefaltete Atlas-Pfeilspitze im Kleinformat, fliegt auf
          dem Ring in Bahnrichtung (Tangente ~45 Grad) */}
      <g transform="translate(27.56 11.39) rotate(135) scale(0.18) translate(-12 -12)">
        <path fill="currentColor" fillOpacity="0.5" d="M12 2.4 L20.6 21 L14.4 21 L12 14 Z" />
        <path fill="currentColor" d="M12 2.4 L12 14 L9.6 21 L3.4 21 Z" />
      </g>
      {/* Funke: das KI-Zeichen, bewusst ausserhalb der Kugel in freier Flaeche */}
      <path
        d="M6.8 6.6 C7.0 7.5 7.3 7.8 8.2 8.0 C7.3 8.2 7.0 8.5 6.8 9.4 C6.6 8.5 6.3 8.2 5.4 8.0 C6.3 7.8 6.6 7.5 6.8 6.6 Z"
        fill="currentColor"
        fillOpacity="0.85"
      />
    </svg>
  );
}
