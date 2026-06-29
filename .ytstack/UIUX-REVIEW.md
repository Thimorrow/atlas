# UI/UX-Review Atlas — Konsolidierter Befund

168 Rohbefunde aus drei Pässen (interface-craft / Josh Puckett, design-motion / Krehel·Tompkins·Kowalski, make-interfaces-feel-better) zusammengeführt, dedupliziert und priorisiert. Konsens mehrerer Pässe = höhere Konfidenz (in Klammern markiert).

---

## Executive Summary — „Wenn du nur diese machst"

Die zehn wirkungsstärksten Fixes über die ganze App:

1. **Wochenwechsel & Tag-Navigation re-staggern alle Event-Blöcke mit Blur (bis ~1 s) bei JEDER Navigation.** Das ist die häufigste Aktion der App und ermüdet sofort. → Stagger nur beim echten First-Paint (firstPaint-Ref), danach nur der vorhandene Wrapper-Crossfade. *(Konsens: Krehel + Tompkins + Kowalski, Woche **und** Heute)*
2. **First-Paint der Default-Ansicht braucht ~1,4–1,5 s bis settled** (0,5 s Base-Delay + 0,7 s Section-Duration + Stagger). → Base-Delay auf ~0,12 s, Section-Duration auf ~0,4 s, Per-Block-Stagger deckeln. *(Konsens: alle drei Motion-Lenses)*
3. **SplitText zerlegt „Kalender"/„Einstellungen" Buchstabe für Buchstabe bei jedem Load** — Motion-on-mount auf statischem Nav-Heading, doppelt geblurrt (SplitText + parent StaggerItem). → SplitText raus, Heading statisch oder einfacher Section-Fade. *(Konsens: alle drei, beide Surfaces)*
4. **Logo-Nudge (rotateX-Tilt) feuert bei jedem Prev/Next/Woche-Switch** — peripheres Element in der Gegenecke zieht das Auge weg vom Grid. → Nudge von Routine-Navigation entkoppeln; Logo-Motion nur für den seltenen „Heute"-Flip. *(Konsens: alle drei)*
5. **Scale-on-Press wird NIE animiert** — `transition-[…,transform]` listet `transform`, aber Tailwind v4 emittiert für `scale-[0.96]` die standalone `scale`-Property → snappt instant auf jedem Button app-weit. → `scale` in Transition-Liste (oder `transition-transform`). *(make-interfaces, hohe Konfidenz, kompiliert verifiziert)*
6. **Alle School-Lessons sind dasselbe Blau** — 13 identische Blöcke, kein visueller Einstiegspunkt, Woche „scannt" nicht. → Nach Fach einfärben (hue-hash aus event-colors.ts), Quelle über Border-Weight kodieren. *(interface-craft — größter Readability-Win)*
7. **Button-Fokusring ohne Offset + neutrales Grau** — auf filled/outline-Varianten kaum sichtbar; das Primitive, auf dem jeder Keyboard-User landet. → `ring-offset-2 ring-offset-background` + kontrastreicheres/branded Ring-Token. *(Konsens: alle drei Lenses + interface-craft)*
8. **Aktives Theme-Tile & aktives Modul lesen sich in Light-Mode schwächer als die inaktiven** (accent ~3 % Delta gegen card). → Aktiv = `ring-2 ring-primary` / `bg-primary/8`, inaktive Border zurücknehmen. *(interface-craft)*
9. **Reduced-Motion-Gate ist löchrig** — `reducedMotion="user"` neutralisiert nur Transform/Layout; **opacity + filter:blur laufen weiter**; CSS-`@media` fasst Framers JS-Animationen nicht. → `useReducedMotion()` lesen und Entrances bei finalem Zustand mounten. *(Konsens: Krehel + Kowalski, mehrere Surfaces)*
10. **Edit-Sheet staggert 6 vorausgefüllte Felder mit Blur (~0,6 s)** — verzögert das Bearbeiten genau des Inhalts, den man öffnen wollte. → Per-Feld-Stagger + Blur raus, ein kurzer Container-Fade. *(Konsens: alle drei)*

### Querschnitt-Themen (wiederkehrend über Surfaces)

- **Blur-everywhere:** identisches `blur(4–6px)`-Entrance auf Sidebar, Sections, SplitText, ~30 Event-Blöcke, Edit-Feldern, Date-/Time-Popover, Color-Check. Blur als Haus-Default statt selektives Signal — auf ≥3 Komponenten je Surface das klassische Slop-Tell. → Blur auf 1–2 echte „Materialisier"-Momente reservieren, Rest opacity+y.
- **Reduced-Motion-Lücke** (siehe #9) — betrifft Sidebar, Stagger, SplitText, Event-Sheet-Felder, Header-Color-Dot.
- **Hit-Areas < 40×40:** Icon-Buttons (36), `sm` (32), Close-Button (36), Color-Swatches (32), Date-Chevrons (32), Time-Stepper (~28×20), All-Day-Mini-Buttons (~16), Settings-Back-Link (~20). *(Konsens interface-craft + make-interfaces)*
- **Press-Scale-Drift:** Haupt-App standardisiert auf 0.96, aber color-picker/date-field/time-range nutzen 0.92 (unter dem 0.95-Floor); Event-Blöcke/Agenda-Karten/Profil-Trigger haben gar keinen Press. *(Konsens)*
- **--ease-atlas erreicht das Button-Primitive nicht** — höchstfrequentes Element fährt die explizit verworfene Material-Default-Kurve (0.4,0,0.2,1). *(Konsens: Krehel + Tompkins + Kowalski)*
- **Rot ist überladen:** „Jetzt"-Linie, Entfall und user-getönte rosa Events teilen Rot — aktiver Block liest sich wie ein abgesagter. *(Konsens beide Kalender-Surfaces)*
- **tabular-nums fehlt** an Live-Countern (Kicker-relLabel, Dauer-Label) während andere Stellen es korrekt nutzen → Sub-Pixel-Jitter pro Minute/Nudge.
- **Concentric Radius / Radius-Konsistenz:** Collapse vs. Expand (md/lg), Time-Stepper (6 statt 8), Settings-Cards.

---

## Kalender · Wochenansicht (calendar-week)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | Wochenwechsel re-staggert ~30 Blöcke mit Blur | app/page.tsx:817-835, 670 | Inner-Wrapper remountet je Navigation, Blur-Cascade läuft trotz „sofort"-Kommentar bei jedem Chevron-Klick | Stagger an `firstPaint.current` gaten; bei Wechsel nur Wrapper-Crossfade, Blöcke instant | S | Krehel·Tompkins·Kowalski |
| 🔴 high | `blur(5px)` auf jedem Event-Block | app/page.tsx:829-835 | ~16 dichte Text-Tiles blurren beim First-Paint → mindert Lesbarkeit + 16 gleichzeitige Filter-Animationen GPU-teuer | Blur auf Grid-Blöcken droppen, nur opacity+y(6px) | S | Krehel·Tompkins |
| 🔴 high | Default-View settled erst nach ~1,4 s | app/page.tsx:833, stagger.tsx:16,27 | 0,5 s Base + 0,7 s Section-Duration + lange Staggers | Base→0,12; Duration→0,4; Per-Block-Cap senken | M | Krehel·Tompkins·Kowalski |
| 🔴 high | Alle School-Lessons identisch blau | app/page.tsx:50-54 | 13 gleiche Blöcke, kein Einstiegspunkt, Woche scannt nicht | Nach Fach einfärben (hue-hash), Quelle über Border | M | interface-craft |
| 🟠 med | Drei gestapelte Staggers auf einem Mount | app/page.tsx:555,561,802-835 | Section-Stagger + SplitText + Grid-Stagger gleichzeitig → „Seite performt" | Einen Stagger behalten (Grid hat räuml. Sinn), Section zu stillem Fade, SplitText raus | M | Krehel |
| 🟠 med | Reduced-Motion neutralisiert Blur/Opacity nicht | motion-provider.tsx:8, globals.css:169 | `reducedMotion="user"` lässt opacity+filter laufen; CSS-Gate fasst Framer nicht | `useReducedMotion()` → Entrance instant / Blur=0 | M | Krehel |
| 🟠 med | Rot bedeutet zweierlei | app/page.tsx:868 (vs. 58-59,76,409) | „Jetzt"-Linie und Entfall teilen Rot, kreuzen sich montags | Rot nur für Now; Entfall neutral-entsättigt + Strike + kleines rotes Tag | M | interface-craft |
| 🟠 med | Custom-getönte Blöcke zu blass in Light | globals.css:120-126 | Nur 11 % --ev-Mix (Light) vs. 22 % (Dark) → liest sich wie Drag-Selektion | Light-Mix auf ~16–18 % oder Inner-Border | S | interface-craft |
| 🟠 med | Entfall-Strike nahezu unsichtbar | app/page.tsx:63-81 | 1,5px / red-500/40 Hairline tut kaum Arbeit | Strike auf ~2px, /60-70, oder Hatch-Gradient | S | interface-craft |
| 🟠 med | Editierbare Blöcke ohne Press-Scale | app/page.tsx:820-825 | Primäres Interaktionselement, nur `hover:shadow-sm`; Buttons haben Press | `active:scale-[0.96]` + transform-Transition | S | make-interfaces |
| 🟠 med | Hover-Shadow snappt ohne Transition | app/page.tsx:820-824 | Kein `transition-shadow` (Today-View macht's korrekt) | `transition-shadow` ergänzen | S | make-interfaces |
| 🟠 med | Tap-Targets unter 40×40 | app/page.tsx:730-737, 804 | All-Day-Mini-Buttons ~16px, Kurz-Events 20px min, Nav-Icons 36/32 | Hit-Slop via padding/Pseudo-Element auf 40×40 | M | make-interfaces |
| 🟢 low | Heading doppelt geblurrt (SplitText + StaggerItem) | stagger.tsx:65-87, page.tsx:561 | Zwei überlappende Blur-Entrances auf demselben Wort | Ein Owner: SplitText raus, Section trägt Heading | S | Tompkins |
| 🟢 low | Entfall-Strike snappt statisch | page.tsx:63-81 vs. 867 | Now-Line zeichnet sich (scaleX), Strike nicht — zwei Philosophien | Strike via pathLength/scaleX einzeichnen (Now-Line-Technik) | M | Tompkins |
| 🟢 low | Event-Blöcke ohne Hover-Persönlichkeit | app/page.tsx:823 | Signatur-Element (farbiger Left-Border) bleibt inert | Border 6→8px / Chroma vertiefen bei Hover (editierbar) | S | Tompkins |
| 🟢 low | Logo-Nudge bei jedem Nav-Arrow | app-sidebar.tsx:106, page.tsx:577,608,620 | Peripherer Tilt bei Hochfrequenz-Aktion | Nudge nur für „Heute"-Flip behalten | S | Krehel·Kowalski |
| 🟢 low | Today-Spalten-Tint zu schwach | app/page.tsx:778 | `bg-primary/[0.035]` quasi unsichtbar | Auf ~0,05–0,06 anheben oder ganz weglassen | S | interface-craft |
| 🟢 low | Konfligierende Border-Breiten (3px vs 6px) | app/page.tsx:821 vs 50-54 | Zwei `border-l-width`-Utilities lösen per Source-Order | Eine Breite pro Surface / Shared-Block-Komponente | S | interface-craft |
| ⚪ nit | Now-Dot aus scale(0) | app/page.tsx:873-878 | Pop-in statt natürliche Erscheinung | Start bei scale 0.6 oder nur opacity | S | Krehel·Kowalski |
| ⚪ nit | Raum-Code „A120" als Wiederholungs-Rauschen | app/page.tsx:810-813 | Default-Raum 6+× → Ausnahmen verschwinden | Raum nur zeigen wenn ≠ üblicher | M | interface-craft |
| ⚪ nit | Blur ohne will-change auf vielen Blöcken | app/page.tsx:829-835 | Code merkt selbst „glitcht/repaintet" | Bei Stutter `will-change:filter` nur während Enter | S | make-interfaces |

---

## Kalender · Heute/Agenda (calendar-today)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | Agenda-Cascade re-feuert bei jeder Tag-Navigation | app/page.tsx:680,347,378,670 | `stagger` hardcoded true, keine firstPaint-Gate (anders als Woche) → ~1 s Blur-Ramp je Arrow | firstView-Ref wie Woche; bei Nav nur Wrapper-Fade | M | Krehel·Tompkins·Kowalski |
| 🟠 med | `blur(5px)` auf Text-Zeilen vs. „auf einen Blick" | app/page.tsx:353,378 | Schedule blurrt beim First-Paint, gegen den Glance-Zweck | Blur droppen/→2px, nur opacity+y8 | S | Tompkins·Kowalski |
| 🟠 med | SplitText auf „Kalender"-Heading | page.tsx:561, stagger.tsx:65-87 | Buchstaben-Theater auf statischem Heading | SplitText raus | S | Krehel·Kowalski |
| 🟠 med | Section-Enter 700 ms, drei Staggers gestapelt | stagger.tsx:20-28 | >2× 300 ms-Ceiling; Shell+Heading+Liste gleichzeitig | Section-Enter <250 ms, y/blur runter, konsolidieren | S | Kowalski |
| 🟠 med | Blur-on-blur: Section + Agenda gleichzeitig | page.tsx:659,378 | Zwei Blur+y-Systeme auf denselben Pixeln | Ein Layer trägt Blur, anderer nur opacity | S | Krehel |
| 🟠 med | Start-Zeit doppelt/dreifach gedruckt | page.tsx:383,399-401,358 | Gutter „07:50" + Block „07:50–09:20"; Frei-Zeilen 3× | Ein Ort für Zeit: Gutter ODER Block | S | interface-craft |
| 🟠 med | Agenda zentriert, teilt keine Kante mit Header | app/page.tsx:302 | `mx-auto max-w-xl` → Liste startet bei ~x780, Titel bei ~x390 | Agenda links an px-6/8-Gutter ankern (oder Header zentrieren) | M | interface-craft |
| 🟠 med | Rot überladen — aktiver Block ≈ abgesagter | page.tsx:58-59,280,390 | „Arbeit" (rosa ev-tint) ähnelt Cancelled-Block; ring-2/30 disambiguiert kaum | Rot nur für Entfall; Now mit distinktem Non-Rot-Signal | M | interface-craft |
| 🟠 med | Dark-Mode-Blöcke verlieren Gewicht | page.tsx:51-53,387 | `bg-blue-500/20` + 3px-Bar nahe Background-Luminanz | Dark-Fill /25–/30 + Border, oder Bar auf 6px | S | interface-craft |
| 🟢 low | Agenda-Karten ohne Press-Scale | app/page.tsx:384-392 | Raw `<div onClick>`, kein active-Scale | `active:scale-[0.96]` + transform-Transition | S | Krehel·make-interfaces |
| 🟢 low | Header-Icon-Buttons 36×36 | button.tsx:18 | Prev/Next/Neuer-Termin unter 40×40 | `h-10 w-10` oder Hit-Slop | S | make-interfaces |
| 🟢 low | Tag-Nav ohne Richtungssinn | page.tsx:670-674 | Prev/Next = identischer opacity-Fade, Chevrons sind aber direktional | Direktionaler Slide ±16–24px, dir im State tracken | M | Tompkins |
| 🟢 low | Now/Next-Block ohne Motion-Priorität | page.tsx:371,389 | Hero-Block entert wie „Frei"-Filler | isNext distinkter Beat / Ring einzeichnen | M | Tompkins |
| 🟢 low | Live-Countdown im Kicker nicht tabular | app/page.tsx:288,294 | relLabel re-rendert je 60 s, schiebt Zeile (rechte Seite ist korrekt mono) | `tabular-nums`/`font-mono` ergänzen | S | make-interfaces |
| 🟢 low | „Vertretung"-Badge eigene Blur+Scale in bewegter Zeile | page.tsx:413-417 | Dritte Animations-Ebene im selben Moment | Badge mit Parent-Zeile mitlaufen lassen | S | Krehel·Kowalski |
| 🟢 low | Logo-Nudge bei jedem Tag-Arrow | page.tsx:576,620 | Hochfrequente Aktion, off-surface | Nudge entkoppeln, nur „Heute"-Flip | S | Kowalski |
| ⚪ nit | Vertretung-Badge aus scale(0.8) | page.tsx:413-417 | Unter dem 0.9-Floor → Pop-in | Start scale(0.9–0.94), Extra-Delay weg | S | Tompkins·Kowalski |
| ⚪ nit | Frei-Filler bekommt gleichen Blur+Stagger wie Events | page.tsx:353-355 | Spacer-Zeilen mit gleichem Motion-Gewicht | Frei-Slots nur opacity / kein Enter | S | Tompkins |
| ⚪ nit | Gutter-Zeit-Styling differiert Frei vs. Event | page.tsx:358 vs 383 | 11px/70 % vs. 12px/100 % → Achse uneinheitlich | Ein Gutter-Typstil; Frei-Zeile als Ganzes dimmen | S | interface-craft |
| ⚪ nit | „Heute"-Logo macht vollen 360° rotateX-Flip | app-sidebar.tsx:100, page.tsx:594 | Voller Spin liest sich gimmickig | Halbe Drehung / schnellerer Settle (Geschmack) | S | Krehel |

---

## Termin-Sheet + Eingabefelder (event-sheet)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | Edit-Modus staggert 6 vorausgefüllte Felder mit Blur (~0,6 s) | event-sheet.tsx:535-544 | Blurrt Text, den man bearbeiten will; feuert bei jedem Öffnen (Create-Flow tut's nicht) | Per-Feld-Stagger + Blur raus, ein Container-Fade ~150–200 ms | S | Krehel·Tompkins·Kowalski |
| 🟠 med | Identisches `blur(4px)` über 4 Komponenten | date-field:93, time-range:224, color-picker:61, event-sheet:538 | Blur als Haus-Default statt Signal | Blur nur auf Popover-Materialisieren; Rest opacity+y; reduced-motion gaten | S | Krehel·Kowalski |
| 🟠 med | Ganztags-Swap `mode="wait"` + Höhen-Snap | event-sheet.tsx:357-380 | ~0,4 s Dead-Beat + Layout springt (kein Height-Transition) | `mode` weglassen (Crossfade) + Height/Layout animieren | M | Krehel·Tompkins·Kowalski |
| 🟠 med | Step-0 füllt nur oberes Drittel des Full-Height-Sheets | event-sheet.tsx:441,558 | ~700px leer unter Date-Field → wirkt unfertig | Content oben ankern + Live-Preview, oder max-height | M | interface-craft |
| 🟠 med | 3-Step-Scope kaum lesbar (2 von 3 Tracks unsichtbar) | event-sheet.tsx:506,518 | `bg-muted`-Tracks + /60-Labels verschwinden | Inaktive Tracks `bg-border`/15–20 %, Labels →/80 | S | interface-craft |
| 🟠 med | Disabled „Weiter" ohne Hinweis dass Titel entsperrt | event-sheet.tsx:661,305 | Toter grauer Button, Titel ist labelloses 35 %-Placeholder-Feld | „Weiter" enabled + Inline-Validierung, oder Required-Hinweis | S | interface-craft |
| 🟠 med | Press-Scale 0.92 unter 0.95-Floor | color-picker:47, date-field:105/116/147, time-range:172 | Bricht Regel + inkonsistent mit 0.96-Standard | Auf `active:scale-[0.96]` heben | S | make-interfaces |
| 🟠 med | Mehrere Controls < 40×40 | event-sheet:483, color-picker:47, date-field:105/116/147 | Close 36 (Delete daneben 40), Swatches 32, Chevrons 32, Day-Cells 36, Stepper ~28×20 | Close→40, Hit-Slop für Swatches/Nav | M | make-interfaces |
| 🟢 low | Color-Select stapelt zwei Motions (bounce-Ring + scale(0.25)-Check) | color-picker:55,61-64 | Einzige bounce>0 im Surface + Near-zero-Pop | Ring bounce:0; Check Start scale ~0.7 | S | Krehel·Tompkins·Kowalski |
| 🟢 low | Figure-8-Handle teleportiert bei Preset-Klick | infinity-slider:152,199-209 | cx/cy ohne Transition → Snap statt Gleiten entlang Lemniskate | t entlang Pfad tweenen (animate(), ~280–360 ms) bei externem Change | M | Tompkins |
| 🟢 low | Selektions-Ring spring bounce 0.15 | color-picker:50-56 | Einzige Überschwingung; andere layoutIds bounce:0 | bounce:0 | S | Kowalski |
| 🟢 low | Create-Flow ohne Split/Stagger, nur Edit hat ihn | event-sheet:535,560 | Häufigerer Pfad wirkt flacher | Gleichen Stagger-Wrapper für Step-0-Kinder | M | make-interfaces |
| ⚪ nit | Press-Scale-Drift 0.96 vs 0.92 im selben Sheet | color-picker:47, date-field:147, time-range:172 | Gleiche Geste, verschiedenes Feedback | Ein Token (0.96) | S | Krehel |
| ⚪ nit | Header-Color-Dot retint anders als ev-tint/Ribbon | event-sheet:471-476 | Eine Farbänderung, drei Geschwindigkeiten | Retint-Timing vereinheitlichen (~0,3 s) | S | Tompkins |
| ⚪ nit | Color-Check aus scale(0.25) | color-picker:60-68 | Effektiv von Null | Start scale 0.6–0.85, Blur/opacity behalten | S | Tompkins·Kowalski |
| ⚪ nit | Header-Color-Dot zu klein (10px) | event-sheet:471 | Live-Color-Payoff verpufft neben 18px-Titel | Auf size-3/~12px | S | interface-craft |
| ⚪ nit | Dauer-Label ohne tabular-nums | time-range-field:301 | Updated live, Jitter (Rest des Surface ist tabular) | `tabular-nums` | S | make-interfaces |
| ⚪ nit | Drei Input-Gruppen, zwei Label-Konventionen | event-sheet:298,313,563 | Nur Datum gelabelt | Einheitlich: alle oder keine | S | interface-craft |
| ⚪ nit | Titel-Underline vs. boxed Pills | event-sheet:299,55 | Zwei Input-Idiome nebeneinander | Bewusst als Header absetzen oder vereinheitlichen | S | interface-craft |
| ⚪ nit | Selektiertes Segment nur via shadow (dark) | event-sheet:582 | card≈muted im Dark → kaum Abgrenzung | `ring-1 ring-border` / leicht heller | S | interface-craft |
| ⚪ nit | Time-Stepper-Radius nicht konzentrisch | time-range:171,199 | 6px statt 12−4=8px | `rounded-lg` | S | make-interfaces |

---

## Einstellungen (settings)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | SplitText buchstabiert „Einstellungen" + parent StaggerItem (Doppel-Blur) | stagger.tsx:50-63, settings:35 | Zwei Motion-Systeme auf einem Heading, jedes Load | SplitText raus, statisch / ein Section-Fade | S | Krehel·Tompkins·Kowalski |
| 🔴 high | Page-Entrance ~1,2 s, 4 identische Cards à 700 ms | stagger.tsx:16,25 | Uniform-Fade + zu lang für Repeat-Utility | Duration→0,18–0,4, Stagger→0,05–0,08, Blur→3px | S | Krehel·Kowalski |
| 🔴 high | Aktives Theme-Tile schwächer als inaktive (Light) | settings:70-85 | border-transparent + accent ~3 % Delta → aktiv = nur Bold-Text | `ring-2 ring-primary`/`bg-primary/8`; inaktive Border zurück | S | interface-craft |
| 🟠 med | Theme-Button-Hover: bg snappt (nicht in Transition-Liste) | settings:71,74 | `transition-[color,transform]`, aber `hover:bg-accent/50` springt | `background-color` in Transition, ~150 ms | S | Krehel |
| 🟠 med | Theme-Indikator-Spring unterdämpft (Overshoot) | settings:83 | stiffness 500 / damping 38 (krit. ~44,7) → Wobble auf Utility | damping→44–48 oder bounce:0 | S | Krehel·Kowalski (Tompkins: Geschmack) |
| 🟠 med | blur(6px) auf Text-Entrances verzögert First-Paint-Lesbarkeit | stagger.tsx:21,56 | Heading + Body unleserlich für mehrere 100 ms | Blur von Text-Entrances entfernen, opacity+y8 | S | Kowalski |
| 🟠 med | Slider-Satin/Handle-Elevation verschwindet in Dark | infinity-slider:196,200 | Hardcoded schwarze Drop-Shadows unsichtbar auf dunklem Card | Shadows themen (Token/color-mix, Light-Glow im Dark) | M | interface-craft·make-interfaces |
| 🟢 low | Kein Exit-Motion (harter Cut bei Navigate-Away) | settings:24-114 | Reicher Enter, null Exit → Asymmetrie | Kurzer Exit via AnimatePresence, oder Enter leichter | M | Krehel |
| 🟢 low | InfinitySlider-Jewel teleportiert bei externem Change | infinity-slider:95-97,200-209 | Snap zerstört das räumliche Shade-Modell | t entlang Pfad tweenen wenn nicht-Drag | M | Tompkins |
| 🟢 low | Handle ohne Grab/Press-State; Keyboard-Steps sub-pixel | infinity-slider:200,166-173 | Greifen = Hovern; Arrow = TAU/320 (unsichtbar) | Grabbing-State; Step ~4–6 (Shift größer) | M | Krehel·Tompkins |
| 🟢 low | Keyboard-Slider ohne Focus-State | infinity-slider:156-177 | tabIndex/role=slider, aber kein Focus-Ring | `focused` state OR mit `hot`; focus-visible-Ring | S | Tompkins |
| 🟢 low | Slider exponiert sinnlose SR-Werte | infinity-slider:161-164 | aria-valuenow = roher Sample-Index 0–320 | `aria-valuetext` mit menschlicher Shade-Beschreibung | S | interface-craft |
| 🟢 low | Back-Link < 40px Hit-Area | settings:27-33 | ~20px hoch, einziger Weg zurück | `-mx-2 px-2 py-2` / Pseudo-Element | S | make-interfaces |
| 🟢 low | Slider animiert non-composited (r/stroke/fill) | infinity-slider:200,208 | Paint-Properties repainten je Frame | Grow via transform:scale auf `<g>` | M | make-interfaces |
| 🟢 low | Profil-Card wirkt interaktiv, ist statisch | settings:41-55 | Gleiche Shell wie aktionierbare Cards, keine Aktion | Edit-Affordanz / „bald"-Badge / leichter read-only Block | S | interface-craft |
| ⚪ nit | Slider-Fill eased (160 ms) statt Drag direkt zu folgen | infinity-slider:208 | Farbe lagged hinter Pointer beim Drag | `transition:none` während draggingRef | S | Kowalski |
| ⚪ nit | „BALD"-Badge im Abmelden-Button 9px | settings:109 | Unter Lesbarkeit, inkonsistent mit Sidebar-Badge | `text-[10px]/[11px]` | S | interface-craft |
| ⚪ nit | Page-Titel unterskaliert (text-xl) | settings:34 | Timid in großem leeren Frame | `text-2xl` oder Spalte vertikal zentrieren | S | interface-craft |
| ⚪ nit | Cards: rounded-xl mit p-5 nicht ganz konzentrisch | settings:42,60,71,97 | Outer 12px wirkt tight gegen 20px-Padding | `rounded-2xl` auf Cards | S | make-interfaces |
| ⚪ nit | Card-Tiefe nur Border + unsichtbarer shadow-sm (Dark) | settings:42,60,97 | Flacher, outlined im Dark | Layered transparent box-shadow, Border auf Hairline | S | make-interfaces |

---

## Sidebar · App-Shell · Logo · Theme (sidebar-layout)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | Logo-Nudge an höchstfrequente Aktion gebunden | app-sidebar:106-120, page:576,608,620 | rotateX-Tilt bei jedem Prev/Next/Woche, peripher in Gegenecke | Listener/nudge entfernen; nur „Heute"-Flip + direkter Logo-Klick | S | Krehel·Tompkins·Kowalski |
| 🔴 high | 700 ms Blur+Slide-Entrance auf Nav-Chrome bei jedem Mount | app-sidebar:135-137 | Stabilstes Element „materialisiert" sichtbar; >2× Ceiling | Static rendern oder <200 ms opacity-only, kein x/Blur | S | Krehel·Kowalski |
| 🟠 med | Reduced-Motion-Gate unvollständig | motion-provider:8 | Blur+Opacity laufen weiter (nur x suppressed); Kommentar überstaatet Coverage | `useReducedMotion()` → finaler Zustand; Kommentar fixen | M | Krehel·Kowalski |
| 🟠 med | Collapse animiert `width` (Layout-Property) | app-sidebar:140-143 | Main-Grid reflowt je Frame 280 ms (Inner ist klug fixiert) | transform/clip auf Fixed-Track statt width (falls Jank) | M | Tompkins·Kowalski |
| 🟠 med | „MODULE"-Eyebrow nicht mit Nav-Labels aligned | app-sidebar:207 | 32px Stair-Step (Eyebrow bei ~16px, Labels bei ~48px) | Eyebrow auf Label-Spalte einrücken (`pl-12`) | S | interface-craft |
| 🟠 med | Aktives Modul zu schwach (Light) | app-sidebar:230 | `bg-accent`+`font-medium` kaum über Hover | Left-Accent-Bar (2px bg-primary) / stärkerer Fill | S | interface-craft |
| 🟠 med | Header-Chrome-Buttons 36×36 | app-sidebar:164,179,197 | Logo/Collapse/Expand unter 40×40 | `size-10` oder `after:`-Pseudo-Element | S | make-interfaces |
| 🟢 low | Resize-Drag setState je pointermove | app-sidebar:78,131-143 | Voll-Komponenten-Re-Render je Frame | Width direkt auf Element, State erst auf pointerup | S | Tompkins·Kowalski |
| 🟢 low | Logo-Flip/Nudge als Keyframe-Arrays (nicht interruptierbar) + voller 360° | app-sidebar:101 | Rapid-Klicks queuen/restarten | Single-value spring/transition, kleinerer Settle | S | Kowalski |
| 🟢 low | Sidebar-Blur escaped Reduced-Motion-Gate | app-sidebar:135-137 | filter läuft für RM-User weiter | `useReducedMotion()` → Filter droppen | S | Krehel |
| 🟢 low | Profil-Trigger ohne Press-Scale | app-sidebar:253 | Alle anderen Buttons haben `active:scale-[0.96]` | `active:scale-[0.96]` ergänzen | S | make-interfaces |
| 🟢 low | Sidebar entert als ein Block statt Split/Stagger | app-sidebar:131-137 | stagger.tsx existiert; Logo/Nav/Footer könnten chunken | Children staggern ~80–100 ms (falls Entrance bleibt) | M | make-interfaces |
| 🟢 low | Aktiv-Indikator statisch (magic-motion-Chance) | app-sidebar:225-233 | Hard-Cut bei künftiger Multi-Route-Navigation | Shared `layoutId`-Pill sobald Module live | M | Tompkins |
| 🟢 low | 3 von 4 Modulen disabled — Rail wirkt inert | app-sidebar:31-36,234-243 | 75 % grau, kein Fokus auf live Kalender | Roadmap-Gewicht weiter senken / Sub-Heading | M | interface-craft |
| 🟢 low | Collapse-Eyebrow hinterlässt Phantom-Gap | app-sidebar:207 | Nur opacity-0, bleibt im Layout | Height/Margin auf 0 bei collapsed | S | interface-craft |
| 🟢 low | Collapse/Expand verschiedene Radien (md/lg) | app-sidebar:179,197 | Gleicher Control, Radius springt im Crossfade | Ein Radius (`rounded-lg`) für beide States | S | interface-craft·make-interfaces |
| ⚪ nit | Mixed Easing/Duration im Collapse (280 vs 200 ms) | app-sidebar:142,128,153,179 | Width und Label-Fade auf verschiedenen Kurven | Crossfades auf `--ease-atlas` + 200–240 ms | S | Krehel |
| ⚪ nit | Label-Fade (200) endet vor Width-Clip (280) | app-sidebar:128,142,153 | ~80 ms leere Rail-Naht | Label-Opacity-Duration auf 280 ms matchen | S | Tompkins |
| ⚪ nit | Rechte-Kanten-Gutter inkonsistent (mr-2 vs mr-3) | app-sidebar:219,265 | Badges vs. Footer-Chevron stoppen verschieden | Ein Trailing-Gutter (`mr-3`) | S | interface-craft |
| ⚪ nit | Logo-Block schwerstes Element (Light) | app-sidebar:164 | near-black zieht Auge mehr als aktives Modul | Optional: getöntes Container im Light | S | interface-craft |
| ⚪ nit | Atlas-Mark geometrisch statt optisch zentriert | atlas-logo:14-16 | Asymm. Pfeil, größerer Bottom-Gap | viewBox balancieren / Sub-Pixel-Translate | S | make-interfaces |
| ⚪ nit | Entrance-Blur über Full-Height-Sidebar ohne will-change | app-sidebar:135-138 | Teurer Composite, mögliches First-Frame-Stutter | `will-change:filter` nur während Enter (falls Stutter) | S | make-interfaces |

---

## UI-Primitives · Button · Dropdown (ui-primitives)

| Sev | Befund | Datei | Problem | Fix | Eff | Pass |
|---|---|---|---|---|---|---|
| 🔴 high | Scale-on-Press wird NIE animiert | button.tsx:6 | v4 emittiert für `scale-[0.96]` standalone `scale`, nicht in Transition-Liste → snappt app-weit | `scale` in Liste / `transition-transform` | S | make-interfaces (kompiliert verifiziert) |
| 🔴 high | Button ignoriert `--ease-atlas`, fährt verworfene Material-Kurve | button.tsx:6, dropdown:38 | Höchstfrequentes Element auf (0.4,0,0.2,1) das globals.css explizit ablöst | `ease-[var(--ease-atlas)]` + duration in cva-Base; DropdownItem ebenso | S | Krehel·Tompkins·Kowalski |
| 🔴 high | Alle Button-Größen < 40×40 | button.tsx:16-18 | default h-9 (36), icon 36×36, sm 32 | icon/default→`h-10`, oder Pseudo-Element-Hit-Slop | M | make-interfaces·interface-craft |
| 🟠 med | Fokusring ohne Offset + neutrales Grau | button.tsx:6, globals.css:28 | 2px mid-gray flush an Edge; verschwimmt mit outline-Border | `ring-offset-2 ring-offset-background` + dunkleres/branded Ring | S | Krehel·Tompkins·Kowalski·interface-craft |
| 🟠 med | Dropdown Enter/Exit spiegelsymmetrisch + Keyframe (nicht interruptierbar) | dropdown-menu:21 | Exit so prominent wie Enter; Re-Toggle replayt Keyframe | Exit billiger: zoom-out droppen, `duration-100` | S | Tompkins (Krehel: nit) |
| 🟠 med | Icon/sm unter komfortablem Target (36/32) | button.tsx:18 | Nav-Chevrons ~36px, Glyph nur 16px | `h-10 w-10` oder 44px Hit-Slop | S | Tompkins |
| 🟠 med | Keine size:lg — 40px-Höhe 5× per className gepatcht | event-sheet:640,648,652,661,666 | h-10-Override dupliziert statt Token | `size:lg (h-10 px-5)` zu buttonVariants | S | interface-craft |
| 🟠 med | Keine destructive-Variante — per Call-Site handgerollt | event-sheet:621,632 | Inline-Klassen + roher `<button>` mit kopiertem Press | `variant:destructive`/`destructive-outline` | M | interface-craft |
| 🟢 low | Press-Scale + Color teilen 150 ms symmetrisch | button.tsx:6 | Press liest sich weich statt snappy | transform auf ~100 ms ease-out trennen | S | Krehel·Kowalski |
| 🟢 low | Dropdown-Items cursor-pointer (gegen native Konvention) | dropdown-menu:38 | Hand-Cursor liest „Link" statt Menü-Wahl | `cursor-default` | S | interface-craft |
| 🟢 low | Menu-Item-Icons bleiben muted bei Focus | dropdown-menu:38 | Label flippt zu accent-foreground, Icon nicht | `focus:[&_svg]:text-accent-foreground`, hartes svg-color scopen | S | interface-craft |
| 🟢 low | Dropdown-Items ~36px Rows + kein Press | dropdown-menu:38 | Unter 40px, nur transition-colors | `py-2.5`; optional `active:scale-[0.98]` | S | make-interfaces |
| ⚪ nit | disabled:opacity-50 außerhalb Transition (snappt) | button.tsx:6 | „Weiter" enabled/disabled springt | `opacity` in Transition-Liste | S | Krehel |
| ⚪ nit | Dropdown: zoom+slide+fade = redundanter Spatial-Cue | dropdown-menu:21 | Origin-aware zoom kommuniziert schon, +2px slide redundant | `slide-in-from-*` droppen | S | Kowalski |
| ⚪ nit | Press-Scale ohne `static`-Escape-Hatch | button.tsx:6 | Kein Per-Instance-Opt-out (dichte Toolbars) | Optionale `static`-Boolean-Prop | S | make-interfaces·Tompkins |
| ⚪ nit | sm mischt arbiträres text-[13px] in die Skala | button.tsx:17 | Magic-Number neben text-sm | `text-xs` / `--text-xs`-Token | S | interface-craft |

---

## Quick wins — S-Aufwand, hohe Wirkung (Fix-Phase-Checkliste)

**Motion / Performance**
- [ ] SplitText auf „Kalender" + „Einstellungen" entfernen, Heading statisch/einfacher Fade *(3 Surfaces)*
- [ ] Stagger der Event-Blöcke (Woche **und** Heute) hinter firstPaint-Ref gaten; bei Navigation nur Wrapper-Crossfade
- [ ] First-Paint-Base-Delay 0,5→~0,12; StaggerItem-Duration 0,7→~0,4; Per-Block-Stagger deckeln
- [ ] Blur von Grid-/Agenda-/Edit-Feld-Entrances droppen (nur opacity+y); Blur auf 1–2 Materialisier-Momente reservieren
- [ ] Logo-Nudge von Prev/Next/Woche/Tag-Navigation entkoppeln — nur „Heute"-Flip
- [ ] Edit-Sheet: Per-Feld-Stagger+Blur → ein Container-Fade
- [ ] `useReducedMotion()` lesen → Blur/Opacity-Entrances bei RM auf finalen Zustand (Sidebar, Stagger, SplitText, Sheet); irreführenden Kommentar fixen
- [ ] Now-Dot / Vertretung-Badge / Color-Check von scale(0/0.25/0.8) auf ≥0.6–0.9

**Button / Primitive (app-weit)**
- [ ] `scale` in Button-Transition-Liste aufnehmen (Press-Scale animiert dann tatsächlich)
- [ ] `ease-[var(--ease-atlas)]` + explizite duration in Button-cva-Base und DropdownItem
- [ ] `focus-visible:ring-offset-2 ring-offset-background` + kontrastreicheres/branded Ring-Token
- [ ] Icon/default-Button auf `h-10` (40×40)
- [ ] `size:lg (h-10 px-5)` Token statt 5× h-10-Override im Sheet
- [ ] `opacity` in Button-Transition (disabled-Fade)
- [ ] Dropdown-Exit verbilligen (zoom-out raus / `duration-100`); `cursor-default`

**Press-Scale-Konsistenz**
- [ ] color-picker/date-field/time-range von 0.92 → 0.96
- [ ] `active:scale-[0.96]` + transform-Transition auf Event-Blöcke, Agenda-Karten, All-Day-Buttons, Profil-Trigger
- [ ] `transition-shadow` auf Woche-Blöcken (matcht Today-View)

**Visuelles Gewicht / Farbe**
- [ ] Aktives Theme-Tile + aktives Modul in Light dominant machen (`ring-2 ring-primary`/Accent-Bar), inaktive zurücknehmen
- [ ] Custom-getönte Blöcke Light-Mix auf ~16–18 %; Dark-Event-Fill /25–/30
- [ ] Entfall-Strike auf ~2px / red /60–70
- [ ] Rot konsolidieren: nur Now-Indikator behält Rot, Entfall neutral-entsättigt

**Typografie / Layout**
- [ ] `tabular-nums` auf Kicker-relLabel und Dauer-Label
- [ ] „MODULE"-Eyebrow auf Label-Spalte einrücken; Collapse/Expand auf einen Radius
- [ ] Settings-Section-Blur von Text-Entrances entfernen; Theme-Hover-`background-color` in Transition; Theme-Indikator-Spring damping→44–48