# Atlas — Design & Motion Gesamt-Audit

4 Linsen × 9 parallele Agents (design-motion-principles · interface-craft Critique · emil-design-eng · framer-motion-Deepdive · Token/CSS). ~115 Rohbefunde → 68 dedupliziert. `⊕N` = von N Agents unabhängig bestätigt.

**Positiv (alle Motion-Agents):** reduced-motion-Grundgerüst (MotionConfig + CSS-media-query + per-Komponente `useReducedMotion`) ist vorbildlich. Logo-Spin & Checkbox-Burst sind frequenz-bewusste Delights.

---

## P0 — BUGS (Korrektheit · A11y · Dark-Mode · Layout-Perf)

1. **⊕3 Klickbare Event-/Todo-divs ohne Tastatur-/Fokus-Zugang** — `app/page.tsx:575,1319`, `calendar-todos.tsx:25`. Termin-Karten + Todo-Zeilen sind `div onClick` ohne role/tabIndex/focus-visible (Ganztags ist `button` → inkonsistent). → als `button` rendern + `focus-visible:ring-2`. **M**
2. **⊕2 Toggle-Rows (Ganztags/Deadline/Farbe) nicht keyboard-erreichbar** — `event-sheet:347`, `todo-sheet:322/407`. `div onClick`; nur innerer Switch erreichbar, doppeltes onClick via `stopPropagation` (double-fire-fragil). → outer `<label>`/`button` als Single-Owner, Switch `pointer-events-none tabIndex=-1`. **S**
3. **Titel-Pflichtfeld ohne a11y-Label** — `event-sheet:300`, `todo-sheet:274`. Nur Placeholder, kein label/aria-label am wichtigsten Feld. → `aria-label` + `aria-required`. **S**
4. **`Label` ist `<span>` statt `<label htmlFor>`** — `event-sheet:57`, `todo-sheet:40`. Klick fokussiert Feld nicht, keine SR-Assoziation. → echtes `<label htmlFor>` + id. **M**
5. **DateField-Trigger `outline-none` ohne focus-visible-Ersatz** — `date-field:81`. Tastatur-Fokus komplett unsichtbar. → `focus-visible:ring-2`. **S**
6. **⊕2 Retry-Fehler-Toasts auto-dismissen nach ~4s** — `toaster:11-21`, `lib/persist:21/42`. Actionable „Erneut versuchen" verschwindet bevor Klick möglich. → `duration: Infinity` für Toasts mit Action. **S**
7. **⊕2 Now-Linie animiert `top` (Layout-Property) 700ms** — `page:1356-1359`. Reflow pro Minuten-Tick statt GPU. → `transform: translateY()` + `transition-transform`. **S/M**
8. **InfinitySlider-Farbe läuft 160ms hinterher beim Ziehen** — `infinity-slider:196,208`. CSS-transition restartet jeden Frame → gummiges Direct-Manipulation-Gefühl. → während `dragging` transition 0. **S**
9. **⊕2 Exits laufen mit Enter-Easing (ease-out statt ease-in)** — `event-sheet:441`, `todo-sheet:236`. `--ease-atlas` ist ease-out, auch für Sheet-Exits → „klebriges" Schließen (`todos/page` macht's bereits richtig). → separater `EXIT_EASE [0.4,0,1,1]`. **S**
10. **Today-Spalte im Wochen-Raster faktisch unsichtbar** — `page:1239`. `bg-primary/[0.035]`; Wochenend-Tönung ist *stärker* als Heute. → vertikale Akzentlinie / `bg-primary/[0.06]` + Spaltenkopf-Unterstrich. **S**
11. **InfinitySlider-Thumb `fill/stroke="#fff"` bricht Dark-Mode** — `infinity-slider:200,206`. → `var(--background)`. **S**
12. **Autoplan-Overlay `bg-black/40` vs Sheets `bg-foreground/20`** — `autoplan:58`. In Dark divergierende Backdrops. → `bg-foreground/20` angleichen. **S**
13. **Sheet-Shadow `rgba(0,0,0,0.25)` ohne Dark-Anpassung** — `event-sheet:443`, `todo-sheet:238`. Sheet-Kante verschwindet in Dark. → `--sheet-shadow` token mit `.dark`-override. **S**
14. **DateField-Popover im scrollenden Sheet-Body abgeschnitten** — `todo-sheet:265`, `date-field:97`. `overflow-y-auto` clippt das absolute Popover. → Portal/Floating-UI. **M**
15. **Sidebar-Entrance nicht reduced-motion-gegated** — `app-sidebar:125-131`. MotionConfig kappt nur transform; `opacity/blur` laufen weiter. → `useReducedMotion` + `initial={reduce?false:…}`. **S**
16. **⊕2 Blur-Enter ignoriert prefers-reduced-motion** — `event-sheet:540`, `todo-sheet:269/286`, `color-picker:61`. Gleiche Lücke wie #15. → `useReducedMotion`-Gate. **S**

---

## P1 — MOTION-SLOP (AI-Slop-Bewegung entfernen)

17. **⊕3 Sidebar 700ms Blur-Slide-Auftritt bei jedem Reload** — `app-sidebar:129-131`. Dauer-Chrome inszeniert Auftritt; 700ms + `blur(6px)` auf großer Fläche. → opacity-only ≤300ms, Blur weg, x −16. **S**
18. **⊕4 Blur-Everywhere als Enter-Treatment (7+ Stellen)** — `page:516/534/551/569/601`, `stagger:23/60`, `event-sheet:540`, `todo-sheet`, `date-field:93`, `time-range:224`. Blur auf Text kostet First-Paint-Lesbarkeit + GPU; Kalender-Blöcke haben Blur bereits aus diesem Grund entfernt — Rest folgt nicht. → Blur an Listen/Feldern streichen, nur `opacity+y`. **S**
19. **Per-Buchstabe SplitText-Blur auf statischen Headings** — `stagger:59-93` (page:1010 „Kalender"), `todos/page:218`, `settings:114`. Signatur-AI-Slop auf täglich gelesener Navigation. → SplitText raus, statisch. **S**
20. **Agenda-Liste Blur-Stagger Delays bis 0.8s** — `page:510-571`. Untere Items ~1,2s nach Mount; Kern-Liste bremst. → step 0.03, cap 0.2, `0.18-0.22s`. **S**
21. **⊕2 Listen-Stagger zu langsam + feuert bei jedem Tageswechsel neu** — `todos/page:404,428-431`. `key=date`-Remount spielt vollen ~1s-Stagger pro Pfeilklick. → step 25-35ms, cap 0.2-0.3, nur firstMount. **M**
22. **⊕2 Kalender-Blöcke re-staggern bei jeder Wochen-Navigation** — `page:1126,1330-1336`. Keyed Remount → Stagger bei jedem Klick. → `initial` via `firstPaint`-Flag gaten. **S**
23. **Progress-Bar animiert `width` statt `scaleX`** — `todos/page:501`. Reflow pro Frame. → `scaleX` + `origin-left`. **S**
24. **Section-Stagger 400ms+Blur bei jedem Load** — `stagger:22-30`. → 0.22s, Blur weg, y6. **S**
25. **⊕2 `active:scale` ohne `transform` in transition-property** — `todo-sheet:385`, `page:111`. `transition-colors` + `active:scale` → Press snappt. → `transition-[…,transform]`. **S**

---

## P2 — POLISH (Emil — die unsichtbaren Details)

26. **⊕2 Kein globales `:focus-visible`, `--ring` ungenutzt** — `globals.css` (fehlt). Nav-Links, Toggle-Buttons, Logo, WeekTodoChip ohne Fokusring. → `*:focus-visible{outline:2px solid var(--ring);offset:2px}`. **S**
27. **Fokusringe fehlen flächig** — WeekTodoChip `page:111`, Recurrence-Presets `todo-sheet:353/379`, Day-Grid + „Heute" `date-field:146/165`, Autoplan-Close `autoplan:84`, InfinitySlider `infinity-slider:156`. → `focus-visible:ring-2` je Control. **S**
28. **`button.tsx` ohne `cursor-pointer`** — `ui/button:10`. Alle `<Button>` zeigen Default-Cursor. → `cursor-pointer` in cva-base. **S**
29. **⊕2 Sidebar/Buttons `active:scale-0.96` snappt (nur transition-colors)** — `app-sidebar:158/172/191`. → `transition-[scale] duration-150`. **S**
30. **All-day Event-Buttons ohne active/press** — `page:488-499,1190-1194`. → `active:scale-0.97 transition-[box-shadow,scale]`. **S**
31. **⊕2 Hover nicht via `(hover:hover)` guarded → sticky auf Touch** — `page:111/1191`, `app-sidebar:224`, `color-picker:47`. → `@media (hover:hover)`-Wrapper. **M**
32. **Zeit-Werte nicht `tabular-nums`** — `page:459` (Kicker) u.a. Header-Breite springt. → `font-mono tabular-nums`. **S**
33. **⊕3 Segmented-/kind-Pill-bounce inkonsistent** — `event-sheet:589` (0) vs `todo-sheet:309` / `color-picker:55` (0.15). → ein Pill-Spring-Token, `bounce:0 0.3s`. **S**
34. **Checkbox überschwingt mehrfach auf Kern-Aktion** — `todo-checkbox:90-95,105-106` (bounce 0.5/0.45). → bounce 0.15-0.2 / ease-out 180ms. **S**
35. **Radiate-Burst-Ring ~Konfetti auf Routine-Abhaken** — `todo-checkbox:70-83`. → streichen / nur „alles erledigt"-Moment. **S**
36. **⊕3 Accepted-Autoplan-Row snappt ohne Transition** — `autoplan:109-134`. → `transition-opacity 150-200` + Button↔Status-Crossfade. **S**
37. **Animation aus `scale(0)`/`scale(0.4)`** — `page:1369` (now-dot), `calendar-todos:123`. → ab 0.6-0.85 starten. **S**
38. **WeekTodoChip 1.9× Scale-Burst auf 6px-Punkt** — `page:117-124`. → `[1,1.4,1] 0.3s`. **S**
39. **Vertretung-Badge doppel-animiert in animierter Zeile** — `page:600-607`. → eigene Badge-Anim streichen. **S**
40. **Placeholder zu blass (`/35`,`/45`) unter WCAG** — `event-sheet:305/55`. → opacity `/55-60`. **S**
41. **Error-`<p>` ohne `aria-live`/`role=alert`** — `event-sheet:618`, `todo-sheet:454`. SR bekommt Validierungsfehler nicht. → `aria-live="polite"`. **S**
42. **Settings-Theme-Tile: `bg-color` nicht in transition** — `settings:157`. Hover snappt. → `transition-[color,background-color,transform]`. **S**
43. **Sheet-Slide nutzt FM `x`-shorthand (nicht GPU)** — `event-sheet:439`, `todo-sheet:235`. → `transform:translateX()`. **S**
44. **Input-Focus-Transitions ohne duration/ease (nicht Atlas-Kurve)** — `event-sheet:55`, `date-field:82`, `time-range:192`. → `duration-150 ease-[var(--ease-atlas)]`. **S**
45. **AgendaTodoRow `div` ohne `cursor-pointer`, Titel klickt nicht** — `calendar-todos:25`. → `cursor-pointer` + onClick-Proxy auf Toggle. **S**
46. **Autofocus 240ms Magic-Timer entkoppelt von Motion-State** — `event-sheet:196`, `todo-sheet:133`. Bei reduced-motion trotzdem 240ms Delay. → `onAnimationComplete` + reduced sofort. **S**
47. **350ms blockierender „Beat" verzögert Reflow beim Abhaken** — `todos/page:149-171`. → 150-200ms. **S**
48. **Press-Affordance Todo-Zeile unsichtbar (`active:scale-0.995`)** — `todos/page:378`. → 0.98 / bg-tint. **S**
49. **Color-Selection-Ring bounct + zu lang** — `color-picker:55` (0.4 bounce0.15). → bounce0 0.25-0.3. **S**
50. **Switch-Fokusring-Offset falscher BG** — `event-sheet:71`, `todo-sheet:323` (`offset-card` auf `bg-background` row). → `ring-offset-background`. **S**
51. **Collapsed Dropdown ohne origin-scale (nur shadcn-Default)** — `app-sidebar:277-281`. → `transform-origin` an Trigger + scale 0.96→1. **S**
52. **`height:auto` Expand/Collapse animiert Layout** — `todo-sheet:336/369/422`, `todos/page:564`. → `grid-rows 0fr→1fr` / gemessene Höhe. **M**
53. **`overflow-visible` beim Collapse spillt Content** — `todo-sheet:340`. → `overflow-hidden` während Anim, danach visible. **M**
54. **Event-Block-Border quasi unsichtbar auf farbigem BG (Dark)** — `page:136-139` + `globals.css:125-133`. → `inset 0 0 0 1px rgba(255,255,255,0.08)` dark. **S**
55. **SWATCH_SHADOW `rgba(0,0,0,0.1)` unsichtbar Dark** — `color-picker:11`. → 0.22 + dark-override. **S**
56. **`border-black/10` in Settings-Theme-Preview unsichtbar Dark** — `settings:172`. → `border-border/30`. **S**
57. **`motion.div layout` um Ganztags-Toggle = großer FLIP** — `event-sheet:345`. → explizite `layout`-transition 0.25. **M**
58. **`border-l-[6px]` vs `border`-utility ordering-fragil** — `page:488`. → `event-pill` CSS-Klasse. **M**

---

## P3 — OPPORTUNITIES (UX-Aufwertung)

59. **Kein primärer CTA — 6 identische Outline-Buttons im Kopf** — `page:1020-1089`. „Neuer Termin" = gefüllter Primary mit Label. **S**
60. **⊕2 Lade→Content snappt; nackter „Lade…"-Text** — `page:1132-1139`. → Skeleton-Raster in gleiche Geometrie / `AnimatePresence` crossfade. **M**
61. **⊕2 Erledigte Todos belohnen nicht (bleiben an Ort, kein Exit)** — `page:25-40,547-559`, `calendar-todos:27-29`. → `AnimatePresence`+`layout`/Reorder, Liste schrumpft sichtbar. **M**
62. **Speichern-Buttons ohne busy-Lade-Feedback** — `event-sheet:647`, `todo-sheet:481`. → `Loader2`-Spinner + „Speichert…". **S**
63. **Autoplan-Vorschlag nach Annehmen nicht zurücknehmbar** — `autoplan:126`. Bricht Optimistic-Retry-Muster. → Undo/X + Sonner-Rückgängig. **M**
64. **Kein Feedback beim Routenwechsel über Nav-Links** — `app-sidebar:219-227`. → `useLinkStatus`/pending optimistisch aktiv. **M**
65. **Nicht-lineare Zeitachse macht Dauer-über-Höhe unlesbar** — `page:954,1244`. → gestauchte Leer-Segmente als Bruch markieren (zickzack/gepunktet). **M**
66. **View-Wechsel Woche↔Heute ohne Exit (bewusst wg Minuten-Tick)** — `page:1120-1131`. → Now-State aus keyed Subtree heben + `AnimatePresence`. **M**
67. **Sidebar-Collapse animiert `width` → Reflow der Seite** — `app-sidebar:134-137`. → `transform:translateX` + Content-Padding / ~200ms. **L**

---

## P4 — SYSTEMISCH (Fundament: tokenisieren & deduplizieren)

68. **`EASE`/`BURST_EASE` 7-fach copy-pasted; Enter-Dauern inkonsistent (0.28/0.3/0.32/0.4/0.42)** — überall. → **`lib/motion.ts`** mit `EASE, EXIT_EASE, BURST_EASE, DUR={fast,base,slow}` als Single Source.
- **Typo-Skala komplett arbiträr** (14 ad-hoc `text-[Npx]`, inkl. `12.5px`; 11px ×23, 13px ×19) — app-weit. → benannte `@theme`-Skala. **L**
- **Quellenfarben hardcoded** (blue/amber/emerald-500) umgehen das streng-monochrome Token-System — `page:135-139`. → `--color-ev-school/-routine/-manual`. **M**
- **Amber 4-fach überladen** (Routine/Vertretung/Wochenziel/überfällig) — Farbcodierung wertlos. → eine Bedeutung + `--success`/`--warning`-Tokens. **M**
- **`--success`/`--warning` fehlen** (Settings nutzt raw emerald/amber) — `settings:215-216`. **M**
- **`ACTIVE_RING` hardcoded oklch in JS** — `todos/page:38`. → `--color-active-ring`. **S**
- **„Jetzt"/„noch X min" raw `text-red-500`** untokenisiert — `page:440-474`. → `--live`/`--urgent`. **S**
- **Radius-Skala existiert, ungenutzt** (`rounded-xl` vs `2xl` vs md/lg/full gemischt) — `globals.css:84-87`. → ein Token-Radius je Ebene. **S**
- **z-index Magic-Numbers**, Sheet+Popover beide `z-50` (Kollisionsrisiko) — diverse. → benannte Z-Konstanten, Popover > Sheet. **M**
- **Dupliziertes UI**: Switch/Label/inputCls, DayToggle, SegmentedControl, SheetHeader, Backdrop, Avatar-Initialen („TZ" 3×) — `event-sheet`/`todo-sheet`/`autoplan`. → gemeinsame `components/sheet-fields.tsx` + Backdrop-Konstante. **M**
- **„Bald"-Badges fluten Shell** (5 Coming-Soon-Marker) — `app-sidebar:213/300`, `settings:135/250`. → dezenter, doppelte Abmelden-Stubs reduzieren. **S**
