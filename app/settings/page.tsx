"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ChevronLeft,
  Sun,
  Moon,
  Monitor,
  LogOut,
  User,
  Palette,
  CalendarClock,
  NotebookPen,
  RefreshCw,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/stagger";
import { MicrosoftConnection } from "@/components/microsoft-connection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const THEMES = [
  { key: "light", label: "Hell", icon: Sun },
  { key: "dark", label: "Dunkel", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
] as const;

// Mini-Vorschau pro Theme -> Tiles wirken weniger leer, man "sieht" die Wahl.
const PREVIEW: Record<string, { box: string; bar: string; barDim: string }> = {
  light: { box: "bg-white", bar: "bg-zinc-800/80", barDim: "bg-zinc-300" },
  dark: { box: "bg-zinc-900", bar: "bg-zinc-100/80", barDim: "bg-zinc-600" },
  system: { box: "bg-gradient-to-br from-white to-zinc-900", bar: "bg-zinc-500", barDim: "bg-zinc-400/60" },
};

type SyncState =
  | { ok: true; fetched: number; upserted: number; window: { start: string; end: string } }
  | { ok: false; error: string; kind: "network" | "server" };

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
};

// A4 (Verstaendlichkeit): Die rohe Server- oder Netzwerkmeldung (etwa "fetch
// failed" oder ein WebUntis-HTTP-Status) sagt einem Schueler nichts. Sie bleibt
// als technisches Detail sichtbar, davor steht ein Satz, der weiterhilft.
// Bewusst NICHT pauschal "die Schule hat Untis abgeschaltet": das stimmt nur in
// einem der Faelle, und sobald Untis wieder laeuft, wuerde eine feste Meldung
// bei jedem anderen Problem in die Irre fuehren.
function friendlySyncMessage(error: string, kind: "network" | "server"): string {
  if (kind === "network") {
    return "Keine Verbindung zum Server. Pruef dein WLAN und versuch es dann noch einmal.";
  }
  const e = error.toLowerCase();
  if (/401|403|auth|credential|login|passwor|anmeld/.test(e)) {
    return "WebUntis hat die Zugangsdaten abgelehnt. Server, Schule, Benutzer oder Passwort stimmen nicht.";
  }
  if (/econnrefused|etimedout|enotfound|fetch failed|timeout|502|503|504|unreachable/.test(e)) {
    return "WebUntis antwortet nicht. Oft liegt das an der Schule, etwa weil der Dienst dort gerade abgeschaltet ist. Versuch es später erneut.";
  }
  return "Der Abgleich hat nicht geklappt. Versuch es später erneut.";
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof User;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="flex items-start gap-3 border-b bg-muted/30 px-5 py-4">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  // A3 (Reduced-Motion): globale <MotionConfig reducedMotion="user"> kappt nur
  // transform -- die opacity+y-Animation der Sync-Meldung braucht ein eigenes Gate.
  const reduce = useReducedMotion();
  // A5 (Semantik): die Theme-Kacheln sind eine sich gegenseitig ausschliessende
  // Auswahl -- also radiogroup/radio statt lose aria-pressed-Buttons, inklusive
  // Pfeiltasten-Navigation (WAI-ARIA "Radio Group"-Pattern, roving tabindex).
  const themeRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => setMounted(true), []);

  function onThemeKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % THEMES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + THEMES.length) % THEMES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = THEMES.length - 1;
    else return;
    e.preventDefault();
    setTheme(THEMES[next].key);
    themeRefs.current[next]?.focus();
  }

  async function runSync() {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch("/api/sync/untis", { method: "POST" });
      const data = await res.json();
      setSync(
        data.ok
          ? { ok: true, fetched: data.fetched, upserted: data.upserted, window: data.window }
          : { ok: false, error: data.error ?? "Unbekannter Fehler", kind: "server" },
      );
    } catch (e) {
      // Netzwerkfehler (z.B. offline) laufen nie durch die API-Antwort oben,
      // sondern landen hier. Als "network" markiert, damit die Meldung nicht
      // faelschlich WebUntis beschuldigt, wenn schlicht das WLAN weg ist.
      setSync({ ok: false, error: (e as Error).message, kind: "network" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    // Design-Audit (Stimmigkeit): px-6 lg:px-8 wie app/page.tsx -- gleicher
    // Randabstand auf beiden Seiten. pt-6 gleicht auch oben auf den Stundenplan-
    // Kopf an, statt eines eigenen, groesseren Werts (py-8).
    <main className="h-full overflow-y-auto px-6 pt-6 pb-8 lg:px-8">
      <Stagger className="mx-auto max-w-2xl space-y-6">
        {/* Kopf -- Back-Link nur auf Mobile (dort fehlt die Sidebar). */}
        <StaggerItem>
          <Link
            href="/"
            className="relative mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors [touch-action:manipulation] before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          >
            <ChevronLeft className="size-4" />
            Zurück zum Stundenplan
          </Link>
          {/* Design-Audit (Stimmigkeit): text-xl + mt-0.5 wie der "Stundenplan"-
              Titel auf der Hauptseite -- beide Seiten sollen als EINE App wirken,
              nicht als zwei mit unterschiedlicher Titelgroesse. */}
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            Einstellungen
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Profil, Erscheinungsbild und Datenquellen von Atlas.
          </p>
        </StaggerItem>

        {/* Profil */}
        <StaggerItem>
          <Section icon={User} title="Profil" desc="Deine Kontodaten.">
            {/* A6 (Platzhalter): "bald bearbeitbar" war ein Versprechen ohne
                Funktion dahinter -- Bearbeiten braucht Mehrnutzer/Auth in der
                Datenschicht, die hier nicht angefasst wird. Kein Platzhalter
                statt einem, der nie einloest. */}
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full border bg-muted text-xl font-semibold">
                TZ
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-base font-medium leading-tight">Thimofej</div>
                <div className="text-sm text-muted-foreground">Schüler</div>
                {/* title, weil truncate die Adresse auf schmalen Displays
                    abschneidet -- so bleibt sie per Hover/Longpress lesbar. */}
                <div
                  className="truncate font-mono text-xs text-muted-foreground"
                  title="thimofej@yesterday-ai.de"
                >
                  thimofej@yesterday-ai.de
                </div>
              </div>
            </div>
          </Section>
        </StaggerItem>

        {/* Erscheinungsbild */}
        <StaggerItem>
          <Section icon={Palette} title="Erscheinungsbild" desc="Hell, dunkel oder dem System folgen.">
            <div role="radiogroup" aria-label="Erscheinungsbild" className="grid grid-cols-3 gap-3">
              {THEMES.map((t, i) => {
                const selected = mounted && theme === t.key;
                // Solange next-themes noch nicht hydriert ist (mounted=false),
                // muss trotzdem genau eine Kachel per Tab erreichbar sein.
                const tabbable = mounted ? selected : i === 0;
                const p = PREVIEW[t.key];
                return (
                  <button
                    key={t.key}
                    ref={(el) => {
                      themeRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => setTheme(t.key)}
                    onKeyDown={(e) => onThemeKeyDown(e, i)}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={tabbable ? 0 : -1}
                    className={cn(
                      // `isolate` = eigener Stacking-Context, sonst verschwindet der
                      // `-z-10`-Indikator hinter der opaken bg-card.
                      // ui-polish: font-medium bleibt IMMER gesetzt (nicht nur bei
                      // selected) -- ein Schriftgewicht-Wechsel wuerde die Textbreite
                      // aendern, Auswahl signalisiert stattdessen nur die Farbe.
                      // `scale` statt `transform` in der Transition-Liste: wie in
                      // button.tsx (F11) emittiert Tailwind v4 fuer `scale-[...]`
                      // eine eigene `scale`-Property, "transform" faengt sie nicht.
                      "relative isolate flex flex-col items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-[color,background-color,scale] [touch-action:manipulation] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      selected
                        ? "border-transparent text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="theme-active"
                        className="absolute inset-0 -z-10 rounded-xl border-2 border-primary bg-primary/10"
                        transition={{ type: "spring", stiffness: 500, damping: 46 }}
                      />
                    )}
                    {/* Mini-Mock des jeweiligen Modes -- Surfaces-Audit: die Kachel
                        rundet mit rounded-xl (14px) bei p-3 (12px) Abstand, macht die
                        Box hier also einen rechnerisch fast eckigen Innenradius (~2px)
                        noetig. rounded-lg (10px) sass zu rund fuer den Abstand und
                        pinchte sichtbar in der Ecke -- rounded-sm (6px) liegt naeher an
                        der abgeleiteten Ecke, ohne komplett eckig zu wirken. */}
                    <span className={cn("flex h-11 w-full items-center gap-2 rounded-sm border p-2", p.box)}>
                      <span className="size-4 shrink-0 rounded-full border border-black/10 bg-primary/70" />
                      <span className="flex-1 space-y-1.5">
                        <span className={cn("block h-1.5 w-4/5 rounded-full", p.bar)} />
                        <span className={cn("block h-1.5 w-3/5 rounded-full", p.barDim)} />
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <t.icon className="size-4" />
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        </StaggerItem>

        {/* Stundenplan / Untis-Sync -- echte Funktion */}
        <StaggerItem>
          <Section
            icon={CalendarClock}
            title="Stundenplan"
            desc="WebUntis-Stunden in deinen Stundenplan importieren."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Wortwahl: "idempotent" war Entwicklersprache -- ein Schueler
                  weiss nicht, was das bedeutet. Ersetzt durch den eigentlichen
                  Nutzen: der Abgleich haelt die Stunden aktuell, ohne dass beim
                  wiederholten Sync Duplikate entstehen. */}
              <p className="text-[13px] text-muted-foreground">
                Lädt deine Stunden von{" "}
                <span className="font-medium text-foreground">letzter Woche bis in drei Wochen</span> und hält sie
                aktuell.
              </p>
              <Button onClick={runSync} disabled={syncing} size="sm" variant="outline">
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                {/* ui-polish: beide Labels liegen uebereinander in derselben Grid-
                    Zelle -- die Breite reserviert sich am laengeren Text, der
                    Button springt beim Wechsel "Jetzt synchronisieren" <->
                    "Synchronisiere…" nicht mehr in der Breite. */}
                <span className="relative inline-grid">
                  <span className={cn("col-start-1 row-start-1", syncing && "invisible")}>
                    Jetzt synchronisieren
                  </span>
                  <span className={cn("col-start-1 row-start-1", !syncing && "invisible")}>Synchronisiere…</span>
                </span>
              </Button>
            </div>

            {/* A4: role="status" + aria-live traegt das Ergebnis auch zu
                Screenreader-Nutzern, die den Klick nicht visuell verfolgen. */}
            {sync && (
              <motion.div
                role="status"
                aria-live="polite"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={cn(
                  "mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px]",
                  sync.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                )}
              >
                {sync.ok ? (
                  <Check aria-hidden="true" className="mt-px size-4 shrink-0" />
                ) : (
                  <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
                )}
                {/* ui-polish: tabular-nums, damit die Ziffern (Anzahl, Datum) beim
                    naechsten Sync nicht in der Breite zittern. */}
                <span className="leading-snug tabular-nums">
                  {sync.ok ? (
                    <>
                      <span className="font-medium">{sync.fetched} Stunden geladen</span>, {sync.upserted} aktualisiert.
                      <span className="block text-muted-foreground">
                        Zeitraum {fmtDay(sync.window.start)} – {fmtDay(sync.window.end)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{friendlySyncMessage(sync.error, sync.kind)}</span>
                      <span className="mt-1 block break-words font-mono text-xs opacity-70">
                        Technisches Detail: {sync.error}
                      </span>
                    </>
                  )}
                </span>
              </motion.div>
            )}
          </Section>
        </StaggerItem>

        {/* Microsoft 365 / OneNote */}
        <StaggerItem>
          <Section
            icon={NotebookPen}
            title="OneNote"
            desc="Fach-Notizen als Seite in dein OneNote schicken."
          >
            <MicrosoftConnection />
          </Section>
        </StaggerItem>

        {/* Konto */}
        <StaggerItem>
          {/* A6 (Platzhalter): ein dauerhaft deaktivierter "Abmelden"-Button, der
              nie aktiv wird, ist selbst der Befund (ui-review: totes Bedienelement).
              Mehrnutzer/Login liegt in der Datenschicht, die hier nicht angefasst
              wird -- also ehrlicher Fliesstext statt vorgetaeuschter Bedienbarkeit. */}
          <Section icon={LogOut} title="Konto" desc="Ein Nutzer, keine Anmeldung nötig.">
            <p className="text-[13px] text-muted-foreground">
              Atlas läuft aktuell für ein einzelnes Konto ohne Login. Abmelden gibt es, sobald mehrere Nutzer
              unterstützt werden.
            </p>
          </Section>
        </StaggerItem>

        {/* Fuss */}
        <StaggerItem>
          {/* A2 (Kontrast): /70 faellt auf dem Hintergrund unter 4.5:1. */}
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Atlas · Dein Alltag an einem Ort.
          </p>
        </StaggerItem>
      </Stagger>
    </main>
  );
}
