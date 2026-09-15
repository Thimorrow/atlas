"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abschnittLabel, type Sprache, type Vokabel } from "@/lib/vokabeln";

const ZURUECK = { type: "spring", duration: 0.28, bounce: 0.12 } as const;

export function VokabelLernkarte({
  karte,
  sprache,
  busy,
  animateIn,
  onBewerten,
}: {
  karte: Vokabel;
  sprache: Sprache;
  busy: boolean;
  animateIn: boolean;
  onBewerten: (
    richtig: boolean,
    animation: Promise<unknown>,
    animateNext: boolean,
  ) => Promise<boolean>;
}) {
  const [umgedreht, setUmgedreht] = useState(false);
  const [gesehen, setGesehen] = useState(false);
  const [sofort, setSofort] = useState(false);
  const [abgabe, setAbgabe] = useState<boolean | null>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const rotation = useTransform(x, [-320, 0, 320], [-12, 0, 12]);
  const links = useTransform(x, [-90, -15, 0], [1, 0, 0]);
  const rechts = useTransform(x, [0, 15, 90], [0, 0, 1]);
  const flipRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    flipRef.current?.focus({ preventScroll: true });
  }, []);
  const locked = useRef(false);
  const gezogen = useRef(false);
  const blocked = busy || abgabe !== null;

  useEffect(
    () => () => {
      x.stop();
      opacity.stop();
    },
    [x, opacity],
  );

  function umdrehen(tastatur = false) {
    if (blocked || locked.current) return;
    setSofort(tastatur);
    setUmgedreht((alt) => !alt);
    setGesehen(true);
  }

  async function bewerten(richtig: boolean, tastatur = false) {
    if (!gesehen || blocked || locked.current) return;
    locked.current = true;
    setAbgabe(richtig);
    const ohneBewegung = reduce || tastatur;
    const flug = ohneBewegung
      ? Promise.resolve()
      : Promise.all([
          animate(x, (richtig ? 1 : -1) * Math.min(window.innerWidth, 700), {
            duration: 0.2,
            ease: [0.32, 0.72, 0, 1],
          }),
          animate(opacity, 0, { duration: 0.18, ease: [0.32, 0.72, 0, 1] }),
        ]);
    const angenommen = await onBewerten(richtig, flug, !ohneBewegung);
    if (!angenommen) {
      await Promise.all([
        animate(x, 0, ohneBewegung ? { duration: 0 } : ZURUECK),
        animate(opacity, 1, { duration: ohneBewegung ? 0 : 0.15 }),
      ]);
      setAbgabe(null);
      locked.current = false;
    }
  }

  useEffect(() => {
    function taste(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        blocked
      )
        return;
      if (event.key === "ArrowLeft" && gesehen) {
        event.preventDefault();
        void bewerten(false, true);
      }
      if (event.key === "ArrowRight" && gesehen) {
        event.preventDefault();
        void bewerten(true, true);
      }
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  const flaeche =
    "[grid-area:1/1] flex min-h-80 w-full flex-col rounded-2xl border bg-card p-6 shadow-card sm:min-h-96 sm:p-9";
  const rueckseite = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  } as const;

  return (
    <div className="space-y-5">
      <motion.div
        className="relative isolate"
        initial={
          animateIn && !reduce ? { opacity: 0, y: 10, scale: 0.98 } : false
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-2 flex items-center justify-center rounded-2xl border bg-muted/50"
        >
          <span className="text-sm text-muted-foreground">
            Deine nächste Vokabel
          </span>
        </div>
        <motion.div
          drag={gesehen && !blocked ? "x" : false}
          dragMomentum={false}
          onPointerDown={() => {
            if (!blocked) {
              gezogen.current = false;
              x.stop();
            }
          }}
          onDragStart={() => {
            gezogen.current = true;
          }}
          onDragEnd={(_, info) => {
            const richtung =
              Math.abs(info.offset.x) >= 90
                ? info.offset.x
                : Math.abs(info.offset.x) >= 30 &&
                    Math.abs(info.velocity.x) >= 650
                  ? info.velocity.x
                  : 0;
            if (richtung) void bewerten(richtung > 0);
            else void animate(x, 0, reduce ? { duration: 0 } : ZURUECK);
          }}
          style={{
            perspective: 1400,
            x,
            opacity,
            rotate: reduce ? 0 : rotation,
            touchAction: "pan-y",
          }}
          className="relative will-change-transform"
        >
          <motion.button
            ref={flipRef}
            type="button"
            disabled={blocked}
            aria-label={
              umgedreht
                ? `Vokabelkarte: ${karte.deutsch}. Zur Vorderseite umdrehen`
                : `Vokabelkarte: ${karte.wort}. Zur Antwort umdrehen`
            }
            aria-pressed={umgedreht}
            onClick={(event) => {
              if (!gezogen.current || event.detail === 0)
                umdrehen(event.detail === 0);
            }}
            animate={{ rotateY: umgedreht ? 180 : 0 }}
            initial={false}
            transition={{
              duration: reduce || sofort ? 0 : 0.28,
              ease: [0.65, 0, 0.35, 1],
            }}
            style={{ transformStyle: "preserve-3d" }}
            className="grid w-full cursor-pointer rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 disabled:cursor-default"
          >
            <span
              aria-hidden={umgedreht}
              style={rueckseite}
              className={flaeche}
            >
              <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  {abschnittLabel(sprache, karte.abschnitt)}
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1">
                  Box {karte.box}
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center justify-center gap-5 py-9 text-center">
                <span className="text-xs text-muted-foreground">
                  {sprache === "latein" ? "Latein" : "Englisch"} → Deutsch
                </span>
                <span className="max-w-full break-words text-3xl font-medium leading-snug tracking-tight sm:text-4xl">
                  {karte.wort}
                </span>
              </span>
              <span className="text-center text-xs text-muted-foreground">
                Antippen zum Umdrehen
              </span>
            </span>
            <span
              aria-hidden={!umgedreht}
              style={{ ...rueckseite, transform: "rotateY(180deg)" }}
              className={flaeche}
            >
              <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Die deutsche Bedeutung</span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1">
                  Box {karte.box}
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center justify-center gap-5 py-9 text-center">
                <span className="max-w-full break-words text-3xl font-medium leading-snug tracking-tight sm:text-4xl">
                  {karte.deutsch}
                </span>
                <span className="max-w-full break-words text-sm text-muted-foreground">
                  {karte.wort}
                </span>
              </span>
              <span className="text-center text-xs text-muted-foreground">
                Gewusst? Nach rechts wischen.
              </span>
            </span>
          </motion.button>
          <motion.span
            aria-hidden="true"
            style={{ opacity: links }}
            className="pointer-events-none absolute right-5 top-16 -rotate-12 rounded-lg border-2 border-destructive bg-background px-3 py-2 text-sm font-semibold text-destructive"
          >
            <X className="mr-1 inline size-4" /> Falsch
          </motion.span>
          <motion.span
            aria-hidden="true"
            style={{ opacity: rechts }}
            className="pointer-events-none absolute left-5 top-16 rotate-12 rounded-lg border-2 border-foreground bg-background px-3 py-2 text-sm font-semibold"
          >
            <Check className="mr-1 inline size-4" /> Richtig
          </motion.span>
        </motion.div>
      </motion.div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button
          variant="outline"
          className="min-h-14 flex-col gap-1 sm:flex-row sm:gap-2"
          disabled={!gesehen || blocked}
          onClick={(event) => void bewerten(false, event.detail === 0)}
        >
          <X className="size-4" /> Falsch
        </Button>
        <Button
          variant="outline"
          className="min-h-14 flex-col gap-1 sm:flex-row sm:gap-2"
          disabled={blocked}
          onClick={(event) => umdrehen(event.detail === 0)}
        >
          <RotateCcw className="size-4" /> Umdrehen
        </Button>
        <Button
          className="min-h-14 flex-col gap-1 sm:flex-row sm:gap-2"
          disabled={!gesehen || blocked}
          onClick={(event) => void bewerten(true, event.detail === 0)}
        >
          <Check className="size-4" /> Richtig
        </Button>
      </div>
      <p className="min-h-8 text-center text-xs leading-relaxed text-muted-foreground">
        {busy ? (
          "Nächste Vokabel …"
        ) : gesehen ? (
          <>
            <ArrowLeft className="mr-1 inline size-3" /> Falsch · Wischen oder
            Pfeiltasten · Richtig <ArrowRight className="ml-1 inline size-3" />
          </>
        ) : (
          "Überlege dir die Bedeutung. Drehe dann die Karte um."
        )}
      </p>
    </div>
  );
}
