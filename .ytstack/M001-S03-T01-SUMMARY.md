---
milestone: M001
slice: S03
task: T01
project: Atlas
completed: 2026-06-26T18:20:00Z
status: done
---

# M001-S03-T01 -- Summary

**Was gemacht:** Wochenkalender-Ansicht (Desktop). ERSTER Entwurf (Almanach-Aesthetik,
Fraunces, "Luxus") wurde vom User komplett verworfen -> auf **shadcn/Tailwind, schlicht**
neu gebaut.

**Aktueller Stand (nach Redesign):**
- Stack: Tailwind v4 + shadcn-Tokens (`app/globals.css`), `components/ui/button.tsx`,
  `lib/utils.ts` (cn). Font **Geist** (sans + mono). framer-motion dezent, lucide-react.
- Dark Mode via `.dark`-Klasse (No-Flash-Script in `app/layout.tsx`, localStorage
  `atlas-theme`).
- `app/page.tsx`: schlichter Kalender, KEIN Branding/Dashboard oben links -- nur
  Wochen-Nav (zurueck/vor/Heute) + Wochenbereich-Label + Theme-Toggle. Zeit-Raster
  06-22, 7 Spalten. Kacheln neu: clean, linker Akzentstrich (Schule blau / Routine
  amber / manuell emerald), volle Titel, Zeit in Mono. Entfall = gestrichelt + durch-
  gestrichen + "Entfall"-Badge; Vertretung-Badge. Freie Luecken dezent. Heute-Spalte
  leicht getoent, Datum als primary-Badge. Jetzt-Linie (rot, live).
- **Volle Faechernamen:** `adapter.ts` nimmt `su[0].longname` -> Re-Sync -> "Englisch",
  "Informatik/ang. Mathematik" statt Kuerzel.

**Verifikation (headless):** `npm run build` gruen; `/` -> 200; Re-Sync 72 upserted,
Faechernamen ausgeschrieben bestaetigt. **Visuelle Abnahme durch User weiterhin offen.**

**Notizen:**
- HOUR_H (page.tsx, 56) bestimmt die Rasterhoehe (kein globals-Pendant mehr noetig).
- Offene Feedback-Schleife: User gibt Look-Korrekturen, danach weiter zu T02/T03.
