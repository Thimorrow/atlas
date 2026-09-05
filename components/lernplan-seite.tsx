"use client";

// Planseite des Lernplans: Kopf, Sicherheits-Übersicht, Tage mit Einheiten.
// Siehe SPEC.md "Planseite". Die Karten-Erzeugung laeuft ueber den Hook
// useKartenQueue (components/lernplan-karten-queue.tsx) im Hintergrund mit --
// die Seite zeigt dafuer nichts an, solange alles gut geht.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Loader2, MoreHorizontal, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useKartenQueue } from "@/components/lernplan-karten-queue";
import { MinutenFeld, OHNE_THEMA_LABEL, PhaseChip, SicherheitsBalken, balkenTextFarbe, useOverflowTitle } from "@/components/lernplan-ui";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { colorValue, NEUTRAL_COLOR } from "@/lib/subject-colors";
import { daysBetween, localISO, weekdayDateLabel } from "@/lib/assignments-view";
import { ZEITBUDGET_MAX, ZEITBUDGET_MIN, type ItemDTO, type PlanDTO, type PunktDTO } from "@/lib/lernplan-types";

const EASE = [0.22, 1, 0.36, 1] as const;

type Assignment = { id: string; title: string; dueDate: string | null };
type SubjectInfo = { name: string; color: string | null; botEnabled: boolean };

// Ein Codepfad, ein Wortlaut: 404 (nicht mehr da) und ein sonstiger
// Speicherfehler fuehren fuer den Nutzer zur selben naechsten Handlung.
const SPEICHERN_FEHLGESCHLAGEN = "Nicht gespeichert. Seite neu laden und erneut versuchen.";

// Baut den Erfolgstext fuer "Neu verteilen" statt den Maschinen-Enum aus
// lib/lernplan.ts ("knapp") direkt anzuzeigen -- neu/zusaetzlich kommen aus
// lib/lernplan-store.ts (neuVerteilenImStore).
// S1: "knapp" heisst nicht immer "es wurde gestrichen" -- lib/lernplan.ts
// setzt denselben Hinweis auch, wenn stattdessen nur die Tagesbudgets still
// hochskaliert wurden (budgetErhoeht). planAnlegen (lib/lernplan-store.ts)
// unterscheidet das schon mit zwei Saetzen -- hier derselbe Wortlaut statt
// eines dritten, erfundenen. budgetErhoeht kommt aus der Verteilen-Antwort,
// noch nicht garantiert vorhanden, darum optional und ohne es funktionsfaehig.
// S4: gestrichen und budgetErhoeht sind unabhaengig voneinander wahr
// (verteilen() Schritt 1/2 in lib/lernplan.ts) -- beide Saetze kommen wie bei
// planAnlegen (lib/lernplan-store.ts:465-484) nebeneinander, statt sich
// gegenseitig zu verdraengen.
function verteilenErfolgsText(
  neu: number,
  zusaetzlich: number,
  hinweis?: string,
  budgetErhoeht?: boolean,
  gestrichen?: number,
): string {
  // neu === 0 ist erreichbar, wenn alle betroffenen Punkte schon sicher genug
  // waren (lib/lernplan.ts) -- "0 neue Einheiten verteilt." klaenge dann nach
  // einem Fehlschlag, obwohl nichts zu tun war. Aber neu === 0 ist AUCH
  // erreichbar, wenn im Gegenteil alles gestrichen werden musste, weil die
  // Zeit bis zur Pruefung nicht reicht (verteilen() Schritt 1, hinweis
  // "knapp") -- dann ist "schon sicher genug" die falsche Erklaerung fuer
  // dieselbe Zahl, darum nur bei hinweis !== "knapp" die Abkuerzung nehmen.
  if (neu === 0 && zusaetzlich === 0 && !hinweis) return "Alles schon sicher genug, nichts musste neu verteilt werden.";
  const teile: string[] = [`${neu} ${neu === 1 ? "neue Einheit" : "neue Einheiten"} verteilt.`];
  if (zusaetzlich > 0) teile.push(`${zusaetzlich} davon zusätzlich zum Üben.`);
  if (hinweis === "knapp") {
    if (gestrichen && gestrichen > 0) {
      // NIT: nicht "Übungseinheit(en)" -- lib/lernplan.ts streicht zuerst bei
      // Proben, erst danach beim Üben (nie bei Simulationen). Wer nach
      // "Übungseinheiten" sucht, vermisst sonst tatsaechlich seine Proben.
      teile.push(
        `Knapp: ${gestrichen} ${gestrichen === 1 ? "Einheit musste" : "Einheiten mussten"} gestrichen werden, damit der Plan bis zur Prüfung passt.`,
      );
    }
    if (budgetErhoeht) {
      teile.push(
        "Knapp: einzelne Tage sind länger geworden, als du angegeben hast, damit der Plan bis zur Prüfung passt.",
      );
    }
    if (!gestrichen && !budgetErhoeht) teile.push("Knapp: nicht alles hat gepasst, es wurde gekürzt.");
  }
  return teile.join(" ");
}

// Die echten Fehlercodes aus lib/lernplan-store.ts (kein_plan, pruefung,
// keine_tage) statt des erfundenen "404", dazu "umfang" aus der Route selbst
// (app/api/lernen/plan/[id]/verteilen/route.ts): der Body hatte kein
// gueltiges umfang-Feld, ein Client-Bug, kein Nutzerfehler -- deshalb der
// Hinweis auf Neuladen statt eine Erklaerung, die der Nutzer eh nicht
// beeinflussen kann. hinweis traegt schon den fertigen Satz -- der hat
// Vorrang vor der Code-Uebersetzung.
function verteilenFehlerText(data: { error?: string; hinweis?: string } | null): string {
  if (data?.hinweis) return data.hinweis;
  switch (data?.error) {
    case "kein_plan":
      return "Plan gibt es nicht mehr.";
    case "pruefung":
      return "Prüfung gibt es nicht mehr.";
    case "keine_tage":
      return "Bis zur Prüfung sind keine Tage mehr.";
    case "umfang":
      return "Ungültige Anfrage. Seite neu laden und erneut versuchen.";
    default:
      return "Konnte nicht neu verteilt werden.";
  }
}

export function LernplanSeite({ subjectId, assignmentId }: { subjectId: string; assignmentId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<"laden" | "leer" | "fehler" | "ok">("laden");
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [probeItem, setProbeItem] = useState<ItemDTO | null>(null);
  // Getrennte Zustaende fuer Kopf- und Banner-Knopf: beide riefen frueher
  // dasselbe verteilenLaeuft, also zeigten beide "Wird verteilt ...", obwohl
  // nur einer ausgeloest hatte.
  const [kopfVerteilenLaeuft, setKopfVerteilenLaeuft] = useState(false);
  const [bannerVerteilenLaeuft, setBannerVerteilenLaeuft] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const [loeschenLaeuft, setLoeschenLaeuft] = useState(false);
  // Ehrlich: localISO() wurde vorher nur einmal pro Render gelesen -- ein
  // ueber Mitternacht offen gelassener Tab zeigte den Vortag beliebig lange
  // weiter als "Heute". Ein Timer, der exakt zur naechsten Mitternacht
  // feuert, waere die vollstaendige Loesung, ist hier aber nicht drin: die
  // beiden Listener unten decken nur den Fall ab, dass der Tab zwischendurch
  // den Fokus verliert und zurueckkommt (Reload einer anderen App, Sperr-
  // bildschirm) -- bleibt der Tab die ganze Nacht durchgehend im Vordergrund
  // und aktiv, ohne je den Fokus zu verlieren, bleibt "heute" bis zum
  // naechsten Fokuswechsel oder Neuladen der Vortag.
  const [heute, setHeute] = useState(() => localISO());
  useEffect(() => {
    function aktualisieren() {
      setHeute(localISO());
    }
    document.addEventListener("visibilitychange", aktualisieren);
    window.addEventListener("focus", aktualisieren);
    return () => {
      document.removeEventListener("visibilitychange", aktualisieren);
      window.removeEventListener("focus", aktualisieren);
    };
  }, []);
  // Liegt hier statt in KopfMenu (S8): die Checkliste rendert jetzt als
  // aufklappbarer Abschnitt im normalen Seitenfluss statt als Overlay ueber
  // dem Menue -- dafuer muss die Seite selbst wissen, ob sie offen ist.
  // NIT: das Verschwinden von "Ueberfaelliges nachholen" nach erfolgreichem
  // Verteilen liess KopfMenu daneben um die volle Knopfbreite springen -- die
  // min-w-Reservierung am Knopf stabilisiert nur seine eigene Breite waehrend
  // der Aktion, nicht den Sprung beim endgueltigen Verschwinden. `layout` auf
  // dem KopfMenu-Wrapper unten laesst es stattdessen an die freigewordene
  // Stelle gleiten; reduce schaltet das wie ueberall sonst in dieser Datei ab.
  const reduce = useReducedMotion();
  const [checklisteOffen, setChecklisteOffen] = useState(false);
  // S4: Ziel fuer den Fokus beim Oeffnen -- der Abschnitt wird aus dem Menue
  // heraus geoeffnet (KopfMenu), dessen schliessenUndFokusZurueck() den
  // Fokus auf den Menue-Trigger im Kopf legt, ausserhalb dieser Section. Ohne
  // eigenen Fokus hier erreicht ein Tastendruck (Escape) den onKeyDown der
  // Section nie, weil er dort nie hin blubbert.
  const checklisteRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (checklisteOffen) checklisteRef.current?.focus();
  }, [checklisteOffen]);

  // S5: minutesWeekday/minutesWeekend waren nach dem Anlegen nirgends mehr
  // aenderbar -- einziger Hebel war "Plan neu erstellen", das den gesamten
  // Fortschritt verwirft. Gleiches Oeffnen/Fokus-Muster wie checklisteOffen.
  const [budgetOffen, setBudgetOffen] = useState(false);
  const budgetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (budgetOffen) budgetRef.current?.focus();
  }, [budgetOffen]);
  const [budgetWerktag, setBudgetWerktag] = useState(30);
  const [budgetWochenende, setBudgetWochenende] = useState(30);
  const [budgetSpeichertLaeuft, setBudgetSpeichertLaeuft] = useState(false);
  // Bewusst nur an budgetOffen gebunden, nicht an plan: waehrend das Feld
  // offen ist, soll ein Hintergrund-Refresh (neuLaden(), z.B. nach einem
  // abgehakten Item) die Eingabe des Nutzers nicht ueberschreiben.
  useEffect(() => {
    if (budgetOffen && plan) {
      setBudgetWerktag(plan.minutesWeekday);
      setBudgetWochenende(plan.minutesWeekend);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetOffen]);
  // Fokus-Ziel, falls ein Knopf, der ihn haelt, nach einer Aktion aus dem DOM
  // verschwindet (Verschoben-Banner nach erfolgreichem Neu-Verteilen) --
  // der Plankopf-Titel ist garantiert am Leben, solange der Plan geladen ist.
  const titelRef = useRef<HTMLHeadingElement | null>(null);
  // true, wenn der Banner-Knopf die laufende Aktion ausgeloest hat -- nur dann
  // muss der Fokus beim Verschwinden des Banners aufgefangen werden.
  const bannerAusloeserRef = useRef(false);
  // Gleiches Muster fuer den Kopf-Knopf "Überfälliges nachholen": der
  // verschwindet aus dem DOM, sobald hatUeberfaelliges nach einem
  // erfolgreichen neuVerteilen() falsch wird -- ohne Auffangen faellt der
  // Fokus sonst auf body zurueck.
  const kopfAusloeserRef = useRef(false);
  // Nach erfolgreichem Loeschen wechselt die ganze Seite auf den Leer-Zustand --
  // der Ausloeser-Knopf im Kopf existiert dann nicht mehr, also faengt diese
  // Ueberschrift den Fokus auf statt ihn an body zu verlieren.
  const leerUeberschriftRef = useRef<HTMLParagraphElement | null>(null);
  const vorherigerStatusRef = useRef(status);
  useEffect(() => {
    const vorher = vorherigerStatusRef.current;
    vorherigerStatusRef.current = status;
    if (status === "leer" && vorher === "ok") {
      leerUeberschriftRef.current?.focus();
    }
  }, [status]);

  // Nur der allererste Ladevorgang darf die ganze Seite auf "fehler"
  // schalten. setzeErgebnis() ruft neuLaden() nach dem Speichern eines
  // Ergebnisses -- schlaegt genau dieser Hintergrund-Refresh im Funkloch
  // fehl, waere sonst der gerade gespeicherte Fortschritt weg, obwohl er auf
  // dem Server steht. Ein Refresh-Fehler bleibt darum ein Toast.
  const ersteLadungRef = useRef(true);
  // subjectId/assignmentId koennen wechseln, ohne dass die Komponente
  // remountet (Client-Navigation zu einem anderen Plan) -- dann ist es wieder
  // ein erster Ladevorgang fuer die neuen Props.
  useEffect(() => {
    ersteLadungRef.current = true;
  }, [subjectId, assignmentId]);

  // Schutz gegen ueberholende Antworten: load() und neuLaden() laufen
  // nebeneinander -- die Karten-Queue ruft neuLaden() nach jedem fertigen
  // Punkt auf, setzeErgebnis() ebenfalls nach jedem gespeicherten Ergebnis.
  // Kommt der aeltere von zwei parallelen Plan-Fetches spaeter zurueck,
  // wuerde er den gerade gespeicherten Stand mit einem veralteten Plan
  // ueberschreiben. Ein monoton steigender Zaehler laesst nur die Antwort des
  // jeweils zuletzt gestarteten Aufrufs in den State schreiben -- gleiches
  // Muster wie itemAufrufZaehlerRef weiter unten.
  const planAufrufZaehlerRef = useRef(0);

  const load = useCallback(async () => {
    const aufruf = ++planAufrufZaehlerRef.current;
    try {
      const [pRes, sRes, aRes] = await Promise.all([
        fetch(`/api/lernen/plan/${assignmentId}`),
        fetch(`/api/lernen/${subjectId}`),
        fetch(`/api/assignments?subjectId=${subjectId}`),
      ]);
      if (planAufrufZaehlerRef.current !== aufruf) return;
      if (pRes.status === 404) {
        if (ersteLadungRef.current) setStatus("leer");
        ersteLadungRef.current = false;
        return;
      }
      if (!pRes.ok || !sRes.ok || !aRes.ok) throw new Error("laden");
      const planData = ((await pRes.json()) as { plan: PlanDTO }).plan;
      const sData = (await sRes.json()) as { subject: { name: string; color: string | null }; botEnabled: boolean };
      const aData = (await aRes.json()) as { assignments: { id: string; title: string; dueDate: string | null }[] };
      if (planAufrufZaehlerRef.current !== aufruf) return;
      setPlan(planData);
      setSubject({ name: sData.subject.name, color: sData.subject.color, botEnabled: sData.botEnabled });
      setAssignment(aData.assignments.find((a) => a.id === assignmentId) ?? null);
      setStatus("ok");
      ersteLadungRef.current = false;
    } catch {
      if (planAufrufZaehlerRef.current !== aufruf) return;
      if (ersteLadungRef.current) {
        setStatus("fehler");
        ersteLadungRef.current = false;
      } else {
        toast("Aktualisieren fehlgeschlagen. Dein Fortschritt bleibt gespeichert.");
      }
    }
  }, [subjectId, assignmentId, toast]);

  // neuLaden() ist der Einhaengepunkt fuer die Karten-Queue (nach jedem
  // erzeugten Kartensatz) und fuer setzeErgebnis() (nach jeder gespeicherten
  // Probe, wegen der neu berechneten Sicherheit) -- beide brauchen nur
  // frische punkte/items, nicht Fach und Aufgaben-Liste. Frueher rief das
  // volle load() alle drei Fetches pro Karten-Statuswechsel neu auf.
  const neuLaden = useCallback(async () => {
    const aufruf = ++planAufrufZaehlerRef.current;
    try {
      const res = await fetch(`/api/lernen/plan/${assignmentId}`);
      if (planAufrufZaehlerRef.current !== aufruf) return;
      if (res.status === 404) {
        // Plan wurde in der Zwischenzeit geloescht -- der volle Reload zeigt
        // den Leer-Zustand statt eines veralteten Plans.
        void load();
        return;
      }
      if (!res.ok) throw new Error("laden");
      const planData = ((await res.json()) as { plan: PlanDTO }).plan;
      if (planAufrufZaehlerRef.current !== aufruf) return;
      setPlan(planData);
    } catch {
      if (planAufrufZaehlerRef.current !== aufruf) return;
      toast("Aktualisieren fehlgeschlagen. Dein Fortschritt bleibt gespeichert.");
    }
  }, [assignmentId, load, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stoesst die Karten-Erzeugung im Hintergrund an -- vor den fruehen Returns
  // unten, weil Hooks unbedingt aufgerufen werden muessen. Solange plan noch
  // nicht geladen ist, gibt es einfach nichts zu erzeugen.
  const kartenQueue = useKartenQueue({
    subjectId,
    assignmentId,
    punkte: plan?.punkte ?? [],
    botEnabled: subject?.botEnabled ?? true,
    onAktualisiert: neuLaden,
  });
  // S5: lokaleFehler liefert useKartenQueue inzwischen garantiert
  // (components/lernplan-karten-queue.tsx) -- kein Cast/Fallback mehr noetig.
  const kartenLokaleFehler = kartenQueue.lokaleFehler;

  // NIT: title (nativer Tooltip) soll wie bei PunktZeile/EinheitZeile/dem
  // Dialog nur erscheinen, wenn der Titel tatsaechlich abgeschnitten ist --
  // vorher stand er hier bedingungslos, auch ueber kurzen Titeln. Ebenfalls
  // vor den fruehen Returns, weil Hooks unbedingt aufgerufen werden muessen;
  // planloseTitelText faellt vor dem Laden auf "Prüfung" zurueck wie das
  // gerenderte h1 selbst.
  const planTitelOverflow = useOverflowTitle(assignment?.title ?? "Prüfung", titelRef);

  const verschoben = !!assignment?.dueDate && assignment.dueDate !== plan?.examDate;
  // Deckt sich mit ueberfaelligeTage in TageListe: nur zeigen, wenn es
  // ueberhaupt etwas nachzuholen gibt, sonst laeuft der Knopf ins Leere und
  // meldet trotzdem "erfolgreich".
  const hatUeberfaelliges = plan?.items.some((i) => i.date < heute && i.doneAt === null) ?? false;

  // Wenn der Verschoben-Banner (und sein Knopf) nach erfolgreichem Neu-Verteilen
  // verschwindet, faengt der Plankopf-Titel den Fokus auf -- sonst faellt er auf
  // body zurueck, weil der Ausloeser aus dem DOM entfernt wurde.
  useEffect(() => {
    if (!verschoben && bannerAusloeserRef.current) {
      bannerAusloeserRef.current = false;
      titelRef.current?.focus();
    }
  }, [verschoben]);

  // Gleiches Muster fuer den Kopf-Knopf: verschwindet er, weil seine eigene
  // Aktion hatUeberfaelliges auf falsch gesetzt hat, faengt der Titel den
  // Fokus auf statt ihn an body zu verlieren.
  useEffect(() => {
    if (!hatUeberfaelliges && kopfAusloeserRef.current) {
      kopfAusloeserRef.current = false;
      titelRef.current?.focus();
    }
  }, [hatUeberfaelliges]);

  function patchItem(id: string, patch: Partial<ItemDTO>) {
    setPlan((p) => (p ? { ...p, items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : p));
  }

  // Schutz gegen ueberholende Antworten: je Item ein monoton steigender Zaehler.
  // Wer beim Absenden den aktuellen Stand merkt und beim Eintreffen der Antwort
  // nur dann in den State schreibt, wenn kein neuerer Aufruf fuer dieses Item
  // gestartet wurde, verhindert, dass eine langsame erste Antwort eine schnellere
  // zweite ueberschreibt (zwei schnelle Klicks auf dieselbe Checkbox).
  const itemAufrufZaehlerRef = useRef<Map<string, number>>(new Map());
  function naechsterAufruf(id: string): number {
    const n = (itemAufrufZaehlerRef.current.get(id) ?? 0) + 1;
    itemAufrufZaehlerRef.current.set(id, n);
    return n;
  }
  function istAktuellerAufruf(id: string, aufruf: number): boolean {
    return itemAufrufZaehlerRef.current.get(id) === aufruf;
  }

  async function toggleEinfach(item: ItemDTO) {
    const vorher = item;
    const done = item.doneAt === null;
    const aufruf = naechsterAufruf(item.id);
    patchItem(item.id, { doneAt: done ? new Date().toISOString() : null, result: done ? item.result : null });
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) {
        if (istAktuellerAufruf(item.id, aufruf)) {
          patchItem(item.id, vorher);
          toast(SPEICHERN_FEHLGESCHLAGEN);
        }
        return;
      }
      const updated = ((await res.json().catch(() => null)) as { item: ItemDTO } | null)?.item ?? null;
      if (updated && istAktuellerAufruf(item.id, aufruf)) patchItem(item.id, updated);
    } catch {
      if (istAktuellerAufruf(item.id, aufruf)) {
        patchItem(item.id, vorher);
        toast(SPEICHERN_FEHLGESCHLAGEN);
      }
    }
  }

  async function setzeErgebnis(item: ItemDTO, result: number) {
    const vorher = item;
    const aufruf = naechsterAufruf(item.id);
    patchItem(item.id, { doneAt: new Date().toISOString(), result });
    try {
      const res = await fetch(`/api/lernen/plan/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true, result }),
      });
      if (!res.ok) {
        if (istAktuellerAufruf(item.id, aufruf)) {
          patchItem(item.id, vorher);
          toast(SPEICHERN_FEHLGESCHLAGEN);
        }
        return;
      }
      const updated = ((await res.json().catch(() => null)) as { item: ItemDTO } | null)?.item ?? null;
      if (updated && istAktuellerAufruf(item.id, aufruf)) patchItem(item.id, updated);
      void neuLaden();
    } catch {
      if (istAktuellerAufruf(item.id, aufruf)) {
        patchItem(item.id, vorher);
        toast(SPEICHERN_FEHLGESCHLAGEN);
      }
    }
  }

  async function neuVerteilen(umfang: "ueberfaellig" | "alle_offen", quelle: "kopf" | "banner") {
    const laeuft = quelle === "kopf" ? kopfVerteilenLaeuft : bannerVerteilenLaeuft;
    const setLaeuft = quelle === "kopf" ? setKopfVerteilenLaeuft : setBannerVerteilenLaeuft;
    if (!plan || laeuft) return;
    setLaeuft(true);
    try {
      const res = await fetch(`/api/lernen/plan/${plan.id}/verteilen`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ umfang }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            plan?: PlanDTO;
            hinweis?: string;
            error?: string;
            neu?: number;
            zusaetzlich?: number;
            budgetErhoeht?: boolean;
            gestrichen?: number;
          }
        | null;
      if (!res.ok || !data?.plan) {
        toast(verteilenFehlerText(data));
        return;
      }
      setPlan(data.plan);
      // "knapp" heisst, es musste gestrichen oder das Tagesbudget stumm
      // erhoeht werden (lib/lernplan.ts) -- der Vorgang ist geglueckt, aber
      // etwas ist dabei verlorengegangen. Genau dafuer gibt es "warning"
      // statt "success" (components/toast.tsx, gleiches Muster wie in
      // lernplan-erstellen.tsx bei denselben Hinweisen).
      toast(
        verteilenErfolgsText(data.neu ?? 0, data.zusaetzlich ?? 0, data.hinweis, data.budgetErhoeht, data.gestrichen),
        data.hinweis === "knapp" ? "warning" : "success",
      );
    } catch {
      toast("Konnte nicht neu verteilt werden.");
    } finally {
      setLaeuft(false);
    }
  }

  // S5: das Budget zu speichern heisst zwangslaeufig, die offenen Einheiten
  // damit neu zu verteilen -- sonst stuende die neue Zahl in der Datenbank und
  // die Tage laegen weiter ueber dem Limit, samt derselben "Knapp"-Meldung.
  // PATCH /api/lernen/plan/[id] macht deshalb beides und antwortet in der Form
  // des Neuverteilens; darum hier derselbe Erfolgstext, der auch "es wurde
  // gestrichen" und "Tage sind laenger geworden" benennt. Erledigte Einheiten
  // fasst der Vorgang nicht an (Umfang "alle_offen"), der Fortschritt bleibt.
  async function budgetSpeichern() {
    if (!plan || budgetSpeichertLaeuft) return;
    setBudgetSpeichertLaeuft(true);
    try {
      const res = await fetch(`/api/lernen/plan/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutesWeekday: budgetWerktag, minutesWeekend: budgetWochenende }),
      });
      const data = (await res.json().catch(() => null)) as
        | { plan?: PlanDTO; neu?: number; zusaetzlich?: number; hinweis?: string; budgetErhoeht?: boolean; gestrichen?: number }
        | null;
      if (!res.ok || !data?.plan) {
        // Achtung: "hinweis" traegt in dieser API zwei Bedeutungen -- im
        // Fehlerfall den Klartext fuer den Nutzer, im Erfolgsfall den
        // Maschinen-Enum "knapp". Darum nur hier, wo res.ok falsch ist.
        toast((!res.ok && data?.hinweis) || SPEICHERN_FEHLGESCHLAGEN);
        return;
      }
      setPlan(data.plan);
      toast(
        `Zeitbudget gespeichert. ${verteilenErfolgsText(data.neu ?? 0, data.zusaetzlich ?? 0, data.hinweis, data.budgetErhoeht, data.gestrichen)}`,
        data.hinweis === "knapp" ? "warning" : "success",
      );
      setBudgetOffen(false);
      titelRef.current?.focus();
    } catch {
      toast(SPEICHERN_FEHLGESCHLAGEN);
    } finally {
      setBudgetSpeichertLaeuft(false);
    }
  }

  async function planLoeschen() {
    if (!plan || loeschenLaeuft) return;
    setLoeschenLaeuft(true);
    try {
      const res = await fetch(`/api/lernen/plan/${plan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLoeschenOffen(false);
      setPlan(null);
      setStatus("leer");
      toast("Plan gelöscht.", "success");
    } catch {
      toast("Der Plan konnte nicht gelöscht werden.");
    } finally {
      setLoeschenLaeuft(false);
    }
  }

  if (status === "laden") return <LernplanSkeleton />;

  if (status === "leer") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
          <p
            ref={leerUeberschriftRef}
            tabIndex={-1}
            className="text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Noch kein Plan
          </p>
          <p className="text-[13px] text-muted-foreground">Zu dieser Prüfung gibt es noch keinen Lernplan.</p>
          <Link href={`/lernen/${subjectId}/plan/${assignmentId}/neu`} className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
            Lernplan erstellen
          </Link>
        </div>
      </div>
    );
  }

  if (status === "fehler" || !plan) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border bg-card px-4 py-6 text-center shadow-card">
          <p className="text-[14px] text-muted-foreground">Der Plan konnte nicht geladen werden.</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Prüfe die Verbindung und versuche es erneut.</p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-border-control px-3 py-1.5 text-[13px] font-medium transition-colors ease-[var(--ease-atlas)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  const tint = colorValue(subject?.color) || NEUTRAL_COLOR;
  // S2: Math.max(0, …) klemmte jedes negative Delta auf 0 -- eine Pruefung
  // von vorgestern behauptete "Heute faellig". Der negative Fall bleibt jetzt
  // sichtbar. Wortlaut bewusst "Vor X Tagen" statt "Rueckstand": Rueckstand
  // waere die Sprache eines verpassten Termins vor der Frist, hier ist die
  // Pruefung aber bereits geschrieben -- es fehlt nichts mehr aufzuholen, nur
  // die Einordnung "das war vor X Tagen" bleibt richtig.
  const tageBis = assignment?.dueDate ? daysBetween(heute, assignment.dueDate) : null;
  const hatChecklisteText = !plan.checklistFileId && !!plan.checklistText;
  // Waehrend ein Dialog offen ist, wird der Seiteninhalt dahinter per inert
  // (statt aria-hidden) aus Tab-Order und AX-Baum genommen -- aria-hidden
  // allein liesse die Knoepfe und Links darunter weiter fokussierbar, ein
  // ARIA-Verstoss. Gleiches Muster wie in den Dialogen selbst (unten).
  const dialogOffen = probeItem !== null || loeschenOffen;

  return (
    <div className="mx-auto max-w-2xl">
      <div inert={dialogOffen} className="space-y-6">
      <header className="relative rounded-2xl border bg-card p-5 shadow-card">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-2xl" style={{ backgroundColor: tint }} />
        {/* S5: fuehrte vorher als toter Text nirgendwohin -- jetzt ein Link
            zurueck zum Fach, gleiches Ziel wie im Fehlerfall des Erstell-Flows
            (lernplan-erstellen.tsx). before:-inset-1 vergroessert die
            Trefflaeche, ohne die Zeile selbst optisch zu verbreitern oder wie
            eine zweite hervorgehobene Kopf-Aktion neben "Ueberfaelliges
            nachholen"/KopfMenu zu wirken -- nur ein dezenter Hover-Underline. */}
        <Link
          href={`/lernen/${subjectId}`}
          className="relative -m-1 inline-block rounded p-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground before:absolute before:-inset-1 before:content-[''] [touch-action:manipulation] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {subject?.name ?? "Fach"}
        </Link>
        <h1
          ref={titelRef}
          tabIndex={-1}
          className="mt-0.5 truncate text-xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={planTitelOverflow.title}
        >
          {assignment?.title ?? "Prüfung"}
        </h1>
        {tageBis !== null && (
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            {tageBis < 0
              ? `Vor ${-tageBis} ${-tageBis === 1 ? "Tag" : "Tagen"}`
              : tageBis === 0
                ? "Heute fällig"
                : tageBis === 1
                  ? "Morgen fällig"
                  : `Noch ${tageBis} Tage`}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hatUeberfaelliges && (
            <Button
              type="button"
              size="sm"
              // Bewusst nicht mehr die primaere Aktion des Screens -- die
              // Handlung des Tages steht in der Heute-Karte. Planpflege ist
              // sekundaer.
              variant="outline"
              aria-disabled={kopfVerteilenLaeuft}
              aria-busy={kopfVerteilenLaeuft}
              // min-w haelt die Breite ueber beide Beschriftungen ("Überfälliges
              // nachholen" / "Wird verteilt …") stabil, damit KopfMenu daneben
              // waehrend der Aktion nicht springt (S10).
              className={cn("min-w-[180px] justify-center", kopfVerteilenLaeuft && "opacity-60")}
              onClick={() => {
                if (kopfVerteilenLaeuft) return;
                kopfAusloeserRef.current = true;
                void neuVerteilen("ueberfaellig", "kopf");
              }}
            >
              {kopfVerteilenLaeuft ? (
                <>
                  <Loader2 className="size-3.5 motion-safe:animate-spin" />
                  Wird verteilt …
                </>
              ) : (
                "Überfälliges nachholen"
              )}
            </Button>
          )}
          <motion.div layout={!reduce} transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE }}>
            <KopfMenu
              plan={plan}
              subjectId={subjectId}
              assignmentId={assignmentId}
              checklisteOffen={checklisteOffen}
              onToggleCheckliste={() => setChecklisteOffen((v) => !v)}
              budgetOffen={budgetOffen}
              onToggleBudget={() => setBudgetOffen((v) => !v)}
              onLoeschenOeffnen={() => setLoeschenOffen(true)}
            />
          </motion.div>
        </div>
      </header>

      {checklisteOffen && hatChecklisteText && (
        <section
          ref={checklisteRef}
          tabIndex={-1}
          className="space-y-1.5 rounded-xl border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            // Escape schliesst wie ueberall sonst auf der Seite (Menue,
            // Dialoge) -- vorher blieb dieser Abschnitt als einziger offen.
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setChecklisteOffen(false);
            titelRef.current?.focus();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Checkliste</p>
            <button
              type="button"
              onClick={() => setChecklisteOffen(false)}
              className="relative inline-flex min-h-11 items-center rounded px-1 py-1 text-[12px] font-medium text-primary before:absolute before:-inset-2 before:content-[''] [touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Verbergen
            </button>
          </div>
          {/* select-text hebt das app-weite select-none fuer echten Inhalt auf --
              gleiches Muster wie app/page.tsx bei Fach/Raum: die eigene
              Checkliste soll markier- und kopierbar bleiben. */}
          <p className="whitespace-pre-wrap select-text text-[13px] text-muted-foreground">{plan.checklistText}</p>
        </section>
      )}

      {budgetOffen && (
        <section
          ref={budgetRef}
          tabIndex={-1}
          className="space-y-3 rounded-xl border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setBudgetOffen(false);
            titelRef.current?.focus();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zeitbudget pro Tag</p>
            <button
              type="button"
              onClick={() => {
                setBudgetOffen(false);
                titelRef.current?.focus();
              }}
              className="relative inline-flex min-h-11 items-center rounded px-1 py-1 text-[12px] font-medium text-primary before:absolute before:-inset-2 before:content-[''] [touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Verbergen
            </button>
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Speichern verteilt alle noch offenen Einheiten sofort neu. Erledigte Tage bleiben unangetastet.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] text-muted-foreground">
              Werktage (Min.)
              <MinutenFeld
                wert={budgetWerktag}
                min={ZEITBUDGET_MIN}
                max={ZEITBUDGET_MAX}
                onCommit={setBudgetWerktag}
                toast={toast}
                className="mt-1 block w-full rounded-md border border-border-control bg-background px-2.5 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block text-[12.5px] text-muted-foreground">
              Wochenende (Min.)
              <MinutenFeld
                wert={budgetWochenende}
                min={ZEITBUDGET_MIN}
                max={ZEITBUDGET_MAX}
                onCommit={setBudgetWochenende}
                toast={toast}
                className="mt-1 block w-full rounded-md border border-border-control bg-background px-2.5 text-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            aria-disabled={budgetSpeichertLaeuft}
            aria-busy={budgetSpeichertLaeuft}
            className={cn(budgetSpeichertLaeuft && "opacity-60")}
            onClick={() => void budgetSpeichern()}
          >
            {budgetSpeichertLaeuft ? (
              <>
                <Loader2 className="size-3.5 motion-safe:animate-spin" />
                Wird gespeichert …
              </>
            ) : (
              "Speichern"
            )}
          </Button>
        </section>
      )}

      {verschoben && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          <span>
            Prüfung ist jetzt am {assignment?.dueDate ? weekdayDateLabel(assignment.dueDate) : "?"}, neu verteilen?
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-disabled={bannerVerteilenLaeuft}
            aria-busy={bannerVerteilenLaeuft}
            // min-w wie beim Kopf-Knopf (S10): "Ganzen Plan neu verteilen" ist
            // die breiteste Beschriftung dieses Knopfs.
            className={cn("min-w-[200px] justify-center", bannerVerteilenLaeuft && "opacity-60")}
            onClick={() => {
              if (bannerVerteilenLaeuft) return;
              bannerAusloeserRef.current = true;
              void neuVerteilen("alle_offen", "banner");
            }}
          >
            {bannerVerteilenLaeuft ? (
              <>
                <Loader2 className="size-3.5 motion-safe:animate-spin" />
                Wird verteilt …
              </>
            ) : (
              "Ganzen Plan neu verteilen"
            )}
          </Button>
        </div>
      )}

      <TageListe
        subjectId={subjectId}
        assignmentId={assignmentId}
        plan={plan}
        heute={heute}
        botEnabled={subject?.botEnabled ?? true}
        kartenLaufend={kartenQueue.laufend}
        kartenLokaleFehler={kartenLokaleFehler}
        onKartenErneut={(punktId) => kartenQueue.erneut([punktId])}
        onToggleEinfach={toggleEinfach}
        onProbeOeffnen={setProbeItem}
        fallbackFocusRef={titelRef}
      />

      <SicherheitsUebersicht punkte={plan.punkte} />
      </div>

      <WieLiefEsDialog
        offen={probeItem !== null}
        titel={probeItem?.punktTitel ?? (probeItem?.phase === "simulation" ? "Simulation" : OHNE_THEMA_LABEL)}
        istSimulation={probeItem?.phase === "simulation"}
        betroffenePunkteAnzahl={
          plan.punkte.filter((p) => p.sicherheitQuelle !== "karten" && p.sicherheitQuelle !== "diagnose").length
        }
        onClose={() => setProbeItem(null)}
        onWaehlen={(result) => {
          if (probeItem) setzeErgebnis(probeItem, result);
          setProbeItem(null);
        }}
        fallbackFocusRef={titelRef}
      />

      <PlanLoeschenDialog
        offen={loeschenOffen}
        laeuft={loeschenLaeuft}
        onClose={() => setLoeschenOffen(false)}
        onLoeschen={() => void planLoeschen()}
      />
    </div>
  );
}

// --- Kopf: "Mehr"-Menü (Checkliste, Plan neu erstellen, Plan löschen) -------
//
// Gleiches Zugriffsmuster wie das ehemalige NeuVerteilenMenu: role="menu",
// Pfeiltasten, Escape, Fokus zurueck zum Ausloeser. Die drei Eintraege
// braucht man selten -- deshalb hinter einem einzelnen Knopf statt im Kopf
// ausgebreitet.

function KopfMenu({
  plan,
  subjectId,
  assignmentId,
  checklisteOffen,
  onToggleCheckliste,
  budgetOffen,
  onToggleBudget,
  onLoeschenOeffnen,
}: {
  plan: PlanDTO;
  subjectId: string;
  assignmentId: string;
  checklisteOffen: boolean;
  onToggleCheckliste: () => void;
  budgetOffen: boolean;
  onToggleBudget: () => void;
  onLoeschenOeffnen: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const hatChecklisteLink = !!plan.checklistFileId;
  const hatChecklisteText = !plan.checklistFileId && !!plan.checklistText;

  // Aussen-Klick schliesst das Menue -- sonst bleibt es offen, wenn woanders
  // auf der Seite getippt wird.
  useEffect(() => {
    if (!offen) return;
    function onDoc(e: MouseEvent) {
      // S2: schliessenUndFokusZurueck() statt nur setOffen(false) -- sonst
      // verschwindet der fokussierte Menueeintrag aus dem DOM und der Fokus
      // faellt auf body, statt zum Trigger zurueckzukehren.
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) schliessenUndFokusZurueck();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [offen]);

  // Beim Oeffnen wandert der Fokus auf den ersten Eintrag.
  useEffect(() => {
    if (offen) itemRefs.current[0]?.focus();
  }, [offen]);

  function schliessenUndFokusZurueck() {
    setOffen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const refs = itemRefs.current.filter((el): el is HTMLElement => el !== null);
    const idx = refs.findIndex((el) => el === document.activeElement);
    if (e.key === "Escape" || e.key === "Tab") {
      // Tab wie Escape: die Eintraege sind per tabIndex={-1} aus der
      // Tab-Reihenfolge genommen (nur Pfeiltasten wandern zwischen ihnen),
      // ohne diesen Fall wanderte Tab sonst weiter in den Seiteninhalt,
      // waehrend das Menue offen blieb.
      e.preventDefault();
      schliessenUndFokusZurueck();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      refs[(idx + 1) % refs.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      refs[(idx - 1 + refs.length) % refs.length]?.focus();
    } else if (e.key === "Home") {
      // NIT: Escape/Tab/Pfeile waren schon verdrahtet, Home/End fehlten --
      // gleiches Muster wie ChecklistModeRadiogroup in
      // components/lernplan-erstellen.tsx.
      e.preventDefault();
      refs[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      refs[refs.length - 1]?.focus();
    }
  }

  let refIndex = 0;
  function setItemRef(el: HTMLElement | null) {
    itemRefs.current[refIndex] = el;
    refIndex += 1;
  }

  return (
    <div ref={wrapRef} className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          itemRefs.current = [];
          setOffen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label="Weitere Optionen zum Plan"
      >
        <MoreHorizontal className="size-4" />
      </Button>
      {offen && (
        <ul
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-10 mt-1 w-52 rounded-lg border bg-popover p-1 shadow-popover"
        >
          {hatChecklisteLink && (
            <li role="none">
              <a
                ref={setItemRef}
                href={`/api/files/${plan.checklistFileId}`}
                target="_blank"
                rel="noopener"
                role="menuitem"
                tabIndex={-1}
                onClick={schliessenUndFokusZurueck}
                className="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Checkliste öffnen
              </a>
            </li>
          )}
          {hatChecklisteText && (
            <li role="none">
              <button
                ref={setItemRef}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-expanded={checklisteOffen}
                onClick={() => {
                  onToggleCheckliste();
                  schliessenUndFokusZurueck();
                }}
                className="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {checklisteOffen ? "Checkliste verbergen" : "Checkliste anzeigen"}
              </button>
            </li>
          )}
          <li role="none">
            <button
              ref={setItemRef}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-expanded={budgetOffen}
              onClick={() => {
                onToggleBudget();
                schliessenUndFokusZurueck();
              }}
              className="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {budgetOffen ? "Zeitbudget verbergen" : "Zeitbudget ändern"}
            </button>
          </li>
          <li role="none">
            <Link
              ref={setItemRef}
              href={`/lernen/${subjectId}/plan/${assignmentId}/neu`}
              role="menuitem"
              tabIndex={-1}
              onClick={schliessenUndFokusZurueck}
              className="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Plan neu erstellen
            </Link>
          </li>
          <li role="none">
            <button
              ref={setItemRef}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                schliessenUndFokusZurueck();
                onLoeschenOeffnen();
              }}
              className="flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-[13px] text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Plan löschen
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

// --- Sicherheits-Uebersicht ----------------------------------------------------

function SicherheitsUebersicht({ punkte }: { punkte: PunktDTO[] }) {
  const [offen, setOffen] = useState(punkte.length <= 4);
  // BLOCKIEREND: sicherheit ist fuer jeden Punkt ohne Diagnose-Check ein
  // erfundener Platzhalter (50, lib/lernplan-store.ts) -- ein Mittelwert
  // ueber lauter ungemessene Punkte waere keine Kennzahl, sondern die
  // Behauptung einer Messung, die nie stattgefunden hat. Der Schnitt zaehlt
  // deshalb nur ueber `gemessene` (sicherheitQuelle !== "ohne_test"); ist sie
  // leer, gibt es keine Zahl anzuzeigen, nur die Punktzahl selbst. Ist nur ein
  // Teil gemessen, sagt die Kopfzeile explizit wie viele, statt einen Schnitt
  // ueber eine gemischte Grundgesamtheit (Haelfte gemessen, Haelfte erfunden)
  // unkommentiert als eine einzige Zahl auszugeben.
  const gemessene = punkte.filter((p) => p.sicherheitQuelle !== "ohne_test");
  const schnitt =
    gemessene.length > 0 ? Math.round(gemessene.reduce((s, p) => s + p.sicherheit, 0) / gemessene.length) : 0;

  return (
    <section className="space-y-2">
      {/* S9: echte Ueberschrift statt nur eines <button>-Textes -- vorher war
          dieser Abschnitt per Ueberschriften-Navigation unsichtbar, waehrend
          "Was ansteht", "Ueberfaellig" und "Kommende Tage" sauber ausgezeichnet
          sind. Der Knopf bleibt innerhalb der Ueberschrift. */}
      <h2>
        <button
          type="button"
          onClick={() => setOffen((v) => !v)}
          aria-expanded={offen}
          className="relative flex min-h-11 w-full items-center justify-between gap-2 rounded before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ChevronDown className={cn("size-3.5 motion-safe:transition-transform motion-safe:ease-[var(--ease-atlas)]", offen && "rotate-180")} />
            Sicherheit
          </span>
          {/* NIT: text-muted-foreground und balkenTextFarbe() konkurrierten hier um
              dieselbe Textfarbe -- welche Utility im generierten Stylesheet gewinnt,
              entscheidet die Reihenfolge dort, nicht die im String. balkenTextFarbe
              soll gewinnen, also bleibt nur noch tabular-nums als neutrale Basis. */}
          <span
            className={cn("tabular-nums text-[12px]", gemessene.length > 0 ? balkenTextFarbe(schnitt) : "text-muted-foreground")}
          >
            {punkte.length} {punkte.length === 1 ? "Punkt" : "Punkte"}
            {gemessene.length === 0 && " · Noch nicht eingeschätzt"}
            {gemessene.length > 0 && gemessene.length < punkte.length && ` · ${gemessene.length} eingeschätzt · ${schnitt}%`}
            {gemessene.length > 0 && gemessene.length === punkte.length && ` · ${schnitt}%`}
          </span>
        </button>
      </h2>
      {offen && (
        <ul className="space-y-2">
          {punkte.map((p) => (
            <PunktZeile key={p.id} punkt={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PunktZeile({ punkt }: { punkt: PunktDTO }) {
  const [offen, setOffen] = useState(false);
  const hatFeedback = punkt.checks.some((c) => c.feedback);
  const titelOverflow = useOverflowTitle<HTMLParagraphElement>(punkt.titel);

  return (
    <li className="rounded-xl border bg-card p-3 shadow-card">
      <p ref={titelOverflow.ref} className="truncate text-[13.5px] font-medium" title={titelOverflow.title}>
        {punkt.titel}
      </p>
      <SicherheitsBalken wert={punkt.sicherheit} quelle={punkt.sicherheitQuelle} label={punkt.titel} className="mt-2" />
      {/* S11: die Karten-Reparatur ("Karten erneut erzeugen") stand frueher
          auch hier, doppelt zur Einheiten-Zeile in TageListe -- diese
          Uebersicht beantwortet nur "wie sicher bin ich", die Reparatur einer
          fehlgeschlagenen Kartenerzeugung gehoert dort hin, zumal dieser
          Abschnitt ab fuenf Punkten eingeklappt startet und der Knopf damit
          meist unsichtbar war.
          NIT: die Zeile rendert jetzt nur noch, wenn es wirklich Feedback
          gibt -- vorher blieb ohne Feedback und ohne Fehler-Retry ein
          6px hoher Totraum unter jedem unauffaelligen Punkt stehen. */}
      {hatFeedback && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={() => setOffen((v) => !v)}
            aria-expanded={offen}
            className="relative ml-auto flex min-h-11 items-center gap-1 rounded before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className={cn("size-3.5 motion-safe:transition-transform motion-safe:ease-[var(--ease-atlas)]", offen && "rotate-180")} />
            Feedback
          </button>
        </div>
      )}
      {/* NIT: hatFeedback prueft mit some(), vorher rendierte die Liste aber
          alle checks -- auch die ohne Rueckmeldung, aufgefangen nur durch den
          irrefuehrenden Fallback-Text "Keine Rueckmeldung". Jetzt vorher
          gefiltert, der Fallback entfaellt damit von selbst. */}
      {offen && hatFeedback && (
        <ul className="mt-2 space-y-1.5 border-t pt-2">
          {punkt.checks.filter((c) => c.feedback).map((c) => (
            <li key={c.id} className="text-[12.5px] text-muted-foreground">
              <span className="block font-medium text-foreground">{c.frage}</span>
              {c.feedback}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// --- Tage -----------------------------------------------------------------------

type Tag = { date: string; items: ItemDTO[] };

function gruppiereTage(items: ItemDTO[]): Tag[] {
  const byDate = new Map<string, ItemDTO[]>();
  for (const item of items) {
    const arr = byDate.get(item.date) ?? [];
    arr.push(item);
    byDate.set(item.date, arr);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, its]) => ({ date, items: its.sort((a, b) => a.position - b.position) }));
}

function TageListe({
  subjectId,
  assignmentId,
  plan,
  heute,
  botEnabled,
  kartenLaufend,
  kartenLokaleFehler,
  onKartenErneut,
  onToggleEinfach,
  onProbeOeffnen,
  fallbackFocusRef,
}: {
  subjectId: string;
  assignmentId: string;
  plan: PlanDTO;
  heute: string;
  botEnabled: boolean;
  kartenLaufend: Set<string>;
  // S5: Punkte, deren Karten-Lauf in dieser Sitzung lokal gescheitert ist.
  kartenLokaleFehler: Set<string>;
  onKartenErneut: (punktId: string) => void;
  onToggleEinfach: (item: ItemDTO) => void;
  onProbeOeffnen: (item: ItemDTO) => void;
  // Ziel fuer den Fokus, wenn eine Einheit sich selbst aus dem Baum
  // entfernt -- siehe Kommentar bei EinheitZeile/ausgeloestRef.
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const tage = useMemo(() => gruppiereTage(plan.items), [plan.items]);
  const punkteById = useMemo(() => new Map(plan.punkte.map((p) => [p.id, p])), [plan.punkte]);
  const [erledigteOffen, setErledigteOffen] = useState(false);

  // Reihenfolge nach Dringlichkeit statt nach Kalender: heute zuerst (die
  // eine Frage des Screens), dann ueberfaellige Tage mit noch offener
  // Arbeit, dann kommende Tage aufsteigend. Vergangene Tage, an denen schon
  // alles erledigt ist, sind Archiv und kommen eingeklappt ans Ende.
  const heuteTag = tage.find((t) => t.date === heute) ?? null;
  const ueberfaelligeTage = tage.filter((t) => t.date < heute && t.items.some((i) => i.doneAt === null));
  const offeneUeberfaelligeAnzahl = ueberfaelligeTage.reduce(
    (n, t) => n + t.items.filter((i) => i.doneAt === null).length,
    0,
  );
  const kommendeTage = tage.filter((t) => t.date > heute);
  const erledigteTage = tage.filter((t) => t.date < heute && t.items.every((i) => i.doneAt !== null));

  // S3/S2: die erste offene Einheit des Heute-Tags bekommt die primaere
  // Aktion -- ids sind planweit eindeutig, darum reicht ein Vergleich in
  // "zeile" unten fuer alle Abschnitte (nur ein Item im ganzen Plan traegt
  // je eine bestimmte id). Faellt der Heute-Tag weg oder ist er komplett
  // abgehakt, liefert find() dort undefined, und die primaere Aktion wandert
  // auf die erste offene Einheit des aeltesten ueberfaelligen Tages
  // (ueberfaelligeTage ist wie tage aufsteigend sortiert, [0] also der
  // aelteste) -- sonst hat der Screen ausgerechnet dann, wenn Zeitdruck am
  // groessten ist, keinen primaeren Knopf mehr.
  // S3: "lernen"-Einheiten scheiden hier bewusst aus. Sie sind Lesestoff mit
  // Seitenangabe (siehe EinheitZeile, item.phase === "lernen"-Zweig) und
  // haben gar kein Bedienelement, das die primaere Auszeichnung tragen
  // koennte -- ein primaer=true, das nirgends ankommt, waere kein Fehler,
  // aber ein erfundener Knopf allein fuer die Auszeichnung waere schlechter
  // als gar keiner. Also die erste offene Einheit suchen, die tatsaechlich
  // eine Handlung anbietet (ueben/probe/simulation); Plaene starten laut
  // verteilen() (lib/lernplan.ts) am ersten Tag ueblicherweise nur mit
  // "lernen"-Einheiten, ohne diesen Filter bliebe der Knopf an Tag 1 also
  // fast immer aus.
  const ersteOffeneHeuteId =
    heuteTag?.items.find((i) => i.doneAt === null && i.phase !== "lernen")?.id ??
    ueberfaelligeTage[0]?.items.find((i) => i.doneAt === null && i.phase !== "lernen")?.id ??
    null;
  // S4: Heute-Tag da, aber komplett abgehakt -- braucht eine Bestaetigung
  // und den naechsten Termin statt nur durchgestrichener Zeilen.
  const heuteAllesErledigt = !!heuteTag && heuteTag.items.every((i) => i.doneAt !== null);

  const zeile = (item: ItemDTO) => (
    <EinheitZeile
      key={item.id}
      subjectId={subjectId}
      assignmentId={assignmentId}
      item={item}
      punkt={item.pointId ? (punkteById.get(item.pointId) ?? null) : null}
      botEnabled={botEnabled}
      kartenLaeuft={item.pointId ? kartenLaufend.has(item.pointId) : false}
      kartenLokalFehler={item.pointId ? kartenLokaleFehler.has(item.pointId) : false}
      primaer={item.id === ersteOffeneHeuteId}
      onKartenErneut={onKartenErneut}
      onToggleEinfach={onToggleEinfach}
      onProbeOeffnen={onProbeOeffnen}
      fallbackFocusRef={fallbackFocusRef}
    />
  );

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Was ansteht</h2>

      {heuteTag ? (
        <>
          <TagKarte tag={heuteTag} istHeute renderItem={zeile} />
          {heuteAllesErledigt && (
            <p className="rounded-xl border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
              Heute alles erledigt
              {kommendeTage[0] && <> · Nächster Termin {weekdayDateLabel(kommendeTage[0].date)}</>}
            </p>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed p-3 text-[13px] text-muted-foreground">
          <p className="text-[12.5px] font-semibold tabular-nums text-foreground">Heute</p>
          {/* S6: "Nichts geplant" allein liest sich wie "nichts zu tun", waehrend
              gleichzeitig Ueberfaelliges offensteht -- unter Zeitdruck ueberliest
              man dann die eigene Rueckstands-Liste direkt darunter. */}
          {offeneUeberfaelligeAnzahl > 0 ? (
            <p className="mt-1">
              Für heute nichts geplant, aber {offeneUeberfaelligeAnzahl}{" "}
              {offeneUeberfaelligeAnzahl === 1 ? "Einheit" : "Einheiten"} überfällig
            </p>
          ) : (
            <p className="mt-1">
              Nichts geplant
              {kommendeTage[0] && <> · Nächster Termin {weekdayDateLabel(kommendeTage[0].date)}</>}
            </p>
          )}
        </div>
      )}

      {ueberfaelligeTage.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Überfällig</h3>
          {/* NIT: die "ueberfaellig"-Plakette pro Karte entfaellt -- sie
              wiederholte nur, was diese Ueberschrift schon in Rot sagt. */}
          {ueberfaelligeTage.map((tag) => (
            <TagKarte key={tag.date} tag={tag} renderItem={zeile} />
          ))}
        </div>
      )}

      {kommendeTage.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kommende Tage</h3>
          {kommendeTage.map((tag) => (
            <TagKarte key={tag.date} tag={tag} renderItem={zeile} />
          ))}
        </div>
      )}

      {erledigteTage.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setErledigteOffen((v) => !v)}
            aria-expanded={erledigteOffen}
            className="relative flex min-h-11 items-center gap-1 rounded text-[11px] font-semibold uppercase tracking-wide text-muted-foreground before:absolute before:-inset-3 before:content-[''] [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className={cn("size-3.5 motion-safe:transition-transform motion-safe:ease-[var(--ease-atlas)]", erledigteOffen && "rotate-180")} />
            Erledigte Tage ({erledigteTage.length})
          </button>
          {erledigteOffen && (
            <div className="mt-2 space-y-2">
              {erledigteTage.map((tag) => (
                <TagKarte key={tag.date} tag={tag} renderItem={zeile} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// --- Eine Tageskarte ------------------------------------------------------------

function TagKarte({
  tag,
  istHeute,
  renderItem,
}: {
  tag: Tag;
  istHeute?: boolean;
  renderItem: (item: ItemDTO) => ReactNode;
}) {
  // S7: die eine Zahl, die man morgens braucht -- vorher stand nur die
  // Einzeldauer je Einheit da, nie die Summe des Tages. tabular-nums, damit
  // sie beim Aktualisieren (neu verteilen, Karten fertig) nicht zappelt.
  const tagesSumme = tag.items.reduce((s, i) => s + i.minuten, 0);

  return (
    // S4: die Toenung des Heute-Tages ist ersatzlos weg. bg-primary/5 drueckte
    // --muted-foreground (Fliesstext dieser Karte: Punkt-Details, "Wird
    // vorbereitet …") auf 4,22:1 und damit unter die Pflicht von 4,5:1 fuer
    // Fliesstext. Zurueckgenommene Alphas helfen nicht: 0,03 ergibt 4,40,
    // 0,025 ergibt 4,44, 0,02 ergibt 4,48 -- erst ab 0,015 (4,53) haelt die
    // Regel, und dort ist die Flaeche nicht mehr von einer ungetoenten zu
    // unterscheiden. Eine Toenung, die entweder die Lesbarkeit kostet oder
    // unsichtbar ist, traegt nichts; der Rand markiert den heutigen Tag
    // ohnehin, und die Ueberschrift sagt "Heute". Ohne Toenung steht der Text
    // auf Kartengrund bei 4,73:1 hell und 6,91:1 dunkel.
    // Rechenweg: fuer Graustufen ist Y = L hoch 3, das Alpha wird aber im
    // sRGB-Gammaraum komponiert, nicht in linearer Luminanz -- linear
    // gemischt kommt ein zu heller Grund und damit ein zu guter Wert heraus.
    <div className={cn("rounded-xl border p-3", istHeute && "border-primary/40")}>

      <div className="mb-2 flex items-center gap-2">
        <p className="text-[12.5px] font-semibold tabular-nums">
          {/* NIT: "Heute" nennt bewusst zusaetzlich das Datum -- "heute" kann
              bei einem ueber Nacht offen gebliebenen Tab veralten (siehe
              Kommentar bei heute/useEffect oben), ohne Datum an der Karte
              selbst liesse sich das nicht pruefen. */}
          {istHeute ? `Heute, ${weekdayDateLabel(tag.date)}` : weekdayDateLabel(tag.date)}
        </p>
        <span className="ml-auto shrink-0 tabular-nums text-[12px] text-muted-foreground">{tagesSumme} Min</span>
      </div>
      <ul className="space-y-2">{tag.items.map(renderItem)}</ul>
    </div>
  );
}

// --- Eine Einheit -------------------------------------------------------------

function EinheitZeile({
  subjectId,
  assignmentId,
  item,
  punkt,
  botEnabled,
  kartenLaeuft,
  kartenLokalFehler,
  primaer,
  onKartenErneut,
  onToggleEinfach,
  onProbeOeffnen,
  fallbackFocusRef,
}: {
  subjectId: string;
  assignmentId: string;
  item: ItemDTO;
  punkt: PunktDTO | null;
  botEnabled: boolean;
  kartenLaeuft: boolean;
  // S5: Punkte, deren Karten-Lauf in dieser Sitzung lokal gescheitert ist --
  // unabhaengig davon, ob der Server-Status (cardsState) geschrieben werden
  // konnte (Funkloch trifft beides). Ohne dieses Set haengt die Zeile bei
  // einem Punkt ohne Karten dauerhaft in "Wird vorbereitet …", ohne Knopf.
  kartenLokalFehler: boolean;
  // S3: die erste offene Einheit des Heute-Tags traegt ihre Aktion als
  // echten Button statt als Textlink -- die einzige primaere Handlung des
  // Screens (siehe TageListe).
  primaer: boolean;
  onKartenErneut: (punktId: string) => void;
  onToggleEinfach: (item: ItemDTO) => void;
  onProbeOeffnen: (item: ItemDTO) => void;
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const erledigt = item.doneAt !== null;
  const titel = item.punktTitel ?? (item.phase === "simulation" ? "Simulation" : OHNE_THEMA_LABEL);
  const manuell = item.phase === "probe" || item.phase === "simulation";
  const titelOverflow = useOverflowTitle<HTMLSpanElement>(titel);

  // Abhaken der letzten offenen Einheit eines ueberfaelligen Tages laesst
  // diesen Tag (TageListe) sofort ins eingeklappte "Erledigte Tage"
  // wandern -- die Checkbox, die das ausgeloest hat, verschwindet damit aus
  // dem DOM, noch bevor der Klick-Handler zurueckkehrt. Ohne Auffangen
  // faellt der Fokus dann auf body, gleiches Muster wie bei den Kopf-/
  // Banner-Knoepfen (siehe kopfAusloeserRef/bannerAusloeserRef). Nur der
  // direkte Toggle (nicht manuell) ist synchron genug, um das zuverlaessig
  // auszuloesen -- der Dialog-Pfad hat seinen eigenen Fallback (siehe
  // WieLiefEsDialog/fallbackFocusRef), darum hier kein Ref fuer den
  // manuell-Zweig setzen (sonst wuerde ein spaeteres, unabhaengiges
  // Verschwinden faelschlich Fokus stehlen).
  const ausgeloestRef = useRef(false);
  useEffect(() => {
    return () => {
      if (ausgeloestRef.current) fallbackFocusRef.current?.focus?.();
    };
  }, [fallbackFocusRef]);
  // NIT: ohne Reset bliebe ausgeloestRef nach dem ersten Abhaken fuer immer
  // true -- ein spaeteres, unabhaengiges Verschwinden dieser Zeile (z.B.
  // "Ueberfaelliges nachholen" ersetzt alle Items) wuerde dann faelschlich
  // wieder den Fokus stehlen, obwohl der Nutzer laengst woanders steht.
  // Ueberlebt die Zeile den aktuellen Commit, ist das Zeitfenster fuer den
  // Fokus-Fang vorbei -- kein Deps-Array, laeuft nach jedem Render, in dem
  // die Zeile noch existiert.
  useEffect(() => {
    ausgeloestRef.current = false;
  });

  // S6: eine erledigte Probe/Simulation liess sich frueher per Klick
  // abwaehlen -- das setzte doneAt/result zurueck, aber die zuvor
  // geschriebene confidence (Balken, neuVerteilen) blieb stehen, weil kein
  // vorheriger Stand gespeichert ist, zu dem man zurueckfallen koennte. Statt
  // einen falschen alten Wert stehen zu lassen, oeffnet ein Klick auf eine
  // bereits erledigte Probe/Simulation stattdessen erneut den "Wie lief
  // es?"-Dialog -- setzeErgebnis() ueberschreibt Ergebnis und confidence
  // dann konsistent und laedt neu.
  function checkboxKlick() {
    if (!manuell) {
      ausgeloestRef.current = true;
      onToggleEinfach(item);
      return;
    }
    onProbeOeffnen(item);
  }

  return (
    <li className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
      <button
        type="button"
        role={manuell ? undefined : "checkbox"}
        aria-checked={manuell ? undefined : erledigt}
        // S8: die Rolle checkbox fehlt hier bewusst, weil ein Klick einen
        // Dialog oeffnet statt umzuschalten -- ohne einen eigenen Traeger fuer
        // den Zustand hoert ein Screenreader aber nur "Schaltflaeche" und
        // "eintragen"/"aendern" unterscheidet sich zu leise. aria-pressed
        // macht den erledigt-Zustand ausdruecklich zugaenglich.
        aria-pressed={manuell ? erledigt : undefined}
        aria-haspopup={manuell ? "dialog" : undefined}
        aria-label={
          manuell
            ? erledigt
              ? `Ergebnis für ${titel} ändern`
              : `Ergebnis für ${titel} eintragen`
            : erledigt
              ? `${titel} als offen markieren`
              : `${titel} als erledigt markieren`
        }
        onClick={checkboxKlick}
        // A2 (Touch): der Knopf selbst ist jetzt echt 44x44 (size-11) statt
        // ueber ein asymmetrisch aufgeblaehtes `before` auf einer 20px-Box zu
        // simulieren -- das ergab zuletzt nur 42x48px, unter dem Minimum. Der
        // sichtbare Rahmen liegt in einem inneren size-5-Span, das per
        // place-items-center immer symmetrisch mittig sitzt. Negative Margins
        // fangen den optischen Versatz auf: -ml-5/-mr-1 halten den Footprint
        // bei 20px Breite (wie vorher), damit die Content-Spalte an derselben
        // Stelle beginnt, und die Box endet real bei 36px -- 2px vor dem
        // linken Rand der "Karten üben"-Trefflaeche (deren eigenes -mx-1 bei
        // 38px beginnt), also ohne Ueberlappung. -my-2.5 haelt den
        // Vertikal-Bleed innerhalb des li-Paddings (py-2.5), ohne ueber den
        // Kartenrand hinauszuragen.
        className="relative -ml-5 -mr-1 -my-2.5 grid size-11 shrink-0 place-items-center rounded-md [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-5 place-items-center rounded border transition-colors ease-[var(--ease-atlas)]",
            // BLOCKIEREND: --border liegt auf --card bei nur 1,27:1 (im
            // Dunkelmodus ~2,52:1) -- WCAG 1.4.11 verlangt 3:1 fuer die
            // Begrenzung eines Bedienelements, und dieser Rahmen ist der
            // einzige Traeger von "diese Einheit ist noch offen". Nutzt
            // border-control statt border, das genau dafuer angelegt wurde
            // (app/globals.css: --border-control, hell 0.72, dunkel 30%
            // Deckkraft).
            erledigt ? "border-primary bg-primary text-primary-foreground" : "border-border-control",
          )}
        >
          {erledigt && <span className="text-[11px] leading-none">✓</span>}
        </span>
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* S9: der Chip traegt nur bei "lernen" eine eigene Information --
              bei "ueben"/"probe"/"simulation" wiederholt er nur den Aktions-
              Text direkt darunter ("Karten üben"/"Probe im Tutor"/"Simulation
              im Tutor"), kostet dabei aber die erste Position der Zeile.
              Nur fuer "lernen" rendern, damit der Titel die anderen drei
              Zeilen anfuehrt. */}
          {item.phase === "lernen" && <PhaseChip phase={item.phase} />}
          <span
            ref={titelOverflow.ref}
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] font-medium",
              erledigt && "text-muted-foreground line-through",
            )}
            title={titelOverflow.title}
          >
            {titel}
          </span>
          <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">{item.minuten} Min</span>
        </div>

        {item.phase === "lernen" && punkt && (
          <div className="text-[12.5px] text-muted-foreground">
            {punkt.detail && <p>{punkt.detail}</p>}
            {punkt.seiten && <p>Seiten {punkt.seiten}</p>}
            {punkt.blaetter.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-3">
                {punkt.blaetter.map((b) => (
                  <a
                    key={b.id}
                    href={`/api/files/${b.id}`}
                    target="_blank"
                    rel="noopener"
                    title={b.name}
                    className="relative inline-flex min-h-[32px] max-w-[14rem] items-center truncate rounded-full border border-border-control px-2.5 py-1 text-[11.5px] before:absolute before:-inset-1.5 before:content-[''] [touch-action:manipulation] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {b.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {item.phase === "ueben" &&
          (!punkt || !punkt.topicId ? (
            // Fehlt topicId, legt die Karten-Queue beim naechsten Lauf
            // automatisch ein neues Thema an (lib/lernplan-karten-queue.ts,
            // Edge Case "Thema geloescht") -- fuer den Schueler zaehlt hier
            // nur, dass gerade nichts zu tun ist, nicht der fehlende
            // Fremdschluessel.
            <p className="flex min-h-11 items-center text-[12.5px] text-muted-foreground">Wird vorbereitet …</p>
          ) : punkt.cardsState === "fehler" || kartenLokalFehler ? (
            // S3: kennt cardsState statt blind auf "Karten werden erzeugt" zu
            // hoffen -- ein Fehler wartet sonst nie von selbst ab. S5: auch
            // ein Lauf, der nur lokal (dieser Sitzung) gescheitert ist, ohne
            // dass der Server-Status geschrieben werden konnte, bekommt
            // denselben Fehlertext und denselben Knopf.
            // kartenLaeuft ist genau kartenLaufend.has(pointId): useKartenQueue
            // sperrt pro Punkt, nicht global, und speist `laufend` aus dem
            // Hauptlauf UND jedem erneut()-Aufruf. Ein Reparaturversuch fuer
            // einen anderen Punkt sperrt diesen Knopf also nicht -- was auch
            // richtig ist, jeder Knopf repariert genau seinen Punkt.
            // echtes disabled entfaellt bewusst: es wuerde den Fokus auf body
            // werfen, sobald der eigene Klick den Knopf deaktiviert --
            // aria-disabled/aria-busy plus Fruehausstieg im Klick-Handler
            // statt dessen.
            <button
              type="button"
              onClick={() => {
                if (kartenLaeuft) return;
                onKartenErneut(punkt.id);
              }}
              aria-disabled={kartenLaeuft}
              aria-busy={kartenLaeuft}
              className={cn(
                "relative -mx-1 inline-flex min-h-11 items-center gap-1 rounded px-1 text-[12.5px] font-medium text-primary",
                "[touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kartenLaeuft && "opacity-60",
              )}
            >
              <RotateCw className={cn("size-3", kartenLaeuft && "motion-safe:animate-spin")} aria-hidden />
              Karten fehlen, erneut erzeugen
            </button>
          ) : punkt.cardsState === "fertig" && punkt.kartenAnzahl === 0 ? (
            // S3: die Erzeugung ist durchgelaufen (cardsState "fertig"), hat
            // aber nichts geliefert -- ohne diesen Zweig blieb "Karten werden
            // vorbereitet …" stehen, obwohl nichts mehr vorbereitet wird. Die
            // Queue nimmt genau diesen Fall nur ueber onKartenErneut wieder
            // auf (siehe lib/lernplan-karten-queue.ts), also derselbe Knopf
            // wie bei "fehler" -- gleiches Muster wie oben (BLOCKIEREND 1).
            // NIT: die Beschriftung nennt jetzt nur noch die Handlung
            // ("Erneut versuchen") statt eines Zwei-Satz-Fliesstexts als
            // Knopf-Label in 12,5px -- der Grund ("Es wurden keine Karten
            // erzeugt") steht daneben als eigener Text, gleiches Muster wie
            // "Karten fehlen, erneut erzeugen" oben, nur mit Grund und
            // Handlung als zwei Elemente statt einem Satz.
            <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[12.5px] text-muted-foreground">Es wurden keine Karten erzeugt.</span>
              <button
                type="button"
                onClick={() => {
                  if (kartenLaeuft) return;
                  onKartenErneut(punkt.id);
                }}
                aria-disabled={kartenLaeuft}
                aria-busy={kartenLaeuft}
                className={cn(
                  "relative -mx-1 inline-flex min-h-11 items-center gap-1 rounded px-1 text-[12.5px] font-medium text-primary",
                  "[touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kartenLaeuft && "opacity-60",
                )}
              >
                <RotateCw className={cn("size-3", kartenLaeuft && "motion-safe:animate-spin")} aria-hidden />
                Erneut versuchen
              </button>
            </div>
          ) : punkt.kartenAnzahl > 0 ? (
            // S1: Karten sind schon da (kartenAnzahl > 0) -- das Abfragen
            // vorhandener Karten (Leitner-Durchlauf, Selbsteinschaetzung)
            // braucht den Bot nicht. Dieser Zweig steht deshalb VOR der
            // !botEnabled-Pruefung unten: faellt der Bot-Schluessel weg,
            // bleiben bereits erzeugte Karten trotzdem erreichbar. S3: die
            // erste offene Einheit des Heute-Tags traegt ihre Aktion als
            // echten, gefuellten Button -- die einzige primaere Handlung
            // des Screens, statt eines 12,5px-Textlinks. Alle anderen Zeilen
            // bleiben Links.
            primaer ? (
              <Link
                href={`/lernen/${subjectId}/session?modus=lernen&thema=${punkt.topicId}&pruefung=${assignmentId}&einheit=${item.id}`}
                className={cn(buttonVariants({ size: "sm" }), "mt-0.5")}
              >
                Karten üben
              </Link>
            ) : (
              <Link
                href={`/lernen/${subjectId}/session?modus=lernen&thema=${punkt.topicId}&pruefung=${assignmentId}&einheit=${item.id}`}
                className="relative -mx-1 inline-flex min-h-11 items-center rounded px-1 text-[12.5px] font-medium text-primary underline-offset-2 [touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Karten üben
              </Link>
            )
          ) : !botEnabled ? (
            // S1: nur noch fuer den Fall ohne vorhandene Karten -- ohne Bot
            // kann keine neue Erzeugung anlaufen, und der Zweig oben faengt
            // bereits alle Punkte mit kartenAnzahl > 0 vorher ab.
            <p className="flex min-h-11 items-center text-[12.5px] text-muted-foreground">KI ist nicht eingerichtet</p>
          ) : (
            // S11: ein Wartetext statt zweier -- "laeuft gerade" gegen "steht
            // in der Warteschlange" ist reines Innenleben der Parallelitaet
            // aus lib/lernplan-karten-queue.ts, fuer den Schueler ist beides
            // warten.
            <p className="flex min-h-11 items-center text-[12.5px] text-muted-foreground">Karten werden vorbereitet …</p>
          ))}

        {item.phase === "probe" &&
          (!punkt || !punkt.topicId ? (
            <p className="flex min-h-11 items-center text-[12.5px] text-muted-foreground">Kann gerade nicht geöffnet werden</p>
          ) : primaer ? (
            <Link
              href={`/lernen/${subjectId}/tutor?thema=${punkt.topicId}&modus=probe&einheit=${item.id}`}
              className={cn(buttonVariants({ size: "sm" }), "mt-0.5")}
            >
              Probe im Tutor
            </Link>
          ) : (
            <Link
              href={`/lernen/${subjectId}/tutor?thema=${punkt.topicId}&modus=probe&einheit=${item.id}`}
              className="relative -mx-1 inline-flex min-h-11 items-center rounded px-1 text-[12.5px] font-medium text-primary underline-offset-2 [touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Probe im Tutor
            </Link>
          ))}

        {item.phase === "simulation" &&
          (primaer ? (
            <Link
              href={`/lernen/${subjectId}/tutor?pruefung=${assignmentId}&modus=probe&einheit=${item.id}`}
              className={cn(buttonVariants({ size: "sm" }), "mt-0.5")}
            >
              Simulation im Tutor
            </Link>
          ) : (
            <Link
              href={`/lernen/${subjectId}/tutor?pruefung=${assignmentId}&modus=probe&einheit=${item.id}`}
              className="relative -mx-1 inline-flex min-h-11 items-center rounded px-1 text-[12.5px] font-medium text-primary underline-offset-2 [touch-action:manipulation] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Simulation im Tutor
            </Link>
          ))}
      </div>
    </li>
  );
}

// --- Dialog "Wie lief es?" ------------------------------------------------------

function WieLiefEsDialog({
  offen,
  titel,
  istSimulation,
  betroffenePunkteAnzahl,
  onClose,
  onWaehlen,
  fallbackFocusRef,
}: {
  offen: boolean;
  titel: string;
  istSimulation?: boolean;
  betroffenePunkteAnzahl: number;
  onClose: () => void;
  onWaehlen: (result: number) => void;
  // Ziel, falls der Ausloeser (die Checkbox der Probe/Simulation) beim
  // Schliessen nicht mehr im DOM ist -- passiert, wenn diese Einheit die
  // letzte offene eines ueberfaelligen Tages war: setzeErgebnis() setzt
  // doneAt, der ganze Tag rutscht dadurch von "Ueberfaellig" ins eingeklappte
  // "Erledigte Tage" und nimmt seine Zeile mit sich aus dem Baum. Ohne diesen
  // Fallback faellt der Fokus dann auf body zurueck statt auf ein lebendiges
  // Element -- gleiches Muster wie titelRef bei den Kopf-/Banner-Knoepfen.
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const reduce = useReducedMotion();
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titelOverflow = useOverflowTitle<HTMLParagraphElement>(titel);

  // Synchron im Layout-Effekt statt per setTimeout: inert auf dem
  // Seiteninhalt (lernplan-seite.tsx) und der Fokuswechsel hierher landen so
  // in derselben Commit-Phase, bevor der Browser den Baum an
  // Screenreader/Wischgesten meldet -- kein 20ms-Fenster mehr, in dem das
  // fokussierte Element noch in einem inert-Teilbaum liegt.
  useLayoutEffect(() => {
    if (!offen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    firstRef.current?.focus();
    return () => {
      // Der Ausloeser kann beim Schliessen bereits aus dem DOM verschwunden
      // sein (siehe fallbackFocusRef oben) -- ein .focus() auf ein
      // entferntes Element ist wirkungslos, der Fokus faellt sonst auf body.
      const geht = restoreRef.current && document.body.contains(restoreRef.current);
      if (geht) restoreRef.current?.focus?.();
      else fallbackFocusRef.current?.focus?.();
    };
  }, [offen, fallbackFocusRef]);

  // Fokus-Falle: Tab und Shift+Tab zykliert zwischen den Buttons im Dialog,
  // damit der Fokus nicht auf die Seite dahinter entkommt.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !containerRef.current) return;
    const buttons = Array.from(containerRef.current.querySelectorAll("button"));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    // A5 (Touch): frueher unmountete AnimatePresence den Dialog erst nach der
    // Ausblend-Animation -- in diesem ~200ms-Fenster blieb er trotz
    // zurueckgegebenem Fokus per Tab erreichbar und weiter als role="dialog"
    // im AX-Baum. Jetzt bleibt die Struktur dauerhaft gemountet, animiert wird
    // nur noch ueber den animate-Prop, und inert nimmt sie synchron mit offen
    // aus Tab-Order und AX-Baum -- auch waehrend sie noch ausblendet.
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6",
        !offen && "pointer-events-none",
      )}
      inert={!offen}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
        initial={false}
        animate={{ opacity: offen ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
        onClick={onClose}
      />
      <motion.div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wie-lief-es-titel"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={false}
        animate={
          offen
            ? { opacity: 1, y: 0, scale: 1 }
            : reduce
              ? { opacity: 0, y: 0, scale: 1 }
              : { opacity: 0, y: 16, scale: 0.98 }
        }
        // NIT: y war vorher hatJeGeoeffnetRef.current ? 8 : 16 -- weil der
        // Dialog dauerhaft gemountet bleibt (initial={false}), startet jede
        // Animation vom zuletzt gerenderten animate-Wert. Ein geschrumpfter
        // Zielwert fuers Schliessen (8px) wurde dadurch zugleich zum
        // Startwert der naechsten Oeffnung -- jeder zweite und folgende
        // Eingang fuehlte sich also anders (kuerzer) an als der erste. y
        // bleibt jetzt konstant 16px fuer jeden Ein- und Ausgang; die
        // kuerzere Schliess-Anmutung kommt stattdessen ueber eine kuerzere
        // Dauer beim Schliessen.
        transition={{ duration: reduce ? 0 : offen ? 0.24 : 0.18, ease: EASE }}
        className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 shadow-popover sm:rounded-2xl"
      >
        <h3 id="wie-lief-es-titel" className="text-[15px] font-semibold tracking-tight">
          Wie lief es?
        </h3>
        <p
          ref={titelOverflow.ref}
          className="mt-0.5 truncate text-[12.5px] text-muted-foreground"
          title={titelOverflow.title}
        >
          {titel}
        </p>
        {/* S9b: die Simulation schreibt die gewaehlte Sicherheit nicht nur auf
            diesen einen Punkt, sondern auf jeden Punkt des Plans, dessen
            Sicherheit noch nicht aus Karten oder aus dem Diagnosetest
            berechnet ist (lib/lernplan-store.ts, notInArray auf
            confidenceSource "karten"/"diagnose") -- eine praezisere,
            mechanisch ermittelte Sicherheit bleibt unberuehrt. Die Zahl hier
            zaehlt darum nur die tatsaechlich betroffenen Punkte, nicht alle. */}
        {istSimulation && (
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Gilt für {betroffenePunkteAnzahl}{" "}
            {betroffenePunkteAnzahl === 1 ? "Punkt" : "Punkte"} ohne genauere Einschätzung aus Karten oder Test.
          </p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button ref={firstRef} type="button" variant="outline" className="h-11" onClick={() => onWaehlen(100)}>
            Sitzt
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => onWaehlen(50)}>
            Wackelt
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => onWaehlen(0)}>
            Fehlt
          </Button>
        </div>
        <Button type="button" variant="ghost" className="mt-2 h-11 w-full" onClick={onClose}>
          Abbrechen
        </Button>
      </motion.div>
    </div>
  );
}

// --- Dialog "Plan löschen?" -----------------------------------------------------

function PlanLoeschenDialog({
  offen,
  laeuft,
  onClose,
  onLoeschen,
}: {
  offen: boolean;
  laeuft: boolean;
  onClose: () => void;
  onLoeschen: () => void;
}) {
  const reduce = useReducedMotion();
  const abbrechenRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Synchron im Layout-Effekt statt per setTimeout -- siehe WieLiefEsDialog.
  useLayoutEffect(() => {
    if (!offen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    abbrechenRef.current?.focus();
    return () => {
      // Gleicher Guard wie bei WieLiefEsDialog: der Ausloeser kann beim
      // Schliessen bereits aus dem DOM verschwunden sein (Plan geloescht),
      // ein .focus() darauf ist wirkungslos und der Fokus faellt auf body.
      if (restoreRef.current && document.body.contains(restoreRef.current)) {
        restoreRef.current.focus();
      }
    };
  }, [offen]);

  // Fokus-Falle wie bei WieLiefEsDialog: Tab und Shift+Tab zykliert zwischen
  // den Buttons im Dialog. Kein Zeitlimit -- die Bestaetigung bleibt offen,
  // bis der Nutzer sich entscheidet.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !containerRef.current) return;
    const buttons = Array.from(containerRef.current.querySelectorAll("button"));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    // A5 (Touch): siehe WieLiefEsDialog -- dauerhaft gemountet statt per
    // AnimatePresence erst nach der Ausblend-Animation entfernt, inert nimmt
    // sie synchron mit offen aus Tab-Order und AX-Baum.
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6",
        !offen && "pointer-events-none",
      )}
      inert={!offen}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
        initial={false}
        animate={{ opacity: offen ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
        onClick={() => {
          if (laeuft) return;
          onClose();
        }}
      />
      <motion.div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="plan-loeschen-titel"
        aria-describedby="plan-loeschen-beschreibung"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        initial={false}
        animate={
          offen
            ? { opacity: 1, y: 0, scale: 1 }
            : reduce
              ? { opacity: 0, y: 0, scale: 1 }
              : { opacity: 0, y: 16, scale: 0.98 }
        }
        // NIT: siehe WieLiefEsDialog -- konstantes y statt eines nach dem
        // ersten Schliessen geschrumpften Zielwerts, der sonst jede weitere
        // Oeffnung verkuerzt haette.
        transition={{ duration: reduce ? 0 : offen ? 0.24 : 0.18, ease: EASE }}
        className="relative w-full max-w-sm rounded-t-2xl border bg-card p-5 shadow-popover sm:rounded-2xl"
      >
        <h3 id="plan-loeschen-titel" className="text-[15px] font-semibold tracking-tight">
          Plan löschen?
        </h3>
        <p id="plan-loeschen-beschreibung" className="mt-0.5 text-[12.5px] text-muted-foreground">
          Themen und Karten bleiben erhalten.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            ref={abbrechenRef}
            type="button"
            variant="outline"
            className={cn("h-11 flex-1", laeuft && "opacity-60")}
            // Bleibt fokussierbar waehrend laeuft, sonst wirft der Browser den
            // Fokus auf body (gleicher Grund wie beim Loeschen-Knopf) -- und die
            // Fokus-Falle oben sammelt per querySelectorAll("button") auch
            // deaktivierte Knoepfe, ein echtes disabled wuerde first.focus()
            // ins Leere laufen lassen.
            aria-disabled={laeuft}
            onClick={() => {
              if (laeuft) return;
              onClose();
            }}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            // Es gibt kein --destructive-foreground-Token: text-background traegt.
            // Bleibt fokussierbar waehrend laeuft, sonst wirft der Browser den
            // Fokus auf body -- siehe Guard im onClick statt disabled.
            className={cn("h-11 flex-1 bg-destructive text-background hover:bg-destructive/90", laeuft && "opacity-60")}
            aria-disabled={laeuft}
            aria-busy={laeuft}
            onClick={() => {
              if (laeuft) return;
              onLoeschen();
            }}
          >
            {laeuft ? (
              <>
                <Loader2 className="size-4 motion-safe:animate-spin" />
                Wird gelöscht …
              </>
            ) : (
              "Löschen"
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Ladezustand ------------------------------------------------------------

function LernplanSkeleton() {
  return (
    // NIT: aria-label auf einem div ohne Rolle wird von den meisten
    // Screenreadern ignoriert, aria-busy allein wird dort nicht vorgelesen --
    // role="status" macht daraus eine Live-Region, die die Ansage traegt.
    <div className="mx-auto max-w-2xl space-y-6" role="status" aria-label="Plan wird geladen" aria-busy="true">
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-56" />
        <Skeleton className="mt-2 h-3.5 w-40" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
