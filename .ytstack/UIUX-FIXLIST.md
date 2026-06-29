# UI/UX Fix-Katalog Atlas — jeder Befund einzeln

Alle 168 Rohbefunde, durchnummeriert. **Macht** = was der Fix ändert · **Warum gut** = der Nutzen/das Problem das verschwindet. Mehrfachnennungen verschiedener Lenses = Konsens (höhere Konfidenz). Wähle per ID-Nummer.


## Kalender · Wochenansicht (calendar-week)  ·  30 Befunde  (7h/13m/8l/2n)

### 1. 🔴 [high] SplitText letter-by-letter reveal on the fixed "Kalender" heading announces itself every visit
`components/stagger.tsx:65-87 (used at app/page.tsx:561)`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Drop SplitText here. The heading already arrives via its parent StaggerItem fade — that single section-level fade is the production-appropriate treatment. If any motion is wanted, a plain opacity+small-y on the whole word (no per-char split, no blur) is enough. Reserve SplitText for a true one-off moment (onboarding splash), not a recurring nav heading.
- **Warum gut:** The static section title "Kalender" is split into per-letter motion.spans that cascade in with filter: blur(6px), y:14, staggerChildren 0.045, delayChildren 0.12, duration 0.55 each. This is a persistent app-section header that is identical on every single load — not a hero/marketing headline. Per the anti-checklist (motion-on-mount-for-static-content) and Jakub's own test ("if users comment 'nice animation!' every time, it's too prominent"), letter-by-letter blur is the textbook 'look at my animation' move and gets tiresome by the 10th visit of a daily-use tool.

### 2. 🔴 [high] blur(5px) on every event block entrance — blur-everywhere slop on the primary content
`app/page.tsx:829-835`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Make blur the exception, not the rule. Drop filter:blur from the grid event blocks and keep just opacity + small y (6px) for the entrance — the cascade still reads. Reserve blur for one deliberate materialize moment (e.g. the event sheet), per Jakub's 'blur as a signal' (selective, not uniform).
- **Warum gut:** Every event block animates initial={{ opacity:0, y:6, filter: 'blur(5px)' }} → blur(0). With ~16 blocks visible in the week grid, plus blur(6px) on the Stagger sections (stagger.tsx:21), blur(6px) on SplitText chars, and blur(6px) on the sidebar (app-sidebar.tsx:135), blur is applied to essentially every entering element in the view. The anti-checklist flags blur-everywhere when ≥3 distinct components share the same blur enter — here it is the default for the whole surface. Worse, the blocks are dense text-bearing tiles (subject + room), so blur-on-mount briefly impairs first-paint readability of the exact content the user opened the app to read, and 16 simultaneous filter animations are GPU-costly on low-end devices.

### 3. 🔴 [high] Every week-change re-staggers all ~30 event blocks with blur — the delight curdles into a wait
`app/page.tsx:817-835 (initial/animate/transition) + key on app/page.tsx:670,689`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** My own golden rule is 'the best animation goes unnoticed' and 'doesn't fatigue on repeated interactions.' Reserve the blur-stagger cascade for the genuine first paint only (you already track firstPaint.current — extend that to gate the per-item entrance entirely, not just the base delay). On subsequent week changes, let the keyed wrapper's 0.18s opacity crossfade carry it and have blocks appear instantly. Keep the playful cascade as the rare 'welcome' moment it deserves to be.
- **Warum gut:** Each event block has initial={{opacity:0, y:6, filter:'blur(5px)'}} with a per-item delay Math.min(di*0.05 + i*0.025, 0.55) and duration 0.4. The inner wrapper key={data.start} remounts on every week navigation, so all blocks re-fire their blur entrance each time the user clicks the chevrons. The code comment claims 'Bei Wochenwechsel/Mode-Switch sofort' but the staggered delay still applies, so up to 0.55s+0.4s of cascade plays on every flip. A student paging through weeks triggers this dozens of times per session.

### 4. 🔴 [high] The 'Kalender' heading is blurred twice on every mount — SplitText letters AND the parent section both blur in
`components/stagger.tsx:65-87 (SplitText) + app/page.tsx:561, layered over StaggerItem item variant components/stagger.tsx:20-28`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: storyboard
- **Macht:** Pick one owner for the heading's motion. The letter-split is the more distinctive Jhey idea — keep it, but then let the parent StaggerItem carry the heading without its own blur/translate (or render the H1 outside the blurred section wrapper). One crisp letter-reveal reads as craft; two stacked blurs on the same word read as the text struggling to resolve.
- **Warum gut:** The <h1> contains <SplitText text='Kalender'/> which splits into letters, each animating opacity+y:14+blur(6px) over 0.55s staggered at 0.045s. That same H1 lives inside a StaggerItem whose item variant ALSO animates opacity+y:18+blur(6px) over 0.7s. So the heading text gets two overlapping blur entrances simultaneously — a blur-on-blur on text where first-paint readability matters, and it re-fires on every page load. The anti-checklist flags blur on text-bearing entrances and motion-on-mount for static headings.

### 5. 🔴 [high] Default view takes ~1.4s to settle — section stagger at 0.7s plus a 0.5s event base-delay
`components/stagger.tsx:20-28, app/page.tsx:831-835`  ·  *motion·Emil*  ·  Eff M
- **Macht:** Treat this as a high-frequency tool, not a landing page. Cut the StaggerItem duration to ~0.18-0.22s, drop the per-section blur(6px) (Emil's blur tip is 'when nothing else works', not the default), and remove the 0.5s firstPaint base-delay so events don't wait on the card to finish arriving. The whole view should be readable in well under 300ms.
- **Warum gut:** StaggerItem `item` variant uses `duration: 0.7` with y:18 + blur(6px), staggered at 0.14 across 3 sections (head/goals/card). Then inside the card, every event waits `delay: (firstPaint ? 0.5 : 0.06) + …cascade(≤0.55)` and animates 0.4s. On first load the last event settles at roughly 0.5 + 0.55 + 0.4 ≈ 1.45s, and the 0.7s section duration alone is more than 2x Emil's 300ms ceiling. This is the screen the student opens constantly.

### 6. 🔴 [high] Every week-navigation click replays a full blur-stagger across all event blocks
`app/page.tsx:817-835, 670-694`  ·  *motion·Emil*  ·  Eff M
- **Macht:** On week change, let the keyed wrapper carry one quick opacity/clip crossfade and render the events statically (no per-item initial/cascade/blur on re-mount). Reserve the per-event entrance for the genuine first paint only, or drop it entirely — the grid position already orients the user.
- **Warum gut:** The outer view is keyed `key={data.start}` and does an opacity fade (line 689-693), but the event blocks ALSO remount (`key=…-${i}`) and re-run `initial={{ opacity:0, y:6, filter:'blur(5px)' }}` with a 0.06 + cascade(≤0.55) delay at 0.4s each — so each arrow click re-animates ~17 blocks over ~0.95s, on top of a redundant wrapper fade. The code comment claims 'Bei Wochenwechsel … sofort' but the cascade still runs. Stepping through weeks is the most frequent action in a week calendar; per Emil's frequency rule it should be instant.

### 7. 🔴 [high] Every school lesson is the same blue — the week doesn't scan
`app/page.tsx:50-54`  ·  *craft*  ·  Eff M
- **Macht:** Color school blocks by subject (hash subject -> hue from the existing 8-color OKLCH palette in event-colors.ts) instead of one global blue. Source can still be encoded via the left border weight or an icon. This is what Untis/Google Calendar do and is the single biggest readability win — a student should spot 'where is Physik this week' by color, not by reading.
- **Warum gut:** SRC.school = 'bg-blue-100/80 ... border-l-blue-500' for ALL school events. In the screenshot Deutsch, Mathematik, Latein, Musik, Englisch, Informatik, Physik, Geschichte, Sport are 13 visually identical blue blocks differentiated only by the title string. There is no visual entry point; the eye must read every block to locate a subject.

### 8. 🟠 [medium] ~0.5s base delay + long 0.7s staggers means the user waits ~1.5s to see their schedule on the default view
`app/page.tsx:833 (firstPaint base 0.5) and components/stagger.tsx:16,27`  ·  *motion·Jakub*  ·  Eff M  ·  buildTool: dialkit
- **Macht:** Cut the firstPaint base delay from 0.5 to ~0.12s and shorten the section item duration from 0.7 to ~0.4s. Cap the per-block stagger lower (e.g. min(..., 0.3)). The content should feel present immediately and settle by ~0.5-0.6s, not 1.5s.
- **Warum gut:** On first paint, event blocks use delay = 0.5 + min(di*0.05 + i*0.025, 0.55), so the last block starts at ~1.05s and finishes its 0.4s entrance near ~1.45s. The page-section Stagger itself runs duration 0.7 with staggerChildren 0.14 + delayChildren 0.08, so the calendar card (the 3rd section) doesn't settle until well after a second. For the app's default surface — the thing a student opens constantly to glance at their day — the core content is deliberately withheld for ~0.5s and not fully legible for ~1.5s. Jakub allows longer durations for polish, but the goal is 'smooth and responsive'; this errs into 'sluggish on every load.'

### 9. 🟠 [medium] Three stacked staggers play on a single mount of one productivity view
`app/page.tsx:555 (Stagger sections), :561 (SplitText chars), :802-835 (grid blocks)`  ·  *motion·Jakub*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** Pick one stagger moment. Keep the per-block grid cascade (it has spatial meaning — events arriving in time order), and reduce the page-section Stagger to a single quiet fade with no child stagger, and remove the SplitText stagger entirely (see separate finding). One deliberate stagger reads as polish; three reads as slop.
- **Warum gut:** Mounting the week view fires (1) the page-section Stagger, (2) the SplitText per-letter stagger inside the header, and (3) the per-block grid stagger across days×hours — all at once. The anti-checklist flags stagger-spam at ≥2 staggered lists in one view; this is three nested layers. The result is a choreography the user reads as 'the page is performing' rather than 'the page is ready,' which is exactly what Jakub's invisible-enhancement principle warns against for repeated-interaction interfaces.

### 10. 🟠 [medium] Reduced-motion gates don't neutralize Framer's JS-driven blur/opacity entrances
`components/motion-provider.tsx:8 and app/globals.css:169-178`  ·  *motion·Jakub*  ·  Eff M
- **Macht:** Add an explicit useReducedMotion() check in the components and pass instant (initial={false}) when it's true, OR gate the blur values to 0 under reduced motion. Verify by toggling the OS setting with the dev panel — confirm the grid blocks and SplitText appear instantly, not just without the y-shift.
- **Warum gut:** Two gates exist: MotionConfig reducedMotion="user" and the CSS @media (prefers-reduced-motion: reduce) block. But Framer's reducedMotion="user" only disables transform and layout animations — it intentionally leaves opacity AND filter (blur) animating. The CSS gate only zeroes CSS transition/animation durations, which does not touch Framer's JS/WAAPI-driven inline animations. So a reduced-motion user still gets the blur-in + opacity cascade on the SplitText, event blocks, sidebar, and sections (only the y/x movement is cut). Blur-to-sharp without translation isn't a classic vestibular trigger, so this isn't a blocker — but it's worth verifying that 'reduced motion' actually feels reduced rather than 'same animation minus the slide.'

### 11. 🟠 [medium] First-paint choreography stacks to ~1.2s before the calendar settles
`app/page.tsx:833 (firstPaint base 0.5 delay) + components/stagger.tsx:16,26 (staggerChildren 0.14, item duration 0.7)`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** This is the default view a user lands on constantly. Even by my standards (longer durations are fine when they serve effect), a >1s settle on the primary surface is decoration announcing itself, not orientation. Compress: drop the item duration from 0.7 to ~0.4, and the firstPaint base delay from 0.5 to ~0.25. The cascade still reads as a deliberate moment but the content arrives while it still feels instant.
- **Warum gut:** On first load the sections cascade (delayChildren 0.08 + staggerChildren 0.14 + 0.7s item duration), then event blocks add a base delay of 0.5 (firstPaint.current) plus their own stagger up to 0.55 plus 0.4s duration. The calendar Card is the third StaggerItem, so its blocks don't begin until the section cascade is well underway — the grid isn't visually complete until well past a second.

### 12. 🟠 [medium] Entfall diagonal strike snaps in statically — yet the now-line right beside it proves a line can draw itself
`app/page.tsx:63-81 (CancelStrike static SVG) vs app/page.tsx:867-872 (now-line scaleX draw-in)`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** 'What could this become?' — the cancellation is the single most emotionally charged state in a student's week (a class is dropped). Let the strike draw itself with an SVG pathLength 0→1 (or scaleX from the top-left origin) over ~0.4s when the block enters. It costs almost nothing, reuses the now-line's exact technique for consistency, and turns a flat red slash into a small moment that acknowledges 'this got cancelled.'
- **Warum gut:** CancelStrike renders a plain <line> with no animation — the cancelled 'Chemie' block (visible in both screenshots) just appears with its red diagonal fully drawn. Meanwhile the now-line a few cells away animates scaleX 0→1 over 0.5s to draw itself in from the left, and its dot scales in. Two lines, two different philosophies in the same grid.

### 13. 🟠 [medium] SplitText assembles the 'Kalender' title letter-by-letter (~1s) on every load
`components/stagger.tsx:50-87, app/page.tsx:561`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Render the title instantly. If a heading entrance is wanted at all, fold it into the section's single fast fade — don't split a daily-seen label into per-letter blur theatre.
- **Warum gut:** The page title runs through SplitText: each of the 8 letters animates opacity + y:14 + blur(6px), staggerChildren 0.045 + delayChildren 0.12 at 0.55s, so the word finishes assembling at ~0.12 + 7*0.045 + 0.55 ≈ 0.98s. This is a static navigation heading on the default surface — exactly the anti-checklist's 'motion-on-mount-for-static-content' / SplitText-slop pattern. Emil's question 'should this animate at all?' answers no: it announces itself and delays reading the page label the user already knows.

### 14. 🟠 [medium] Logo tilts (rotateX nudge) on every navigation arrow and mode switch
`components/app-sidebar.tsx:106-107, 112-122; app/page.tsx:576, 608, 620`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Keep the flip for the rare deliberate 'Heute' moment only; remove the nudge from per-arrow/per-week-switch navigation. The grid content changing is already the feedback for those.
- **Warum gut:** `atlas:nudge` fires `nudgeLogo()` (rotateX 0→26→0, 400ms) on prev/next week, prev/next day, and Week-mode switch — all frequent actions. The deliberate full flip on the 'Heute' jump (rare) is defensible delight, but a logo tilt every time the user pages through weeks is decoration on a high-frequency action, which Emil's frequency rule rules out. The motion is also off-surface (sidebar) from where the user's attention is (the grid), so it reads as a gimmick rather than feedback.

### 15. 🟠 [medium] Red means two different things on the same screen
`app/page.tsx:868`  ·  *craft*  ·  Eff M
- **Macht:** Keep red exclusively for the now-indicator (a near-universal calendar convention) and move Entfall to a neutral-desaturated treatment — greyed fill + the diagonal strike + a small red 'Entfall' tag — so cancellation reads as 'struck out / inactive' rather than competing with 'now'.
- **Warum gut:** The 'Jetzt' line uses bg-red-500 (line 868) while cancellation (Entfall) uses red across the block, label dot, and diagonal strike (lines 58-59, 76 stroke-red-500/40, 409 bg-red-500/60). On Monday the red now-line literally crosses near the red zone, so 'current time' and 'this lesson is cancelled' share one signal color.

### 16. 🟠 [medium] Custom-tinted blocks are too faint in light mode and read as a selection, not an event
`app/globals.css:120-126`  ·  *craft*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Raise the light-mode mix to ~16–18% (or add a subtle inner border at full --ev) so tinted blocks have the same presence in light as in dark. Verify specifically over the today/weekend tinted columns where the fill stacks on an already-tinted background.
- **Warum gut:** .ev-tint mixes only 11% of --ev into the card in light vs 22% in dark. The 'Arbeit 13:15–16:00' rose block sits on the today column (bg-primary/[0.035], page.tsx:778) and its pale-pink fill is barely distinguishable from the column; the empty lower half (14–16h) reads like a highlighted drag-selection rather than a scheduled block. Dark mode renders the same block clearly.

### 17. 🟠 [medium] Cancellation diagonal strike is nearly invisible
`app/page.tsx:63-81`  ·  *craft*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Strengthen the strike (≈2px, red-500/60-70, or a repeating-linear-gradient hatch fill) so the 'crossed out' affordance is legible at a glance without reading the label. Tune width/opacity live against both themes.
- **Warum gut:** CancelStrike draws a single corner-to-corner line at strokeWidth 1.5 with stroke-red-500/40. At block scale this hairline is very low-contrast — in the week screenshot the Chemie block reads as cancelled mostly because of the red tint + 'Entfall' label, not the strike. The strike is doing almost no work.

### 18. 🟠 [medium] Clickable week event blocks have no scale-on-press
`app/page.tsx:820-825`  ·  *mifb*  ·  Eff S
- **Macht:** Add active:scale-[0.96] to the editable block className (and the all-day buttons), combined with a transform transition. Per principle 12 use exactly 0.96; add a static escape only if it reads as distracting on the dense grid.
- **Warum gut:** Event blocks are the primary interactive element (onClick opens the edit sheet, canEdit && "cursor-pointer hover:shadow-sm"), but the className only adds hover:shadow-sm — no active:scale-[0.96]. The shared Button component (button.tsx:6) correctly has active:scale-[0.96], so the nav controls give press feedback while the actual calendar content does not. The all-day mini-buttons (app/page.tsx:730-737) and the today-view blocks (app/page.tsx:384-392) are likewise missing it.

### 19. 🟠 [medium] Hover shadow on week blocks snaps in with no transition
`app/page.tsx:820-824`  ·  *mifb*  ·  Eff S
- **Macht:** Add transition-shadow (specific property, not transition-all) to the week block className so the hover depth eases in/out and is interruptible, matching the today view.
- **Warum gut:** Week blocks use canEdit && "cursor-pointer hover:shadow-sm" with no transition utility, so the shadow appears and disappears instantly on hover. The equivalent today-view block (app/page.tsx:390) does it right with "cursor-pointer transition-shadow hover:shadow-sm". Same component family, inconsistent feel — the week grid (the default view) is the one that snaps.

### 20. 🟠 [medium] Several tap targets fall under the 40x40 minimum
`app/page.tsx:730-737`  ·  *mifb*  ·  Eff M
- **Macht:** Give the all-day buttons a larger padded hit area or a 40x40 pseudo-element; bump the icon buttons to h-10 w-10 (40px). For sub-40px blocks, extend the clickable area without overlapping neighbouring blocks.
- **Warum gut:** All-day mini-buttons in the day header are px-1.5 py-0.5 text-[10px] — roughly 16px tall, far below 40x40, yet they open the edit sheet. Short events are clamped to a 20px-min block height (app/page.tsx:804) while staying clickable. The nav controls also sit just under the floor: button.tsx:16-18 gives icon = h-9 w-9 (36px) and sm = h-8 (32px) for the Heute / chevron / Neuer-Termin buttons.

### 21. 🟢 [low] Now-indicator dot animates from scale(0)
`app/page.tsx:873-878`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Start the dot from scale 0.6 (or just opacity-fade it in alongside the line draw). Minor, but it's the kind of micro-detail Jakub's optical eye catches.
- **Warum gut:** The 'Jetzt' marker dot uses initial={{ scale: 0, opacity: 0 }} → scale 1. Starting from scale(0) is the pattern Jakub/Emil both flag — it reads as a pop-in rather than a natural appearance; scale(0.6-0.9) feels more physical. The accompanying scaleX:0→1 line draw is a nice one-time touch and is fine.

### 22. 🟢 [low] Logo nudge-tilt fires on every navigation arrow / week switch
`components/app-sidebar.tsx:106-107 (dispatched at app/page.tsx:577,608,620)`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Consider dropping the nudge on plain arrow navigation (keep it only for the deliberate Heute flip), or make it even smaller. Feedback for frequent nav is better expressed on the grid itself (the existing opacity cross-fade already does this) than on an unrelated corner element.
- **Warum gut:** nudgeLogo() tilts the logo rotateX 0→26→0 over 0.4s on every prev/next arrow and every Woche switch — high-frequency navigation actions. The full 360 flip on the rare deliberate 'Heute' jump is well-judged delight, but tying a peripheral logo tilt to routine paging means the eye is repeatedly pulled to the top-left corner, away from the calendar the user is actually scanning. It's subtle and the code comments show intent, so this is taste, not a defect.

### 23. 🟢 [low] Event blocks — the heart of the calendar — have zero hover personality beyond a shadow
`app/page.tsx:823 (canEdit && 'cursor-pointer hover:shadow-sm')`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Not every block needs motion, but editable ones could earn a whisper of life — e.g. the colored left border widening 6px→8px or deepening in chroma on hover (a transition the static screenshots can't show but the code makes trivial). It signals 'this one is yours to edit' through the color system you already built, without the scale-bounce that would read as slop. A targeted, meaningful hover beats a uniform one.
- **Warum gut:** Editable blocks get only hover:shadow-sm; school blocks get nothing interactive. The colored left border (6px source-coded blue/amber/green/violet, clearly visible in both shots) is the most characterful element on the surface and it stays completely inert on hover. The restraint is correct for avoiding hover-scale-slop, but it leaves the signature element of the whole view feeling untouchable.

### 24. 🟢 [low] Now-line indicator dot animates from scale(0) and re-draws on each week mount
`app/page.tsx:862-878`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Start the dot at `scale: 0.9` (or just fade opacity, no scale). Consider rendering the now-line statically rather than re-drawing the scaleX sweep on every mount — its position is the orientation signal, the draw-in is pure decoration.
- **Warum gut:** The 'Jetzt' dot uses `initial={{ scale: 0, opacity: 0 }}` (line 875) — Emil's explicit tip #2 is don't animate from scale(0), it creates unnatural motion; start from ~0.9. The line also self-draws via scaleX 0→1 over 0.5s (line 869-871) every time the week containing today mounts, replaying on each navigation back to the current week. The `transition-[top] duration-700` reposition (line 864) is fine and imperceptible at ~1px/min.

### 25. 🟢 [low] Conflicting left-border widths on week blocks (3px vs 6px)
`app/page.tsx:821`  ·  *craft*  ·  Eff S
- **Macht:** Pick one accent-bar width per surface and drop the redundant utility, or fold the width into a single shared block component so the bar can't silently change when SRC vs ev-tint vs cancelled classes combine.
- **Warum gut:** Week block base className sets 'border border-l-[3px]' (line 821) but look.className from SRC sets 'border-l-[6px]' (line 50-54) and ev-tint sets border-left-color. Two competing border-left-width utilities resolve by CSS source order, not intent — a latent inconsistency between the week block (meant 3px) and the agenda/all-day blocks.

### 26. 🟢 [low] Room code 'A120' repeats as visual noise across the grid
`app/page.tsx:810-813`  ·  *craft*  ·  Eff M
- **Macht:** Consider showing the room only when it differs from the student's usual/most-common room (the screenshot already does the inverse signal well: 'A203 (Mu1)', 'N31', 'PH 2', 'TH 1' stand out precisely because they're the exceptions). Suppressing the repeated default would let the exceptions pop.
- **Warum gut:** Most school blocks render the room as their only meta line; 'A120' appears 6+ times down the week. The repeated identical monospace grey label adds clutter without adding information once the user knows their default room.

### 27. 🟢 [low] Today column tint is too weak to register in the grid body
`app/page.tsx:778`  ·  *craft*  ·  Eff S
- **Macht:** Either lean fully on the now-line + date badge and drop the near-invisible column wash, or strengthen it (~0.05–0.06) so the today column reads as a continuous highlight down the full height. The current value lands in an ineffective middle.
- **Warum gut:** today gets bg-primary/[0.035] in light — effectively invisible against the white card; the only reliable 'today' cue in the body is the filled black '29' date badge in the header. Once scrolled into the afternoon, there's no persistent column signal tying events back to today.

### 28. 🟢 [low] Blur-in mount animates filter on many blocks without will-change
`app/page.tsx:829-835`  ·  *mifb*  ·  Eff S
- **Macht:** If first-frame stutter is observed on the cascade, add will-change: filter only for the duration of the enter (and remove after), per principle 15 — never leave it permanently or use will-change: all.
- **Warum gut:** Every packed event block animates filter: blur(5px) -> blur(0px) on mount (initial/animate, lines 829-830), staggered across a full week of ~20-30 blocks at once. There is no will-change hint anywhere, and the code itself notes that blur "glitcht/repaintet unzuverlaessig" on large surfaces (comment at line 668) — which is exactly the cost of animating filter on many composited layers.

### 29. ⚪ [nit] blur(5-6px) is the uniform fingerprint across every entrance in the app
`components/stagger.tsx:20 (blur 6), app/page.tsx:829 (blur 5), components/event-sheet.tsx:538 (blur 4), components/app-sidebar.tsx:135 (blur 6)`  ·  *motion·Jhey*  ·  Eff M
- **Macht:** This is taste, not a bug — the recipe is good. But consider differentiating by element weight so the motion has hierarchy: heavy surfaces (sidebar, card) earn the blur; small repeated items (the 30 event blocks) could drop blur and use opacity+y only, which is also cheaper to composite across many nodes. Reserve blur as a deliberate accent rather than the default everywhere.
- **Warum gut:** The same opacity+translateY+blur recipe at near-identical blur radii (4-6px) drives the sidebar slide-in, the page section stagger, the SplitText letters, every event block, and the edit-sheet field cascade. It's Jakub's polished-entrance treatment applied as the single global enter pattern — which is exactly the 'uniform blur-everywhere' tell when it appears on this many distinct component types in one view.

### 30. ⚪ [nit] Now-line dot animates scale/opacity without will-change but that is fine; the line itself is solid
`app/page.tsx:862-879`  ·  *mifb*  ·  Eff S
- **Macht:** No change required. If the dot ever clips against the day cell's left border, give the now-line container a small left inset or overflow-visible parent.
- **Warum gut:** The Jetzt-Linie draws in once via scaleX (origin-left) and the container glides with transition-[top] duration-700 ease-out — correctly a specific property, interruptible, one-shot. No real issue; noting only that the 7px dot at -left-1 sits half outside the column and could clip on the leftmost day's border, but it reads fine in both screenshots.


## Kalender · Heute/Agenda (calendar-today)  ·  27 Befunde  (3h/13m/6l/5n)

### 31. 🔴 [high] Agenda entrance cascade re-fires its full ~1s blur ramp on every day-navigation, not just first load
`app/page.tsx:347, 353-355, 378-380, 680`  ·  *motion·Jakub*  ·  Eff M  ·  buildTool: dialkit
- **Macht:** Run the blur-stagger only on the genuine first paint (mirror the firstPaint/firstView ref pattern already used for the week view), and on day-to-day navigation fall back to the quiet opacity fade the wrapper already does (page.tsx:671). If you keep a per-item stagger on nav, drop the blur, shrink duration to ~0.22-0.28 and cap the ramp far lower (e.g. i*0.03, max 0.18) so the whole list resolves well under 400ms.
- **Warum gut:** TodayView is keyed today-${anchor} and stagger is hardcoded true (line 680), so each prev/next-day arrow remounts and replays the cascade. Per-item delay = 0.1 + Math.min(i*0.07, 0.8) with duration 0.42 and initial blur(5px)+y8 — the last rows finish up to ~1.0-1.3s after mount. Arrow navigation is a high-frequency action; replaying a blurred, second-long cascade every time is exactly the motion the user 'notices' on the 10th interaction. Jakub: if users consciously notice it, it's too much, and repeated interactions must not get tiresome.

### 32. 🔴 [high] Blurred agenda cascade replays in full on every day-navigation
`app/page.tsx:680, 347, 353, 378`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Mirror the week-view gate: pass `stagger={firstPaint.current}` (or a today-specific firstView ref) so the per-item blur cascade plays once on initial mount, and subsequent day-nav uses only the wrapper's quiet 0.22s opacity fade (already present, line 671-673). Keep the delightful cascade for the entrance; retire it for the high-frequency repeat.
- **Warum gut:** TodayView is always called with the literal `stagger` prop (line 680), and the wrapper remounts on every arrow click via key `today-${anchor}` (line 670). So each item re-runs its `initial={{opacity:0, y:8, filter:'blur(5px)'}}` entrance with delay `0.1 + Math.min(i*0.07, 0.8)` (line 347). Unlike the week grid — which gates its cascade behind `firstPaint.current` (line 833) — the today list has no first-paint gate. Result: every Prev/Next-Tag step replays the whole ~0.9s staggered blur-in. Jhey's own golden rule is 'the best animation is that which goes unnoticed... doesn't fatigue users on repeated interactions.' Day-stepping is exactly that repeated interaction, and the cascade makes itself the loudest thing on screen.

### 33. 🔴 [high] Agenda cascade is too slow and re-triggers on every day-navigation
`app/page.tsx:347,353-355,378-380`  ·  *motion·Emil*  ·  Eff M
- **Macht:** On day-navigation, drop the per-item stagger entirely — let the keyed wrapper's opacity fade (already at 0.22, page.tsx:673) carry the swap and have rows appear instantly. Reserve any stagger for the true first paint only, and there cut duration to ~0.2s, the per-item step to ~0.03s capped at ~0.25s total, and drop the blur on text rows (keep opacity + a small y). Speed is the feature here.
- **Warum gut:** Each agenda row enters at duration 0.42 with delay 0.1 + Math.min(i*0.07, 0.8), so the last rows land ~0.9s after mount. The whole list re-runs on every day-arrow tap because the wrapper is keyed `today-${anchor}` (page.tsx:670), and again on each mode switch. 420ms is well over Emil's 300ms ceiling, and the blur(5px) on these text-bearing rows softens the user's schedule exactly at first paint, when they want to read it. This is the Raycast/frequency case: an at-a-glance view re-triggered constantly should not make the user wait through a cascade.

### 34. 🟠 [medium] Blur-on-blur: section StaggerItem and agenda items materialize simultaneously on first paint
`app/page.tsx:659, 378; components/stagger.tsx:20-28`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Pick one layer to carry the blur. Either let the section StaggerItem do the blur entrance and have the agenda rows do a plain opacity (no blur, no translate) on first paint, or vice-versa. Don't run both blur passes on the same pixels at once.
- **Warum gut:** On first load the calendar-card StaggerItem animates in with filter blur(6px) + y18 over 0.7s (stagger.tsx item variant), while inside it the agenda rows independently animate filter blur(5px) + y8 over 0.42s starting at delay 0.1. The two blur+translateY systems overlap on the same content, so rows blur in while their container is still blurring in — a muddy double-entrance. Jakub flags over-animation and 'same animation everywhere'; blur is a materializing signal that loses meaning when stacked on itself.

### 35. 🟠 [medium] SplitText animates the 'Kalender' heading letter-by-letter on every page load
`app/page.tsx:561; components/stagger.tsx:65-87`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** For a productivity header, drop the per-letter split and let the heading appear with (at most) the section's existing opacity+translateY, or render it instantly. If you want to keep a flourish, reserve SplitText for a true first-run/onboarding moment rather than every mount.
- **Warum gut:** The h1 is rendered via <SplitText text="Kalender" />, which splits the word into chars and staggers each with blur(6px)+y14 over 0.55s (staggerChildren 0.045, delayChildren 0.12). This is a persistent navigation/section heading, not a hero — motion-on-mount for static content per the anti-checklist. It replays on every full load and is one of the most consciously-noticeable things on the surface, which is the opposite of Jakub's 'invisible enhancement' for a daily productivity header.

### 36. 🟠 [medium] blur(5px) on text rows fights the 'auf einen Blick' purpose
`app/page.tsx:353, 378`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Drop the blur on the text rows to ~2px or remove it, keeping opacity + the small y:8 lift — the lift alone reads as a settle without smearing the type. Reserve the heavier blur for the one-time entrance (see the first-paint gate fix) rather than every reveal.
- **Warum gut:** Every agenda row (lesson title, room/teacher, time) enters with `filter:'blur(5px)'` over a 0.42s reveal (lines 353, 378). The page's own subtitle is 'Dein heutiger Tag auf einen Blick' — a glance view. Anti-checklist flags blur on text-bearing entrances 'where it impairs first-paint readability.' For the staggered later rows the text is mid-blur for a noticeable window. Even from Jhey's generous lens, the golden rule says motion should feel expected and unnoticed — a 5px blur on the content you came to read works against that.

### 37. 🟠 [medium] Day navigation has no directional sense of moving through time
`app/page.tsx:670-674`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: dialkit
- **Macht:** Make the remount directional: slide the incoming day in from the right (and out to the left) on Next, reverse on Prev — a small x-offset (±16-24px) paired with the existing opacity is enough to encode direction without becoming a full-screen swipe. Track nav direction in state at the setAnchor call sites (lines 577, 621). This is orientation + a touch of delight at once.
- **Warum gut:** Prev-Tag and Next-Tag both resolve to the identical wrapper animation: `initial={{opacity:0}}` → `animate={{opacity:1}}` (lines 671-672). The chevrons are directional (ChevronLeft/Right) but the motion is not — going back a day looks exactly like going forward. 'What could this become?': a calendar is a timeline, and stepping through days is the one place spatial/directional motion does real orientation work, not just decoration. Right now the agenda just dissolves and re-forms in place.

### 38. 🟠 [medium] The now/next block carries no motional priority
`app/page.tsx:371, 389`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** Give the isNext block a distinct, restrained beat: e.g. settle it last (or first) with a slightly longer ease, or draw its ring in once with a scaleX/opacity sweep on the entrance instead of having it appear instantly. One deliberate accent on the one block that matters — not a loop, not a pulse (the I3 comment was right to kill the pulse).
- **Warum gut:** The currently-relevant event is computed as `isNext` and gets a static `ring-2 ring-primary/30` (lines 371, 389) — visible around 'Arbeit' in both screenshots. But in motion it enters identically to a 'Frei 6 h' filler row: same blur, same y, same stagger slot. The single block the student opened this view to find has zero motional emphasis. From the 'what could this become?' lens, this is the obvious moment to make something land — the hero of the screen reveals like everything else.

### 39. 🟠 [medium] SplitText letter-stagger on the static 'Kalender' heading
`components/stagger.tsx:50-63 (used app/page.tsx:561)`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Render 'Kalender' as plain text (or at most a single fast opacity+y on the whole word, ~0.2s). Save SplitText for a genuine first-run/marketing moment, not a section header the user sees on every visit.
- **Warum gut:** The section heading 'Kalender' is rendered through SplitText, which blurs+staggers each letter in (staggerChildren 0.045, delayChildren 0.12, per-char duration 0.55). This is a persistent app-section title that re-animates on every full reload. Per the anti-checklist this is motion-on-mount-for-static-content: a heading should be readable instantly, and letter-by-letter decoration announces itself rather than serving orientation. In a productivity tool the heading is wayfinding, not a hero moment.

### 40. 🟠 [medium] Page-section enter runs at 700ms per section
`components/stagger.tsx:20-28`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Bring the section enter under ~250ms and reduce y/blur (e.g. y:8, blur off or 2px). Consolidate the choreography: one entrance system for the shell, not shell + heading + list all staggering simultaneously.
- **Warum gut:** The StaggerItem `item` variant enters at duration 0.7 (blur(6px) + y:18 + opacity), with container staggerChildren 0.14. On this surface that governs the header and the calendar card, so the frame the agenda lives in is itself still resolving past half a second while the SplitText and agenda cascades also run. 700ms is more than double Emil's 300ms guidance, and three stacked stagger systems on one mount is the layering Emil warns produces a UI that feels slow despite being 'polished'.

### 41. 🟠 [medium] Start time printed twice on every row
`app/page.tsx:383, 399-401 (events); 358, 362-363 (free)`  ·  *craft*  ·  Eff S
- **Macht:** Pick one home for time. Either keep the gutter as the axis and drop the in-block start (show only end or duration), or drop the gutter time on event rows and let the block own the range. Apple Calendar / Things never print the start twice in an agenda.
- **Warum gut:** The 52px left gutter renders the start time (e.g. '07:50') and the block then repeats the full range top-right ('07:50-09:20'). For school rows the start therefore appears twice and the gutter adds no information the block doesn't already carry. Free rows are worse: gutter '16:00', block '16:00-22:00', and 'Frei 6 h' all encode the same interval three ways.

### 42. 🟠 [medium] Agenda column floats centered, sharing no edge with the page header
`app/page.tsx:302`  ·  *craft*  ·  Eff M
- **Macht:** Either left-align the agenda to the same px-6/8 gutter as the header (constraining width with max-w but anchored left), or center the header block too so the page has one consistent center line. Right now the two layout systems disagree.
- **Warum gut:** TodayView wraps the list in `mx-auto w-full max-w-xl`, so the agenda is centered in the content area (~390px empty left, ~430px empty right). But the 'Kalender' H1, the subtitle and the nav controls are left-aligned at px-6/lg:px-8. The result: the 'Jetzt · Arbeit' kicker and the whole list start at ~x780 while the page title sits at ~x390 with nothing aligning the two. The agenda reads as ungrounded, drifting in the middle of a wide empty canvas.

### 43. 🟠 [medium] Red is overloaded; the active block reads like a cancelled one
`app/page.tsx:58-59, 117, 280, 390`  ·  *craft*  ·  Eff M
- **Macht:** Reserve red for cancellation, and carry 'now' with a distinct non-red signal (e.g. a stronger primary ring + left accent, or a filled 'Jetzt' chip) so the active state never collides with the cancelled treatment. Consider steering user color choices away from the cancelled-red hue.
- **Warum gut:** Red carries four different meanings on this one screen: the now-dot + 'Jetzt' kicker (280, red-500), the cancelled-event styling (CANCELLED_BLOCK, bg-red-50), and the user-colored 'Arbeit' event which renders as a pink-red ev-tint fill. The active 'Arbeit' block (light: pale pink fill, faint ring) is nearly the same treatment as a cancelled block — a glance could read the current event as struck/cancelled. The emphasis ring `ring-2 ring-primary/30` does little to disambiguate.

### 44. 🟠 [medium] Dark-mode event blocks lose weight against the background
`app/page.tsx:51-53, 387`  ·  *craft*  ·  Eff S
- **Macht:** Lift the dark fill (e.g. /25-/30 plus a subtle border or inset highlight) or widen the accent bar in the agenda back toward the 6px used elsewhere, so each block has clear edges without relying on the stripe alone.
- **Warum gut:** Event fills are `bg-blue-500/20` (etc.) with only a `border-l-[3px]` accent in the agenda. In dark mode the Deutsch/Mathematik/Kunst blocks sit at near-background luminance — they register almost entirely via the thin left color bar, and the body of each block barely separates from the page. The day feels flat; the events don't read as discrete cards the way they do in light mode.

### 45. 🟠 [medium] Clickable agenda event cards have no scale-on-press feedback
`app/page.tsx:384-392`  ·  *mifb*  ·  Eff S
- **Macht:** Add `active:scale-[0.96]` and extend the transition to include transform (e.g. `transition-[box-shadow,transform]`) on the editable card div and the all-day buttons. Keep 0.96 to match the Button convention.
- **Warum gut:** The editable event card is a raw <div onClick={...}> with only `cursor-pointer transition-shadow hover:shadow-sm` — it bypasses the Button component, so it never gets the `active:scale-[0.96]` that buttonVariants applies (button.tsx:6). The all-day event chips at app/page.tsx:320-327 are raw <button> elements with the same `transition-shadow hover:shadow-sm` and likewise no press scale. These cards (Arbeit, Deutsch, etc.) are the main tappable content of this view, so the missing tactile cue is felt directly here.

### 46. 🟠 [medium] Header icon buttons are 36x36, under the 40x40 hit-area floor
`components/ui/button.tsx:18`  ·  *mifb*  ·  Eff S
- **Macht:** Bump the icon size to `h-10 w-10` (40px), or keep the visual at 36 and extend the tap target with an inset pseudo-element. The text buttons (Heute/Woche, h-9 + px) are fine via horizontal padding; only the square icon variant is short on both axes.
- **Warum gut:** `size: { icon: "h-9 w-9" }` renders the prev-day, next-day and "Neuer Termin" (CalendarPlus) buttons at 36x36px — below the 40x40 minimum. These three icon buttons sit in the header of this surface (visible top-right in both screenshots).

### 47. 🟢 [low] 'Vertretung' badge has its own nested blur+scale entrance inside an already-animating row
`app/page.tsx:413-417`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Let the badge ride in with its parent row (no separate initial/animate). The row's entrance already covers it; a static badge inside a moving row is cleaner and less busy.
- **Warum gut:** The substituted badge animates initial opacity0/scale0.8/blur(2px) → 1 with its own delay (delay+0.1) while its parent motion.li is already running the blur+y entrance. That's a third animation layer on the same moment — animation-on-animation that no user will consciously parse but adds to the overall 'everything is moving' feel Jakub warns against.

### 48. 🟢 [low] Clickable agenda event rows lack press feedback while other interactive elements have it
`app/page.tsx:384-392`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Add a subtle active:scale-[0.98] (or a quick scale-on-tap via framer's whileTap) to the editable agenda rows so the main interaction on this surface confirms the press, matching the rest of the app.
- **Warum gut:** Editable event rows are clickable divs (cursor-pointer, onClick→onEdit) with only hover:shadow-sm — no active/press state. Meanwhile sidebar buttons and the logo use active:scale-[0.96] (app-sidebar.tsx:164). Jakub's checklist calls for scale feedback on press; the inconsistency means the primary tap target on this surface feels less responsive than chrome the user touches less.

### 49. 🟢 [low] Agenda settle time (~1.3s end-to-end) is long for a glance view
`app/page.tsx:347, 355, 380`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Once the cascade is gated to first-paint only (finding #1), this is mostly resolved — but also consider tightening per-item duration to ~0.3s and the delay step to ~0.05s so even the entrance lands inside ~0.8s. Keep the signature EASE; just compress.
- **Warum gut:** Per-item duration is 0.42s (lines 355, 380) and the delay is capped at `0.1 + 0.8 = 0.9s` (line 347), so the last row finishes at roughly 1.3s after mount. Jhey explicitly allows longer durations when polish warrants it, but pairs that with the golden rule about not fatiguing on repeat. Combined with finding #1 (it replays on every nav), 1.3s to fully settle a 6-row schedule reads as slow once you've seen it twice.

### 50. 🟢 [low] Logo tilt fires on every day-arrow on a high-frequency surface
`app/page.tsx:576,620 → components/app-sidebar.tsx:106-107`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Decouple the logo nudge from day/week arrow navigation. Keep the deliberate full flip for the rare, intentional 'Heute' jump (focus-today) where delight reads as purposeful feedback, but let routine arrow-stepping be silent.
- **Warum gut:** Prev/next day arrows dispatch `atlas:nudge`, which tilts the sidebar logo (rotateX 0→26→0, 400ms) on every press. Stepping through days is a frequent action in a Today view, so a peripheral element animates repeatedly for routine navigation — Emil's frequency rule says high-frequency actions get minimal or no motion, and the feedback the user actually needs (the day changed) is already carried by the agenda swap and the date label.

### 51. 🟢 [low] Active 'now' emphasis is muddy
`app/page.tsx:390`  ·  *craft*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Strengthen the active treatment (higher-opacity ring or a solid accent) and make it visually distinct from the cancelled style, so the active block is unmistakable on its own.
- **Warum gut:** The current/next block is marked with `ring-2 ring-primary/30` layered over the pink ev-tint fill. At 30% opacity the ring is a faint gray halo that fights the red fill rather than asserting 'this is now'. The 'Jetzt · Arbeit' header is doing most of the work; the block itself under-signals.

### 52. 🟢 [low] Status kicker's live countdown number is not tabular
`app/page.tsx:288`  ·  *mifb*  ·  Eff S
- **Macht:** Add `tabular-nums` (and ideally `font-mono` to match the right-side countdown) to the relLabel/time spans in the kicker so the proportional digits don't cause sub-pixel reflow each minute.
- **Warum gut:** In the 'Als Nächstes' kicker, `relLabel(next.s - nowMin)` renders text like 'in 1 h 37 min' inside `<span className="text-muted-foreground">` with no tabular-nums and not font-mono. This value re-renders every 60s via the minute tick (setInterval at app/page.tsx:512), so the digits can change width and nudge the line. The countdown on the right ('noch 1 h 37 min', line 311) correctly uses `font-mono tabular-nums`, but this left-side one does not. The 'Erster Termin' time at line 294 has the same gap.

### 53. ⚪ [nit] Logo does a full 360° rotateX flip on the 'Heute' jump that lands on this surface
`components/app-sidebar.tsx:100-101; app/page.tsx:594`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Keep the rare gating but consider tempering the gesture to a half-turn or a quick settle (e.g. rotateX [0, 180, 0] or a snappier 0.4s) so it confirms the jump without becoming the thing the eye tracks. Subjective — leave as-is if the flourish is an intended brand beat.
- **Warum gut:** Reaching this surface via the Heute button dispatches atlas:focus-today, which triggers flipLogo() — a full rotateX [0,360] over 0.6s. It is correctly frequency-gated (only the deliberate Heute jump, with a softer nudge elsewhere), which is the right instinct. But a full 360 spin is on the flashy side of Jakub's 'noticed = too much'; it reads as a gimmick more than feedback.

### 54. ⚪ [nit] Substituted badge enters from scale(0.8), below the natural-motion floor
`app/page.tsx:414-416`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Bump the start to scale(0.9). Keep the blur(2px) and the staggered delay — those are the parts that make it feel like a considered detail.
- **Warum gut:** The 'Vertretung' badge animates `initial={{opacity:0, scale:0.8, filter:'blur(2px)'}}` (line 414). Both the anti-checklist and Jhey's cookbook put the natural-motion floor at scale(0.9+); 0.8 starts to read as a pop-in rather than a settle. It's a rare element so impact is small, and the nested delay (delay+0.1) sequencing it after its row is a nice touch.

### 55. ⚪ [nit] Free-slot filler rows get the same blur+stagger as real events
`app/page.tsx:353-355`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Let free slots appear with opacity only (or no entrance) so the cascade reads as 'your commitments arriving' rather than every row equally. This also shortens the perceived settle and sharpens the hierarchy.
- **Warum gut:** The dashed 'Frei 6 h' / 'Frei 1 h 50 min' rows (visible top and bottom of both screenshots) animate in with the exact `blur(5px)` + y:8 + stagger treatment as the lessons (lines 353-355). These are low-information spacer rows, yet they consume stagger slots and add to the cascade length, giving filler the same motional weight as the content.

### 56. ⚪ [nit] Substitution badge animates from scale(0.8) with a nested delay
`app/page.tsx:413-417`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Let the badge inherit its parent row's single entrance — no separate animation. If it must animate, start at scale(0.94)+ and drop the extra delay so it doesn't trail behind its own block.
- **Warum gut:** The 'Vertretung' badge enters with scale:0.8 + blur(2px) at delay+0.1 — a third, nested animation layered on top of its parent row's cascade. scale(0.8) sits below Emil's scale(0.9) floor (anti-checklist), so the badge pops slightly unnaturally, and the extra +0.1 delay means this tiny label arrives even later in an already-long sequence.

### 57. ⚪ [nit] Gutter time styling differs between free and event rows
`app/page.tsx:358 vs 383`  ·  *craft*  ·  Eff S
- **Macht:** Use a single gutter type style for all rows (one size, one tone); if free rows should feel quieter, dim the whole row rather than only the time label.
- **Warum gut:** Free-row gutter time is `text-[11px] text-muted-foreground/70`; event-row gutter time is `text-[12px] text-muted-foreground`. The axis column mixes two sizes and two opacities, so the left edge doesn't read as one coherent timeline.


## event-sheet  ·  23 Befunde  (1h/9m/8l/5n)

### 58. 🔴 [high] Edit-mode form fields cascade in with blur — motion announces itself on a utility form
`components/event-sheet.tsx:535-544`  ·  *motion·Emil*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Drop the per-field stagger and blur in edit mode. Either render the fields statically, or do a single subtle container fade (opacity only, ~150ms) so the panel settles without each field performing. If you keep any entrance, remove the blur on text fields and cap the whole sequence under ~200ms.
- **Warum gut:** When opening an existing event, editFields.map renders 6 fields each with initial={{ opacity:0, y:8, filter:'blur(4px)' }} and transition delay 0.04 + i*0.05 (duration 0.32). The last field (Notiz) doesn't finish until ~0.6s, and every text-bearing field renders blurred first. The user opened this to edit one value — by Emil's frequency rule (editing is occasional, goal-directed) the content should be present instantly, not staggered. This trips the anti-checklist's stagger-spam + motion-on-mount-for-static-content + blur-on-text categories at once.

### 59. 🟠 [medium] Identical blur(4px) reveal repeated across 4+ distinct components — Jakub's signature gone uniform
`components/date-field.tsx:93, components/time-range-field.tsx:224, components/color-picker.tsx:61, components/event-sheet.tsx:538`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Keep blur on one or two genuinely 'materializing' moments (e.g. the popovers opening over content) and drop it where it adds nothing — the time list and the form fields would read cleaner with opacity + small translateY alone. If kept, vary the value with element size/context rather than reusing 4px everywhere, so blur stays a signal instead of a texture.
- **Warum gut:** The same filter: blur(4px) enter/exit is applied as the default materialize on the date popover (date-field.tsx:93-95), the time-combo suggestion list (time-range-field.tsx:224-226), the swatch checkmark (color-picker.tsx:61-63) and the edit-mode form fields (event-sheet.tsx:538-539). Four distinct components in one surface share the identical 4px value — this is exactly the blur-everywhere tell. Blur is Jakub's signature precisely because it's selective; used as the house style for every reveal it stops reading as 'materializing' and just becomes a soft default.

### 60. 🟠 [medium] Edit-mode form does a staggered blur entrance — delays editing the content you opened to edit
`components/event-sheet.tsx:536-544`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** For edit (vs the create wizard), let the already-known content appear fast: drop the per-field blur and either remove the stagger or collapse it to a single short group fade (one 0.2s opacity+y on the whole stack). Reserve the staggered reveal for the create flow where there's nothing to read yet.
- **Warum gut:** In edit mode all 6 fields mount with initial={{opacity:0, y:8, filter:'blur(4px)'}} and delay: 0.04 + i*0.05, so the last field only resolves around 0.04 + 5*0.05 + 0.32 ≈ 0.61s. These fields (title input, date, time, color, location, notes) are pre-filled with the values the user explicitly opened the sheet to change — blurring text the user wants to read, and staggering interactivity, works against the task. Jakub's test is 'if users notice the animation it's too much'; a six-step blur-in on an edit form announces itself.

### 61. 🟠 [medium] Edit-mode reveals 6 fields with identical blur+translateY stagger on every open
`components/event-sheet.tsx:535-544`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Even Jhey's golden rule is 'the best animation goes unnoticed' on repeat. Drop the per-field index stagger to a single container fade (one opacity+y on the wrapping div), or cap the stagger to the first 2-3 fields and remove the blur entirely. The form should feel ready, not perform a reveal you watch six times a session.
- **Warum gut:** editFields.map renders each of 6 form fields with initial={{ opacity:0, y:8, filter:'blur(4px)' }} and delay 0.04 + i*0.05. That is the canonical AI-slop fingerprint flagged in the anti-checklist three times over: blur-everywhere entrances (6 distinct fields share blur(4px)), stagger-spam-on-a-list, and uniform-fade-on-every-element. It fires every single time you open an existing event to edit (a routine, repeated action), so the ~0.6s blurred cascade fatigues fast. Notably the create flow does NOT do this (it slides between wizard steps), so the slop is isolated to edit.

### 62. 🟠 [medium] Ganztags toggle swaps content with mode='wait' opacity-only — dead beat + height snap
`components/event-sheet.tsx:357-380`  ·  *motion·Jhey*  ·  Eff M
- **Macht:** Switch to a crossfade (mode default / 'popLayout') so old and new overlap instead of leaving a gap, and animate the container height (or size the dashed placeholder to roughly match the time field) so the layout settles instead of jumping. A toggle this prominent deserves a continuous transition, not a blink.
- **Warum gut:** AnimatePresence mode='wait' crossfades the dashed 'Ganztägig' placeholder (py-10) and the TimeRangeField using opacity only (0.2 in / 0.2 out). mode='wait' forces a full fade-out before fade-in, so toggling shows ~0.4s of empty space, and because the two panels have very different heights and nothing animates height, the footer/content below snaps to the new size when the incoming panel mounts. The toggle itself is instant but the consequence reads as a stutter.

### 63. 🟠 [medium] blur(4px) entrance repeated across four sub-components — uniformity, not intent
`components/event-sheet.tsx:538, components/date-field.tsx:93-95, components/time-range-field.tsx:224-226, components/color-picker.tsx:61-63`  ·  *motion·Emil*  ·  Eff M
- **Macht:** Reserve blur for the one transition that genuinely needs it (the time/date popovers are the best candidates). Let the rest enter on opacity + a small y alone. For reduced-motion correctness, gate the blur behind useReducedMotion() so it collapses to the end state.
- **Warum gut:** The same filter:'blur(4px)' enter pattern appears on edit fields, the DateField month popover, the TimeCombo suggestion list, and the ColorPicker check mark — four distinct components in one surface. Emil reaches for blur only 'when nothing else works' to mask a rough transition; here it's the default polish coat. Crossing ≥3 components is the anti-checklist's blur-everywhere tell. Note also that MotionConfig reducedMotion="user" only neutralizes transform/layout, so these JS-driven blur tweens still run under reduced motion (the global CSS media query doesn't catch framer-driven filter).

### 64. 🟠 [medium] ColorPicker check pops from scale(0.25) — below Emil's scale(0.9) floor
`components/color-picker.tsx:60-67`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Start the check from scale(0.85-0.9), opacity 0, no blur, ~150ms. The icon should feel like it settles into place, not inflate from nothing.
- **Warum gut:** The selected-swatch checkmark animates initial/exit scale:0.25 with blur(4px). Emil's tip #2 is explicit: don't animate from scale(0) — starting below ~0.9 reads as an unnatural zoom rather than an appearance. Combined with the 0.25→1 jump plus blur, a tiny confirmation icon does a lot of motion for a frequent, low-stakes action (picking a color).

### 65. 🟠 [medium] Step 0 fills only the top third of a full-height sheet
`components/event-sheet.tsx:441,558`  ·  *craft*  ·  Eff M
- **Macht:** Either anchor the wizard content to the top and visually acknowledge the empty zone (e.g. a faint live preview of the event block that the color picker already renders), or give the sheet content a max-height and let it sit nearer its true size instead of stretching edge-to-edge. The point is to make the emptiness intentional, not incidental.
- **Warum gut:** The aside is `inset-y-0` (full ~1250px viewport height, line 441) but the step-0 wizard pane (`absolute inset-0 ... px-6 py-6`, line 558) renders only the segmented toggle, the title input and the date field (lines 560-595). In both screenshots content stops at roughly y=470 and the remaining ~700px below the date field is empty. On a resizable, deliberately wide panel this reads as an unfinished form rather than a focused one.

### 66. 🟠 [medium] The 3-step scope is barely legible — two of three tracks are near-invisible
`components/event-sheet.tsx:506,518`  ·  *craft*  ·  Eff S  ·  buildTool: storyboard
- **Macht:** Lift the inactive track to something like `bg-border` or a 15-20% foreground tint so all three segments are clearly present from step 0, and raise future-step labels from /60 toward /80. The user should be able to count the steps at a glance.
- **Warum gut:** Inactive step tracks use `bg-muted` (line 506) and future labels use `text-muted-foreground/60` (line 518). In both screenshots only the first track (Eckdaten) reads as a solid bar; the Uhrzeit and Details tracks are almost imperceptible and their labels are very low-contrast. The whole value of a stepper — telling the user how much is ahead — is undercut when the remaining steps visually vanish.

### 67. 🟠 [medium] Disabled 'Weiter' gives no cue that a title is what unlocks it
`components/event-sheet.tsx:661,305`  ·  *craft*  ·  Eff S
- **Macht:** Keep `Weiter` enabled and surface inline validation on click (you already have the `error` channel and `setError`), or add a quiet helper/required affordance on the title. Either makes the blocked path self-explanatory instead of silently dead.
- **Warum gut:** On a fresh open `Weiter` is disabled (`disabled={step === 0 && !titleOk}`, line 661) and renders as a flat gray block, as seen in the light screenshot. The required field — the title — is a borderless input whose only prompt is a 35%-opacity placeholder (`placeholder:text-muted-foreground/35`, line 305) with no label and no required marker. Nothing connects the dead CTA to the empty title. A user who clicks away from the auto-focused field is left with a gray button and no explanation.

### 68. 🟢 [low] Color-select moment stacks two attention-grabbing motions (bounce ring + scale(0.25) check pop)
`components/color-picker.tsx:55, components/color-picker.tsx:61-64`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Pick one motion to carry the moment. Drop the ring's bounce to 0 for consistency with the rest of the surface, and start the checkmark from scale ~0.7 (not 0.25) or just opacity+blur — so the confirmation feels crisp, not bouncy. Jakub reserves bounce>0 for genuinely playful contexts; on a productivity color picker bounce:0 is the production default.
- **Warum gut:** Picking a swatch fires two simultaneous animations: the layoutId='color-ring' glides with type:'spring', bounce:0.15 (color-picker.tsx:55) AND the checkmark pops in from initial scale:0.25 + blur(4px) (color-picker.tsx:61-64). The bounce:0.15 is the only spring in the whole surface that isn't bounce:0 (kind-pill, step-track and the Switch all use bounce:0), so it reads as an inconsistency rather than intent; and scale(0.25) is a near-scale(0) pop that draws the eye. Together a single utility tap produces a noticeable little flourish.

### 69. 🟢 [low] Ganztags crossfade uses mode='wait' with no height transition — content area snaps while it fades
`components/event-sheet.tsx:357-380`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Either drop mode='wait' so the states crossfade concurrently (faster, no empty gap) and wrap the swap in a layout transition so the height eases, or animate the container height. Small change, but it removes the only visible 'snap' in the time step.
- **Warum gut:** Toggling Ganztags swaps a short dashed py-10 placeholder against the full TimeRangeField inside AnimatePresence mode='wait' with opacity-only transitions (event-sheet.tsx:357-380). mode='wait' makes it sequential (0.2s out, then 0.2s in ≈ 0.4s of dead time), and because the two states have very different heights and nothing animates the height, the block jumps size while it crossfades. The opacity is smooth but the layout pop underneath it is the unpolished part.

### 70. 🟢 [low] Figure-8 handle teleports on preset click — the obvious 'what could this become' delight is left on the table
`components/infinity-slider.tsx:152,199-209`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** When value changes externally (preset click / keyboard), tween t along the path rather than setting it directly: animate the parameter and recompute point(t) each frame so the handle sweeps the curve. This is pure upside delight with no usability cost on a low-frequency action, and it teaches the user the path↔shade mapping by showing it move.
- **Warum gut:** The handle position (hp = point(t)) is written straight to the <circle> cx/cy from React state, and only r and fill carry a 160ms transition — cx/cy do not. So when you click a preset swatch and the active shade jumps to a new point on the lemniscate, the handle snaps instantly across the loop instead of traveling along it. The whole figure-8 control is a playful, on-brand creative experiment (Jhey's favorite kind of build) and the single moment that would make it sing — the dot gliding around the curve to its new shade — is the one motion that's missing.

### 71. 🟢 [low] Selection ring uses spring bounce 0.15 on a utility color pick
`components/color-picker.tsx:50-56`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Set bounce:0 to match the kind-pill and step-track sliders. The ring gliding between swatches is the satisfying part; the overshoot adds nothing functional.
- **Warum gut:** The layoutId='color-ring' transition is type:'spring', bounce:0.15. The anti-checklist flags any bounce>0 on a utility selection. Every other layoutId in this surface (kind-pill, step-track) correctly uses bounce:0 — the ring is the lone overshoot. It's a small wobble, but it's the one inconsistency in an otherwise no-bounce system.

### 72. 🟢 [low] Ganztags ↔ Uhrzeit swap uses mode="wait" — a blank beat between states
`components/event-sheet.tsx:357-380`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Drop mode="wait" so the crossfade overlaps, or shorten each leg to ~120ms. The content occupies the same region — there's no spatial reason to serialize exit before enter.
- **Warum gut:** AnimatePresence mode="wait" means the outgoing block fully fades (0.2s) before the incoming one starts (0.2s), so toggling Ganztags leaves an empty ~0.2s gap before the time picker or the dashed placeholder appears. For a same-slot content swap, a wait-then-enter feels slower than the toggle itself.

### 73. 🟢 [low] Three input groups, two labeling conventions
`components/event-sheet.tsx:298,313,563`  ·  *craft*  ·  Eff S
- **Macht:** Pick one rhythm: either drop the DATUM label (the calendar icon + formatted date is already self-describing) so step 0 reads as three label-free fields, or add lightweight labels to the toggle/title for symmetry. Consistency here costs nothing and tightens the form.
- **Warum gut:** Within step 0 the date field carries an uppercase `DATUM` Label (line 313), but the title field (lines 298-308) and the Einmalig/Wöchentlich segmented control (line 563) carry no label at all. So one of three field groups is labeled and two are not, with no functional reason — the eye expects either all-labeled or all-self-evident.

### 74. 🟢 [low] Title input uses an underline idiom while every other field is a boxed pill
`components/event-sheet.tsx:299,55`  ·  *craft*  ·  Eff S
- **Macht:** If the heading treatment is intentional, lean into it — give the title a touch more breathing room from the boxed fields below so it reads as a header, not a field that forgot its border. Otherwise unify it into the boxed style for one consistent input language.
- **Warum gut:** The title field is a bottom-border-only input (`border-b border-border pb-2.5`, line 299) at 22px, whereas Datum, Ort and Notiz all use the shared boxed `inputCls` (`h-11 rounded-xl border bg-background`, line 55) and DateField mirrors it. The form therefore mixes a heading-style underline with rounded boxed fields. It's a defensible choice (title-as-headline), but on the same screen as the boxed date field the two idioms sit a little uneasily.

### 75. 🟢 [low] Selected segment relies on a shadow that barely reads on dark surfaces
`components/event-sheet.tsx:582`  ·  *craft*  ·  Eff S
- **Macht:** Add a hairline border or a subtle lightening on the selected pill in dark (e.g. a `ring-1 ring-border` or slightly raised background) so the active segment holds the same clarity it has in light mode.
- **Warum gut:** The active Einmalig/Wöchentlich pill is `bg-card shadow-sm` over a `bg-muted` track (lines 563, 582). In dark mode card and muted are both dark, so the selected-vs-unselected distinction leans almost entirely on a soft `shadow-sm`. In the dark screenshot the selected 'Einmalig' pill is differentiated, but only just — the boundary is faint compared to the crisp selection in light mode.

### 76. ⚪ [nit] Press-scale drifts between 0.96 and 0.92 across the sheet's sub-components
`components/color-picker.tsx:47, components/date-field.tsx:147, components/time-range-field.tsx:172`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Pick one press-scale token and apply it everywhere in the sheet (0.96 per the established standard), or if smaller controls intentionally press deeper, make that a documented rule tied to element size rather than ad-hoc per component.
- **Warum gut:** The sheet's own buttons press to active:scale-[0.96] (close button event-sheet.tsx:483, weekday pills :328), but the embedded sub-components press to active:scale-[0.92] — color swatches (color-picker.tsx:47), date-grid cells (date-field.tsx:147), and the time steppers (time-range-field.tsx:172). The repo history shows press-scale was explicitly standardized to 0.96, so the 0.92 instances read as drift rather than a deliberate size-based choice. Jakub allows context-driven timing, but inconsistent feedback on the same press gesture within one surface is the kind of thing users feel without naming.

### 77. ⚪ [nit] Color check-mark pops in from scale(0.25) — effectively from zero
`components/color-picker.tsx:60-68`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Raise the initial scale to ~0.6-0.8 (keep the blur+opacity for the soft entry). The check still reads as a satisfying confirm-pop without the from-zero balloon. Counterweight note only — the delight intent here is correct, just over-scaled.
- **Warum gut:** The selected-swatch checkmark animates initial={{ scale:0.25, opacity:0, filter:'blur(4px)' }} to scale:1. 0.25 is close enough to scale(0) that it reads as a pop from nothing — the anti-checklist's Emil-counterweight rule says start interactive elements at 0.9+ for natural motion. The spring has bounce:0 so it's not bouncy, just an aggressive grow.

### 78. ⚪ [nit] Header color-dot animates, but the live preview tint it should rhyme with updates instantly
`components/event-sheet.tsx:471-476`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Unify the retint timing — give the .ev-tint preview block the same ~0.3s color transition as the header dot (and ideally the ribbon) so a shade pick reads as one synchronized wave of color across the sheet rather than three independent fades. Small touch, but it's the kind of cohesion that turns a nice spark into a signature.
- **Warum gut:** The header dot's animate={{ backgroundColor: color }} (0.3s) is the single best personality spark on this surface — picking a shade smoothly retints it across all three steps. But the ColorPicker's own live-preview block (.ev-tint, color-picker.tsx:81) and the figure-8 ribbon stroke (160ms) update on a different cadence, so the same color change ripples through three elements at three speeds. Through Jhey's lens this is a near-miss on a coherent 'color comes alive' moment.

### 79. ⚪ [nit] Header color dot crossfades color but isn't reduced-motion gated
`components/event-sheet.tsx:471-476`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Leave the crossfade as-is for the default case; if you want full reduced-motion fidelity, snap the color instantly via useReducedMotion(). Low priority — flagging only for consistency with the rest of the gating work.
- **Warum gut:** The header dot animates backgroundColor over 0.3s when the event color changes. The intent (tying the chosen color to the header across steps) is sound and purposeful. But backgroundColor isn't a transform, so MotionConfig reducedMotion="user" leaves it animating; it's the same blind spot as the blur tweens. Harmless visually (a color crossfade isn't a vestibular trigger), just inconsistent with the otherwise-thorough reduced-motion handling.

### 80. ⚪ [nit] Live color dot is too small to do its job
`components/event-sheet.tsx:471`  ·  *craft*  ·  Eff S
- **Macht:** Bump the dot a couple px (size-3 / ~12px) or pair it with the title text color so the live-color signal is actually felt before the user reaches the color step.
- **Warum gut:** The header color dot (`size-2.5`, ~10px, line 471) animates to mirror the chosen event color across all steps — a genuinely thoughtful touch the code comment explicitly calls out as 'macht die Auswahl präsent'. At 10px next to an 18px title it's barely noticeable, so the payoff of carrying the color forward through steps 1-2 is mostly lost.


## Termin-Sheet + Eingabefelder (event-sheet)  ·  5 Befunde  (0h/2m/2l/1n)

### 81. 🟠 [medium] Press scale 0.92 violates the 0.95 floor in field components
`components/color-picker.tsx:47, components/date-field.tsx:105,116,147, components/time-range-field.tsx:172`  ·  *mifb*  ·  Eff S
- **Macht:** Raise all active:scale-[0.92] in color-picker, date-field and time-range-field to active:scale-[0.96] to match the rest of Atlas.
- **Warum gut:** Color swatches use active:scale-[0.92] (color-picker.tsx:47), date-field month chevrons and day cells use active:scale-[0.92] (date-field.tsx:105/116/147), and the time stepper uses active:scale-[0.92] (time-range-field.tsx:172). Principle 12 says never below 0.95 — anything smaller feels exaggerated. The main app was explicitly standardized to 0.96 (commit d4daeb8 'einheitliche press-scale (0.96)'), so these newer components are both rule-breaking and inconsistent with the rest of the surface (event-sheet.tsx buttons correctly use active:scale-[0.96]).

### 82. 🟠 [medium] Several interactive controls fall below the 40x40 hit area minimum
`components/event-sheet.tsx:483, components/color-picker.tsx:47, components/date-field.tsx:105,116,147`  ·  *mifb*  ·  Eff M
- **Macht:** Bump the close button to size-10 to match the delete button; extend the swatch and date-nav hit areas with a transparent pseudo-element / padding to reach 40x40 without enlarging the visible dot/chevron.
- **Warum gut:** Close button is grid size-9 = 36x36 (event-sheet.tsx:483) while the sibling delete button is size-10 = 40 (event-sheet.tsx:632), so even within the same sheet they disagree. Color swatches are size-8 = 32x32 (color-picker.tsx:47), date-field month-nav chevrons are size-8 = 32x32 (date-field.tsx:105/116), and calendar day cells are h-9 = 36px tall (date-field.tsx:147). The time-range steppers (time-range-field.tsx:199, w-7 split vertically inside an h-12 field) are roughly 28x20 each. All are below the 40x40 target.

### 83. 🟢 [low] Duration label lacks tabular-nums and shifts as time changes
`components/time-range-field.tsx:301`  ·  *mifb*  ·  Eff S
- **Macht:** Add tabular-nums to the duration <p> at time-range-field.tsx:301.
- **Warum gut:** The duration line `Dauer · ${durLabel(dur)}` at time-range-field.tsx:301 has no tabular-nums, yet it updates live while the user nudges start/end (e.g. '1 Std 30 min' -> '45 min'). Every other number on this surface — the time inputs, dropdown sub-labels, the date field — already uses tabular-nums, so this one is the inconsistent outlier and can cause a small horizontal jitter on this centered line.

### 84. 🟢 [low] Create-flow content enters as one block; only edit mode is split/staggered
`components/event-sheet.tsx:535,560`  ·  *mifb*  ·  Eff M
- **Macht:** Reuse the same staggered motion.div wrapper for the create-step children (or stagger the step-0 chunks) so both modes share the same entrance polish.
- **Warum gut:** In edit mode each field is wrapped in a motion.div with delay 0.04 + i*0.05 (event-sheet.tsx:535-540), giving a polished staggered reveal. The create wizard step 0 (event-sheet.tsx:560-595) renders the toggle, title and date as a single static block inside the sliding panel — when the sheet first opens there is no internal stagger, so the create entrance feels flatter than the edit entrance despite being the more common path.

### 85. ⚪ [nit] Time-stepper inner radius not concentric with input
`components/time-range-field.tsx:171,199`  ·  *mifb*  ·  Eff S
- **Macht:** Change the stepperBtn radius from rounded-md to rounded-lg.
- **Warum gut:** The time input is rounded-xl (12px) and the stepper buttons sit at inset-y-1 right-1 (4px inset) with rounded-md (6px) (time-range-field.tsx:171/199). For concentricity the inner radius should be 12 - 4 = 8px (rounded-lg), not 6px. Minor, only visible on close inspection at the rounded corner where the up-arrow button meets the field edge.


## settings  ·  23 Befunde  (5h/6m/8l/4n)

### 86. 🔴 [high] Letter-by-letter SplitText on the settings title is a conscious, showy effect on static content
`components/stagger.tsx:55-63 (rendered at app/settings/page.tsx:35)`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Drop SplitText on the settings title. Let the heading appear instantly (or inherit only the single parent StaggerItem fade). Reserve letter-split reveals for a hero/marketing moment, not a productivity page header the user opens repeatedly.
- **Warum gut:** The H1 "Einstellungen" is split into characters that each blur-in (blur(6px)->0, y14->0, 0.55s) with staggerChildren 0.045 + delayChildren 0.12, so the word visibly assembles letter by letter over ~0.6s. This is the anti-checklist 'motion-on-mount-for-static-content' tell — a heading that should read instantly is instead a performance. It also compounds: the heading sits inside a StaggerItem (stagger.tsx:20-28, 0.7s blur/translate) AND runs its own SplitText orchestration, so two overlapping animations fight on the same element. Jakub's test ('if users comment "nice animation!" every time, it is too prominent') fails here.

### 87. 🔴 [high] Full-page entrance is too long and uniform for a repeat-visit utility surface
`components/stagger.tsx:16,25`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Tighten to ~0.32-0.4s per item and a ~0.06-0.08s stagger, and reduce blur to ~3px. Keep the recipe but make the whole list settle in under ~0.5s so it reads as 'smooth arrival,' not a sequence the user watches.
- **Warum gut:** container staggerChildren 0.14 + delayChildren 0.08, item duration 0.7s with blur(6px)+y18. The four cards (header, Profil, Erscheinungsbild, Konto) all share the identical enter recipe, so the last card starts at ~0.5s and the page is not fully settled until ~1.2s. That trips 'uniform-fade-in-on-every-element' (>=4 components, identical opacity/translateY/blur/duration). Jakub allows longer durations for polish, but his explicit constraint — 'when users interact repeatedly, animations must not get tiresome' and 'the best animation goes unnoticed' — is violated: a 1.2s blur-assembly every time you open Settings is consciously noticeable and slow.

### 88. 🔴 [high] Per-letter SplitText reveal on the "Einstellungen" heading
`components/stagger.tsx:50-63 + app/settings/page.tsx:35`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Drop SplitText here entirely. Render the heading as static text. Emil's frequency rule: settings is a repeat-visited utility surface where users have a clear goal and don't expect to be delighted. If any entrance is wanted, let the heading inherit the parent section fade only, no character split.
- **Warum gut:** The settings H1 is rendered via <SplitText text="Einstellungen" />, which splits the word into 12 individual motion.spans, each entering with opacity 0 -> 1, y 14 -> 0 and filter blur(6px) -> 0 over 0.55s, staggered by 0.045s with delayChildren 0.12. The title literally spells itself out letter by letter on a settings page. This is the anti-checklist 'motion-on-mount-for-static-content' pattern: a text-only element whose motion's only purpose is the entrance itself. Atlas is a productivity tool; a settings heading is reference content the user scans, not a hero or narrative moment.

### 89. 🔴 [high] Section stagger entrance is 700ms and settles in ~1.2s on a utility page
`components/stagger.tsx:13-28`  ·  *motion·Emil*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Cut duration to ~0.18-0.22s and staggerChildren to ~0.04-0.05s (or drop the stagger and fade the whole panel at once). The page should be readable and settled in under 300ms total. Use DialKit to feel the timing rather than guess.
- **Warum gut:** StaggerItem uses duration: 0.7 (700ms) with container staggerChildren: 0.14 and delayChildren: 0.08. With four staggered children (header, Profil, Erscheinungsbild, Konto) the last card finishes around 0.08 + 3*0.14 + 0.7 ~= 1.2s. Emil: 'UI animations should generally stay under 300ms; 180ms feels more responsive than 400ms.' 700ms per item is more than 2x the ceiling, and stacking settings sections behind a sequential reveal is the 'stagger-spam-on-every-list' tell, settings options are a static utility list, not a deliberate moment.

### 90. 🔴 [high] Active theme tile reads weaker than inactive ones in light mode
`app/settings/page.tsx:70-85`  ·  *craft*  ·  Eff S
- **Macht:** Make the selected tile unambiguously dominant in light: e.g. ring-2 ring-primary (or bg-primary/8 + border-primary) for the active tile, and drop or lighten the unselected border so inactive tiles read as the quieter state. The active option must carry more visual weight than the inactive ones in both themes.
- **Warum gut:** In the light screenshot the selected "Hell" tile shows no visible container while the two unselected tiles ("Dunkel", "System") carry visible light-gray borders — the active choice is the least prominent of the three. Code: the selected tile sets border-transparent (L74) and overlays a motion.span with border-primary + bg-accent (L80-84). In light mode --accent is oklch(0.97 0 0) against --card oklch(1 0 0) — a ~3% delta that is effectively invisible — so the fill contributes no weight and the tile collapses to plain bold text. Dark mode works (accent 0.285 vs card 0.205, primary border near-white), which is why the inversion is light-mode only.

### 91. 🟠 [medium] Theme-button hover changes background instantly because background-color is excluded from the transition
`app/settings/page.tsx:71,74`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Add background-color to the transition, e.g. transition-[color,background-color,transform] (or transition-colors plus a transform transition), at ~150ms so the hover fill fades in with the text.
- **Warum gut:** className is transition-[color,transform] but the non-selected hover state sets both hover:text-foreground (color, transitions) and hover:bg-accent/50 (background-color, NOT in the transition list). So on hover the text color eases while the background fill snaps in hard — half the hover transitions, half jumps. Jakub: 'ignoring hover state transitions — even small 150-200ms transitions feel more polished than instant changes.'

### 92. 🟠 [medium] Theme-indicator spring is slightly underdamped (bounce) on a utility control
`app/settings/page.tsx:83`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Raise damping to ~44-48 (critically/over-damped) at the same stiffness, or use Framer's bounce:0 spring, so the indicator decelerates cleanly into place with no overshoot.
- **Warum gut:** The sliding layoutId='theme-active' indicator uses transition spring stiffness 500 / damping 38. With default mass 1, critical damping is ~44.7, so the damping ratio is ~0.85 — underdamped, producing a small settle wobble at the end of the slide. The anti-checklist flags 'bouncy-springs-on-utility-actions' (any bounce>0 on a toggle/segmented control), and Jakub's rule is 'bounce:0 is the production default; bounce above zero reads as playful.' The slide itself is the right idea; the residual wobble is the off-note.

### 93. 🟠 [medium] InfinitySlider jewel teleports instead of gliding the figure-8 on external value change
`components/infinity-slider.tsx:95-97, 200-209`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** When the change is NOT a live drag (draggingRef.current === false), tween `t` from its current value to the target theta along the path so the jewel visibly travels the figure-8 to its new shade. Use framer-motion's animate() or a short rAF tween (~280-360ms, var(--ease-atlas)); keep the existing instant apply() during pointermove so dragging stays direct. This turns a snap into the signature 'watch it ride the eight' moment Jhey would reach for, and reinforces that position == shade.
- **Warum gut:** The handle position is derived from React state `t` and rendered as SVG cx/cy (hp = point(t)). The transitions declared on the handle circles cover only `r`, `fill`, and `stroke` (lines 196,200,208) -- never cx/cy. When `value` changes externally (a preset click in the color picker), the useEffect at L95 calls sync(thetaFromShade(value)) which snaps `t` to the new theta, so the jewel jumps across the canvas in one frame. The whole point of the lemniscate is a spatial model of shade-space; teleporting discards it.

### 94. 🟠 [medium] "Einstellungen" heading is animated by two competing motion systems at once
`app/settings/page.tsx:26-36; components/stagger.tsx:20-28, 50-63`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Pick one owner for the heading's entrance. Either drop SplitText here and let the StaggerItem carry the header as a unit, or give the header StaggerItem no inner motion (plain opacity) and let SplitText own the reveal. Layering two blur+translate systems on one text node muddies both -- one deliberate gesture lands harder than two overlapping ones.
- **Warum gut:** The header block is a <StaggerItem> (opacity + y:18 + blur(6px), duration 0.7s, delay via staggerChildren 0.14/delayChildren 0.08). Inside it the <SplitText text="Einstellungen"> independently runs its own orchestration (per-letter opacity + y:14 + blur(6px), duration 0.55s, delayChildren 0.12). So the same letters get blurred+translated by the parent transform AND their own per-char transform on two unsynced timelines -- a muddy, double-blurred compound reveal where neither motion reads cleanly.

### 95. 🟠 [medium] blur(6px) on text-bearing entrances delays first-paint readability
`components/stagger.tsx:21 + components/stagger.tsx:56`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Remove the blur from text entrances; a short opacity + small translateY (y: 8) is enough. Reserve blur for genuinely rough transitions (e.g. content swaps), not mount-in of reference text.
- **Warum gut:** Both the section item (hidden: filter blur(6px), line 21) and every SplitText character (hidden: filter blur(6px), line 56) start blurred. Combined with the 700ms / 0.55s durations, the settings heading and body copy ('Profil', 'Deine Kontodaten', the email) are unreadable for the first several hundred ms of the visit. The anti-checklist flags blur on text-bearing entrances 'where it impairs first-paint readability'. Emil's own tip frames blur as a mask for rough state transitions, not a default coat on static settings text.

### 96. 🟠 [medium] Slider satin depth and handle elevation vanish in dark mode
`components/infinity-slider.tsx:196,200`  ·  *craft*  ·  Eff M  ·  buildTool: dialkit
- **Macht:** Theme the shadows — use a token or color-mix that switches to a subtle light glow / stronger spread on dark, or drive shadow color from currentColor opacity. The geometry, shade ranges (L_MIN/L_MAX/C_MIN/C_MAX), handle radii and the 1400 continuity penalty are also prime live-tuning candidates.
- **Warum gut:** Both the band and handle use hardcoded black drop-shadows — drop-shadow(0 1px 2px rgba(0,0,0,0.18)) on the ribbon (L196) and drop-shadow(0 1px 4px rgba(0,0,0,0.22)) on the white handle grommet (L200). On the dark card (--card oklch(0.205)) a black shadow is invisible, so the intended "Juwel"/satin 3D elevation the comments describe is lost and the handle flattens against the band.

### 97. 🟢 [low] No exit motion — cards vanish instantly on navigate-away
`app/settings/page.tsx:24-114 (StaggerItem has no exit variant, stagger.tsx:20-28)`  ·  *motion·Jakub*  ·  Eff M
- **Macht:** If you keep an entrance this prominent, add a quick subtle exit (opacity->0, y:-6, ~0.15-0.2s, no blur) via a route/page AnimatePresence — or, simpler and more in line with Jakub, lighten the entrance (findings above) so the missing exit no longer feels imbalanced.
- **Warum gut:** The page invests heavily in a choreographed entrance but the StaggerItem variants define only hidden/visible — no exit — and there is no AnimatePresence around the route. Clicking 'Zurück zum Kalender' hard-cuts the whole surface. Jakub's principle is that exits should exist but be subtler than enters; here the asymmetry is total (rich enter, zero exit), which makes the heavy entrance feel even more one-sided.

### 98. 🟢 [low] InfinitySlider handle has hover growth but no grab/press feedback, and keyboard steps are imperceptibly small
`components/infinity-slider.tsx:200,208,166-173`  ·  *motion·Jakub*  ·  Eff M
- **Macht:** Add a momentary press state on pointer-down (e.g. handle r bump or a faint ring) for grab confirmation, and make each arrow keypress move several samples (e.g. step of ~4-6, larger with Shift) so keyboard nudges are visible and usable.
- **Warum gut:** The handle grows on hover (r 10.5->11.5 / 6.5->7.5, transition r 160ms ease-atlas) — nice and subtle — but there is no distinct active/grabbing state on pointer-down, so picking up the handle gives no tactile confirmation. Separately, arrow keys advance t by a single sample (TAU/320 per press, infinity-slider.tsx:170), so one keypress moves the handle a sub-pixel amount along the path — keyboard adjustment feels broken rather than precise. (Note: this control is not actually mounted on the settings page; it renders in the event/color picker.)

### 99. 🟢 [low] Handle has no distinct "grabbed" state -- grabbing looks identical to hovering
`components/infinity-slider.tsx:133-152, 200-209`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Add a `grabbing` state set in onDown / cleared in up, and give the jewel a small but distinct grabbed treatment -- e.g. a slightly tighter bezel + a touch more drop-shadow lift, or r bumped past the hover size with a quick spring. It's a tiny tactile cue that makes the handle feel alive under the finger.
- **Warum gut:** The only handle state change is `hot` (set on pointerEnter/Leave), which grows r by ~1px. onDown (L133) sets draggingRef but never changes any visual state, so the moment of grabbing produces no feedback distinct from a passive hover. A control whose entire identity is a draggable jewel should feel like it reacts to being seized.

### 100. 🟢 [low] Page entrance is heavy for a surface users re-open often
`components/stagger.tsx:13-28; app/settings/page.tsx:24-114`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Tighten the entrance: drop item duration toward ~0.4-0.45s, stagger toward ~0.07-0.09s, and ease the blur down to ~3-4px. Keep the choreography (it's nice), just stop it from announcing itself on every return trip. Worth tuning the four values live rather than guessing.
- **Warum gut:** Four cards stagger in at staggerChildren 0.14 + 0.7s duration each with blur(6px), so the last card doesn't settle until roughly delayChildren 0.08 + 3*0.14 + 0.7 ≈ 1.2s, and SplitText adds its own ~0.7s reveal on top. Jhey's own golden rule is that the best animation goes unnoticed and 'doesn't fatigue users on repeated interactions' -- a 0.7s-per-card blur cascade on a settings page is theatrical the first time and a wait every subsequent visit.

### 101. 🟢 [low] Keyboard-operable slider has no visible focus state
`components/infinity-slider.tsx:156-177, 199-209`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Mirror the hover affordance for focus: track a `focused` state (onFocus/onBlur) and OR it with `hot` when sizing/highlighting the jewel, or add a focus-visible ring to the handle. The figure-8 is a genuinely playful control -- making it keyboard-legible keeps the delight inclusive instead of pointer-only.
- **Warum gut:** The <svg> has tabIndex=0, role="slider" and full arrow-key handling (L166-173), but nothing in the render reacts to focus -- no focus ring on the svg, and the jewel's enlarged/highlighted look is driven only by `hot` (pointer hover). A keyboard user who tabs to the control and arrows along the eight gets no indication of where the handle or focus is.

### 102. 🟢 [low] Theme-toggle sliding indicator spring is underdamped and overshoots
`app/settings/page.tsx:83`  ·  *motion·Emil*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** If you want Emil-pure restraint on the utility control, raise damping to ~45 (critically damped) or use a tween with --ease-atlas around 200ms so the indicator glides to rest without overshoot. Leave as-is only if the slight settle is an intentional signature.
- **Warum gut:** The layoutId="theme-active" indicator that slides between Hell/Dunkel/System uses transition={{ type: 'spring', stiffness: 500, damping: 38 }}. Critical damping for stiffness 500 (mass 1) is ~44.7, so damping 38 is underdamped (ratio ~0.85) and the indicator overshoots its target slightly before settling, the 'bouncy-springs-on-utility-actions' pattern on a theme toggle. The sliding shared-element itself is good (orientation + continuity, defensible), and theme switching is a rare interaction where Emil permits some delight, so this is minor.

### 103. 🟢 [low] Slider exposes meaningless screen-reader values
`components/infinity-slider.tsx:161-164`  ·  *craft*  ·  Eff S
- **Macht:** Add aria-valuetext describing the current shade in human terms (e.g. "hell, satt" / a lightness+saturation phrase), so the announced value is meaningful rather than a path-sample number.
- **Warum gut:** role="slider" announces aria-valuemin=0 / aria-valuemax=320 / aria-valuenow=raw sample index (L162-164) with no aria-valuetext. A screen reader reads out an abstract integer 0–320 that maps to nothing the user understands; the control actually varies lightness and saturation.

### 104. 🟢 [low] Profile card looks interactive but is fully static
`app/settings/page.tsx:41-55`  ·  *craft*  ·  Eff S
- **Macht:** Either add a clear edit affordance (or a quiet "bald" badge like the Konto card uses) so the static nature is intentional, or visually demote it from a peer card to a lighter read-only block to set the right expectation.
- **Warum gut:** The Profil section is a bordered card (the same shell as the actionable Erscheinungsbild and Konto cards) showing name, role and email, but offers no edit control, avatar action, or hover affordance. It restates the identity already shown in the sidebar footer (name + "Schüler"), so it reads as something you can act on while doing nothing.

### 105. ⚪ [nit] Theme-pill spring is underdamped -- slight overshoot on a utility toggle
`app/settings/page.tsx:79-84`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** If you want it perfectly crisp (Emil counterweight), raise damping to ~44-46 for a settle-without-bounce. If you like the slight life it has now, leave it -- it's a single low-frequency control and the overshoot is gentle. Either is defensible; just make it a choice rather than an accident.
- **Warum gut:** The sliding active indicator uses transition={{ type: 'spring', stiffness: 500, damping: 38 }}. Critical damping for stiffness 500 (mass 1) is ~44.7, so damping 38 is underdamped and the pill overshoots/settles back on each theme switch. The anti-checklist flags bouncy springs on utility actions; through Jhey's lens a hair of overshoot on a sliding pill is actually on-brand and pleasant, so this is taste, not a defect.

### 106. ⚪ [nit] InfinitySlider handle color eases (160ms) instead of tracking the drag directly
`components/infinity-slider.tsx:208`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Keep the 160ms transition for r/fill on hover and keyboard nudges, but suppress the fill transition while draggingRef.current is true (e.g. set transition: 'none' during drag) so the core color tracks the pointer 1:1.
- **Warum gut:** The handle core circle has style transition: 'r 160ms ..., fill 160ms var(--ease-atlas)'. During an active pointer drag, fill={value} updates continuously, so the 160ms fill transition makes the handle's core color visibly lag the pointer, the color trails the position by a fraction of a second while dragging. Emil's guidance for drag is direct, untransitioned updates (CSS variables / transitions cause the value to chase rather than track). Note: this control is not actually mounted on the settings page (settings/page.tsx does not import InfinitySlider; it lives in the event color picker), so impact on this surface is nil, flagged because it is a listed source file.

### 107. ⚪ [nit] "BALD" badge inside the Abmelden button is 9px
`app/settings/page.tsx:109`  ·  *craft*  ·  Eff S
- **Macht:** Bump to text-[10px]/text-[11px] to match the sidebar badge and stay legible; keep one badge size across the app.
- **Warum gut:** The inline badge uses text-[9px] uppercase (L109), well below comfortable legibility; the same "BALD" marker in the sidebar renders at a readable size, so the two instances of the same label are inconsistent in scale.

### 108. ⚪ [nit] Page title under-scaled for the canvas
`app/settings/page.tsx:34`  ·  *craft*  ·  Eff S
- **Macht:** Consider text-2xl for the page title (or vertically center the max-w-2xl column) so the entry point feels deliberate rather than top-pinned in a large empty frame.
- **Warum gut:** The h1 "Einstellungen" is text-xl (20px) (L34) sitting at the top of a 1440-wide viewport whose lower ~40% is empty. The title is only modestly larger than the 15px profile name and reads timid against the surrounding void.


## Einstellungen (settings)  ·  5 Befunde  (0h/2m/2l/1n)

### 109. 🟠 [medium] Slider handle bezel + drop-shadows hardcoded for light mode
`components/infinity-slider.tsx:200, :207, :196`  ·  *mifb*  ·  Eff M  ·  buildTool: dialkit
- **Macht:** Drive the bezel fill and shadow colors from theme tokens (e.g. a CSS var that is rgba(0,0,0,.22) in light and rgba(0,0,0,.5)/a subtle white ring in dark), or layer a second light-colored shadow so the handle reads on both backgrounds.
- **Warum gut:** Handle outer circle is fill="#fff" and inner circle stroke="#fff", with drop-shadow(0 1px 4px rgba(0,0,0,0.22)) on the bezel and rgba(0,0,0,0.18) on the ribbon. In dark mode a pure-black drop-shadow on a dark surface is invisible, so the handle loses its lift; in light mode a #fff bezel on a near-white card is only separated by that same faint shadow. The shadow does not adapt to the background as the principle requires.

### 110. 🟠 [medium] „Zurück zum Kalender“ back link has a sub-40px hit area
`app/settings/page.tsx:27-33`  ·  *mifb*  ·  Eff S
- **Macht:** Add vertical padding (e.g. -mx-2 px-2 py-2 to keep the visual position) or a pseudo-element to extend the tap target to >=40px tall.
- **Warum gut:** The link is inline-flex items-center gap-1 text-sm with no vertical padding; rendered text+icon height is ~20px, well under the 40×40 minimum. It is the only way back from this page.

### 111. 🟢 [low] Slider animates non-composited SVG properties (r, stroke, fill)
`components/infinity-slider.tsx:200, :208, :196`  ·  *mifb*  ·  Eff M
- **Macht:** Animate the handle grow via a transform: scale on a wrapped <g> (transform-box/transform-origin) instead of r, keeping color cross-fades but avoiding per-frame radius repaints. No transition:all is used, which is good.
- **Warum gut:** Transitions are set on r ("r 160ms"), fill and stroke. These are paint/layout properties the GPU cannot composite, so the hover-grow and color change repaint each frame instead of riding on transform/opacity/filter.

### 112. 🟢 [low] Card sections nest rounded-lg/md children inside rounded-xl without concentric step
`app/settings/page.tsx:42, :60, :71, :97`  ·  *mifb*  ·  Eff S
- **Macht:** Consider rounded-2xl (16px) on the section cards so the outer radius better matches the generous p-5 padding; inner rounded-lg buttons then sit concentrically. Low impact since children are inset.
- **Warum gut:** Sections are rounded-xl (12px) with p-5 (20px). Inner theme buttons are rounded-lg (8px) and the Abmelden button rounded-md (6px). With 20px padding the children are not flush so it is not a hard break, but the outer 12px radius reads slightly tight against the larger 20px padding.

### 113. ⚪ [nit] Card depth relies on border + invisible shadow-sm in dark mode
`app/settings/page.tsx:42, :60, :97`  ·  *mifb*  ·  Eff S
- **Macht:** Replace/augment with a layered transparent box-shadow that carries depth in both themes, letting the hard border drop to a hairline. Optional polish.
- **Warum gut:** Sections use 'border bg-card shadow-sm'. In dark mode shadow-sm is effectively invisible, so all separation comes from the 1px border plus a marginally lighter bg-card, giving the cards a flatter, more outlined feel than the light variant.


## sidebar-layout  ·  10 Befunde  (3h/3m/3l/1n)

### 114. 🔴 [high] Logo nudge is wired to the app's highest-frequency action (week/day navigation)
`components/app-sidebar.tsx:106-120, app/page.tsx:576,608,620`  ·  *motion·Jakub*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Remove the nudge from routine prev/next and Woche navigation. Reserve logo motion for the single deliberate, rare moment (the 'Heute' flip). If feedback on navigation is wanted, put it where the user is looking (the grid transition / nav button press), not on chrome in the periphery. Keep flipLogo on the explicit logo click.
- **Warum gut:** nudgeLogo() runs rotateX:[0,26,0] (400ms) on the 'atlas:nudge' event, which app/page.tsx dispatches on EVERY prev arrow (line 576), next arrow (line 620), and the Woche toggle (line 608). These are the core, repeated navigation actions of the calendar. The logo sits in the far top-left corner while the user's focus and cursor are on the grid/nav buttons in the center-right, so each page-through fires a peripheral tilt in the opposite corner — exactly the motion the eye catches involuntarily. Jakub's rule: 'If users notice the animation itself, it's too much,' and motion on repeated interactions must not get tiresome. The deliberate, rare 'Heute' full flip (focus-today) is justified delight; the per-navigation nudge is not.

### 115. 🔴 [high] App-shell sidebar gets a 700ms blur+slide entrance on every mount
`components/app-sidebar.tsx:135-137`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Drop the entrance on the sidebar shell entirely (render it static) or, if some arrival is wanted, reduce to a sub-200ms opacity-only fade with no x-translate and no blur. The shell should feel already-there, not arriving. Let the page content (Split/Stagger) carry whatever entrance personality the product wants.
- **Warum gut:** The sidebar root is initial={{opacity:0, x:-28, filter:'blur(6px)'}} -> animate visible with transition={{duration:0.7, ease:EASE}}. This is navigation chrome — the single most stable, most-seen element in the app — yet it slides in from the left with blur over 700ms on every full load. Emil's first question is 'should this animate at all?' Nav chrome should orient instantly, not perform an entrance; 700ms is also more than 2x his 300ms ceiling, and a 6px blur on the shell delays first orientation toward the modules the user came to click. This is textbook motion-on-mount-for-static-content applied to the frame itself.

### 116. 🔴 [high] Logo wiggle fires on every week-navigation (high-frequency, spatially disconnected)
`components/app-sidebar.tsx:106-119`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Remove the 'atlas:nudge' listener / nudgeLogo entirely. Keep the rare deliberate flip on direct logo click and on the 'Heute' jump only. Feedback for week navigation, if wanted, belongs at the interaction source (the arrows/grid), not on a disconnected logo.
- **Warum gut:** nudgeLogo() (rotateX [0,26,0], 400ms) is bound to the global 'atlas:nudge' event, which the comment ties to week-switch / arrow navigation. Arrow-stepping through weeks is a frequent action (potentially dozens of times per session), and the logo sits top-left while the week arrows sit top-right — so the motion has zero spatial or functional relationship to where the user is clicking. By Emil's frequency rule, frequent actions get no animation; here a decorative element flickers in the opposite corner on a repeated utility action, pulling the eye away from the user's actual focus. The deliberate 'Heute' flip (atlas:focus-today, rare) is a defensible delight moment; the per-week nudge is not.

### 117. 🟠 [medium] 700ms blur entrance on persistent app chrome reads as noticeable, not invisible
`components/app-sidebar.tsx:135-137`  ·  *motion·Jakub*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Shorten to ~300-400ms and either drop the blur on chrome or reduce it to ~2-3px, and trim x to ~-12. Let the chrome settle quickly so the content entrance (grid/sections) is the thing the eye reads, not the sidebar re-materializing.
- **Warum gut:** The sidebar mounts with initial={{ opacity:0, x:-28, filter:'blur(6px)' }} -> animate over duration 0.7s. Jakub's enter recipe (opacity+translateY+blur) is correct, but 700ms is long for navigation chrome and blur makes the shell 'materialize' conspicuously on every full load. Jakub treats chrome as something that should feel stable/instant; a 0.7s blur-in on the frame the user returns to repeatedly draws conscious attention ('nice animation') rather than disappearing. The blur recipe is best reserved for content/hero elements, not the frame itself.

### 118. 🟠 [medium] Reduced-motion gating is incomplete — Framer blur/opacity entrances still play
`components/motion-provider.tsx:8`  ·  *motion·Emil*  ·  Eff M
- **Macht:** Don't rely on reducedMotion='user' to gate blur/opacity. Read the reduced-motion preference (e.g. useReducedMotion) and, when set, render entrances with no initial state (mount at final values) — especially for the shell entrance and SplitText. At minimum fix the comment so it doesn't imply full coverage that isn't there.
- **Warum gut:** MotionConfig reducedMotion='user' only strips transform and layout animations — opacity and filter:blur() continue to animate. So under prefers-reduced-motion the sidebar entrance still runs its 700ms opacity+blur(6px) fade (only the x-translate is dropped), and the same is true for Stagger/SplitText. The CSS @media(prefers-reduced-motion) guard in globals.css:169-178 zeroes CSS transitions/animations but does NOT touch Framer's JS-driven inline animations, so it provides no backstop here. The code comment ('transform/opacity-Animationen werden dann auf ihren Endzustand kollabiert') overstates the actual coverage — opacity is explicitly NOT collapsed.

### 119. 🟠 [medium] Collapse/expand animates width (layout property) and reflows the main content
`components/app-sidebar.tsx:140-143`  ·  *motion·Emil*  ·  Eff M
- **Macht:** If a smoother collapse is wanted, drive the visible change with transform (translateX of an over-wide panel) or clip-path against a fixed track instead of animating width, so the main column isn't relaid out per frame. If keeping width, accept it consciously and keep it short — it's borderline acceptable as-is.
- **Warum gut:** The motion.div uses transition:'width 280ms var(--ease-atlas)'. The inner column is given a fixed width to avoid internal reflow (good, deliberate clipping), but the outer element still animates the layout property width, which re-lays-out the adjacent main content/calendar grid every frame for 280ms. Animating width is the canonical layout-thrash anti-pattern; transform/clip would stay on the compositor. Duration (280ms) is within Emil's budget and the action is occasional, so this is polish-grade rather than severe — but it's the one place the shell drives layout work into the rest of the app.

### 120. 🟢 [low] Sidebar blur entrance still animates for reduced-motion users (escapes the gate)
`components/app-sidebar.tsx:135-137, components/motion-provider.tsx:8`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Read useReducedMotion() in AppSidebar and conditionally drop the filter (and ideally hold opacity-only or no entrance) when reduced motion is requested, rather than relying on MotionConfig which lets filter through.
- **Warum gut:** MotionConfig reducedMotion="user" disables transform and layout animations but intentionally keeps non-transform properties (opacity, color, AND filter) animating. So for a reduced-motion user the sidebar's x:-28 translate is correctly suppressed, but filter blur(6px)->blur(0) still runs. The globals.css @media (prefers-reduced-motion) guard (lines 169-178) neutralizes CSS transitions/animations only — it does not touch framer-motion's JS-driven values. A blur fade is a mild visual-disturbance effect some reduced-motion users want gone. This is the one spot where the otherwise-excellent reduced-motion coverage has a seam.

### 121. 🟢 [low] Resize drag updates width via React setState per pointermove
`components/app-sidebar.tsx:78`  ·  *motion·Emil*  ·  Eff M
- **Macht:** During the drag, write width directly to the element (ref.style.width = ...) and commit to React state only on pointerup. Keeps the visual identical while removing a full component re-render per move event.
- **Warum gut:** onMove calls setWidth(...) on every pointermove, re-rendering the whole AppSidebar component (modules, profile, dropdown subtree) on each frame of the drag. Emil's drag guidance is to update the element's style directly rather than route high-frequency drag values through state/CSS-variable cascades, precisely to avoid this recompute cost. The drag does correctly set transition:'none' so width follows the cursor 1:1 (good), but the per-frame React reconciliation is heavier than needed for a smooth 60fps drag on lower-end machines.

### 122. 🟢 [low] Logo flip/nudge use Framer keyframe arrays — not interruptible, and a full 360° spin
`components/app-sidebar.tsx:101`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Keep it rare-only (already mostly true once the per-week nudge is removed). If retained, consider a single-value spring/transition the user can interrupt rather than a 0->360 keyframe, and a smaller settle than a full rotation.
- **Warum gut:** flipLogo animates rotateX:[0,360] and nudgeLogo rotateX:[0,26,0] as keyframe arrays. Keyframe arrays in Framer can't retarget mid-flight, so rapid 'Heute'/logo clicks queue or restart-from-0 rather than blending — exactly the case Emil warns about with keyframes vs. transitions. The flip is also a full 360° rotateX (a complete spin) rather than a settle; it reads as a gimmick more than feedback, though on a rare deliberate action it's within delight tolerance.

### 123. ⚪ [nit] Mixed easing/duration across the collapse interaction
`components/app-sidebar.tsx:142,128,153,179`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Align the crossfades to the same var(--ease-atlas) and a duration that reads as one motion (e.g. opacity 200-240ms on the atlas curve) so the width slide and label fade feel like one synchronized gesture rather than two.
- **Warum gut:** The collapse animates width via 'width 280ms var(--ease-atlas)' (line 142), but the labels, header swap, and badges crossfade with transition-opacity duration-200 (default ease, lines 128/153/207/219) and rows use bare transition-colors (default ease). One coordinated gesture (collapse) is therefore driven by two easing curves and two durations (280 vs 200). Jakub: context should drive a consistent easing choice across a single interaction; the mismatch is subtle but means the width and the label fade decelerate on different curves.


## Sidebar · App-Shell · Logo · Theme (sidebar-layout)  ·  19 Befunde  (1h/4m/9l/5n)

### 124. 🔴 [high] Logo nudge fires on every prev/next arrow — playful feedback turned into fatigue
`app/page.tsx:576,620 + components/app-sidebar.tsx:106-107`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Reserve logo motion for the genuinely rare moment (the 'Heute' focus flip only). Drop atlas:nudge from the prev/next arrows entirely, or move that feedback to where the change actually happens — let the grid/day-column cascade carry the orientation cue, not the brand mark. If you want the logo to acknowledge navigation, gate it to fire at most once per session or only on the week<->today mode switch (line 608), never per-arrow.
- **Warum gut:** The deliberate 'Heute' flip (rotateX 0→360) is a perfect, rare delight moment. But nudgeLogo() (rotateX [0,26,0], 0.4s) is wired to atlas:nudge, which app/page.tsx dispatches on BOTH the ChevronLeft (line 576) and ChevronRight (line 620) navigation arrows — the single most-clicked control in a week calendar. The code comment claims it 'respektiert das Frequency-Gate', but in practice the logo tilts on every week/day step. Jhey's golden rule: motion 'doesn't fatigue users on repeated interactions.' A logo that nods every time you page through weeks stops being delightful by the fifth click.

### 125. 🟠 [medium] Entrance blurs the navigation chrome the user reaches for first
`components/app-sidebar.tsx:135-137`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Keep the slide-in curtain but cut the blur on the nav shell (blur on text-bearing nav is the costly part), or shorten to ~0.4s. The horizontal x:-28 entrance alone already reads as 'the shell arrives' without softening legibility. Let the logo and page content carry the blur flourish, not the clickable nav list.
- **Warum gut:** The sidebar mounts with initial blur(6px) + x:-28 + opacity:0 over 0.7s. This is the primary nav (Kalender/Nachrichten/Inbox/Hermes labels) — the one surface a user wants to read and click immediately on load. It also runs in concert with Stagger sections and SplitText (stagger.tsx), so the whole app 'blurs in' at once, which tips toward the blur-everywhere-entrance pattern. A curtain-raise is a fair Jhey moment, but blurring readable navigation for 0.7s taxes the exact element users target first.

### 126. 🟠 [medium] "MODULE" eyebrow is not aligned with the nav labels it heads
`components/app-sidebar.tsx:207 (vs :126/:230)`  ·  *craft*  ·  Eff S
- **Macht:** Indent the eyebrow to match the label column — give it the same left offset as the labels (e.g. `pl-12` / align to the post-icon start) so the section header and its items share one left edge.
- **Warum gut:** The eyebrow uses `mx-2 px-2`, so its text starts at ~16px from the rail edge. The nav rows use `mx-2` + a `w-10` iconBox (:126), so their labels start at ~48px. The result is a 32px stair-step: the section label sits visibly left of every item it labels ("MODULE" begins clearly to the left of "Kalender"/"Nachrichten" in both screenshots).

### 127. 🟠 [medium] Active module reads too weakly in light mode
`components/app-sidebar.tsx:230`  ·  *craft*  ·  Eff S
- **Macht:** Strengthen the active affordance: add a left accent bar (2px `bg-primary`, also visible when collapsed) or a slightly stronger fill, so the current module is obvious in light mode and survives the collapsed icon-only state.
- **Warum gut:** The only enabled item (Kalender) signals "active" with `bg-accent` + `font-medium` only. In light mode that accent fill is a near-white gray on the `bg-card/40` rail — the selected state is barely a step above the hover state and carries no accent/rail marker. For the single live destination in the product this should be unmistakable. Dark mode reads better but is still flat-fill only.

### 128. 🟠 [medium] Header chrome buttons are 36×36px, below the 40px minimum hit area
`components/app-sidebar.tsx:164,179,197`  ·  *mifb*  ·  Eff S
- **Macht:** Bump these buttons to `size-10` (40px), or keep the 36px visual and extend the tap target with an `after:` pseudo-element to 40×40 (after:absolute after:size-10 after:-translate-1/2). The collapse/expand toggles are the most-used chrome controls, so this matters most there.
- **Warum gut:** Logo button (line 164 `size-9`), collapse toggle (line 179 `size-9`), and expand toggle (line 197 `size-9`) are all 36×36px. size-9 = 2.25rem = 36px, under the 40×40 floor. The wrapping iconBox is `w-10` (40px wide) but the clickable <button> itself stays 36px and has no height extension within the h-16 header.

### 129. 🟢 [low] Active-module indicator is a static block — a magic-motion pill waiting to happen
`components/app-sidebar.tsx:225-233`  ·  *motion·Jhey*  ·  Eff M  ·  buildTool: storyboard
- **Macht:** When the disabled modules go live, render the active highlight as a single framer-motion element with a shared layoutId so it physically slides between rows on navigation (spring, low/no bounce to stay productivity-appropriate). It is the kind of small, unnoticed-but-felt continuity Jhey prizes, and it costs almost nothing once more than one route is clickable.
- **Warum gut:** The active route gets a flat bg-accent rectangle (line 230) with only transition-colors. With three modules disabled ('bald') there is nothing to slide between today — but this is the textbook 'what could this become' opportunity. When Nachrichten/Inbox/Hermes ship, route changes will hard-cut the highlight from one row to the next.

### 130. 🟢 [low] Collapse animates outer `width` (layout property) — sibling grid reflows for 280ms
`components/app-sidebar.tsx:139-143,147`  ·  *motion·Jhey*  ·  Eff M
- **Macht:** Acceptable as-is for an infrequent push-sidebar toggle. If the grid reflow ever shows jank, animate via transform on a fixed-width track (translate the panel + content) instead of animating layout width. Not worth doing preemptively.
- **Warum gut:** The wrapper transitions `width 280ms` (line 142). The team smartly froze the INNER div at a fixed width (line 147, 'kein Reflow, nur Clipping') so the sidebar's own contents just clip — good instinct. But the outer container still animates width, so the main calendar grid (many cells) relayouts every frame of the 280ms collapse. For an infrequent toggle this is acceptable, just not free.

### 131. 🟢 [low] Resize drag re-renders React on every pointermove instead of writing width directly
`components/app-sidebar.tsx:78,131-143`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** During an active resize, write width straight to the element (ref.style.width) inside the pointermove handler and only commit to React state / cookie on pointerup. Keeps the handle glued 1:1 to the cursor without per-frame reconciliation.
- **Warum gut:** onMove calls setWidth(...) on every pointermove (line 78), which re-renders the motion.div and recomputes its style each frame during the drag. Emil's drag guidance (which Jhey's 'unnoticed' golden rule agrees with here) is to write the value straight to the element rather than route a high-frequency gesture through React state. The motion.div wrapper also carries the entrance transition props, adding reconciliation overhead per frame.

### 132. 🟢 [low] Same collapse control rendered with two radii and two icon sizes
`components/app-sidebar.tsx:179/181 vs :197/199`  ·  *craft*  ·  Eff S
- **Macht:** Use one radius and one icon size for the collapse/expand toggle in both states (pick `rounded-lg`, `size-[18px]`), and reduce the header to a single intentional radius scale.
- **Warum gut:** The expanded "collapse" button is `rounded-md` with `size-[18px]` icon (:179/:181); the collapsed "expand" button — conceptually the same control on the same slot — is `rounded-lg` with `size-[19px]` icon (:197/:199). Across the header the logo is `rounded-xl` (:164) and rows are `rounded-lg`, so there are three radii (md/lg/xl) on adjacent controls.

### 133. 🟢 [low] Three of four modules are disabled — rail feels mostly inert with no focusing
`components/app-sidebar.tsx:31-36, 234-243`  ·  *craft*  ·  Eff M
- **Macht:** Keep the roadmap visible but lower its weight further — e.g. drop the icons' opacity in step with the text, or group the "BALD" items under a quieter sub-heading — so the live Kalender entry is the clear visual entry point.
- **Warum gut:** Nachrichten, Inbox and Hermes are all `soon` and render at `text-muted-foreground/55` with a "BALD" badge each (:219). 75% of the nav is non-interactive, so the eye lands on a list dominated by greyed roadmap items rather than the one live destination.

### 134. 🟢 [low] Collapsed rail leaves a phantom gap where the eyebrow was
`components/app-sidebar.tsx:207`  ·  *craft*  ·  Eff S
- **Macht:** Collapse the eyebrow out of flow when `collapsed` (height/margin to 0 alongside the opacity fade) so the icon rail closes the gap.
- **Warum gut:** On collapse the "MODULE" eyebrow is only faded (`collapsed && "opacity-0"`) — it stays in layout (`pb-1` + line height), so the icon-only rail carries an empty band above the first icon instead of tightening up. (Not visible in the supplied expanded shots; grounded in the markup.)

### 135. 🟢 [low] Profile dropdown trigger has no scale-on-press while every other button does
`components/app-sidebar.tsx:253`  ·  *mifb*  ·  Eff S
- **Macht:** Add `active:scale-[0.96] transition-transform` (or fold transform into the existing transition list) on the trigger at line 253 for parity with the other interactive controls.
- **Warum gut:** The profile/account button has `transition-colors hover:bg-accent/50 data-[state=open]:bg-accent` but no `active:scale-[0.96]`. The logo, collapse, and expand buttons (lines 164/179/197) all have `active:scale-[0.96]`, so the footer control feels inconsistently dead on click.

### 136. 🟢 [low] Sidebar enters as one container instead of split + staggered chunks
`components/app-sidebar.tsx:131-137`  ·  *mifb*  ·  Eff M
- **Macht:** Wrap logo / nav items / profile footer in a staggered children variant (stagger ~80-100ms) so the sidebar assembles in pieces instead of one slab. Keep the same EASE and blur values.
- **Warum gut:** The entire `motion.div` slides in as a single block (`initial={{opacity:0, x:-28, filter:'blur(6px)'}}`, one 0.7s transition). Principle 5 calls for breaking content into semantic chunks (logo, nav list, footer) and staggering ~100ms rather than animating the whole container at once. A `components/stagger.tsx` already exists in the repo for exactly this.

### 137. 🟢 [low] Entrance animates filter:blur over the full screen-height sidebar
`components/app-sidebar.tsx:135-138`  ·  *mifb*  ·  Eff S
- **Macht:** If first-frame stutter appears in profiling, add `will-change: filter` for the duration of the entrance only (drop it on completion). Splitting the enter per finding above also reduces the blurred area per element. No change needed if it's smooth in practice.
- **Warum gut:** `initial`/`animate` interpolate `filter: blur(6px) → blur(0px)` on the `h-screen` container (line 138). A full-height blur is a comparatively expensive composite and can stutter on the first frame; no `will-change` is set (correctly, per 'add only when noticed').

### 138. ⚪ [nit] Collapse label fade (200ms) finishes before the width clip (280ms)
`components/app-sidebar.tsx:128,142,153`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Match the label opacity duration to the width (use 280ms with the same --ease-atlas curve), or stagger intentionally — fade labels slightly AFTER the width on expand so content settles into place. Tiny touch, but it removes the only visible seam in the collapse choreography.
- **Warum gut:** Labels and the chevron crossfade via transition-opacity duration-200 (lines 128, 153) while the panel width animates over 280ms (line 142). On collapse the text vanishes ~80ms before the panel finishes narrowing, leaving a brief empty rail; on expand the reverse. A small timing seam in an otherwise tightly choreographed crossfade.

### 139. ⚪ [nit] Inconsistent right-edge gutters between nav badges and footer chevron
`components/app-sidebar.tsx:219 vs :265`  ·  *craft*  ·  Eff S
- **Macht:** Pick one trailing gutter (e.g. `mr-3`) for both the badges and the footer chevron so the right edge of the rail is consistent top to bottom.
- **Warum gut:** The "BALD" badges use `mr-2` (8px) while the footer's ChevronsUpDown uses `mr-3` (12px). The trailing controls in the same rail therefore stop at two different right margins.

### 140. ⚪ [nit] Logo block is the single heaviest element in light mode
`components/app-sidebar.tsx:164`  ·  *craft*  ·  Eff S
- **Macht:** Acceptable as a deliberate brand anchor; if the goal is to keep focus on navigation, consider a lighter/tinted logo container in light mode so the active module and the brand chip aren't both maximum-contrast.
- **Warum gut:** The brand mark is a `bg-primary` (near-black) `rounded-xl` square — in light mode it's the darkest object on screen, pulling the eye to the top-left brand chip more than to the active Kalender item. (In dark mode it inverts to a light chip and behaves better.)

### 141. ⚪ [nit] Collapse vs expand toggle render with different corner radii in the same slot
`components/app-sidebar.tsx:179,197`  ·  *mifb*  ·  Eff S
- **Macht:** Pick one radius for both toggle states (e.g. `rounded-lg` on both at lines 179 and 197) so the corner doesn't change during the collapse/expand cross-fade.
- **Warum gut:** Collapse button uses `rounded-md` (line 179) while the expand button that cross-fades into the same left slot uses `rounded-lg` (line 197); the logo beside them is `rounded-xl` (line 164). The two toggle states are the same conceptual control, so the radius subtly jumps as the sidebar collapses/expands.

### 142. ⚪ [nit] Atlas arrow mark is geometrically centered in its tile, not optically
`components/atlas-logo.tsx:14-16`  ·  *mifb*  ·  Eff S
- **Macht:** Balance the mark inside the 24×24 viewBox so the visual centroid sits at center (the base currently ends at y=21 leaving a larger bottom gap than the y=2.4 top gap), or nudge with a sub-pixel translate in the tile. Verify against the rendered tile.
- **Warum gut:** The logo is an asymmetric upward arrow/triangle (paths span y 2.4→21) centered purely by flexbox in a `rounded-xl` tile (app-sidebar.tsx:166-172). Asymmetric arrow/triangle marks have visual weight that geometric centering misses; surfaces.md calls for nudging or fixing the viewBox.


## UI-Primitives · Button · Dropdown (ui-primitives)  ·  19 Befunde  (3h/6m/5l/5n)

### 143. 🔴 [high] Button & DropdownItem ignore the --ease-atlas signature curve and fall back to the Material default the project explicitly rejected
`components/ui/button.tsx:6, components/ui/dropdown-menu.tsx:38`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Add the brand curve + an explicit token to the cva base, e.g. `transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-atlas)]`, and `transition-colors duration-150 ease-[var(--ease-atlas)]` on DropdownMenuItem. Every hover and press in the app then carries the Atlas personality the team already authored, instead of the curve it deliberately discarded.
- **Warum gut:** Button base = `transition-[color,background-color,border-color,transform] active:scale-[0.96]` with no `ease-*` / `duration-*`. In Tailwind v4.3.1 the functional `transition-[...]` utility emits `transition-timing-function: var(--tw-ease, var(--default-transition-timing-function))`; --tw-ease is never set, so hover-color and the press-scale animate on `cubic-bezier(0.4,0,0.2,1)` — the precise curve globals.css:9-10 says it replaces ('Loest Material-Default (0.4,0,0.2,1) ab -> Bewegung hat Charakter statt lacking strength'). The signature --ease-atlas is wired into app-sidebar.tsx:142, infinity-slider.tsx:196-208 and stagger.tsx, but NOT the two shared primitives users touch most. DropdownItem (`transition-colors`) has the same gap.

### 144. 🔴 [high] Scale-on-press never animates — transition list omits the v4 `scale` property
`components/ui/button.tsx:6`  ·  *mifb*  ·  Eff S
- **Macht:** Add `scale` to the transition list: `transition-[color,background-color,border-color,scale]`, or use Tailwind's `transition-transform` which in v4 expands to `transform, translate, scale, rotate`. Verify the 0.96 press now eases in/out.
- **Warum gut:** Base class is `transition-[color,background-color,border-color,transform] active:scale-[0.96]`. This project is Tailwind v4.3.1, and I compiled the utility via @tailwindcss/node: `scale-[0.96]` emits `scale: 0.96` (the standalone CSS `scale` property), NOT `transform`. Since the transition only lists `transform`, the press scale is never transitioned — it snaps instantly to 0.96 on mousedown and snaps back on release, on every button app-wide. The intended tactile easing (principle 12) silently does nothing.

### 145. 🔴 [high] All button sizes are below the 40×40 minimum hit area
`components/ui/button.tsx:16-18`  ·  *mifb*  ·  Eff M
- **Macht:** Bump icon/default to `h-10 w-10`/`h-10` (40px), or keep the 36px visual box and extend the tap target with a pseudo-element / negative-margin padding to 40×40 without changing layout. Ensure adjacent chevron targets don't overlap.
- **Warum gut:** `size.default: h-9` = 36px tall, `size.icon: h-9 w-9` = 36×36px, `size.sm: h-8` = 32px. The week-header nav chevrons and the sidebar-collapse control (icon variant, visible in calendar-week-light.png at top-right ~x=1680 and top-left ~x=308) render as 36×36px targets — 4px under the 40×40 floor. The `sm` variant at 32px is well under.

### 146. 🟠 [medium] Focus ring is low-contrast gray with no offset — weak on the buttons it guards
`components/ui/button.tsx:6 (focus-visible:ring-2 focus-visible:ring-ring) + app/globals.css:28 (--ring: oklch(0.708 0 0))`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-background` so the ring detaches from the button edge, and darken `--ring` (toward the foreground, e.g. oklch ~0.45) or use the brand/primary token for the ring so it reads at a glance on white. Keep the 2px width. Verify against the outline + ghost variants specifically, not just the filled default.
- **Warum gut:** The shared Button base uses `focus-visible:ring-2 focus-visible:ring-ring` with no `ring-offset`. `--ring` resolves to oklch(0.708 0 0), a mid-gray. On the light-mode white background (oklch 0.995) a 2px mid-gray ring has low luminance contrast, and with no offset it sits directly against the button edge — on the `outline` variant it abuts the element's own 0.92-gray border, so the focus state nearly merges with the resting border. For the one primitive every keyboard user lands on, the focus affordance is the least visible state.

### 147. 🟠 [medium] Shared Button uses Tailwind's Material default easing, not the project's --ease-atlas signature curve
`components/ui/button.tsx:6 (transition-[color,background-color,border-color,transform]) vs app/globals.css:10 (--ease-atlas)`  ·  *motion·Jakub*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Apply the brand curve to the button's transition, e.g. add `ease-[var(--ease-atlas)]` (or a `duration-150 ease-[…]` pair) to the cva base so hover/press inherit the signature easing the rest of Atlas uses. This is a one-line change that makes the highest-frequency element consistent with the design language. DialKit could help A/B the curve against the calendar's existing motion before locking it.
- **Warum gut:** I compiled the class with the project's own Tailwind v4.3.1: `transition-[color,…,transform]` emits `transition-duration: 150ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)` — the exact Material curve globals.css:10 explicitly rejects (comment: 'Loest Material-Default (0.4,0,0.2,1) ab -> Bewegung hat Charakter statt lacking strength'). So the team authored a signature easing to replace this default, then the single most-touched interactive primitive (every variant, every press, every hover) rides the rejected default. Context-should-drive-easing, and the brand decision isn't reaching the button.

### 148. 🟠 [medium] Dropdown enter and exit are mirror-symmetric and keyframe-based (non-interruptible)
`components/ui/dropdown-menu.tsx:21`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Make the exit cheaper than the enter — drop the zoom on close and shorten it (e.g. keep fade-out-0 but skip zoom-out-95, or `data-[state=closed]:duration-100`). The menu should dismiss quicker than it arrives; a settle-on-open, snap-on-close reads more intentional than a symmetric replay.
- **Warum gut:** `data-[state=open]:animate-in ... zoom-in-95 fade-in-0` is mirrored exactly by `data-[state=closed]:animate-out ... zoom-out-95 fade-out-0`. Enter and exit are equally prominent (Jakub: exits should be subtler/faster), and because these are tw-animate-css @keyframes (not state-driven transitions) a rapid open/close re-toggle replays the full keyframe rather than retargeting mid-flight.

### 149. 🟠 [medium] Icon and sm buttons sit below a comfortable pointer/touch target
`components/ui/button.tsx:18`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Bump the icon size to h-10 w-10 (40px) or extend the press/hover background to a 44px hit-slop while keeping the 16px glyph, so the interactive area is larger than the visible icon. Pairs naturally with the press-scale already in place.
- **Warum gut:** `icon: h-9 w-9` = 36px and `sm: h-8` = 32px. The week-nav chevrons and sidebar/DialKit toggles in calendar-week-light.png render as ~36px squares — under the 44px comfortable target. The visible glyph is only 16px (`[&_svg]:size-4`), so the actual press affordance is small even though there is padding room.

### 150. 🟠 [medium] Focus ring sits flush with no offset and uses a neutral gray, weak on outline/ghost variants
`components/ui/button.tsx:6`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Add ring-offset-2 + ring-offset-background so the ring detaches from the button edge, and/or raise ring contrast (a darker/branded ring color). The interaction itself is fine — this is purely making the focus state legible, which matters more than any animation on a keyboard-driven primitive.
- **Warum gut:** focus-visible:ring-2 focus-visible:ring-ring with no ring-offset utility. --ring is oklch(0.708 0 0) light / oklch(0.556 0 0) dark (globals.css:28,53) — a zero-chroma mid-gray. With no offset the 2px ring renders directly on top of the outline variant's existing border (border-border), so keyboard focus on outline/ghost buttons reads as a muddy thicker border rather than a distinct ring.

### 151. 🟠 [medium] Focus ring has no offset and uses a low-contrast neutral
`components/ui/button.tsx:6`  ·  *mifb*  ·  Eff S
- **Macht:** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-background` so the ring detaches from the control, and consider a higher-contrast ring token for filled variants.
- **Warum gut:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` with no `ring-offset`. `--ring` is oklch(0.708 0 0) — a mid neutral gray (globals.css:28). On the filled `default` variant the ring sits flush against the fill, and on `outline` it overlaps the existing border, so keyboard focus is hard to perceive against both light and dark surfaces.

### 152. 🟢 [low] Press-scale and color share one 150ms symmetric timing — the press reads slightly soft
`components/ui/button.tsx:6 (active:scale-[0.96] folded into transition-[…,transform], 150ms)`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Split transform onto a shorter, more decisive timing — e.g. ~100ms with an ease-out/atlas curve for the scale while keeping color at 150ms — so the press feels immediate and the hover stays smooth. Subtle, but it's the difference between 'responsive' and 'really nice' on a button pressed all day.
- **Warum gut:** `active:scale-[0.96]` is animated by the same `transition-[…,transform]` block, so the scale-down and the color hover share one 150ms duration with the symmetric Material ease (verified compiled output). A tactile press wants a faster, snappier down-stroke than a color crossfade; at 150ms symmetric the scale feedback lands a touch mushy rather than crisp. The 0.96 target itself is well-chosen (not scale(0)).

### 153. 🟢 [low] Focus ring sits flush against the button edge with no offset
`components/ui/button.tsx:6`  ·  *motion·Jhey*  ·  Eff S
- **Macht:** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-background` so the ring reads as a distinct halo on both light and dark fills. Leave it un-transitioned.
- **Warum gut:** `focus-visible:ring-2 focus-visible:ring-ring` has no `ring-offset-*`. On the dark default/CTA buttons (Weiter in event-sheet-light.png) a mid-grey 2px ring rendered directly against the button border has weak separation. Not animating the ring is correct (keyboard-initiated — Emil), so the only gap is the offset.

### 154. 🟢 [low] CSS transitions inherit Tailwind's default ease instead of the app's signature EASE curve
`components/ui/button.tsx:6`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Expose the EASE curve as a CSS variable (e.g. --ease-out: cubic-bezier(0.22,1,0.36,1)) and apply ease-[var(--ease-out)] to the button so hover/press easing matches the rest of the product. Emil tip #4: custom easing is what makes motion feel intentional; the default Material curve is the one to override.
- **Warum gut:** transition-[color,background-color,border-color,transform] resolves to Tailwind v4's default timing function cubic-bezier(0.4,0,0.2,1) at 150ms. Meanwhile every framer-motion component defines and uses a custom EASE = [0.22, 1, 0.36, 1] (date-field.tsx:8, event-sheet.tsx:13, stagger.tsx:11, app-sidebar.tsx:46, time-range-field.tsx:13). The shared primitive is the one surface that does NOT speak the app's motion curve.

### 155. 🟢 [low] Press-scale eases in over 150ms rather than feeling instantly tactile
`components/ui/button.tsx:6`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Either give transform a faster duration (~100ms) than the color transition, or let the press-down snap and only ease the release. The current single symmetric transition is acceptable for a productivity tool, but a snappier press would read more responsive.
- **Warum gut:** transform is bundled into the same transition list as the color properties, so active:scale-[0.96] animates over the shared default ~150ms. The press-DOWN therefore ramps in over 150ms and the release uses the identical timing. Emil's tactile-feedback intent is sharpest when the press registers near-instantly.

### 156. 🟢 [low] Dropdown items: ~36px row height and no press feedback despite cursor-pointer
`components/ui/dropdown-menu.tsx:38`  ·  *mifb*  ·  Eff S
- **Macht:** Raise to `py-2.5` (40px rows) for comfortable pointer/touch targets; optionally add a subtle `active:scale-[0.98]` (with `scale` in the transition) for parity with Button press feedback.
- **Warum gut:** DropdownMenuItem uses `px-2.5 py-2 text-sm` → roughly 8+8+~20 = ~36px row height, under the 40px target. It declares `cursor-pointer` but only `transition-colors`, so there is no `active:scale`/press affordance the rest of the button system has — clickable rows feel less tactile than buttons.

### 157. ⚪ [nit] Dropdown enter and exit are symmetric (zoom-in-95 / zoom-out-95) — exit could be subtler
`components/ui/dropdown-menu.tsx:21-22`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Optionally trim the exit to a plainer, faster fade (drop the zoom-out and slide on close, or shorten its duration) so opens feel materialized and closes feel like they simply get out of the way. Low priority — current state is conventional and acceptable.
- **Warum gut:** Content uses `data-[state=open]:zoom-in-95` paired with `data-[state=closed]:zoom-out-95` and matching fade-in-0/fade-out-0 plus equal-magnitude slide-in-from-*-2. Enter and exit carry identical movement and scale. Jakub's rule: the user is moving on during an exit, so it shouldn't demand the same attention as the enter. The dropdown is otherwise exemplary — origin-aware via `origin-(--radix-…-transform-origin)`, zoom-95 not scale-0, reduced-motion covered globally.

### 158. ⚪ [nit] Disabled state opacity is outside the transition list, so it snaps
`components/ui/button.tsx:6 (disabled:opacity-50 not in transition-[color,background-color,border-color,transform])`  ·  *motion·Jakub*  ·  Eff S
- **Macht:** Add `opacity` to the transition list (or use a `transition-[…,opacity]`) so enable/disable fades over the same 150ms as the rest of the button's state changes. Trivial; closes the last instant state-swap on this primitive.
- **Warum gut:** The transition property list covers color, background-color, border-color and transform but not opacity. `disabled:opacity-50` therefore changes instantly when a button toggles to/from disabled (e.g. the 'Weiter' CTA in the event sheet enabling once a title is entered). The jump is small but, on a primitive where the team otherwise transitions every visible property, it's an inconsistency a polish-minded user feels.

### 159. ⚪ [nit] Press-scale is identical across every variant and size — no settle personality
`components/ui/button.tsx:6`  ·  *motion·Jhey*  ·  Eff S  ·  buildTool: dialkit
- **Macht:** Optional delight, not a fix: once --ease-atlas is on the base, the release will already feel more alive. For the primary CTA only you could give the release a hair of overshoot via a `linear()` settle (Jhey's pure-CSS spring) so the most important action feels physical — kept off high-frequency icon buttons to honour restraint.
- **Warum gut:** `active:scale-[0.96]` is shared by the 36px icon button and the large primary CTA alike, and (per finding 1) springs back on the generic Material ease — a linear-feeling snap rather than a settle.

### 160. ⚪ [nit] Dropdown layers three simultaneous entrance cues (zoom + slide + fade)
`components/ui/dropdown-menu.tsx:21`  ·  *motion·Emil*  ·  Eff S
- **Macht:** Drop the slide-in-from-* and keep zoom + fade from the trigger origin — one clean origin-aware cue. Minor; the current behavior is fast and reads fine, so this is taste-level restraint, not a defect.
- **Warum gut:** data-[state=open]:zoom-in-95 plus data-[side=bottom]:slide-in-from-top-2 plus fade-in-0, with origin already pinned to --radix-dropdown-menu-content-transform-origin. The origin-aware zoom already communicates 'expanding from the trigger'; the added 2px directional slide is a redundant second spatial cue (this is the shadcn default).

### 161. ⚪ [nit] Press-scale is baked into the base variant with no `static` escape hatch
`components/ui/button.tsx:6`  ·  *mifb*  ·  Eff S
- **Macht:** Add an optional `static` boolean prop that omits the `active:scale` utility, mirroring the principle's guidance.
- **Warum gut:** `active:scale-[0.96]` lives in the always-on base string. Principle 12 recommends a `static` prop to disable the press scale where motion would distract (e.g. dense toolbars, the week-nav chevrons that already shift the viewport). There is currently no way to opt out per-instance.


## UI-Primitives · Button · Dropdown (key: ui-primitives)  ·  7 Befunde  (1h/3m/2l/1n)

### 162. 🔴 [high] Focus ring sits flush on the button edge — no offset
`components/ui/button.tsx:6`  ·  *craft*  ·  Eff S
- **Macht:** Add focus-visible:ring-offset-2 focus-visible:ring-offset-background to the base cva string so the ring floats a gap off every variant. This is the standard shadcn baseline and is what makes the ring legible on filled buttons.
- **Warum gut:** focus-visible:ring-2 focus-visible:ring-ring with no ring-offset-2 / ring-offset-background. On the default (bg-primary) and outline variants the 2px ring is painted directly against the button's own fill/border, so a keyboard focus indicator on the dark 'Weiter' button or the outline 'Heute'/chevron nav buttons has almost no separation from the control it's outlining.

### 163. 🟠 [medium] Size scale doesn't include the size every primary action actually uses
`components/event-sheet.tsx:640`  ·  *craft*  ·  Eff S
- **Macht:** Add a size: lg (h-10 px-5) to buttonVariants and use it for the sheet footer. This removes five className overrides and makes the comfortable touch size a first-class, reusable token instead of ad-hoc.
- **Warum gut:** Every footer button in the event sheet is size="sm" but immediately overridden to h-10 via className (lines 640, 648, 652, 661, 666). sm is h-8 (32px) and default is h-9 (36px); the real primary-action height the designer wants is 40px, so it's patched in five places. The h-10 override is duplicated rather than expressed as a token.

### 164. 🟠 [medium] No destructive variant — destructive styling is hand-rolled per call site
`components/event-sheet.tsx:621`  ·  *craft*  ·  Eff M
- **Macht:** Add variant: destructive and destructive-outline to buttonVariants and route both the text delete and icon delete through the Button primitive. Centralizes the red treatment and the press-scale that the raw button currently copies.
- **Warum gut:** buttonVariants (button.tsx:9-14) defines default/outline/ghost/secondary but no destructive. The event sheet reconstructs it inline: a Button with className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" (line 621) AND a separate raw <button> for the delete icon (line 632) that re-implements transition + active:scale-[0.96] by hand. Two divergent destructive treatments for the same semantic action.

### 165. 🟠 [medium] Icon button hit area is 36px — below the 44px touch target
`components/ui/button.tsx:18`  ·  *craft*  ·  Eff S
- **Macht:** Bump size: icon to h-10 w-10, or add size: icon-sm for the rare dense case and make h-10 the default icon size. The week-nav chevrons in particular are frequent, small targets.
- **Warum gut:** size: icon is h-9 w-9 (36x36px). It's used for the week-nav chevrons and the 'Neuer Termin' / sidebar-collapse controls (app/page.tsx:573, 617, 631). 36px is under the 44px minimum for comfortable touch and even on desktop the chevron glyph inside leaves a small clickable area.

### 166. 🟢 [low] Dropdown items use cursor-pointer, against native menu convention
`components/ui/dropdown-menu.tsx:38`  ·  *craft*  ·  Eff S
- **Macht:** Switch to cursor-default to match platform menu behavior; the focus:bg-accent highlight already signals the item is actionable.
- **Warum gut:** DropdownMenuItem sets cursor-pointer. Native OS menus and the shadcn/Radix default use the arrow cursor (cursor-default) inside an open menu — the pointer hand reads as 'link/navigation' rather than 'menu choice'.

### 167. 🟢 [low] Menu-item icons stay muted even when the item is focused
`components/ui/dropdown-menu.tsx:38`  ·  *craft*  ·  Eff S
- **Macht:** Drop the hard svg color or scope it so focus:[&_svg]:text-accent-foreground (and destructive variants) can recolor the icon with the text.
- **Warum gut:** DropdownMenuItem forces [&_svg]:text-muted-foreground unconditionally. On focus the text flips to accent-foreground but the leading icon stays muted, so a highlighted row has a full-contrast label next to a faded icon — and a future destructive item couldn't tint its icon red without another override.

### 168. ⚪ [nit] sm size mixes an arbitrary px value into the type scale
`components/ui/button.tsx:17`  ·  *craft*  ·  Eff S
- **Macht:** Either define a --text-xs token at 13px and reference it, or use text-xs, so button text sizes all come from the same scale.
- **Warum gut:** default uses text-sm (14px) while sm uses text-[13px] — an arbitrary one-off value rather than a scale token. Minor, but it's the kind of magic number that drifts.
