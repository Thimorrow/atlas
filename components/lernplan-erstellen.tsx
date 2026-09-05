"use client";

// Erstell-Seite des Lernplans, drei Schritte: Material, Punkte pruefen,
// Diagnosetest -- der Diagnosetest erstellt den Plan am Ende gleich mit,
// ein eigener Bestaetigungsschritt entfaellt. Siehe SPEC.md "Erstell-Seite".
// Der Entwurf liegt in sessionStorage unter lernplan-entwurf:<assignmentId>,
// bis der Plan gespeichert oder verworfen ist -- Reload und Tab-Wechsel
// verlieren nichts.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Upload, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { MinutenFeld } from "@/components/lernplan-ui";
import { cn } from "@/lib/utils";
import { localISO } from "@/lib/assignments-view";
import { verkleinereBild } from "@/lib/bild-verkleinern";
import { ladeDateiInFachHoch } from "@/lib/datei-upload";
import { ACCEPT_ATTR, ACCEPTED_TYPES } from "@/lib/file-limits";
import { addTageISO, ersterPlantag } from "@/lib/lernplan";
import {
  MAX_PUNKTE_PRO_PLAN,
  ZEITBUDGET_MAX,
  ZEITBUDGET_MIN,
  type CheckDraft,
  type PlanDTO,
  type PunktDraft,
} from "@/lib/lernplan-types";
import { jetztHM } from "@/lib/zeit";

const LESEN_TIMEOUT = 90_000;
const BEWERTEN_TIMEOUT = 60_000;
const STORAGE_PREFIX = "lernplan-entwurf:";
const MAX_TEXT = 8000;

type Datei = { id: string; name: string; contentType: string };
type ChecklistMode = "upload" | "fach" | "text";
type ToastFn = (message: string, variant?: "error" | "success" | "warning", action?: { label: string; onClick: () => void }) => void;
// Punkte tragen im Entwurf einen lokalen Schluessel fuer stabile Keys/Merge/
// Loeschen -- die Server-Form (PunktDraft) kennt keine ID, bis der Plan steht.
type PunktLokal = PunktDraft & { key: string };

type Entwurf = {
  checklistMode: ChecklistMode;
  checklistFileId: string | null;
  checklistFileName: string | null;
  checklistText: string;
  minutesWeekday: number;
  minutesWeekend: number;
  checklisteText: string;
  punkte: PunktLokal[];
  antworten: Record<string, string | null>;
  checks: CheckDraft[] | null;
  // S2: ohne das hier bleiben antworten/checks nach einem Reload zwar
  // erhalten, aber die Position im Diagnosetest nicht -- Schritt 3 startet
  // dann wieder bei Frage 1, obwohl schon Antworten gespeichert sind.
  testIndex: number;
};

function neuerSchluessel(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// BLOCKIEREND-Fix: eigene, testbare Funktion statt der Klemmung inline im
// useState-Initializer von SchrittTest -- testIndex darf nie auf eine
// Position zeigen, die im tatsaechlich vorhandenen Fragensatz nicht mehr
// existiert (verworfener/neu erzeugter Fragensatz, oder ein alter Entwurf
// aus sessionStorage mit einem anderen Fragensatz). Siehe Kommentar bei
// "testIndex im Entwurf-Typ oben" und lernplan-erstellen.test.tsx.
export function klemmeTestIndex(testIndex: number, anzahlFragen: number): number {
  if (!Number.isFinite(testIndex) || testIndex < 0) return 0;
  return Math.min(testIndex, anzahlFragen);
}

function leererEntwurf(): Entwurf {
  return {
    checklistMode: "upload",
    checklistFileId: null,
    checklistFileName: null,
    checklistText: "",
    minutesWeekday: 30,
    minutesWeekend: 60,
    checklisteText: "",
    punkte: [],
    antworten: {},
    checks: null,
    testIndex: 0,
  };
}

const FEHLER_TEXT: Record<string, string> = {
  dateien_fremd: "Eine der Dateien gehört nicht zu diesem Fach.",
  datei_laden: "Eine Datei konnte nicht geladen werden.",
  datei_nicht_lesbar: "Eine Datei kann nicht gelesen werden.",
  pdf_ohne_text: "Das PDF enthält keinen Text. Als Foto hochladen oder Text einfügen.",
  modell: "Das Modell hat nicht geantwortet.",
  keine_punkte: "Keine Punkte erkannt. Text prüfen und erneut versuchen.",
  speichern: "Der Plan konnte nicht gespeichert werden.",
  pruefung: "Diese Prüfung gibt es nicht mehr.",
  keine_tage: "Bis zur Prüfung sind keine Tage mehr.",
  plan_gerade_erstellt: "Der Plan wurde gerade erstellt.",
  punkte: "Ein Punkt hat noch keinen Titel oder eine ungültige Minutenzahl. Zurück zur Liste und ergänzen.",
  // BLOCKIEREND-Fix: eigener Code fuer zu viele Punkte statt "punkte" -- der
  // Server (route.ts) unterscheidet das jetzt, dieser Text nennt den echten
  // Grund statt des Titel-/Minuten-Texts oben.
  zu_viele_punkte: `Es sind mehr als ${MAX_PUNKTE_PRO_PLAN} Punkte. Zwei zusammenlegen oder einen löschen.`,
  // Der Server trennt seit dem S4-Fix die leere Liste vom kaputten Punkt --
  // vorher trugen beide den Code "punkte" und nur einer der beiden Texte
  // konnte hier stehen. Seit FEHLER_TEXT Vorrang vor hinweis hat, waere der
  // falsche von beiden erschienen. Der Code heisst bewusst NICHT
  // "keine_punkte": den vergibt lib/lernplan-generieren.ts schon fuer den
  // Lese-Schritt ("aus dem Material war kein Punkt zu holen"), ein anderer
  // Fehler mit anderem Ausweg.
  plan_ohne_punkte: "Der Plan hat noch keinen einzigen Punkt. Zurück zur Liste und mindestens einen anlegen.",
  // S6: entsteht, wenn die Checkliste in Schritt 1 auf "upload"/"fach" ohne
  // gewaehlte Datei steht (z.B. per Browser-Zurueck nach einem Modus-Wechsel)
  // -- "Erneut versuchen" wuerde denselben ungueltigen Body noch einmal
  // schicken. Der Ausweg fuehrt darum zurueck nach Schritt 1, siehe
  // onChecklisteFehlt in SchrittTest.
  checklist: "Die Checkliste ist nicht mehr eindeutig. Zurück zu Material, um die Quelle erneut zu wählen.",
  // S8: diese vier Codes sind reine Formfehler (kaputter Body, ungueltige
  // Pruefung/Datei/Testantworten) -- kein Feld in diesem Formular kann das
  // reparieren, "Erneut versuchen" schickte denselben kaputten Body erneut.
  // Server liefert normalerweise schon einen hinweis dazu (fehlerNachricht
  // bevorzugt den), dieser Text ist nur das Netz, falls nicht.
  body: "Die Anfrage ist ungültig.",
  assignmentId: "Diese Prüfung ist ungültig.",
  fileIds: "Eine der Dateien ist ungültig.",
  checks: "Die Testantworten sind ungültig.",
  // S6-Fix: kein_fach fehlte hier, obwohl HARTE_ZUSTAENDE den Code fuehrt --
  // ohne Hinweis vom Server (fehlerNachricht bevorzugt den) waere die
  // Meldung "Das hat nicht geklappt. Erneut versuchen." ueber einem Knopf
  // "Zurueck zum Fach" gewesen. Die restlichen Eintraege hier sind
  // dieselbe Vollstaendigkeits-Pruefung: subjectId/antworten/minutesWeekday/
  // minutesWeekend/bot_aus tauchen als Codes in app/api/lernen/plan/route.ts
  // beziehungsweise .../bewerten/route.ts auf und fehlten ebenfalls.
  kein_fach: "Diese Prüfung hat kein Fach.",
  bot_aus: "Der Bot ist nicht eingerichtet.",
  subjectId: "Dieses Fach ist ungültig.",
  antworten: "Die Antworten sind ungültig.",
  minutesWeekday: "Die Minutenzahl für Wochentage ist ungültig.",
  minutesWeekend: "Die Minutenzahl für Wochenenden ist ungültig.",
};

// Audit-Fund (aus dem S6-Durchgang): diese Codes sind harte Zustaende --
// Pruefung geloescht, Pruefung ohne Fach, keine Tage mehr bis zur Pruefung,
// dazu (S8) die vier Formfehler-Codes oben. Nichts in diesem Formular kann
// das aendern, "Erneut versuchen" schlaegt darum garantiert wieder fehl.
// Siehe erstellenFehler-Zweig in SchrittTest.
const HARTE_ZUSTAENDE: readonly string[] = [
  "pruefung",
  "kein_fach",
  "keine_tage",
  "body",
  "assignmentId",
  "fileIds",
  "checks",
];

function fehlerNachricht(code: string | undefined, hinweis: string | string[] | undefined): string {
  // S4-Fix: FEHLER_TEXT hat Vorrang -- die Tabelle oben ist fuer bekannte
  // Codes sorgfaeltig auf deutschen, verstaendlichen Text getrimmt. hinweis
  // kommt direkt von der Route und ist teils Entwickler-/Maschinensprache
  // ("assignmentId ist keine gültige ID.", ein Umgebungsvariablenname wie
  // ZAI_API_KEY) -- das darf nicht auf dem Schirm landen, solange es einen
  // eigenen Text fuer den Code gibt. hinweis bleibt der Ruecksprung fuer
  // unbekannte Codes, damit dort wenigstens irgendein Text erscheint statt
  // des ganz generischen Satzes.
  if (code && FEHLER_TEXT[code]) return FEHLER_TEXT[code];
  if (typeof hinweis === "string" && hinweis) return hinweis;
  if (Array.isArray(hinweis) && hinweis.length > 0) return hinweis[0];
  return "Das hat nicht geklappt. Erneut versuchen.";
}

async function ladeMitTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// A2 (Fokus): .focus() allein bringt ein Ziel unterhalb/oberhalb des
// Sichtbereichs nicht zuverlaessig ins Bild -- explizit hereinscrollen statt
// sich auf das Standardverhalten des Browsers zu verlassen. "auto" statt
// "smooth" bei prefers-reduced-motion, block: "nearest" bewegt die Seite nur,
// wenn das Ziel tatsaechlich ausserhalb liegt.
function fokussiereSichtbar(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.focus();
  const reduziert = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduziert ? "auto" : "smooth", block: "nearest" });
}

// --- Datei-Upload direkt ins Fach, siehe lib/datei-upload.ts ----------------

async function uploadZuFach(subjectId: string, file: File): Promise<Datei> {
  return ladeDateiInFachHoch(subjectId, file);
}

async function bildFallsNoetigVerkleinern(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    return await verkleinereBild(file);
  } catch (e) {
    throw new Error(e instanceof Error && e.message === "Bild zu groß" ? "Bild zu groß" : "Das Bild konnte nicht verarbeitet werden.");
  }
}

export function LernplanErstellen({
  subjectId,
  assignmentId,
  initialSchritt,
}: {
  subjectId: string;
  assignmentId: string;
  initialSchritt: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const storageKey = `${STORAGE_PREFIX}${assignmentId}`;
  // S3-Fix: separater Marker statt eines Timers, der den Entwurf loescht --
  // siehe eingereichtMarkieren/eingereichtZurueckziehen unten.
  const eingereichtKey = `${storageKey}:eingereicht`;

  // Ein alter Link/Bookmark auf ?schritt=4 (den frueheren Bestaetigungsschritt,
  // inzwischen entfernt) faellt auf den letzten echten Schritt zurueck statt
  // ins Leere zu laufen.
  const [schritt, setSchrittState] = useState(Math.min(initialSchritt, SCHRITT_LABEL.length));
  useEffect(() => setSchrittState(Math.min(initialSchritt, SCHRITT_LABEL.length)), [initialSchritt]);

  const gehe = useCallback(
    (n: number) => {
      setSchrittState(n);
      router.push(`/lernen/${subjectId}/plan/${assignmentId}/neu?schritt=${n}`, { scroll: false });
    },
    [router, subjectId, assignmentId],
  );

  // A2 (Fokus): nach einem Schrittwechsel verschwindet der ausloesende Knopf,
  // der Fokus faellt sonst auf body. Die Ueberschrift des neuen Schritts nimmt
  // den Fokus auf, damit Tab dort weitermacht und ein Screenreader den
  // Wechsel ansagt.
  const schrittUeberschriftRef = useRef<HTMLHeadingElement | null>(null);
  // SOLLTE 9: der Effekt hat [schritt] als Dependency und feuert damit auch
  // beim Erstmount -- der Ref ueberspringt diesen ersten Lauf, sodass der
  // Fokus erst ab einem echten Schrittwechsel springt.
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    fokussiereSichtbar(schrittUeberschriftRef.current);
  }, [schritt]);

  // SOLLTE 3: Fallback-Ziel fuer Loesch-/Hinzufuege-Aktionen innerhalb eines
  // Schritts (Punkt loeschen, Blatt-Chip entfernen, letztes Blatt hinzufuegen),
  // wenn das ausloesende Element selbst und kein Geschwister mehr existiert --
  // sonst faellt der Fokus an body.
  const fokusUeberschrift = useCallback(() => {
    fokussiereSichtbar(schrittUeberschriftRef.current);
  }, []);

  // --- Voraussetzungen -------------------------------------------------------
  const [gate, setGate] = useState<"laden" | "ok" | "fehlt">("laden");
  const [gateGrund, setGateGrund] = useState("");
  const [assignment, setAssignment] = useState<{ id: string; title: string; dueDate: string | null } | null>(null);
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [bestehenderPlan, setBestehenderPlan] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [aRes, sRes, pRes] = await Promise.all([
          fetch(`/api/assignments?subjectId=${subjectId}`),
          fetch(`/api/lernen/${subjectId}`),
          fetch(`/api/lernen/plan/${assignmentId}`),
        ]);
        if (!alive) return;
        if (!aRes.ok || !sRes.ok) throw new Error("laden");
        const aData = (await aRes.json()) as {
          assignments: { id: string; title: string; dueDate: string | null; subjectId: string | null }[];
        };
        const sData = (await sRes.json()) as { dateien: Datei[]; botEnabled: boolean };
        const found = aData.assignments.find((a) => a.id === assignmentId) ?? null;
        setDateien(sData.dateien);
        setBestehenderPlan(pRes.status === 200);

        // S8: `/api/lernen/plan/${assignmentId}` liefert den Plan zu GENAU
        // dieser Pruefung (nicht irgendeinen Plan desselben Fachs) -- der Fall
        // ist also "Plan neu erstellen" fuer dieselbe Pruefung (bestehenderPlan
        // unten), nicht ein zweiter Plan zu einer anderen Pruefung im Fach. Der
        // bestehende Plan kennt schon die Minutenzahlen, der Schueler muss sie
        // beim Neu-Erstellen nicht erneut eintippen. Nur anwenden, wenn kein
        // eigener Entwurf (sessionStorage) restauriert wurde und die Felder
        // noch auf ihren Vorgaben stehen -- sonst ueberschreibt das eine
        // bereits getippte oder wiederhergestellte Eingabe.
        if (pRes.status === 200) {
          const planData = ((await pRes.json()) as { plan: PlanDTO }).plan;
          setEntwurf((e) => {
            if (hatteGespeichertenEntwurfRef.current) return e;
            if (e.minutesWeekday !== 30 || e.minutesWeekend !== 60) return e;
            return { ...e, minutesWeekday: planData.minutesWeekday, minutesWeekend: planData.minutesWeekend };
          });
        }

        if (!found) {
          setGateGrund("Diese Prüfung gibt es nicht (mehr).");
          setGate("fehlt");
        } else if (!found.subjectId) {
          setGateGrund("Diese Prüfung hat kein Fach.");
          setGate("fehlt");
        } else if (!found.dueDate || ersterPlantag(localISO(), jetztHM()) >= found.dueDate) {
          // BLOCKIEREND-Fix: dieselbe Regel wie verteilen() (lib/lernplan.ts)
          // -- vorher rechnete das Gate nur "dueDate <= heute" und liess eine
          // Pruefung morgen abends noch durch, weil der heutige Abend nach
          // 18 Uhr keinen Plantag mehr uebrig laesst. Der Schueler erfaehrt
          // das jetzt hier, statt nach Upload und Diagnosetest.
          setGateGrund(
            found.dueDate === addTageISO(localISO(), 1)
              ? "Die Prüfung ist morgen, der heutige Abend zählt nicht mehr als Lerntag. Bis dahin lässt sich kein Plan mehr erstellen."
              : "Bis zur Prüfung sind keine Tage mehr.",
          );
          setGate("fehlt");
        } else if (!sData.botEnabled) {
          setGateGrund("Die KI ist nicht eingerichtet, ein Lernplan lässt sich gerade nicht erstellen.");
          setGate("fehlt");
        } else {
          setAssignment({ id: found.id, title: found.title, dueDate: found.dueDate });
          setGate("ok");
        }
      } catch {
        if (!alive) return;
        setGateGrund("Die Daten konnten nicht geladen werden.");
        setGate("fehlt");
      }
    })();
    return () => {
      alive = false;
    };
  }, [subjectId, assignmentId]);

  // --- Entwurf in sessionStorage ---------------------------------------------
  const [entwurf, setEntwurf] = useState<Entwurf>(leererEntwurf);
  const loadedRef = useRef(false);
  // S8: haelt fest, ob ein eigener Entwurf wiederhergestellt wurde -- nur
  // ohne einen solchen darf der Plan-Minutenwert unten (Gate-Effekt) die
  // Vorgabewerte ueberschreiben.
  const hatteGespeichertenEntwurfRef = useRef(false);

  useEffect(() => {
    try {
      // S3-Fix: ein Entwurf, der schon zu einem Plan gefuehrt hat (Marker
      // gesetzt in onFertig unten) und den niemand per "Rueckgaengig" wieder
      // freigegeben hat, ist hier definitiv veraltet -- egal wie lange der
      // Rueckgaengig-Toast sichtbar war/ist, dieser Mount hier passiert erst,
      // NACHDEM der Nutzer den vorigen Bildschirm verlassen und diese Seite
      // neu aufgerufen hat, also nach Ablauf jedes moeglichen Toast-Fensters.
      // Statt eines Timers, der gegen die (durch Hover/Fokus verlaengerbare)
      // Sichtbarkeit des Toasts raet, entscheidet dieser Mount-Zeitpunkt
      // sicher richtig.
      if (sessionStorage.getItem(eingereichtKey)) {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(eingereichtKey);
      } else {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          hatteGespeichertenEntwurfRef.current = true;
          setEntwurf({ ...leererEntwurf(), ...(JSON.parse(raw) as Partial<Entwurf>) });
        }
      }
    } catch {
      // Ignorieren -- der Entwurf startet dann leer, der Schueler merkt davon nichts.
    }
    loadedRef.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entwurf));
    } catch {
      // Ignorieren -- der Entwurf wird dann nur nicht ueber einen Reload hinweg
      // gesichert, es gibt nichts, was der Schueler daraufhin tun koennte.
    }
  }, [entwurf, storageKey]);

  // S3-Fix: markiert den Entwurf als "hat schon zu einem Plan gefuehrt",
  // statt ihn nach einer festen Frist zu loeschen -- ein Timer hier muesste
  // exakt so lange laufen wie der Rueckgaengig-Toast sichtbar ist, aber
  // dessen Anzeigedauer verlaengert sich durch Hover/Fokus (siehe toast.tsx)
  // und ist von hier aus nicht beobachtbar. Der Marker wird stattdessen beim
  // naechsten Mount ausgewertet (siehe Restaurier-Effekt oben): sicher genug,
  // weil dieser Mount erst NACH jedem moeglichen Toast-Fenster passieren
  // kann. "Rueckgaengig" (siehe onFertig unten) macht den Marker rueckgaengig.
  function eingereichtMarkieren() {
    try {
      sessionStorage.setItem(eingereichtKey, "1");
    } catch {
      // Ignorieren -- ohne Marker restauriert der naechste Mount den Entwurf
      // wieder, statt ihn als veraltet zu verwerfen. Harmlos: der Schueler
      // sieht dann bestenfalls unnoetig seinen alten Entwurf wieder.
    }
  }

  function eingereichtZurueckziehen() {
    try {
      sessionStorage.removeItem(eingereichtKey);
    } catch {
      // Ignorieren -- siehe eingereichtMarkieren oben.
    }
  }

  if (gate === "laden") {
    // NIT-Fix: aria-label auf einem <div> ohne Rolle wird von den meisten
    // Screenreadern ignoriert, aria-busy allein wird dort nicht vorgelesen --
    // role="status" macht daraus eine echte Live-Region.
    return (
      <div className="mx-auto max-w-2xl space-y-4" role="status" aria-label="Wird geladen" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (gate === "fehlt") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-[15px] font-medium">Lernplan lässt sich nicht erstellen</p>
          <p className="text-[13px] text-muted-foreground">{gateGrund}</p>
          <Link
            href={`/lernen/${subjectId}`}
            className="rounded-md px-2 py-1.5 text-[13px] text-muted-foreground [touch-action:manipulation] underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zurück zum Fach
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lernplan erstellen
        </p>
        <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{assignment?.title}</h1>
      </div>

      <Fortschritt schritt={schritt} />

      <h2
        ref={schrittUeberschriftRef}
        tabIndex={-1}
        className="rounded text-[15px] font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SCHRITT_LABEL[schritt - 1]}
      </h2>

      {/* NIT: der Banner ist nur in Schritt 1 (hier startet man einen neuen
          Lernplan trotz bestehendem) und Schritt 3 (hier ersetzt "Plan neu
          erstellen" ihn tatsaechlich) relevant -- in Schritt 2 (Punkte
          pruefen) traegt er nichts bei. */}
      {bestehenderPlan && schritt !== 2 && (
        <div className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          Es gibt schon einen Plan zu dieser Prüfung, ein neuer ersetzt ihn.
        </div>
      )}
      {schritt === 1 && (
        <SchrittMaterial
          subjectId={subjectId}
          assignmentId={assignmentId}
          dateien={dateien}
          setDateien={setDateien}
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          onWeiter={(daten) => {
            setEntwurf((e) => ({
              ...e,
              checklisteText: daten.checklisteText,
              punkte: daten.punkte.map((p) => ({ ...p, key: neuerSchluessel() })),
              checks: null,
              antworten: {},
              // BLOCKIEREND-Fix: ein neu erzeugter Fragensatz gehoert zu
              // keinem testIndex mehr als 0 -- ohne den Reset hier blieb
              // testIndex auf einer alten Position stehen (z.B. 3 nach einem
              // "Zurueck" durch Schritt 3), und Schritt 3 stieg beim naechsten
              // Aufruf mitten in den frischen (und noch unbeantworteten)
              // Fragen ein. Die ersten Fragen wurden dann nie gestellt und
              // landeten in auswerten() als "falsch"/"Uebersprungen" --
              // erfundene Messwerte, die in die Sicherheit (lib/lernplan.ts)
              // eingehen. Siehe auch den Clamp in SchrittTest unten als
              // zweite Absicherung gegen einen alten Entwurf aus
              // sessionStorage.
              testIndex: 0,
            }));
            gehe(2);
          }}
          toast={toast}
        />
      )}

      {schritt === 2 && (
        <SchrittPunkte
          subjectId={subjectId}
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          dateien={dateien}
          setDateien={setDateien}
          onZurueck={() => gehe(1)}
          onWeiter={() => gehe(3)}
          toast={toast}
          onFallbackFocus={fokusUeberschrift}
        />
      )}

      {schritt === 3 && (
        <SchrittTest
          subjectId={subjectId}
          assignmentId={assignmentId}
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          bestehenderPlan={bestehenderPlan}
          onZurueck={() => gehe(2)}
          onChecklisteFehlt={() => gehe(1)}
          onFertig={(createdTopicIds, planId, anzahlEinheiten) => {
            router.push(`/lernen/${subjectId}/plan/${assignmentId}`);
            toast(
              `Lernplan mit ${anzahlEinheiten} ${anzahlEinheiten === 1 ? "Einheit" : "Einheiten"} angelegt`,
              "success",
              {
                label: "Rückgängig",
                // S1: die Antwort auswerten statt sie zu ignorieren -- bei
                // Erfolg erzwingt window.location.assign() einen echten
                // Neuaufbau der schon besuchten Planseite (die Seite ist eine
                // Client-Komponente mit eigenem Effekt-Laden, router.refresh()
                // liefert nur eine neue RSC-Payload an dieselbe Instanz und
                // loest kein zweites Laden aus -- siehe subject-detail.tsx
                // remove() fuer dasselbe Muster). Bei Fehlschlag sagt ein
                // Fehler-Toast dem Nutzer den Ausweg, statt dass der Plan
                // unbemerkt weiterbesteht.
                onClick: () => {
                  void (async () => {
                    try {
                      const res = await fetch(`/api/lernen/plan/${planId}`, {
                        method: "DELETE",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ topicIds: createdTopicIds }),
                      });
                      if (!res.ok) {
                        toast("Der Plan konnte nicht rückgängig gemacht werden. Seite neu laden und erneut versuchen.");
                        return;
                      }
                      // S3-Fix: der Plan ist wirklich weg -- der Entwurf soll
                      // beim naechsten Besuch von "Lernplan erstellen" wieder
                      // vollstaendig da sein, kein Marker ihn als veraltet
                      // verwerfen lassen.
                      eingereichtZurueckziehen();
                      window.location.assign(`/lernen/${subjectId}/plan/${assignmentId}`);
                    } catch {
                      toast("Der Plan konnte nicht rückgängig gemacht werden. Seite neu laden und erneut versuchen.");
                    }
                  })();
                },
              },
            );
            // S3-Fix: kein Timer mehr, der gegen die (durch Hover/Fokus
            // verlaengerbare) Sichtbarkeit des Rueckgaengig-Toasts raet --
            // der Marker macht den Entwurf erst beim naechsten Mount ungueltig
            // (siehe Restaurier-Effekt oben), das ist immer sicher spaet genug.
            eingereichtMarkieren();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// --- Fortschrittsanzeige der drei Schritte ----------------------------------

const SCHRITT_LABEL = ["Material", "Punkte prüfen", "Diagnosetest"];

function Fortschritt({ schritt }: { schritt: number }) {
  return (
    <>
      {/* SOLLTE 7: aria-live auf der ol war tot, weil sich beim Schrittwechsel
          nur aria-label und Klassen aendern -- Labelaenderungen loesen keine
          Ansage aus. Eine eigene sr-only-Region mit echtem Textwechsel sagt
          den Wechsel tatsaechlich an. */}
      <p aria-live="polite" className="sr-only">
        Schritt {schritt} von {SCHRITT_LABEL.length}, {SCHRITT_LABEL[schritt - 1]}
      </p>
      <ol className="flex items-center gap-1.5" aria-label={`Schritt ${schritt} von ${SCHRITT_LABEL.length}`}>
        {SCHRITT_LABEL.map((label, i) => {
          const n = i + 1;
          const aktiv = n === schritt;
          const erledigt = n < schritt;
          return (
            <li key={label} aria-current={aktiv ? "step" : undefined} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  aktiv && "bg-primary text-primary-foreground",
                  erledigt && !aktiv && "bg-primary/20 text-primary",
                  !aktiv && !erledigt && "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </span>
              <span
                className={cn(
                  // S8-Fix: unter dem sm-Breakpoint blieben von allen drei
                  // Labels nur nackte Ziffern uebrig -- sehende Telefonnutzer
                  // erfuhren (anders als Screenreader ueber die Live-Region
                  // oben) nicht, dass z.B. Schritt 3 der Diagnosetest ist. Ab
                  // jetzt bleibt nur das AKTIVE Label auf dem Telefon sichtbar,
                  // die uebrigen bleiben sr-only; ab sm sind wie bisher alle
                  // sichtbar.
                  "truncate text-[12px] sm:static sm:inline sm:not-sr-only",
                  aktiv ? "not-sr-only font-medium text-foreground" : "sr-only text-muted-foreground",
                )}
              >
                {label}
              </span>
              {n < SCHRITT_LABEL.length && <span aria-hidden className="h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// --- Schritt 1: Material -----------------------------------------------------

// Quelle der Checkliste: genau eine von drei Optionen -- eine Radiogruppe,
// keine unabhaengigen Umschalter. Pfeiltasten wechseln Auswahl und Fokus,
// nur der aktive Chip ist per Tab erreichbar.
const CHECKLIST_MODES: { value: ChecklistMode; label: string }[] = [
  { value: "upload", label: "Foto/PDF hochladen" },
  { value: "fach", label: "Aus Fach-Dateien" },
  { value: "text", label: "Text einfügen" },
];

function ChecklistModeRadiogroup({
  value,
  onChange,
}: {
  value: ChecklistMode;
  onChange: (mode: ChecklistMode) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % CHECKLIST_MODES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + CHECKLIST_MODES.length) % CHECKLIST_MODES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CHECKLIST_MODES.length - 1;
    else return;
    e.preventDefault();
    const ziel = CHECKLIST_MODES[next];
    if (!ziel) return;
    onChange(ziel.value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Quelle der Checkliste" className="flex flex-wrap gap-2">
      {CHECKLIST_MODES.map((m, i) => {
        const checked = value === m.value;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(m.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative min-h-11 rounded-full border px-3.5 text-[13px] font-medium transition-colors ease-[var(--ease-atlas)] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              // WCAG 1.4.11: der Rahmen ist bei nicht gewaehlten Chips die
              // einzige Begrenzung des Bedienelements (keine Fuellung) --
              // border-border-control statt border-border, siehe Rechnung
              // dazu in app/globals.css.
              checked ? "border-primary bg-primary text-primary-foreground" : "border-border-control hover:bg-accent",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function SchrittMaterial({
  subjectId,
  assignmentId,
  dateien,
  setDateien,
  entwurf,
  setEntwurf,
  onWeiter,
  toast,
}: {
  subjectId: string;
  assignmentId: string;
  dateien: Datei[];
  setDateien: React.Dispatch<React.SetStateAction<Datei[]>>;
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  onWeiter: (daten: { checklisteText: string; punkte: PunktDraft[] }) => void;
  toast: ToastFn;
}) {
  const [checklistUploading, setChecklistUploading] = useState(false);
  const [lesenLoading, setLesenLoading] = useState(false);
  const [lesenError, setLesenError] = useState<string | null>(null);
  // S1-Fix: merkt einen Klick auf "Checkliste lesen" ohne gewaehlte Quelle
  // (z.B. "Aus Fach-Dateien" ohne Dateien im Fach) -- derselbe blasse Knopf
  // tat vorher wortlos nichts. Gleiches Muster wie weiterVersucht bei
  // "Weiter zum Test" in SchrittPunkte (:1585-1595 dort).
  const [lesenVersucht, setLesenVersucht] = useState(false);
  // S7: ohne role="alert"/Fokuswechsel erfaehrt ein Screenreader-Nutzer nach
  // bis zu LESEN_TIMEOUT (90s) Warten nur ueber die Knopfbeschriftung
  // ("Erneut versuchen"), dass das Lesen fehlgeschlagen ist. Dasselbe Muster
  // wie fehlerSchirmRef/fokussiereSichtbar in SchrittTest (:1949-1955 etc.).
  const lesenFehlerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (lesenError) fokussiereSichtbar(lesenFehlerRef.current);
  }, [lesenError]);

  // Tastenkuerzel-Anzeige ist plattformabhaengig (⌘ auf macOS, Strg sonst,
  // wie modKey in lesson-note.tsx) und faellt auf einem Geraet ohne Tastatur
  // (grobes Zeigegeraet, kein Hover) ganz weg -- dort gibt es das Kuerzel
  // nicht zu druecken. navigator/matchMedia sind erst nach der Hydration
  // verlaesslich bekannt, darum startet der Hinweis unsichtbar und erscheint
  // erst im Effekt nach dem Mount.
  const [modKey, setModKey] = useState<string | null>(null);
  useEffect(() => {
    const ohneTastatur = window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(hover: hover)").matches;
    if (ohneTastatur) return;
    setModKey(/Mac/.test(navigator.userAgent) ? "⌘" : "Strg");
  }, []);

  const checklistInputRef = useRef<HTMLInputElement | null>(null);
  const checklistInputId = useId();

  // NIT: die Fade-Kante soll nur zeigen, dass die Liste tatsaechlich
  // ueberlaeuft (scrollHeight > clientHeight), nicht pauschal bei jeder
  // Groesse -- sonst schwebt sie auch ueber einer einzigen Datei.
  const fachListRef = useRef<HTMLUListElement | null>(null);
  const [fachUeberlaeuft, setFachUeberlaeuft] = useState(false);

  useEffect(() => {
    const el = fachListRef.current;
    setFachUeberlaeuft(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [dateien, entwurf.checklistMode]);

  async function checklisteHochladen(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      toast("Nur PDF, PNG, JPG, WEBP oder HEIC.");
      return;
    }
    setChecklistUploading(true);
    try {
      const zu = await bildFallsNoetigVerkleinern(file);
      const datei = await uploadZuFach(subjectId, zu);
      setDateien((d) => [datei, ...d]);
      setEntwurf((e) => ({ ...e, checklistMode: "upload", checklistFileId: datei.id, checklistFileName: datei.name }));
      // S10-Fix: neue Datei hochgeladen -- ein vorheriger Lesefehler bezog
      // sich auf eine andere Quelle.
      setLesenError(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Die Datei konnte nicht hochgeladen werden.");
    } finally {
      setChecklistUploading(false);
    }
  }

  const hatChecklist =
    (entwurf.checklistMode !== "text" && !!entwurf.checklistFileId) ||
    (entwurf.checklistMode === "text" && entwurf.checklistText.trim().length > 0);

  async function checklisteLesen() {
    setLesenError(null);
    setLesenLoading(true);
    try {
      const body =
        entwurf.checklistMode === "text"
          ? { checklist: { text: entwurf.checklistText.trim() } }
          : { checklist: { fileId: entwurf.checklistFileId } };
      const res = await ladeMitTimeout(
        "/api/lernen/plan/lesen",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            ...body,
          }),
        },
        LESEN_TIMEOUT,
      );
      const data = (await res.json().catch(() => null)) as
        | { entwurf: { checklisteText: string; punkte: PunktDraft[] }; hinweis?: string[] }
        | { error: string; hinweis?: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setLesenError(fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined));
        return;
      }
      if (data.hinweis && data.hinweis.length > 0) {
        // S4: alle Hinweise aus lib/lernplan-generieren.ts sind Einbussen
        // ("konnte nicht geladen/gelesen werden", "wurde weggelassen",
        // "wurden gekuerzt") -- kein einziger ist reine Information. "warning"
        // (components/toast.tsx) trifft die Botschaft besser als "success".
        toast(data.hinweis.join(" "), "warning");
      }
      onWeiter(data.entwurf);
    } catch {
      setLesenError("Das Modell hat nicht geantwortet. Erneut versuchen.");
    } finally {
      setLesenLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        {/* S9: eine Ebene unter der Schritt-Ueberschrift (:338, ebenfalls h2)
            -- sonst kollabieren zwei Ebenen zu einer. */}
        <h3 className="text-[13px] font-semibold">Checkliste</h3>
        <p className="text-[12.5px] text-muted-foreground">Genau eine Quelle: Foto, PDF, Fach-Datei oder Text.</p>
        <ChecklistModeRadiogroup
          value={entwurf.checklistMode}
          onChange={(mode) => {
            // S3-Fix: die Datei-Auswahl gehoert zum Modus, in dem sie getroffen
            // wurde. Ohne Reset zeigte "Foto/PDF hochladen" zwar korrekt eine
            // leere Dropzone (:827-829-Fix), aber checklisteLesen schickte
            // trotzdem noch die fileId der zuvor in "Aus Fach-Dateien"
            // gewaehlten Datei -- Anzeige und Daten liefen auseinander.
            setEntwurf((e) => ({ ...e, checklistMode: mode, checklistFileId: null, checklistFileName: null }));
            // S10-Fix: lesenError bezieht sich auf die zuletzt GELESENE Quelle
            // -- nach einem Moduswechsel ist das nicht mehr, was gerade
            // gewaehlt ist. Ohne Reset stand die rote Meldung samt "Erneut
            // versuchen" weiter da, obwohl ein erneuter Klick jetzt etwas
            // anderes lesen wuerde.
            setLesenError(null);
          }}
        />

        {entwurf.checklistMode === "upload" && (
          <div>
            {/* BLOCKIEREND-Fix: vorher ein sr-only <input> (fokussierbar, aber
                1x1px und ohne Label) PLUS ein separates <button>, das den
                Klick per .click() weiterreichte -- zwei Tabstopps statt eines,
                der zweite ohne Fokusring und ohne Namen ("Datei auswaehlen,
                Schaltflaeche"). Muster wie subject-files.tsx:276-295: ein
                peer sr-only <input> mit echtem <label htmlFor>, das den
                Fokusring per peer-focus-visible traegt -- ein Tabstopp,
                sichtbarer Fokus, echter Name. `disabled` statt eines
                onClick-Guards sperrt die Auswahl waehrend des Uploads. */}
            <input
              ref={checklistInputRef}
              id={checklistInputId}
              type="file"
              accept={ACCEPT_ATTR}
              disabled={checklistUploading}
              className="peer sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void checklisteHochladen(file);
              }}
            />
            <label
              htmlFor={checklistInputId}
              aria-busy={checklistUploading}
              className={cn(
                "flex min-h-[64px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-4 text-center transition-colors ease-[var(--ease-atlas)] [touch-action:manipulation] hover:bg-accent/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                checklistUploading && "opacity-60",
              )}
            >
              {checklistUploading ? (
                <Loader2 className="size-4 motion-safe:animate-spin text-muted-foreground" />
              ) : (
                <Upload className="size-4 text-muted-foreground" />
              )}
              <span className="text-[13px] font-medium">
                {/* NIT-Fix: die Dropzone behielt beim Hochladen ihre
                    Ruhe-Beschriftung ("Foto oder PDF waehlen") und zeigte nur
                    den Spinner -- subject-files.tsx:298 sagt an derselben
                    Stelle an, dass gerade hochgeladen wird. */}
                {checklistUploading
                  ? "Wird hochgeladen …"
                  : /* NIT: checklistFileId ueberlebt einen Moduswechsel (z.B.
                    "Aus Fach-Dateien" -> zurueck zu "Foto/PDF hochladen") --
                    ohne die Modus-Pruefung zeigte die Dropzone den Namen der
                    Fach-Datei, als waere sie gerade hier hochgeladen worden. */
                  entwurf.checklistMode === "upload" && entwurf.checklistFileId
                    ? entwurf.checklistFileName
                    : "Foto oder PDF wählen"}
              </span>
            </label>
          </div>
        )}

        {entwurf.checklistMode === "fach" && (
          <div className="relative">
            <ul ref={fachListRef} className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {dateien.length === 0 && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">Noch keine Fach-Dateien.</li>}
            {dateien.map((f) => (
              <li key={f.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                  <input
                    type="radio"
                    name="checklist-fach"
                    checked={entwurf.checklistFileId === f.id}
                    onChange={() => {
                      setEntwurf((e) => ({ ...e, checklistFileId: f.id, checklistFileName: f.name }));
                      // S10-Fix: andere Fach-Datei gewaehlt -- derselbe Grund
                      // wie beim Moduswechsel/Upload oben.
                      setLesenError(null);
                    }}
                    className="size-4 shrink-0 [touch-action:manipulation]"
                  />
                  <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
                </label>
              </li>
            ))}
            </ul>
            {/* weiche Fade-Kante statt dem Wort "Scrollbar" -- erklaert nichts
                extra, zeigt die Scrollbarkeit aber trotzdem an. Nur sichtbar,
                wenn die Liste tatsaechlich ueberlaeuft (SOLLTE sonst schwebt
                sie auch ueber einer einzigen Datei ohne etwas zu verbergen). */}
            {fachUeberlaeuft && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-lg bg-gradient-to-t from-background to-transparent" />
            )}
          </div>
        )}

        {entwurf.checklistMode === "text" && (
          <div>
            <label htmlFor="checkliste-text" className="mb-1 block text-[12.5px] font-medium text-muted-foreground">
              Checkliste als Text
            </label>
            <textarea
              id="checkliste-text"
              value={entwurf.checklistText}
              onChange={(e) => setEntwurf((prev) => ({ ...prev, checklistText: e.target.value.slice(0, MAX_TEXT) }))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && hatChecklist && !lesenLoading && !checklistUploading) {
                  e.preventDefault();
                  void checklisteLesen();
                }
              }}
              rows={6}
              placeholder="Checkliste einfügen"
              aria-describedby="checkliste-text-zaehler"
              className="w-full resize-none rounded-md border border-border-control bg-background px-3 py-2 text-[16px] outline-none [touch-action:manipulation] focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div id="checkliste-text-zaehler" className="mt-1 flex min-h-4 items-center justify-between gap-2">
              {modKey && <p className="text-[12px] text-muted-foreground">{modKey} + Enter liest die Checkliste</p>}
              {entwurf.checklistText.length >= MAX_TEXT * 0.8 && (
                <p
                  className={cn(
                    "text-[11px] tabular-nums text-muted-foreground",
                    entwurf.checklistText.length >= MAX_TEXT * 0.95 && "text-destructive",
                  )}
                >
                  {entwurf.checklistText.length}/{MAX_TEXT}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {lesenError && (
        <div
          ref={lesenFehlerRef}
          tabIndex={-1}
          role="alert"
          // S7-Fix: text-destructive auf bg-destructive/10 liegt bei 13px nur
          // bei rund 4,0:1 (hell) bzw. 4,3:1 (dunkel) -- unter der Pflicht
          // 4,5:1 fuer Fliesstext. text-red-700/dark:text-red-400 (dieselbe
          // Kombination wie URTEIL_STYLE unten) erreicht 5,44:1 (hell, gegen
          // rgb(253,230,231)) bzw. rund 5,7:1 (dunkel, gegen rgb(46,31,31)) --
          // die Tonung von bg/border bleibt, nur der Text wird dunkler/heller.
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {lesenError}
        </div>
      )}

      {/* S6-Fix: Schritt 1 hatte anders als Schritt 2/3 keinen Ausgang ausser
          Browser-Zurueck -- gerade hier kann auffallen, dass die falsche
          Pruefung offen ist. Derselbe Link wie im Gate-Zustand "fehlt"
          (:330-335). */}
      {/* S1-Fix: Sonst tat der blasse Hauptknopf ohne gewaehlte Quelle wortlos
          nichts -- der Schueler waehlt z.B. "Aus Fach-Dateien" bei einem Fach
          ohne Dateien, tippt zweimal, nichts passiert. */}
      {!hatChecklist && lesenVersucht && (
        <p className="text-[12.5px] text-destructive">
          Zuerst eine Checkliste hochladen, aus den Fach-Dateien wählen oder Text einfügen.
        </p>
      )}
      <div className="flex gap-2">
        <Link href={`/lernen/${subjectId}`} className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
          Zurück
        </Link>
        <Button
          type="button"
          className={cn("h-11 flex-1", (!hatChecklist || lesenLoading || checklistUploading) && "opacity-60")}
          aria-disabled={!hatChecklist || lesenLoading || checklistUploading}
          aria-busy={lesenLoading}
          onClick={() => {
            if (!hatChecklist || lesenLoading || checklistUploading) {
              if (!hatChecklist) setLesenVersucht(true);
              return;
            }
            void checklisteLesen();
          }}
        >
          {lesenLoading ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" />
              Checkliste wird gelesen …
            </>
          ) : lesenError ? (
            "Erneut versuchen"
          ) : (
            "Checkliste lesen"
          )}
        </Button>
      </div>
    </div>
  );
}

// --- Schritt 2: Punkte pruefen ----------------------------------------------

// S2: Checks binden ueber pointIndex an die Position im punkte-Array (siehe
// lib/lernplan-types.ts, Fallback ist die Array-Position selbst). Loeschen
// oder Zusammenlegen zweier Punkte muss also nur den betroffenen Check
// herausnehmen und die Indizes der folgenden Checks verschieben, statt den
// ganzen Diagnosetest zu verwerfen -- Undo legt beides symmetrisch zurueck.
function checkAnPosition(checks: CheckDraft[] | null, pos: number): CheckDraft | null {
  if (!checks) return null;
  return checks.find((c, i) => (c.pointIndex ?? i) === pos) ?? null;
}

function entferneCheckAnPosition(checks: CheckDraft[] | null, pos: number): CheckDraft[] | null {
  if (!checks) return checks;
  return checks
    .map((c, i) => ({ c, at: c.pointIndex ?? i }))
    .filter(({ at }) => at !== pos)
    .map(({ c, at }) => (at > pos ? { ...c, pointIndex: at - 1 } : c));
}

function fuegeCheckWiederEin(checks: CheckDraft[] | null, pos: number, check: CheckDraft | null): CheckDraft[] | null {
  if (!checks) return checks;
  const verschoben = checks.map((c, i) => {
    const at = c.pointIndex ?? i;
    return at >= pos ? { ...c, pointIndex: at + 1 } : c;
  });
  return check ? [...verschoben, { ...check, pointIndex: pos }] : verschoben;
}

function SchrittPunkte({
  subjectId,
  entwurf,
  setEntwurf,
  dateien,
  setDateien,
  onZurueck,
  onWeiter,
  toast,
  onFallbackFocus,
}: {
  subjectId: string;
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  dateien: Datei[];
  setDateien: React.Dispatch<React.SetStateAction<Datei[]>>;
  onZurueck: () => void;
  onWeiter: () => void;
  toast: ToastFn;
  onFallbackFocus: () => void;
}) {
  const [markiert, setMarkiert] = useState<string[]>([]);
  // Checkboxen zum Zusammenlegen sitzen hinter diesem Modus statt an jeder
  // Zeile dauerhaft -- die 44px-Spalte fuer eine seltene Aktion wuerde sonst
  // das Titelfeld verengen, das man wirklich bearbeitet.
  const [auswahlModus, setAuswahlModus] = useState(false);

  // S8: ein frisch angelegter Punkt (leerer Titel) darf nicht sofort als
  // Fehler markiert sein -- beruehrt haelt die Punkt-Schluessel, deren
  // Titelfeld schon verlassen wurde, weiterVersucht merkt einen Klick auf
  // "Weiter zum Test" trotz gesperrtem Zustand. Erst eines von beidem
  // schaltet die rote Meldung frei; der Weiter-Knopf selbst bleibt unabhaengig
  // davon gesperrt, solange irgendein Titel fehlt.
  const [beruehrt, setBeruehrt] = useState<Set<string>>(new Set());
  const [weiterVersucht, setWeiterVersucht] = useState(false);
  // S1-Fix: derselbe Zweck wie weiterVersucht oben, fuer "Zusammenlegen" --
  // ein Klick mit falscher Markieranzahl tat vorher wortlos nichts, die
  // Erklaerung lag nur sr-only da.
  const [zusammenlegenVersucht, setZusammenlegenVersucht] = useState(false);

  function beruehre(key: string) {
    setBeruehrt((s) => (s.has(key) ? s : new Set(s).add(key)));
  }

  function auswahlBeenden() {
    setAuswahlModus(false);
    setMarkiert([]);
  }

  // SOLLTE 3: Fokus-Ziele fuer "naechstes Geschwister, sonst Ueberschrift" --
  // Loesch-Knopf pro Punkt (Index im Array) und Datei-Chip-Knopf pro Punkt
  // (Map vom Punkt-Schluessel auf seine Chip-Knoepfe), plus der "+ Blatt"-
  // Ausloeser pro Punkt, der beim letzten hinzufuegbaren Blatt verschwindet.
  const punktLoeschenRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const chipRefsRef = useRef<Map<string, (HTMLButtonElement | null)[]>>(new Map());
  const blattTriggerRefsRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  // S5: "Punkt hinzufuegen" haengte einen leeren Punkt ans Ende, der Fokus
  // blieb aber auf dem Knopf stehen -- der neue, ungueltige Punkt (roter
  // Rand, "Titel fehlt noch.") entstand oberhalb, ohne dass ihn ein
  // Screenreader je zu sehen bekam. titelRefsRef haelt das Titel-Input pro
  // Punkt-Schluessel, neuerPunktKeyRef merkt sich den zuletzt angelegten
  // Schluessel bis zum naechsten Render, der Effekt darunter fokussiert ihn
  // dann tatsaechlich.
  const titelRefsRef = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const neuerPunktKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = neuerPunktKeyRef.current;
    if (!key) return;
    const el = titelRefsRef.current.get(key);
    if (el) {
      neuerPunktKeyRef.current = null;
      fokussiereSichtbar(el);
    }
  }, [entwurf.punkte]);

  function setChipRef(punktKey: string, idx: number, el: HTMLButtonElement | null) {
    const arr = chipRefsRef.current.get(punktKey) ?? [];
    arr[idx] = el;
    chipRefsRef.current.set(punktKey, arr);
  }

  function patchPunkt(key: string, patch: Partial<PunktLokal>) {
    setEntwurf((e) => ({ ...e, punkte: e.punkte.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
  }

  // Datei-Chip entfernen: Fokus auf den naechsten Chip-Knopf in derselben
  // Reihe, sonst den "+ Blatt"-Ausloeser (naechstes Geschwister danach),
  // sonst die Schritt-Ueberschrift.
  function entferneDatei(punktKey: string, id: string) {
    const punkt = entwurf.punkte.find((p) => p.key === punktKey);
    if (!punkt) return;
    const idx = punkt.fileIds.indexOf(id);
    const chipRefs = chipRefsRef.current.get(punktKey) ?? [];
    const ziel = (idx >= 0 ? chipRefs[idx + 1] : undefined) ?? blattTriggerRefsRef.current.get(punktKey) ?? null;
    patchPunkt(punktKey, { fileIds: punkt.fileIds.filter((f) => f !== id) });
    if (ziel) fokussiereSichtbar(ziel);
    else onFallbackFocus();
  }

  function loeschePunkt(key: string) {
    const index = entwurf.punkte.findIndex((p) => p.key === key);
    const punkt = entwurf.punkte[index];
    if (!punkt) return;
    // Nur der eigene Check dieses Punkts (falls vorhanden) und seine eigene
    // Antwort gehen verloren -- Checks der uebrigen Punkte werden umindiziert
    // statt verworfen, Undo legt beides symmetrisch zurueck. Siehe
    // checkAnPosition/entferneCheckAnPosition/fuegeCheckWiederEin oben.
    const eigenerCheck = checkAnPosition(entwurf.checks, index);
    const eigeneAntwort = entwurf.antworten[key];
    const ziel = punktLoeschenRefs.current[index + 1] ?? null;
    setEntwurf((e) => {
      const { [key]: _entfernt, ...antwortenOhne } = e.antworten;
      return {
        ...e,
        punkte: e.punkte.filter((p) => p.key !== key),
        antworten: antwortenOhne,
        checks: entferneCheckAnPosition(e.checks, index),
      };
    });
    setMarkiert((m) => m.filter((k) => k !== key));
    if (ziel) fokussiereSichtbar(ziel);
    else onFallbackFocus();
    toast("Punkt gelöscht.", "success", {
      label: "Rückgängig",
      onClick: () => {
        setEntwurf((e) => {
          const punkte = [...e.punkte];
          punkte.splice(index, 0, punkt);
          return {
            ...e,
            punkte,
            antworten: eigeneAntwort !== undefined ? { ...e.antworten, [key]: eigeneAntwort } : e.antworten,
            checks: fuegeCheckWiederEin(e.checks, index, eigenerCheck),
          };
        });
      },
    });
  }

  function punktHinzufuegen() {
    const key = neuerSchluessel();
    neuerPunktKeyRef.current = key;
    setEntwurf((e) => ({
      ...e,
      punkte: [...e.punkte, { key, titel: "", detail: "", seiten: null, fileIds: [], minuten: 30, frage: null, musterantwort: null }],
    }));
  }

  // S2-Fix: die FIFO-Verdraengung (die dritte Markierung stiess bisher still
  // die aelteste ab) fuehrte dazu, dass ein bereits angehaktes Kaestchen sich
  // von selbst wieder abhakte, ohne dass irgendetwas das ansagte -- nur der
  // sr-only-Hinweis kannte den Grund. Die dritte Markierung wird jetzt
  // stattdessen abgelehnt (ein Toast nennt den Grund), die ersten beiden
  // bleiben unangetastet stehen -- vorhersehbarer als ein Kaestchen, das sich
  // ohne eigenes Zutun aendert.
  function toggleMarkiert(key: string) {
    if (markiert.includes(key)) {
      setMarkiert((m) => m.filter((k) => k !== key));
      return;
    }
    if (markiert.length >= 2) {
      toast("Schon zwei Punkte markiert. Erst einen abwählen, um einen anderen zu markieren.");
      return;
    }
    setMarkiert((m) => [...m, key]);
  }

  function zusammenlegen() {
    if (markiert.length !== 2) return;
    // "des ersten": Reihenfolge in der Liste zaehlt, nicht die Markier-Reihenfolge.
    const indizes = markiert
      .map((key) => entwurf.punkte.findIndex((p) => p.key === key))
      .filter((idx) => idx !== -1)
      .sort((x, y) => x - y);
    const [erstIndex, zweitIndex] = indizes;
    const a = erstIndex !== undefined ? entwurf.punkte[erstIndex] : undefined;
    const b = zweitIndex !== undefined ? entwurf.punkte[zweitIndex] : undefined;
    if (erstIndex === undefined || zweitIndex === undefined || !a || !b) return;
    const minutenSumme = a.minuten + b.minuten;
    const minutenGekappt = minutenSumme > 90;
    const zusammengelegt: PunktLokal = {
      ...a,
      // S7: Titel des zweiten Punkts verketten statt verwerfen -- sonst
      // verschwindet er wortlos aus dem Plan.
      titel: [a.titel, b.titel].filter((t) => t.trim().length > 0).join(" + "),
      detail: [a.detail, b.detail].filter(Boolean).join(" "),
      // Seiten ebenso verketten statt a's Wert stillschweigend zu behalten.
      seiten: [a.seiten, b.seiten].filter((s): s is string => !!s && s.trim().length > 0).join(", ") || null,
      fileIds: Array.from(new Set([...a.fileIds, ...b.fileIds])),
      minuten: Math.min(90, minutenSumme),
    };
    // zusammengelegt behaelt a's Platz (erstIndex) und a's Frage/Musterantwort
    // unveraendert -- ein Punkt traegt strukturell nur eine Frage, b's Slot
    // (zweitIndex) verschwindet, seine Frage/Antwort gehoert zu keinem Punkt
    // mehr -- dessen Check faellt weg, alles danach rueckt einen Index vor.
    // Ein etwaiger Check zu a bleibt gueltig, ohne Anpassung.
    const bCheck = checkAnPosition(entwurf.checks, zweitIndex);
    const bAntwort = entwurf.antworten[b.key];
    setEntwurf((e) => {
      const punkte = e.punkte.filter((p) => p.key !== a.key && p.key !== b.key);
      punkte.splice(erstIndex, 0, zusammengelegt);
      const { [b.key]: _entfernt, ...antwortenOhneB } = e.antworten;
      return { ...e, punkte, antworten: antwortenOhneB, checks: entferneCheckAnPosition(e.checks, zweitIndex) };
    });
    setMarkiert([]);
    setAuswahlModus(false);
    toast(minutenGekappt ? `Punkte zusammengelegt. Minuten auf 90 gekappt (statt ${minutenSumme}).` : "Punkte zusammengelegt.", "success", {
      label: "Rückgängig",
      onClick: () => {
        setEntwurf((e) => {
          const punkte = e.punkte.filter((p) => p.key !== zusammengelegt.key);
          punkte.splice(erstIndex, 0, a);
          punkte.splice(zweitIndex, 0, b);
          return {
            ...e,
            punkte,
            antworten: bAntwort !== undefined ? { ...e.antworten, [b.key]: bAntwort } : e.antworten,
            checks: fuegeCheckWiederEin(e.checks, zweitIndex, bCheck),
          };
        });
      },
    });
  }

  function dateiName(id: string): string {
    return dateien.find((d) => d.id === id)?.name ?? "Datei";
  }

  // Der Server lehnt einen leeren Titel mit dem Code "punkte" ab -- das
  // faengt diese Datei hier vorher ab, statt den Nutzer erst den ganzen
  // Diagnosetest machen und dann in eine Fehlerschleife laufen zu lassen.
  const hatLeererTitel = entwurf.punkte.some((p) => p.titel.trim().length === 0);
  // BLOCKIEREND-Fix: dieselbe Vorab-Pruefung fuer die Punkte-Obergrenze --
  // die Grenze steht jetzt sichtbar im Zaehler oben, BEVOR sie zuschlaegt,
  // und der "Punkt hinzufuegen"-Knopf laesst sich ab hier nicht mehr
  // druecken statt einen 21. Punkt anzulegen, den der Server ohnehin ablehnt.
  const amPunkteLimit = entwurf.punkte.length >= MAX_PUNKTE_PRO_PLAN;

  if (entwurf.punkte.length === 0) {
    // Deep-Link auf ?schritt=2 (oder ein Reload dort) kann diesen Schirm
    // zeigen, ohne dass je eine Checkliste gelesen wurde -- checklisteText
    // bleibt dann leer (nur checklisteLesen in Schritt 1 befuellt es). "Keine
    // Punkte erkannt" waere hier eine falsche Behauptung (es wurde nichts
    // erkannt, weil nichts gelesen wurde), nicht der ehrliche Zustand.
    const nieGelesen = entwurf.checklisteText.trim().length === 0;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
          <p className="text-[15px] font-medium">{nieGelesen ? "Noch keine Checkliste gelesen" : "Keine Punkte erkannt"}</p>
          <p className="text-[13px] text-muted-foreground">
            {nieGelesen
              ? "Zurück zu Material, um eine Checkliste zu lesen, oder einen Punkt manuell hinzufügen."
              : "Füge einen Punkt manuell hinzu, um mit dem Plan weiterzumachen."}
          </p>
          <Button type="button" className="mt-2 gap-1.5" onClick={punktHinzufuegen}>
            <Plus className="size-3.5" />
            Punkt hinzufügen
          </Button>
        </div>
        {/* NIT (Audit-Fund): der Zweig hier resolved erst, sobald
            entwurf.punkte.length === 0 gilt -- der einzige Weg raus ist
            punktHinzufuegen oben, danach ist dieser Zweig nicht mehr
            gerendert. Ein "Weiter zum Test"-Knopf konnte hier nie aktiv
            werden, ohne dass sich der Zweig aufloest -- ein dauerhaft toter
            Knopf, entfernt statt ihn (weiterhin nutzlos) disabled zu lassen. */}
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
          Zurück
        </Button>
      </div>
    );
  }

  // NIT: "erkannt" behauptet eine Checkliste, die je gelesen wurde -- bei
  // ausschliesslich manuell angelegten Punkten (keine Checkliste gelesen)
  // hat niemand etwas erkannt.
  const ausChecklisteGelesen = entwurf.checklisteText.trim().length > 0;
  // S7-Fix: die Maschinen-Obergrenze steht nur noch da, wenn sie in
  // greifbarer Naehe ist -- bei z.B. vier Punkten fragt "4 von 20" eher, ob
  // 16 fehlen, statt zu informieren. Gleicher Schwellwert wie beim
  // Zeichenzaehler oben (:981, 80% der Obergrenze) -- ab da lohnt sich der
  // Hinweis, weil ein paar weitere Punkte reichen koennten, um die Grenze
  // tatsaechlich zu erreichen.
  const punkteNahAmLimit = entwurf.punkte.length >= MAX_PUNKTE_PRO_PLAN * 0.8;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        {punkteNahAmLimit ? (
          // NIT-Fix: "Punkt"/"Punkte" muss sich hier nach der (immer
          // pluralen) Obergrenze richten, nicht nach der aktuellen Anzahl --
          // "von" verlangt Dativ Plural ("Punkten"), das galt bisher schon
          // fuer den Limit-Hinweis unten (:1643).
          <>
            {entwurf.punkte.length} von {MAX_PUNKTE_PRO_PLAN} Punkten
          </>
        ) : (
          <>
            {entwurf.punkte.length} {entwurf.punkte.length === 1 ? "Punkt" : "Punkte"}
          </>
        )}
        {ausChecklisteGelesen ? " erkannt." : "."} Titel, Seiten, Blätter und Minuten lassen sich anpassen.
      </p>

      {/* S2/S5-Fix: das Zeitbudget stand bisher in Schritt 1 "Material",
          obwohl es erst im POST aus Schritt 3 verwendet wird (lib/lernplan.ts
          rechnet daraus das Tagesbudget und damit die Streichungen) -- wer
          gerade HIER die Punkte sieht und merkt, dass die Zeit nicht reicht,
          musste bisher zwei Schritte zurueck. Jetzt aenderbar genau dort, wo
          die Punkte stehen, deren Zeitbedarf man gerade abschaetzt. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed px-3 py-2.5">
        <label htmlFor="minuten-schultag" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          Wie lange kannst du an einem Schultag lernen?
          <MinutenFeld
            id="minuten-schultag"
            wert={entwurf.minutesWeekday}
            min={ZEITBUDGET_MIN}
            max={ZEITBUDGET_MAX}
            onCommit={(n) => setEntwurf((e) => ({ ...e, minutesWeekday: n }))}
            toast={toast}
            className="w-16 rounded-md border border-border-control bg-background px-2 py-1.5 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {/* NIT-Fix: "Min." war aria-hidden -- der Screenreader hoerte die
              Frage ohne Einheit und wusste nicht, ob Minuten oder Stunden
              gemeint sind. Jetzt Teil des Label-Textes. */}
          <span>Min.</span>
        </label>
        <label htmlFor="minuten-wochenende" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          … und am Wochenende?
          <MinutenFeld
            id="minuten-wochenende"
            wert={entwurf.minutesWeekend}
            min={ZEITBUDGET_MIN}
            max={ZEITBUDGET_MAX}
            onCommit={(n) => setEntwurf((e) => ({ ...e, minutesWeekend: n }))}
            toast={toast}
            className="w-16 rounded-md border border-border-control bg-background px-2 py-1.5 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span>Min.</span>
        </label>
      </div>

      <ul className="space-y-2">
        {entwurf.punkte.map((p, i) => (
          <li key={p.key} className="rounded-xl border bg-card p-3 shadow-card">
            {/* S4: der Loeschen-Knopf (size-8=32px + before:-inset-1.5=6px je
                Seite ergibt korrekt 44px Trefflaeche) reichte bei gap-1 (4px)
                um 6-4=2px in die Titelspalte hinein. gap-1.5 (6px) macht die
                Ueberlappung 0. */}
            <div className="flex items-start gap-1.5">
              {/* N7: die Kaestchenspalte bleibt dauerhaft montiert und wird nur
                  unsichtbar geschaltet. Zwei Bewertungen wollten hier
                  Gegensaetzliches -- die eine den Sprung von 44+6px weg, den das
                  Einschalten sonst jedem Titelfeld verpasst, die andere die
                  dauerhaft reservierten 50px auf dem schmalsten Geraet. Es
                  gewinnt die feste Reservierung: 50px kosten auf 375px Breite
                  einmalig Platz, der Sprung dagegen trifft bei jedem Umschalten.
                  Die naheliegende dritte Loesung, die Breite zu animieren, faellt
                  aus -- width und margin animieren heisst Layout in jedem Frame
                  und schiebt die Nachbarn mit, was das Projekt sonst nirgends
                  tut. aria-hidden und tabIndex halten die Spalte im Aus-Zustand
                  aus Vorlesereihenfolge und Tab-Reihenfolge heraus. */}
              <label
                className={cn(
                  "-m-1 grid size-11 shrink-0 cursor-pointer place-items-center",
                  !auswahlModus && "invisible",
                )}
                aria-hidden={!auswahlModus}
              >
                <input
                  type="checkbox"
                  tabIndex={auswahlModus ? undefined : -1}
                  aria-label={`${p.titel || "Punkt"} zum Zusammenlegen markieren`}
                  checked={markiert.includes(p.key)}
                  onChange={() => toggleMarkiert(p.key)}
                  className="size-4 shrink-0 [touch-action:manipulation]"
                />
              </label>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  {(() => {
                    const titelLeer = p.titel.trim().length === 0;
                    const zeigeTitelFehler = titelLeer && (beruehrt.has(p.key) || weiterVersucht);
                    return (
                      <>
                        <input
                          ref={(el) => {
                            titelRefsRef.current.set(p.key, el);
                          }}
                          type="text"
                          value={p.titel}
                          onChange={(e) => patchPunkt(p.key, { titel: e.target.value.slice(0, 200) })}
                          onBlur={() => beruehre(p.key)}
                          placeholder="Titel"
                          aria-label={`Titel von Punkt ${i + 1}`}
                          aria-invalid={zeigeTitelFehler}
                          aria-describedby={zeigeTitelFehler ? `punkt-titel-fehler-${p.key}` : undefined}
                          className={cn(
                            "h-11 w-full rounded-md border border-border-control bg-background px-2.5 py-2 text-[16px] font-medium outline-none [touch-action:manipulation] focus-visible:ring-2 focus-visible:ring-ring",
                            zeigeTitelFehler && "border-destructive",
                          )}
                        />
                        {zeigeTitelFehler && (
                          <p id={`punkt-titel-fehler-${p.key}`} className="mt-1 text-[12px] text-destructive">
                            Titel fehlt noch.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={p.seiten ?? ""}
                    onChange={(e) => patchPunkt(p.key, { seiten: e.target.value || null })}
                    placeholder="Seiten"
                    aria-label={`Seiten von Punkt ${i + 1}`}
                    className="h-11 w-28 rounded-md border border-border-control bg-background px-2 py-1.5 text-[16px] tabular-nums outline-none [touch-action:manipulation] focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    Minuten
                    <MinutenFeld
                      wert={p.minuten}
                      min={10}
                      max={90}
                      onCommit={(n) => patchPunkt(p.key, { minuten: n })}
                      toast={toast}
                      aria-label={`Minuten von Punkt ${i + 1}`}
                      className="w-20 rounded-md border border-border-control bg-background px-2 py-1.5 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
                {/* S10 (loest SOLLTE 5 + BLOCKIEREND 2 endgueltig ab): der
                    X-Knopf hatte seine 44px-Trefflaeche bisher ueber ein
                    before:-inset-3.5 auf eine size-4-Box gelegt -- der
                    Ueberhang ragte weit ueber den ~22px hohen Chip hinaus,
                    was nur mit viel Zeilen-/Spaltenabstand (24px) ueberlappungsfrei
                    blieb, aber die drei Chips wie einzelne Objekte statt eine
                    Reihe aussehen liess. Jetzt traegt der Chip selbst
                    min-h-11 (44px), der X-Knopf ist als echte size-11-Flaeche
                    (44x44) OHNE before-Ueberhang im Chip enthalten -- die
                    Trefflaeche verlaesst die sichtbare Box nirgends mehr.
                    Rechnung: Chip = min-h-11 (44px hoch) x variable Breite
                    (10px Padding links + Text + 4px gap + 44px Knopf).
                    X-Knopf = size-11 = 44x44px, exakt deckungsgleich mit der
                    Chip-Hoehe, kein Ueberhang. Abstand zwischen zwei Chips:
                    gap-3 = 12px in beide Richtungen. Einzige verbleibende
                    Ueberlappungsgefahr ist die des "+ Blatt"-Ausloesers
                    (BlattHinzufuegen, unveraendert 28px sichtbar mit
                    before:-inset-2 = 8px Ueberhang auf allen vier Seiten,
                    44px Trefflaeche gesamt): sein Ueberhang reicht 8px in den
                    12px-Abstand hinein, es bleiben 12-8=4px Luft bis zur
                    echten Chip-Kante. Ueberlappung ist damit 0, auch bei
                    umgebrochenen Zeilen (Chip-Trefflaeche hat keinen eigenen
                    Ueberhang mehr, der sich mit dem des Ausloesers addieren
                    koennte). */}
                <div className="flex flex-wrap gap-3">
                  {p.fileIds.map((id, ci) => (
                    <span
                      key={id}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full border pl-2.5 text-[11.5px] text-muted-foreground"
                    >
                      {dateiName(id)}
                      <button
                        type="button"
                        ref={(el) => setChipRef(p.key, ci, el)}
                        aria-label={`${dateiName(id)} entfernen`}
                        onClick={() => entferneDatei(p.key, id)}
                        className="grid size-11 shrink-0 place-items-center rounded-full [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <BlattHinzufuegen
                    subjectId={subjectId}
                    dateien={dateien.filter((d) => !p.fileIds.includes(d.id))}
                    setDateien={setDateien}
                    onAdd={(id) => patchPunkt(p.key, { fileIds: [...p.fileIds, id] })}
                    toast={toast}
                    triggerRef={(el) => {
                      blattTriggerRefsRef.current.set(p.key, el);
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                ref={(el) => {
                  punktLoeschenRefs.current[i] = el;
                }}
                aria-label={`${p.titel || "Punkt"} löschen`}
                onClick={() => loeschePunkt(p.key)}
                className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors ease-[var(--ease-atlas)] [touch-action:manipulation] before:absolute before:-inset-1.5 before:content-[''] hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", amPunkteLimit && "opacity-60")}
          aria-disabled={amPunkteLimit}
          onClick={() => {
            if (amPunkteLimit) return;
            punktHinzufuegen();
          }}
        >
          <Plus className="size-3.5" />
          Punkt hinzufügen
        </Button>
        {auswahlModus ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(markiert.length !== 2 && "opacity-60")}
              aria-disabled={markiert.length !== 2}
              aria-describedby={markiert.length !== 2 && zusammenlegenVersucht ? "zusammenlegen-hinweis" : undefined}
              onClick={() => {
                if (markiert.length !== 2) {
                  setZusammenlegenVersucht(true);
                  return;
                }
                zusammenlegen();
              }}
            >
              Zusammenlegen
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={auswahlBeenden}>
              Abbrechen
            </Button>
            {/* S1-Fix: sonst tat der Knopf oben fuer sehende Nutzer wortlos
                nichts -- der Hinweis war rein sr-only. Jetzt sichtbar, gleiches
                Muster wie lesenVersucht/weiterVersucht. */}
            {markiert.length !== 2 && zusammenlegenVersucht && (
              <p id="zusammenlegen-hinweis" className="w-full text-[12.5px] text-destructive">
                Genau zwei Punkte markieren, um sie zusammenzulegen.
              </p>
            )}
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAuswahlModus(true)}>
            Punkte zusammenlegen
          </Button>
        )}
      </div>

      {amPunkteLimit && (
        <p className="text-[12.5px] text-muted-foreground">
          {MAX_PUNKTE_PRO_PLAN} von {MAX_PUNKTE_PRO_PLAN} Punkten erreicht. Zwei zusammenlegen, um Platz zu schaffen.
        </p>
      )}
      {hatLeererTitel && (beruehrt.size > 0 || weiterVersucht) && (
        <p id="punkte-titel-fehlt-hinweis" className="text-[12.5px] text-destructive">
          Jeder Punkt braucht einen Titel, bevor es weitergeht.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
          Zurück
        </Button>
        <Button
          type="button"
          className={cn("h-11 flex-1", (entwurf.punkte.length === 0 || hatLeererTitel) && "opacity-60")}
          aria-disabled={entwurf.punkte.length === 0 || hatLeererTitel}
          // NIT-Fix: das Ziel rendert erst, wenn die rote Meldung selbst
          // sichtbar ist (beruehrt.size > 0 || weiterVersucht) -- ohne diese
          // Bedingung zeigte aria-describedby schon vorher auf eine ID, die
          // es im DOM noch gar nicht gab.
          aria-describedby={hatLeererTitel && (beruehrt.size > 0 || weiterVersucht) ? "punkte-titel-fehlt-hinweis" : undefined}
          onClick={() => {
            if (entwurf.punkte.length === 0 || hatLeererTitel) {
              setWeiterVersucht(true);
              return;
            }
            onWeiter();
          }}
        >
          Weiter zum Test
        </Button>
      </div>
    </div>
  );
}

function BlattHinzufuegen({
  subjectId,
  dateien,
  setDateien,
  onAdd,
  toast,
  triggerRef,
}: {
  subjectId: string;
  dateien: Datei[];
  setDateien: React.Dispatch<React.SetStateAction<Datei[]>>;
  onAdd: (id: string) => void;
  toast: ToastFn;
  triggerRef?: (el: HTMLButtonElement | null) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [hochladenAktiv, setHochladenAktiv] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ausloeserRef = useRef<HTMLButtonElement | null>(null);
  // BLOCKIEREND-Fix: der letzte Eintrag ("Datei hochladen") ist jetzt ein
  // <label> statt eines <button> (siehe uploadInputId unten), darum auch
  // HTMLLabelElement in den Roving-Tabindex-Refs.
  const itemRefs = useRef<(HTMLButtonElement | HTMLLabelElement | null)[]>([]);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputId = useId();

  // Aussen-Klick schliesst das Menue -- sonst bleibt es offen, wenn woanders
  // auf der Seite getippt wird. Escape schliesst und gibt den Fokus an den
  // Ausloeser zurueck, ArrowUp/Down navigieren -- siehe NeuVerteilenMenu in
  // lernplan-seite.tsx fuer dasselbe Muster.
  useEffect(() => {
    if (!offen) return;
    function onDoc(e: MouseEvent) {
      // S2: setOffen(false) allein reisst den fokussierten Menueeintrag aus
      // dem DOM, ohne den Fokus irgendwohin zu legen -- er faellt auf body.
      // schliessenUndFokusZurueck() (unten, dieselbe Funktion wie bei Escape)
      // legt ihn stattdessen zurueck auf den Ausloeser.
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        schliessenUndFokusZurueck();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  // Beim Oeffnen wandert der Fokus auf den ersten Eintrag.
  useEffect(() => {
    if (offen) itemRefs.current[0]?.focus();
  }, [offen]);

  function schliessenUndFokusZurueck() {
    setOffen(false);
    ausloeserRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    // S12: itemRefs wird per Index geschrieben und nie gekuerzt -- sobald
    // dateien schrumpft (bei jedem Hinzufuegen, siehe der Filter unten in
    // JSX), bleiben Slots am Ende null. Erst auf Nicht-null filtern, dann
    // navigieren -- wie KopfMenu es in lernplan-seite.tsx macht.
    const refs = itemRefs.current.filter((el): el is HTMLButtonElement | HTMLLabelElement => el !== null);
    const idx = refs.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      schliessenUndFokusZurueck();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      refs[(idx + 1) % refs.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      refs[(idx - 1 + refs.length) % refs.length]?.focus();
    } else if (e.key === "Home") {
      // NIT-Fix: Escape/Tab/Pfeile waren verdrahtet, Home/End fehlten --
      // ChecklistModeRadiogroup (:657-668) hat beide schon fuer dasselbe
      // Roving-Tabindex-Muster.
      e.preventDefault();
      refs[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      refs[refs.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // S10: die Eintraege sind native button/a ohne tabIndex={-1} -- Tab
      // wanderte Eintrag fuer Eintrag durch das offene Menue und danach in
      // den Seiteninhalt dahinter, waehrend das Menue offen blieb (geschlossen
      // wurde nur bei mousedown ausserhalb). Tab schliesst jetzt wie Escape.
      e.preventDefault();
      schliessenUndFokusZurueck();
    }
  }

  // Hochladen sitzt hier statt in einer eigenen Sektion in Schritt 1 --
  // Blaetter werden ohnehin je Punkt zugeordnet, eine globale Vorauswahl war
  // doppelte Arbeit. Der Ausloeser bleibt darum immer sichtbar, auch ohne
  // vorhandene Fach-Dateien.
  async function hochladen(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      toast("Nur PDF, PNG, JPG, WEBP oder HEIC.");
      return;
    }
    setHochladenAktiv(true);
    try {
      const zu = await bildFallsNoetigVerkleinern(file);
      const datei = await uploadZuFach(subjectId, zu);
      setDateien((d) => [datei, ...d]);
      onAdd(datei.id);
      schliessenUndFokusZurueck();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Die Datei konnte nicht hochgeladen werden.");
    } finally {
      setHochladenAktiv(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={(el) => {
          ausloeserRef.current = el;
          triggerRef?.(el);
        }}
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={offen}
        className="relative inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11.5px] text-muted-foreground [touch-action:manipulation] before:absolute before:-inset-2 before:content-[''] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-3" />
        Blatt
      </button>
      {/* BLOCKIEREND-Fix: vorher ein permanent gemountetes sr-only <input>
          (unabhaengig davon, ob das Menue offen ist) plus ein separates
          <button role="menuitem">, das per .click() weiterreichte -- zwei
          Tabstopps pro Instanz, bis zu zwanzig auf Schritt 2. Muster wie
          subject-files.tsx:276-295: ein peer sr-only <input> mit echtem
          <label>, das den Klick nativ uebernimmt -- ein Tabstopp. `disabled`
          statt eines onClick-Guards sperrt die Auswahl waehrend des Uploads. */}
      {/* tabIndex={-1}: dieses Menue navigiert per Roving-Tabindex (Pfeiltasten
          + itemRefs.current[i]?.focus()), nicht per echtem Tab -- das <label>
          unten traegt darum den Tabstopp-Ersatz (dieselbe tabIndex={-1} +
          itemRefs-Anbindung wie die Datei-Eintraege), das <input> bleibt aus
          dem Tab-Fluss komplett heraus, egal ob das Menue offen ist. */}
      <input
        ref={uploadInputRef}
        id={uploadInputId}
        type="file"
        accept={ACCEPT_ATTR}
        tabIndex={-1}
        disabled={hochladenAktiv}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void hochladen(file);
        }}
      />
      {offen && (
        <ul
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute z-10 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border bg-popover p-1 shadow-popover"
        >
          {dateien.map((d, i) => (
            <li key={d.id} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                title={d.name}
                onClick={() => {
                  onAdd(d.id);
                  schliessenUndFokusZurueck();
                }}
                className="flex min-h-11 w-full items-center truncate rounded-md px-2 py-1.5 text-left text-[12.5px] [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {d.name}
              </button>
            </li>
          ))}
          <li role="none">
            {/* BLOCKIEREND-Fix: statt eines <button>, der per .click() an ein
                permanent gemountetes, unabhaengig fokussierbares <input>
                weiterreichte (zwei Tabstopps, der zweite ohne Label), jetzt
                ein <label htmlFor> -- der Klick aktiviert das Input nativ,
                das Label traegt selbst den Namen "Datei hochladen". Enter/
                Space loesen bei einem <label> anders als bei einem <button>
                keinen Klick aus, darum der eigene onKeyDown hier. */}
            <label
              ref={(el) => {
                itemRefs.current[dateien.length] = el;
              }}
              htmlFor={uploadInputId}
              role="menuitem"
              tabIndex={-1}
              aria-disabled={hochladenAktiv}
              aria-busy={hochladenAktiv}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (hochladenAktiv) return;
                uploadInputRef.current?.click();
              }}
              className={cn(
                "flex min-h-11 w-full cursor-pointer items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted-foreground [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                hochladenAktiv && "opacity-60",
              )}
            >
              {hochladenAktiv ? (
                <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" />
              ) : (
                <Upload className="size-3.5 shrink-0" />
              )}
              {hochladenAktiv ? "Wird hochgeladen …" : "Datei hochladen"}
            </label>
          </li>
        </ul>
      )}
    </div>
  );
}

// --- Schritt 3: Diagnosetest + Plan erstellen -------------------------------

function SchrittTest({
  subjectId,
  assignmentId,
  entwurf,
  setEntwurf,
  bestehenderPlan,
  onZurueck,
  onChecklisteFehlt,
  onFertig,
  toast,
}: {
  subjectId: string;
  assignmentId: string;
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  bestehenderPlan: boolean;
  onZurueck: () => void;
  // S6: Ausweg aus der Sackgasse, wenn die Checkliste in Schritt 1 seit dem
  // Lesen ungueltig geworden ist (Modus "upload"/"fach" ohne gewaehlte
  // Datei) -- siehe planErstellen unten.
  onChecklisteFehlt: () => void;
  onFertig: (createdTopicIds: string[], planId: string, anzahlEinheiten: number) => void;
  toast: ToastFn;
}) {
  const fragePunkte = useMemo(() => entwurf.punkte.filter((p) => p.frage), [entwurf.punkte]);
  // S2: startet aus entwurf.testIndex statt immer bei 0 -- ein Reload in
  // Schritt 3 setzt sonst zurueck auf Frage 1, obwohl schon Antworten
  // gespeichert sind (siehe testIndex im Entwurf-Typ oben). Der Effekt
  // darunter (bei value/frageZurueck) spiegelt jede Aenderung von index
  // zurueck in den Entwurf, damit sessionStorage sie mitschreibt.
  // Zweite Absicherung: testIndex kann aus einer sessionStorage-Leiche
  // stammen (alter Entwurf, anderer Fragensatz) oder -- vor diesem Fix --
  // aus einem verworfenen Fragensatz uebrig geblieben sein. Ein Index
  // ausserhalb des tatsaechlich vorhandenen Fragensatzes darf hier nie
  // ankommen, sonst gilt fertig (unten) sofort und die fehlenden Fragen
  // wurden nie gestellt.
  const [index, setIndex] = useState(() => klemmeTestIndex(entwurf.testIndex, fragePunkte.length));
  useEffect(() => {
    setEntwurf((e) => (e.testIndex === index ? e : { ...e, testIndex: index }));
  }, [index, setEntwurf]);
  const [value, setValue] = useState("");
  // S9: "Weiter" bei leerem Feld muss etwas SAGEN, statt nur lautlos
  // abzubrechen -- der Guard im onSubmit unten setzt diesen Hinweis, eine
  // eigene sr-only-Live-Region gibt ihn aus (dasselbe Muster wie die
  // Frage-Ansage oben).
  const [leerHinweis, setLeerHinweis] = useState(false);
  const [auswertenLoading, setAuswertenLoading] = useState(false);
  const [auswertenError, setAuswertenError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Plan erstellen laeuft von drei Stellen aus an (ohne Diagnosefragen direkt,
  // "Ohne Test planen", nach dem Testergebnis) -- ein gemeinsamer Zustand
  // fuer Laden/Fehler statt dreifacher Kopie. letzteAnfrageRef haelt die
  // zuletzt gesendeten Checks/ersetzen-Flag fest, damit "Erneut versuchen"
  // exakt denselben Request wiederholen kann.
  const [erstellenLoading, setErstellenLoading] = useState(false);
  const [erstellenFehler, setErstellenFehler] = useState<{ code: string; text: string } | null>(null);
  const letzteAnfrageRef = useRef<{ checks: CheckDraft[]; ersetzen: boolean }>({ checks: [], ersetzen: false });

  // S5-Fix: "Plan neu erstellen" ersetzt einen bestehenden Plan samt schon
  // abgehakten Einheiten. Die einzige Ruecknahme dafuer war bisher ein Toast
  // (siehe onFertig-Aufrufer in LernplanErstellen) mit vier Sekunden
  // Anzeigedauer, auf einem Telefon ohne Hover nicht verlaengerbar und nach
  // router.push() womoeglich noch gar nicht im Fokus -- fuer eine Aktion
  // dieser Tragweite die schwaechste Ruecknahme im ganzen Lernpfad. Der
  // Loesch-Dialog derselben Seite (PlanLoeschenDialog in lernplan-seite.tsx)
  // hat fuer eine vergleichbar folgenreiche Aktion eine echte Rueckfrage VOR
  // der Aktion -- das ist der richtige Ort, nicht die Ruecknahme danach.
  // planErstellenMitBestaetigung haelt darum bei bestehenderPlan an, bevor
  // ueberhaupt ein Request rausgeht; der Toast mit "Rueckgaengig" bleibt
  // zusaetzlich stehen als Netz, falls die Bestaetigung versehentlich bejaht
  // wurde.
  const [ersetzenAnfrage, setErsetzenAnfrage] = useState<CheckDraft[] | null>(null);
  function planErstellenMitBestaetigung(checks: CheckDraft[]) {
    if (bestehenderPlan) {
      setErsetzenAnfrage(checks);
      return;
    }
    void planErstellen(checks, false);
  }
  const ersetzenAnfrageSchirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ersetzenAnfrage) fokussiereSichtbar(ersetzenAnfrageSchirmRef.current);
  }, [ersetzenAnfrage]);

  useEffect(() => {
    // Auf Touch-Geraeten schiebt Autofokus die Tastatur bei jeder Frage hoch --
    // nur auf Geraeten mit feinem Zeigegeraet (Maus/Trackpad) fokussieren.
    const grob = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (!grob) inputRef.current?.focus();
  }, [index]);

  // S1: bei jedem Fragewechsel (auch rueckwaerts) das Feld aus einer bereits
  // gespeicherten Antwort vorbelegen -- sonst ueberschreibt ein erneutes
  // "Weiter" eine vorhandene Antwort mit leer, und Zurueckgehen zeigt immer
  // ein leeres Feld, obwohl schon etwas gespeichert ist.
  useEffect(() => {
    const punkt = fragePunkte[index];
    setValue(punkt ? (entwurf.antworten[punkt.key] ?? "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, fragePunkte]);

  // Ohne Fragen: Checks direkt auf [] setzen, kein Test noetig. Der Schirm
  // "Keine Diagnosefragen" mit dem Plan-erstellen-Knopf rendert danach --
  // beim ersten Mount genauso wie bei einer Rueckkehr per "Zurueck", kein
  // Unterschied mehr zwischen den beiden Wegen.
  useEffect(() => {
    if (fragePunkte.length === 0 && entwurf.checks === null) {
      setEntwurf((e) => ({
        ...e,
        checks: [],
        punkte: e.punkte.map((p) => ({ ...p })),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fertig = index >= fragePunkte.length;

  function antworten(antwort: string | null) {
    const punkt = fragePunkte[index];
    if (!punkt) return;
    setEntwurf((e) => ({ ...e, antworten: { ...e.antworten, [punkt.key]: antwort } }));
    setValue("");
    setLeerHinweis(false);
    setIndex((i) => i + 1);
  }

  // S1: der einzige Rueckweg war bisher "Auswerten fehlgeschlagen" ->
  // setIndex(0), was mitten im Test zurueck an den Anfang springt statt eine
  // Frage zurueck. Bei der ersten Frage gibt es nichts, wohin man zurueck
  // koennte.
  function frageZurueck() {
    if (index === 0) return;
    setLeerHinweis(false);
    setIndex((i) => i - 1);
  }

  async function planErstellen(checks: CheckDraft[], ersetzen: boolean) {
    // BLOCKIEREND: ohne diesen Guard laufen zwei Klicks im selben Tick beide
    // durch, bevor React erstellenLoading neu rendert -- bei ersetzen=true
    // legt der zweite POST einen Plan mit neuer planId an und loescht den
    // gerade erstellten. planId/createdTopicIds im Erfolgs-Toast (siehe
    // onFertig-Aufrufer) zeigen dann auf einen Plan, den es nicht mehr gibt,
    // Rueckgaengig scheitert. Dasselbe Muster wie bei checklisteLesen (:915-918).
    if (erstellenLoading) return;
    // S6: dieselbe Pruefung wie hatChecklist in Schritt 1 (SchrittMaterial)
    // -- ein Browser-Zurueck nach Schritt 1 mit anschliessendem Moduswechsel
    // (auf "upload"/"fach" ohne gewaehlte Datei) kann die Checkliste
    // ungueltig machen, obwohl sie beim Lesen noch gueltig war. Ohne diesen
    // Guard ginge {fileId: null} raus, der Server lehnt mit "checklist" ab,
    // und "Erneut versuchen" schickte denselben ungueltigen Body erneut --
    // Sackgasse. Der Ausweg fuehrt stattdessen zurueck nach Schritt 1.
    const hatChecklistQuelle =
      entwurf.checklistMode === "text"
        ? entwurf.checklistText.trim().length > 0
        : !!entwurf.checklistFileId;
    if (!hatChecklistQuelle) {
      onChecklisteFehlt();
      return;
    }
    letzteAnfrageRef.current = { checks, ersetzen };
    setErstellenLoading(true);
    setErstellenFehler(null);
    try {
      const checklist =
        entwurf.checklistMode === "text" ? { text: entwurf.checklistText.trim() } : { fileId: entwurf.checklistFileId };
      const res = await fetch("/api/lernen/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          checklist,
          minutesWeekday: entwurf.minutesWeekday,
          minutesWeekend: entwurf.minutesWeekend,
          punkte: entwurf.punkte.map(({ key: _key, ...p }) => p),
          checks: checks.length > 0 ? checks : null,
          ersetzen,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { plan: PlanDTO; createdTopicIds: string[]; hinweis?: string[] }
        | { error: string; hinweis?: string }
        | null;
      if (res.status === 409) {
        setErstellenFehler({ code: "plan_gerade_erstellt", text: fehlerNachricht("plan_gerade_erstellt", undefined) });
        return;
      }
      if (!res.ok || !data || "error" in data) {
        setErstellenFehler({
          code: data && "error" in data ? data.error : "speichern",
          text: fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined),
        });
        return;
      }
      // S4: der Hinweis hier ist "knapp" (siehe lib/lernplan-store.ts) -- eine
      // Warnung, kein Erfolg. Selbe Begruendung wie in checklisteLesen oben.
      if (data.hinweis && data.hinweis.length > 0) toast(data.hinweis.join(" "), "warning");
      onFertig(data.createdTopicIds, data.plan.id, data.plan.items.length);
    } catch {
      setErstellenFehler({ code: "netzwerk", text: "Der Plan konnte nicht gespeichert werden." });
    } finally {
      setErstellenLoading(false);
    }
  }

  function ohneTestPlanen() {
    if (erstellenLoading || auswertenLoading) return;
    // S3: ein Klick nach bereits gegebenen Antworten (index > 0) verwirft die
    // sonst wortlos -- checks:[] bewertet jeden Punkt pauschal als unsicher,
    // obwohl schon gemessene Antworten vorliegen. auswerten() unten bewertet
    // genau diese Antworten und markiert die restlichen Punkte als
    // "Uebersprungen" (dieselbe Logik wie am regulaeren Testende). Sobald
    // entwurf.checks gesetzt ist, rendert der TestErgebnis-Schirm automatisch
    // (die Bedingung dafuer greift unabhaengig von `fertig`), mit demselben
    // "Plan erstellen"-Knopf wie am Testende.
    if (index > 0) {
      void auswerten();
      return;
    }
    setEntwurf((e) => ({
      ...e,
      checks: [],
      punkte: e.punkte.map((p) => ({ ...p })),
    }));
    planErstellenMitBestaetigung([]);
  }

  async function auswerten() {
    setAuswertenError(null);
    setAuswertenLoading(true);
    try {
      const zuSenden = fragePunkte.filter((p) => entwurf.antworten[p.key] !== null && entwurf.antworten[p.key] !== undefined);

      // Alle Diagnosefragen uebersprungen: kein POST noetig, Checks direkt
      // lokal bauen (alle "falsch", Feedback "Übersprungen").
      if (zuSenden.length === 0) {
        const checks: CheckDraft[] = fragePunkte.map((p) => ({
          pointIndex: entwurf.punkte.findIndex((q) => q.key === p.key),
          frage: p.frage!,
          musterantwort: p.musterantwort ?? "",
          antwort: null,
          urteil: "falsch",
          feedback: "Übersprungen",
        }));
        setEntwurf((e) => ({ ...e, checks }));
        return;
      }

      const res = await ladeMitTimeout(
        "/api/lernen/plan/bewerten",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subjectId,
            antworten: zuSenden.map((p) => ({
              frage: p.frage,
              musterantwort: p.musterantwort,
              antwort: entwurf.antworten[p.key],
            })),
          }),
        },
        BEWERTEN_TIMEOUT,
      );
      const data = (await res.json().catch(() => null)) as
        | { urteil: "richtig" | "teilweise" | "falsch"; feedback: string }[]
        | { error: string; hinweis?: string }
        | null;
      if (!res.ok || !data || !Array.isArray(data)) {
        setAuswertenError(fehlerNachricht(data && "error" in data ? data.error : undefined, data && "hinweis" in data ? data.hinweis : undefined));
        return;
      }
      // S3-Fix: ein eigener urteilIndex lief bisher blind durch data, ohne je
      // data.length gegen zuSenden.length zu pruefen -- lieferte die Route
      // weniger Urteile als gesendete Antworten, griff `urteil?.urteil ??
      // "falsch"` und stufte eine tatsaechlich richtige Antwort stumm als
      // "Falsch" ein, ohne Feedback-Aufklapper. Ein fehlendes Urteil ist kein
      // "falsch", sondern ein Fehler der Auswertung selbst -- der bestehende
      // Fehlerschirm (samt "Erneut versuchen"/"Zurueck zu den Fragen") faengt
      // das ab, statt den Schueler faelschlich als unwissend einzustufen.
      if (data.length !== zuSenden.length) {
        setAuswertenError("Das Modell hat nicht zu jeder Antwort geurteilt. Erneut versuchen.");
        return;
      }
      let urteilIndex = 0;
      // pointIndex zeigt auf die Position im vollen Punkte-Array, weil der
      // Store Checks sonst nach Array-Position zuordnet und Punkte ohne Frage
      // die Reihenfolge verschieben wuerden.
      const checks: CheckDraft[] = fragePunkte.map((p) => {
        const pointIndex = entwurf.punkte.findIndex((q) => q.key === p.key);
        const antwort = entwurf.antworten[p.key] ?? null;
        if (antwort === null) {
          return { pointIndex, frage: p.frage!, musterantwort: p.musterantwort ?? "", antwort: null, urteil: "falsch", feedback: "Übersprungen" };
        }
        const urteil = data[urteilIndex];
        urteilIndex += 1;
        return {
          pointIndex,
          frage: p.frage!,
          musterantwort: p.musterantwort ?? "",
          antwort,
          urteil: urteil?.urteil ?? "falsch",
          feedback: urteil?.feedback ?? "",
        };
      });
      setEntwurf((e) => ({ ...e, checks }));
    } catch {
      setAuswertenError("Das Modell hat nicht geantwortet. Erneut versuchen.");
    } finally {
      setAuswertenLoading(false);
    }
  }

  // Sobald die letzte Frage beantwortet ist, wertet die App selbst aus --
  // ein Klick auf einen Knopf, der nichts entscheidet ("Auswerten"), entfaellt.
  // Nur ohne Fehler und ohne bereits vorliegende Checks anstossen, sonst
  // liefe die Auswertung nach jedem Render erneut an.
  // BLOCKIEREND 1: checks steht nicht nur bei einem frischen Entwurf auf
  // null, sondern auch auf [] -- naemlich wenn "Ohne Test planen" (unten)
  // den POST schon losgeschickt hat, dieser aber fehlschlaegt und der
  // Nutzer danach doch noch die restlichen Fragen beantwortet. Ohne die
  // Erweiterung um "|| entwurf.checks.length === 0" wuerde die Auswertung
  // nie anlaufen und der Nutzer haenge dauerhaft im Skeleton-Screen unten
  // fest, ohne Knopf. fragePunkte.length > 0 schuetzt davor, dass dieselbe
  // Bedingung beim Fall "keine Diagnosefragen" (dort ist [] der gueltige
  // Dauerzustand, siehe Effekt oben) versehentlich mit-ausloest.
  useEffect(() => {
    if (
      fragePunkte.length > 0 &&
      (entwurf.checks === null || entwurf.checks.length === 0) &&
      fertig &&
      !auswertenLoading &&
      !auswertenError
    ) {
      void auswerten();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fertig, entwurf.checks, auswertenError]);

  // BLOCKIEREND: der ausloesende Knopf (Plan erstellen/Ohne Test planen/
  // Erneut versuchen/die letzte Frage beantworten) wird in derselben
  // Commit-Phase durch einen Baum ohne fokussierbares Element ersetzt --
  // Fokus faellt sonst auf body, Tab faengt ganz oben an, und weder Laden
  // noch Fehler noch Auswertung werden je angesagt. Die Datei loest dasselbe
  // Problem sauber bei fokussiereSichtbar/ersterLauf/den sr-only-Live-Regionen
  // oben -- hier dasselbe Muster: ein tabIndex={-1}-Ziel pro Schirm, das ein
  // Effekt bei jedem Wechsel fokussiert, plus role="alert"/"status" fuer die
  // Ansage. Die fuenf Ziel-Screens (Plan-erstellen-Fehler, Plan-wird-erstellt,
  // Auswerten-Fehler, Auswerten-laedt, Testergebnis) bleiben eigene Baeume
  // (kein gemeinsamer DOM-Knoten wie beim Titel-Input), darum hier das
  // Fokus-Ziel-Muster statt "Knopf bleibt montiert" (:843-863) -- Letzteres
  // passt nur, wenn derselbe Knopf sichtbar bleibt und nur seinen Zustand
  // wechselt. Testergebnis (eigene Komponente unten) setzt sein Fokus-Ziel
  // selbst per Mount-Effekt, da es nicht hier, sondern als eigener Baum
  // gerendert wird.
  const fehlerSchirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (erstellenFehler) fokussiereSichtbar(fehlerSchirmRef.current);
  }, [erstellenFehler]);

  const ladenSchirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (erstellenLoading) fokussiereSichtbar(ladenSchirmRef.current);
  }, [erstellenLoading]);

  // Vierter Screen: die Auswertung des Diagnosetests (auswerten(), Schritt 3
  // vor dem eigentlichen Plan-Erstellen) kann genauso scheitern wie das
  // Plan-Erstellen selbst -- derselbe Fokus-/Ansage-Bedarf wie bei
  // fehlerSchirmRef oben, bisher fehlte er hier.
  const auswertenFehlerSchirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (auswertenError) fokussiereSichtbar(auswertenFehlerSchirmRef.current);
  }, [auswertenError]);

  const zeigtAuswertenLaden = fertig && !auswertenError && !(entwurf.checks && entwurf.checks.length > 0);
  const auswertenLadenSchirmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (zeigtAuswertenLaden) fokussiereSichtbar(auswertenLadenSchirmRef.current);
  }, [zeigtAuswertenLaden]);

  // S5-Fix: die Rueckfrage vor "Plan neu erstellen" ueberlagert genauso jeden
  // darunterliegenden Zustand wie die Plan-Erstellung selbst (siehe Kommentar
  // dort) -- sie kann von denselben drei Screens ausgeloest werden
  // (planErstellenMitBestaetigung oben). "Abbrechen" schliesst nur die
  // Rueckfrage und legt den ausloesenden Screen wieder frei, kein Request
  // ist bis dahin rausgegangen.
  if (ersetzenAnfrage) {
    return (
      <div
        ref={ersetzenAnfrageSchirmRef}
        tabIndex={-1}
        role="alertdialog"
        aria-label="Plan neu erstellen?"
        className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          Es gibt schon einen Plan zu dieser Prüfung. Der neue Plan ersetzt ihn, auch schon abgehakte Einheiten gehen dabei verloren.
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1" onClick={() => setErsetzenAnfrage(null)}>
            Abbrechen
          </Button>
          <Button
            type="button"
            className="h-11 flex-1"
            onClick={() => {
              const checks = ersetzenAnfrage;
              setErsetzenAnfrage(null);
              void planErstellen(checks, true);
            }}
          >
            Plan neu erstellen
          </Button>
        </div>
      </div>
    );
  }

  // Plan-Erstellung ueberlagert jeden darunterliegenden Zustand (Fragen,
  // "Keine Diagnosefragen", Testergebnis) -- sie kann von jedem dieser drei
  // Screens ausgeloest werden. "Zurueck" im Fehlerfall schliesst nur die
  // Fehlermeldung und legt den ausloesenden Screen wieder frei, statt aus
  // dem Testschritt zu springen -- kein Sackgasse.
  if (erstellenFehler) {
    return (
      <div
        ref={fehlerSchirmRef}
        tabIndex={-1}
        role="alert"
        className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* S7-Fix: siehe Kommentar bei lesenError oben -- dieselbe Kontrast-
            Korrektur (text-destructive -> text-red-700/dark:text-red-400). */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-400">
          <p>{erstellenFehler.text}</p>
          {erstellenFehler.code === "plan_gerade_erstellt" && (
            <Link
              href={`/lernen/${subjectId}/plan/${assignmentId}`}
              className="relative mt-1 inline-block rounded [touch-action:manipulation] underline-offset-2 before:absolute before:-inset-2 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Zur Planseite
            </Link>
          )}
        </div>
        {erstellenFehler.code === "punkte" || erstellenFehler.code === "zu_viele_punkte" || erstellenFehler.code === "plan_ohne_punkte" ? (
          // Eingabefehler -- ein "Erneut versuchen" wuerde exakt denselben
          // ungueltigen Body erneut schicken und immer wieder scheitern.
          // Der Weg fuehrt stattdessen zurueck in die Punkte-Liste, wo sich
          // sowohl ein fehlender Titel als auch zu viele Punkte tatsaechlich
          // beheben lassen.
          <Button type="button" className="h-11 w-full" onClick={onZurueck}>
            Zurück zur Liste
          </Button>
        ) : erstellenFehler.code === "checklist" ? (
          // S6: derselbe Grund wie bei "punkte" -- der Guard in planErstellen
          // faengt das eigentlich vorher ab, dieser Zweig ist nur das Netz
          // fuer den Fall, dass der Server trotzdem mit "checklist" antwortet.
          // "Erneut versuchen" wuerde wieder denselben ungueltigen Body
          // schicken, der Weg fuehrt stattdessen zurueck nach Schritt 1.
          <Button type="button" className="h-11 w-full" onClick={onChecklisteFehlt}>
            Zurück zu Material
          </Button>
        ) : HARTE_ZUSTAENDE.includes(erstellenFehler.code) ? (
          // Audit-Fund: siehe HARTE_ZUSTAENDE oben -- "Erneut versuchen" waere
          // hier ein folgenloser Knopf, der Weg fuehrt zurueck zum Fach, wie
          // beim Gate-Fehler oben (gate === "fehlt").
          <Link
            href={`/lernen/${subjectId}`}
            className="relative flex h-11 w-full items-center justify-center rounded-md border border-border-control text-[13.5px] font-medium [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Zurück zum Fach
          </Link>
        ) : (
          <>
            <Button
              type="button"
              className="h-11 w-full"
              onClick={() => void planErstellen(letzteAnfrageRef.current.checks, letzteAnfrageRef.current.ersetzen)}
            >
              Erneut versuchen
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={() => {
                setErstellenFehler(null);
                // BLOCKIEREND 1 (Teil 2): war checks=[] nur der Bypass von
                // "Ohne Test planen" (nicht der Dauerzustand ohne
                // Diagnosefragen, siehe Effekt oben -- der greift nur bei
                // fragePunkte.length === 0), zurueck auf null. Sonst bliebe
                // der Bypass stehen, auch wenn der Nutzer jetzt doch noch
                // die restlichen Fragen beantworten will.
                if (fragePunkte.length > 0 && entwurf.checks?.length === 0) {
                  setEntwurf((e) => ({ ...e, checks: null }));
                }
              }}
            >
              Zurück
            </Button>
          </>
        )}
      </div>
    );
  }

  if (erstellenLoading) {
    return (
      <div
        ref={ladenSchirmRef}
        tabIndex={-1}
        role="status"
        aria-busy="true"
        className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="text-[15px] font-medium">{bestehenderPlan ? "Plan wird neu erstellt" : "Plan wird erstellt"}</p>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (fragePunkte.length === 0) {
    // Wird sowohl beim ersten Mount ohne Diagnosefragen gerendert als auch
    // bei Rueckkehr per "Zurueck" -- entwurf.checks steht in beiden Faellen
    // schon auf [] (siehe Effekt oben), kein Unterschied zwischen den Wegen.
    if (entwurf.checks === null) return null;
    // NIT: ein Deep-Link auf ?schritt=3 (initialSchritt kommt ungeprueft aus
    // der URL) kann diesen Schirm auch mit komplett leerer Punkte-Liste
    // zeigen, nicht nur ohne Diagnosefragen. "Plan erstellen" liefe dann in
    // einen Server-Fehler ("punkte"), dessen Text faelschlich einen
    // ungueltigen Punkt behauptet -- es gibt aber gar keinen. Eigene Meldung
    // und kein Knopf, der in diese falsche Fehlermeldung laeuft.
    const keinePunkte = entwurf.punkte.length === 0;
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
          <p className="text-[15px] font-medium">{keinePunkte ? "Keine Punkte vorhanden" : "Keine Diagnosefragen"}</p>
          <p className="text-[13px] text-muted-foreground">
            {keinePunkte
              ? "Zurück zur Punkte-Liste, um mindestens einen Punkt hinzuzufügen."
              : "Zu diesen Punkten gibt es keine Fragen, der Plan wird ohne Test erstellt."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
            Zurück
          </Button>
          {!keinePunkte && (
            <Button
              type="button"
              className={cn("h-11 flex-1", erstellenLoading && "opacity-60")}
              aria-disabled={erstellenLoading}
              aria-busy={erstellenLoading}
              onClick={() => {
                if (erstellenLoading) return;
                planErstellenMitBestaetigung(entwurf.checks ?? []);
              }}
            >
              {bestehenderPlan ? "Plan neu erstellen" : "Plan erstellen"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (entwurf.checks && entwurf.checks.length > 0) {
    return (
      <TestErgebnis
        checks={entwurf.checks}
        bestehenderPlan={bestehenderPlan}
        erstellenLoading={erstellenLoading}
        onZurueck={onZurueck}
        onErstellen={() => {
          if (erstellenLoading) return;
          planErstellenMitBestaetigung(entwurf.checks ?? []);
        }}
      />
    );
  }

  if (fertig) {
    if (auswertenError) {
      return (
        <div
          ref={auswertenFehlerSchirmRef}
          tabIndex={-1}
          role="alert"
          className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* S7-Fix: siehe Kommentar bei lesenError oben -- dieselbe Kontrast-
            Korrektur (text-destructive -> text-red-700/dark:text-red-400). */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-400">
            {auswertenError}
          </div>
          <Button
            type="button"
            className={cn("h-11 w-full", auswertenLoading && "opacity-60")}
            aria-disabled={auswertenLoading}
            aria-busy={auswertenLoading}
            onClick={() => {
              if (auswertenLoading) return;
              void auswerten();
            }}
          >
            Erneut versuchen
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            onClick={() => {
              // S2-Fix: setIndex(0) riss den Nutzer an den Anfang statt eine
              // Frage zurueck (dasselbe Muster, das frageZurueck() oben schon
              // fuer den Fragenschirm behebt) -- und liess auswertenError
              // stehen, was den Auto-Auswerten-Effekt (der !auswertenError
              // verlangt) dauerhaft blockierte: alle Antworten neu eintippen
              // landete exakt wieder auf diesem Fehlerschirm, ohne dass
              // ueberhaupt ein neuer Versuch unternommen wurde.
              setAuswertenError(null);
              frageZurueck();
            }}
          >
            Zurück zu den Fragen
          </Button>
        </div>
      );
    }
    // Die Auswertung laeuft ueber den Effekt oben von selbst an -- dieser
    // Ladezustand deckt sowohl den kurzen Moment bis der Effekt feuert als
    // auch die eigentliche Wartezeit ab.
    return (
      <div
        ref={auswertenLadenSchirmRef}
        tabIndex={-1}
        role="status"
        aria-busy="true"
        className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="text-[15px] font-medium">Antworten werden ausgewertet</p>
        <p className="text-[13px] text-muted-foreground">Die KI prüft deine Antworten, das dauert einen Moment.</p>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  const punkt = fragePunkte[index];

  return (
    <div className="space-y-4">
      {/* S7: das Eingabefeld bleibt bei jedem Fragewechsel derselbe DOM-Knoten
          mit derselber id/Label -- Fokus bleibt stehen, Frage, Punkt-Titel
          und Zaehler tauschen sich sonst stumm aus. Dieselbe Loesung wie bei
          Fortschritt oben: eine eigene sr-only-Region mit echtem Textwechsel. */}
      <p aria-live="polite" className="sr-only">
        Frage {index + 1} von {fragePunkte.length} zu {punkt.titel}: {punkt.frage}
      </p>
      <p className="tabular-nums text-[13px] text-muted-foreground">
        {index + 1} von {fragePunkte.length}
      </p>
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <p className="text-[12.5px] font-medium text-muted-foreground">{punkt.titel}</p>
        <p className="mt-1.5 text-[16px] font-medium">{punkt.frage}</p>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            // S9: ein leeres Feld sperrt "Weiter" statt es still als falsch
            // zu werten -- "Weiß ich nicht" bleibt der einzige Weg, einen
            // Punkt ohne Antwort zu quittieren. Der Guard hier faengt auch
            // ein Enter im leeren Feld ab, aria-disabled am Knopf allein
            // wuerde die Formular-Submission nicht verhindern.
            if (value.trim().length === 0) {
              setLeerHinweis(true);
              return;
            }
            antworten(value.trim());
          }}
        >
          <label htmlFor="test-antwort" className="sr-only">
            Deine Antwort
          </label>
          <input
            ref={inputRef}
            id="test-antwort"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.slice(0, 500));
              if (leerHinweis) setLeerHinweis(false);
            }}
            placeholder="Antwort eintippen"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={leerHinweis ? "test-antwort-leer-hinweis" : undefined}
            className="w-full rounded-md border border-border-control bg-background px-3 py-2.5 text-[16px] outline-none [touch-action:manipulation] focus-visible:ring-2 focus-visible:ring-ring"
          />
          {/* S1-Fix: war rein sr-only -- ein sehender Schueler mit leerem Feld
              druecke "Weiter" (oder Enter) und sah nichts passieren, nur der
              Screenreader erfuhr den Grund. Jetzt sichtbar, gleiches Muster
              wie lesenVersucht/weiterVersucht/zusammenlegenVersucht. */}
          {leerHinweis && (
            <p id="test-antwort-leer-hinweis" aria-live="polite" className="text-[12.5px] text-destructive">
              Feld ist leer. Antwort eintippen oder „Weiß ich nicht“ wählen.
            </p>
          )}
          <div className="flex gap-2">
            {/* S5: bei Frage 1 war der Knopf komplett aus dem Baum entfernt --
                "Weiß ich nicht"/"Weiter" ruecken beim Wechsel zu Frage 2 dadurch
                um seine Breite (~74px + 8px Abstand) nach rechts, mitten in einer
                Abfolge mit acht Klicks auf dieselbe Stelle. Der Knopf bleibt jetzt
                immer montiert und reserviert seinen Platz.
                S5-Fix: bei Frage 1 fuehrte "Zurueck" bisher ins Leere (index
                0 -> frageZurueck() no-op, aria-hidden/unsichtbar) -- jeder
                andere Schirm dieses Schritts hat einen Weg zurueck nach
                Schritt 2, der Fragenschirm keinen ausser dem Browser-
                Zurueck-Knopf. Statt einer fuenften, gleichrangigen Aktion
                uebernimmt genau dieser Knopf an Frage 1 die Rolle: er fuehrt
                dann zurueck zur Punkte-Liste statt eine Frage zurueck (die
                es an Frage 1 nicht gibt). Ab Frage 2 unveraendert. */}
            <Button type="button" variant="ghost" className="h-11" onClick={index === 0 ? onZurueck : frageZurueck}>
              Zurück
            </Button>
            {/* NIT-Fix: beide Knoepfe trugen flex-1 und standen damit gleich
                breit nebeneinander, obwohl "Weiter" die primaere Aktion ist --
                "Weiß ich nicht" bleibt jetzt so breit wie sein Text, wie
                "Zurueck" links daneben. */}
            <Button type="button" variant="outline" className="h-11" onClick={() => antworten(null)}>
              Weiß ich nicht
            </Button>
            <Button
              type="submit"
              className={cn("h-11 flex-1", value.trim().length === 0 && "opacity-60")}
              aria-disabled={value.trim().length === 0}
            >
              Weiter
            </Button>
          </div>
        </form>
      </div>
      <button
        type="button"
        onClick={ohneTestPlanen}
        aria-disabled={erstellenLoading || auswertenLoading}
        aria-busy={erstellenLoading || auswertenLoading}
        className={cn(
          "relative rounded px-1 py-1 text-[13px] text-muted-foreground [touch-action:manipulation] underline-offset-2 before:absolute before:-inset-2.5 before:content-[''] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          (erstellenLoading || auswertenLoading) && "opacity-60",
        )}
      >
        {index > 0
          ? // S1-Fix: ab der zweiten Frage wertet der Knopf (ohneTestPlanen
            // oben) tatsaechlich nur die bisherigen Antworten aus und fuehrt
            // zum Testergebnis-Schirm -- den Plan legt dort erst der eigene
            // "Plan erstellen"-Knopf an. "...planen" behauptete bisher das
            // Verhalten von Frage 1 (wo der Plan sofort entsteht), obwohl der
            // Schueler hier noch das Ergebnis seines Tests sehen soll, bevor
            // der Plan steht -- diese Information (was sitzt, was wackelt)
            // nimmt ihm ein Ueberspringen sonst weg. Die Beschriftung folgt
            // darum dem Verhalten, nicht umgekehrt.
            auswertenLoading
            ? "Antworten werden ausgewertet …"
            : "Mit bisherigen Antworten auswerten"
          : "Ohne Test planen"}
      </button>
    </div>
  );
}

const URTEIL_STYLE: Record<string, string> = {
  richtig: "border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:text-green-400",
  teilweise: "border-yellow-600/30 bg-yellow-600/10 text-yellow-700 dark:border-yellow-500/30 dark:text-yellow-400",
  falsch: "border-red-600/30 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:text-red-400",
};
const URTEIL_LABEL: Record<string, string> = { richtig: "Richtig", teilweise: "Teilweise", falsch: "Falsch" };
// S3-Fix: nie beantwortete Fragen (antwort === null -- "Weiss ich nicht"
// oder gar nicht erreicht, siehe auswerten() weiter oben) tragen fuer die
// Plan-Rechnung weiterhin urteil "falsch" (das aendert diese Anzeige-Fix
// bewusst nicht, siehe Kommentar im Auftrag). Angezeigt werden sie aber
// nicht als "Falsch", sondern als "Übersprungen" -- der Schueler hat sie nie
// beantwortet, das ist kein Fehler.
const UEBERSPRUNGEN_STYLE = "border-border bg-muted text-muted-foreground";

function TestErgebnis({
  checks,
  bestehenderPlan,
  erstellenLoading,
  onZurueck,
  onErstellen,
}: {
  checks: CheckDraft[];
  bestehenderPlan: boolean;
  erstellenLoading: boolean;
  onZurueck: () => void;
  onErstellen: () => void;
}) {
  const [offen, setOffen] = useState<number | null>(null);
  const [antwortenOffen, setAntwortenOffen] = useState(false);
  const sitzen = checks.filter((c) => c.urteil === "richtig").length;
  const wackeln = checks.filter((c) => c.urteil === "teilweise").length;
  // S3-Fix: uebersprungene Fragen (antwort === null) liefen bisher unter
  // "falsch" mit -- sechs nie gestellte Fragen erschienen als "6 fehlen",
  // als haette der Schueler sie gekonnt falsch beantwortet. Getrennt
  // gezaehlt, "fehlen" bleibt nur fuer tatsaechlich falsch beantwortete.
  const uebersprungen = checks.filter((c) => c.antwort === null).length;
  const fehlen = checks.filter((c) => c.urteil === "falsch" && c.antwort !== null).length;

  // BLOCKIEREND-Fix: dieser Schirm loest genau den auswertenLadenSchirmRef
  // ab, sobald checks eintrifft (siehe Kommentar bei fehlerSchirmRef oben) --
  // ohne eigenes Fokus-Ziel faellt der Fokus dabei auf body, ein
  // Screenreader-Nutzer bekommt die fertige Auswertung nie angesagt.
  // Fokussiert wird einmal beim Mount, nicht bei jedem Re-Render (Auf-/
  // Zuklappen von "Antworten ansehen"/Feedback wuerde den Fokus sonst
  // staendig zurueckreissen).
  const ergebnisRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fokussiereSichtbar(ergebnisRef.current);
  }, []);

  return (
    <div
      ref={ergebnisRef}
      tabIndex={-1}
      role="status"
      className="space-y-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-[13px] text-muted-foreground">
        {/* NIT-Fix: "0 sitzen, 0 wackeln, 0 fehlen" liest sich ohne Kontext wie
            ein Fragment -- "Von N Fragen: " davor verankert die Zahlen. */}
        Von {checks.length} {checks.length === 1 ? "Frage" : "Fragen"}: {sitzen} {sitzen === 1 ? "sitzt" : "sitzen"},{" "}
        {wackeln} {wackeln === 1 ? "wackelt" : "wackeln"}, {fehlen} {fehlen === 1 ? "fehlt" : "fehlen"}
        {uebersprungen > 0 && `, ${uebersprungen} übersprungen`}
      </p>

      {/* Die Zusammenfassung oben traegt die Botschaft, die Frage-fuer-Frage-
          Liste ist dieselbe Information, die danach dauerhaft auf der
          Planseite steht -- hinter einem Aufklapper, standardmaessig zu. */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setAntwortenOffen((v) => !v)}
          aria-expanded={antwortenOffen}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Antworten ansehen
          <ChevronDown className={cn("size-4 shrink-0 motion-safe:transition-transform motion-safe:ease-[var(--ease-atlas)]", antwortenOffen && "rotate-180")} />
        </button>
        {antwortenOffen && (
          <ul className="space-y-2 border-t p-2">
            {checks.map((c, i) => (
              <li key={i} className="rounded-xl border bg-card p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13.5px] font-medium">{c.frage}</p>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium",
                      c.antwort === null ? UEBERSPRUNGEN_STYLE : URTEIL_STYLE[c.urteil],
                    )}
                  >
                    {c.antwort === null ? "Übersprungen" : URTEIL_LABEL[c.urteil]}
                  </span>
                </div>
                {c.feedback && (
                  // SOLLTE 4: vorher `before:-inset-3` (12px) auf eine sichtbare
                  // Zeilenhoehe von rund 17px -- macht rund 41px, unter dem
                  // 44px-Minimum. `min-h-11` liefert die 44px direkt als eigene
                  // Boxhoehe statt ueber ein groesseres Inset.
                  <button
                    type="button"
                    onClick={() => setOffen((v) => (v === i ? null : i))}
                    aria-expanded={offen === i}
                    className="relative mt-1.5 flex min-h-11 items-center gap-1 rounded text-[12px] text-muted-foreground [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown className={cn("size-3.5 motion-safe:transition-transform motion-safe:ease-[var(--ease-atlas)]", offen === i && "rotate-180")} />
                    Feedback
                  </button>
                )}
                {offen === i && c.feedback && <p className="mt-1 text-[12.5px] text-muted-foreground">{c.feedback}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onZurueck}>
          Zurück
        </Button>
        <Button
          type="button"
          className={cn("h-11 flex-1", erstellenLoading && "opacity-60")}
          aria-disabled={erstellenLoading}
          aria-busy={erstellenLoading}
          onClick={onErstellen}
        >
          {bestehenderPlan ? "Plan neu erstellen" : "Plan erstellen"}
        </Button>
      </div>
    </div>
  );
}
