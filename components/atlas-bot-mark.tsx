// Zeichen des Atlas-Bots: eine Sphaere mit Meridianen -- der Globus zum
// Kartenwerk, das der App den Namen gibt. Bewusst ein eigenes Zeichen neben
// AtlasLogo (der gefalteten Pfeilspitze): das Logo steht fuer die App, dieses
// Mal fuer den Gespraechspartner darin. Alle Toene kommen aus currentColor
// ueber Opazitaet, damit es in beiden Themes und auf farbigem Grund traegt.
export function AtlasBotMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {/* Koerper der Sphaere -- gedeckt, damit die Meridiane darauf sitzen */}
      <circle cx="12" cy="12" r="9.25" fill="currentColor" fillOpacity="0.16" />
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeOpacity="0.9"
      />
      {/* Aequator: leicht angehoben, damit die Kugel von schraeg oben
          gesehen wirkt statt flach frontal */}
      <path
        d="M2.9 13.6 C5.6 15.2 18.4 15.2 21.1 13.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.55"
        strokeLinecap="round"
      />
      {/* Laengsmeridian -- die eine Achse reicht; zwei machen das Zeichen in
          Favicon-Groesse zum Gitter */}
      <ellipse
        cx="12"
        cy="12"
        rx="4.3"
        ry="9.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />
      {/* Pol-Punkt: gibt dem Zeichen einen Blick, ohne ein Gesicht zu bauen */}
      <circle cx="12" cy="7.4" r="1.35" fill="currentColor" />
    </svg>
  );
}
