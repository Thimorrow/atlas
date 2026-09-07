import { describe, expect, it } from "vitest";
import {
  LernplanFehler,
  addTageISO,
  einheitenFuer,
  ersterPlantag,
  neuVerteilen,
  runde5,
  verteilen,
  type NeuVerteilenInput,
} from "@/lib/lernplan";

describe("runde5 und addTageISO", () => {
  it("rundet auf 5", () => {
    expect(runde5(6)).toBe(5);
    expect(runde5(7)).toBe(5);
    expect(runde5(8)).toBe(10);
  });

  it("rechnet Tage in UTC, auch über Monatsgrenzen", () => {
    expect(addTageISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addTageISO("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("ersterPlantag", () => {
  // BLOCKIEREND-Fix: dieselbe Regel entscheidet in verteilen(), ob der
  // heutige Abend noch als Lerntag zaehlt, und im Gate (lernplan-erstellen.tsx),
  // ob das Formular ueberhaupt aufgemacht wird -- Pruefung morgen ist der
  // Grenzfall, an dem beide bisher auseinanderliefen.
  it("Prüfung morgen, vor 18 Uhr: heute zählt noch als Plantag", () => {
    const heute = "2026-01-05";
    const pruefungMorgen = addTageISO(heute, 1);
    expect(ersterPlantag(heute, "17:59") < pruefungMorgen).toBe(true);
  });

  it("Prüfung morgen, ab 18 Uhr: kein Plantag mehr übrig", () => {
    const heute = "2026-01-05";
    const pruefungMorgen = addTageISO(heute, 1);
    expect(ersterPlantag(heute, "18:00") >= pruefungMorgen).toBe(true);
  });
});

describe("einheitenFuer", () => {
  it("Sicherheit 90: nur üben, kein lernen/probe", () => {
    const einheiten = einheitenFuer({ minuten: 60, sicherheit: 90 }, 0);
    expect(einheiten).toEqual([{ pointIndex: 0, phase: "ueben", minuten: 10 }]);
  });

  it("Sicherheit 50: Faktor 1, lernen/üben/probe in der Reihenfolge", () => {
    const einheiten = einheitenFuer({ minuten: 60, sicherheit: 50 }, 2);
    expect(einheiten).toEqual([
      { pointIndex: 2, phase: "lernen", minuten: 60 },
      { pointIndex: 2, phase: "ueben", minuten: 10 },
      { pointIndex: 2, phase: "probe", minuten: 10 },
    ]);
  });

  it("Sicherheit 20: Faktor 1,5", () => {
    const einheiten = einheitenFuer({ minuten: 60, sicherheit: 20 }, 1);
    expect(einheiten[0]).toEqual({ pointIndex: 1, phase: "lernen", minuten: 90 });
  });

  it("lernen hat mindestens 10 Minuten", () => {
    const einheiten = einheitenFuer({ minuten: 6, sicherheit: 50 }, 0);
    expect(einheiten[0].minuten).toBe(10);
  });
});

const alleWerktage = () => true;
const nurMontagFreitag = (iso: string) => {
  const tag = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return tag >= 1 && tag <= 5;
};

describe("verteilen", () => {
  it("Plantag heute, wenn jetzt vor 18 Uhr", () => {
    const { items, tage } = verteilen([{ pointIndex: 0, phase: "lernen", minuten: 20 }], {
      heuteISO: "2026-01-05",
      jetztHM: "10:00",
      pruefungISO: "2026-01-08",
      schultag: alleWerktage,
      minutesWeekday: 30,
      minutesWeekend: 60,
      sicherheiten: [50],
    });
    expect(tage).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
    expect(items[0].date).toBe("2026-01-05");
  });

  it("Plantag morgen, wenn jetzt nach 18 Uhr", () => {
    const { items, tage } = verteilen([{ pointIndex: 0, phase: "lernen", minuten: 20 }], {
      heuteISO: "2026-01-05",
      jetztHM: "19:00",
      pruefungISO: "2026-01-08",
      schultag: alleWerktage,
      minutesWeekday: 30,
      minutesWeekend: 60,
      sicherheiten: [50],
    });
    expect(tage[0]).toBe("2026-01-06");
    expect(items[0].date).toBe("2026-01-06");
  });

  it("Tagesbudget nach Schultag/Wochenende", () => {
    // 2026-01-05 ist ein Montag: Mo-Fr Schultag, Sa/So nicht.
    const { items } = verteilen(
      [
        { pointIndex: 0, phase: "lernen", minuten: 30 },
        { pointIndex: 1, phase: "lernen", minuten: 30 },
      ],
      {
        heuteISO: "2026-01-09", // Freitag
        jetztHM: "10:00",
        pruefungISO: "2026-01-13", // Dienstag -> Plantage Fr, Sa, So, Mo
        schultag: nurMontagFreitag,
        minutesWeekday: 30,
        minutesWeekend: 60,
        sicherheiten: [50, 50],
      },
    );
    // Freitag (Schultag, 30 Min Budget) ist voll nach der ersten Einheit,
    // die zweite landet am Samstag (Wochenende, 60 Min Budget).
    expect(items[0].date).toBe("2026-01-09");
    expect(items[1].date).toBe("2026-01-10");
  });

  it("Einheit über dem Tagesbudget bekommt einen ganzen Tag", () => {
    const { items } = verteilen(
      [
        { pointIndex: 0, phase: "lernen", minuten: 50 },
        { pointIndex: 1, phase: "lernen", minuten: 10 },
      ],
      {
        heuteISO: "2026-01-05",
        jetztHM: "10:00",
        pruefungISO: "2026-01-09",
        schultag: alleWerktage,
        minutesWeekday: 30,
        minutesWeekend: 60,
        sicherheiten: [50, 50],
      },
    );
    const grosse = items.find((i) => i.minuten === 50)!;
    const kleine = items.find((i) => i.minuten === 10)!;
    expect(grosse.date).not.toBe(kleine.date);
  });

  it("üben liegt frühestens am Folgetag von lernen desselben Punkts", () => {
    const { items } = verteilen(
      [
        { pointIndex: 0, phase: "lernen", minuten: 20 },
        { pointIndex: 0, phase: "ueben", minuten: 10 },
      ],
      {
        heuteISO: "2026-01-05",
        jetztHM: "10:00",
        pruefungISO: "2026-01-10",
        schultag: alleWerktage,
        minutesWeekday: 60,
        minutesWeekend: 60,
        sicherheiten: [50],
      },
    );
    const lernen = items.find((i) => i.phase === "lernen")!;
    const ueben = items.find((i) => i.phase === "ueben")!;
    expect(ueben.date > lernen.date).toBe(true);
  });

  it("ab 2 Plantagen ist der letzte Tag die Simulation", () => {
    const { items, tage } = verteilen([{ pointIndex: 0, phase: "lernen", minuten: 10 }], {
      heuteISO: "2026-01-05",
      jetztHM: "10:00",
      pruefungISO: "2026-01-08",
      schultag: alleWerktage,
      minutesWeekday: 30,
      minutesWeekend: 60,
      sicherheiten: [50],
    });
    expect(tage.length).toBeGreaterThanOrEqual(2);
    const simulation = items.find((i) => i.phase === "simulation")!;
    expect(simulation.date).toBe(tage[tage.length - 1]);
    expect(simulation.pointIndex).toBeNull();
    expect(simulation.minuten).toBe(30);
  });

  it("bei nur einem Plantag gibt es keine Simulation", () => {
    const { items, tage } = verteilen([{ pointIndex: 0, phase: "ueben", minuten: 10 }], {
      heuteISO: "2026-01-05",
      jetztHM: "10:00",
      pruefungISO: "2026-01-06",
      schultag: alleWerktage,
      minutesWeekday: 30,
      minutesWeekend: 60,
      sicherheiten: [50],
    });
    expect(tage).toEqual(["2026-01-05"]);
    expect(items.some((i) => i.phase === "simulation")).toBe(false);
  });

  it("streicht bei zu wenig Platz erst probe (>=40), dann alle probe, dann üben (>=80)", () => {
    const einheiten = [
      { pointIndex: 0, phase: "lernen" as const, minuten: 10 },
      { pointIndex: 0, phase: "ueben" as const, minuten: 10 },
      { pointIndex: 0, phase: "probe" as const, minuten: 10 },
      { pointIndex: 1, phase: "ueben" as const, minuten: 10 },
      { pointIndex: 1, phase: "probe" as const, minuten: 10 },
    ];
    const { items, hinweis, gestrichen } = verteilen(einheiten, {
      heuteISO: "2026-01-05",
      jetztHM: "10:00",
      pruefungISO: "2026-01-06", // nur ein Plantag, kein Simulation-Tag
      schultag: alleWerktage,
      minutesWeekday: 10,
      minutesWeekend: 10,
      sicherheiten: [50, 90], // Punkt 0 >= 40, Punkt 1 >= 80
    });
    expect(hinweis).toBe("knapp");
    expect(gestrichen).toBeGreaterThan(0);
    // Punkt 0 ist >= 40: seine probe faellt zuerst weg.
    expect(items.some((i) => i.pointIndex === 0 && i.phase === "probe")).toBe(false);
    // Punkt 1 (>= 80) verliert danach auch das ueben.
    expect(items.some((i) => i.pointIndex === 1 && i.phase === "ueben")).toBe(false);
  });

  it("vorbelegte Einheiten verkleinern die tatsächlich freie Kapazität (Reviewer-Beispiel)", () => {
    // 5 Lerntage à 30 Min = 150 Min volle Kapazität. Vorbelegt: 4 Tage voll
    // (4*30=120 Min), frei bleiben nur die 30 Min des letzten Lerntags. Neu zu
    // legen: 10 x 10 Min "ueben" (100 Min) auf Punkten mit Sicherheit 50 --
    // die werden nie gestrichen (Streichen trifft nur probe bzw. ueben >=80).
    // Ohne Fix rechnet kapazitaet() mit den vollen 150 Min: 100 <= 150, also
    // weder Streichen noch budgetErhoeht/hinweis -- ein stiller Überlauf.
    const vorbelegt = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"].map((date) => ({
      pointIndex: 999,
      phase: "lernen" as const,
      date,
      minuten: 30,
    }));
    const einheiten = Array.from({ length: 10 }, (_, i) => ({
      pointIndex: i,
      phase: "ueben" as const,
      minuten: 10,
    }));
    const ergebnis = verteilen(einheiten, {
      heuteISO: "2026-01-05",
      jetztHM: "10:00",
      pruefungISO: "2026-01-11",
      schultag: alleWerktage,
      minutesWeekday: 30,
      minutesWeekend: 30,
      sicherheiten: new Array(10).fill(50),
      vorbelegt,
    });
    expect(ergebnis.gestrichen).toBe(0);
    expect(ergebnis.budgetErhoeht || ergebnis.hinweis === "knapp").toBe(true);
  });

  it("wirft LernplanFehler('keine_tage') ohne Plantage", () => {
    expect(() =>
      verteilen([{ pointIndex: 0, phase: "ueben", minuten: 10 }], {
        heuteISO: "2026-01-05",
        jetztHM: "10:00",
        pruefungISO: "2026-01-05",
        schultag: alleWerktage,
        minutesWeekday: 30,
        minutesWeekend: 60,
        sicherheiten: [50],
      }),
    ).toThrow(LernplanFehler);
    try {
      verteilen([{ pointIndex: 0, phase: "ueben", minuten: 10 }], {
        heuteISO: "2026-01-05",
        jetztHM: "19:00",
        pruefungISO: "2026-01-06",
        schultag: alleWerktage,
        minutesWeekday: 30,
        minutesWeekend: 60,
        sicherheiten: [50],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LernplanFehler);
      expect((err as LernplanFehler).code).toBe("keine_tage");
    }
  });
});

const basisOpts = {
  heuteISO: "2026-01-10",
  jetztHM: "10:00",
  pruefungISO: "2026-01-15",
  schultag: alleWerktage,
  minutesWeekday: 60,
  minutesWeekend: 60,
  sicherheiten: [] as number[],
};

describe("neuVerteilen", () => {
  it("Umfang überfällig: nur offene Einheiten vor heute werden ersetzt", () => {
    const plan: NeuVerteilenInput = {
      items: [
        { id: "a", pointIndex: 0, phase: "lernen", minuten: 20, date: "2026-01-08", doneAt: null },
        { id: "b", pointIndex: 0, phase: "ueben", minuten: 10, date: "2026-01-20", doneAt: null },
      ],
      punkte: [{ sicherheit: 50 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "ueberfaellig", sicherheiten: [50] });
    expect(ergebnis.behalten).toEqual(["b"]);
    expect(ergebnis.neu.some((i) => i.phase === "lernen")).toBe(true);
  });

  it("Umfang überfällig: eine offene, nicht überfällige Simulation wird nicht verdoppelt", () => {
    const plan: NeuVerteilenInput = {
      items: [
        { id: "a", pointIndex: 0, phase: "lernen", minuten: 20, date: "2026-01-08", doneAt: null },
        { id: "s", pointIndex: null, phase: "simulation", minuten: 30, date: "2026-01-24", doneAt: null },
      ],
      punkte: [{ sicherheit: 50 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "ueberfaellig", sicherheiten: [50] });
    expect(ergebnis.behalten).toEqual(["s"]);
    expect(ergebnis.neu.filter((i) => i.phase === "simulation")).toHaveLength(0);
  });

  it("Umfang alle_offen: alle offenen Einheiten werden ersetzt", () => {
    const plan: NeuVerteilenInput = {
      items: [
        { id: "a", pointIndex: 0, phase: "lernen", minuten: 20, date: "2026-01-08", doneAt: null },
        { id: "b", pointIndex: 0, phase: "ueben", minuten: 10, date: "2026-01-20", doneAt: null },
      ],
      punkte: [{ sicherheit: 50 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "alle_offen", sicherheiten: [50] });
    expect(ergebnis.behalten).toEqual([]);
    expect(ergebnis.neu.some((i) => i.phase === "lernen")).toBe(true);
    expect(ergebnis.neu.some((i) => i.phase === "ueben")).toBe(true);
  });

  it("Punkt < 40 ohne offene üben bekommt eine zusätzliche", () => {
    const plan: NeuVerteilenInput = {
      items: [{ id: "a", pointIndex: 0, phase: "probe", minuten: 10, date: "2026-01-08", doneAt: "2026-01-08T10:00:00Z" }],
      punkte: [{ sicherheit: 20 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "ueberfaellig", sicherheiten: [20] });
    expect(ergebnis.zusaetzlich).toBe(1);
    expect(ergebnis.neu.some((i) => i.pointIndex === 0 && i.phase === "ueben")).toBe(true);
  });

  it("Punkt >= 80 verliert seine offene probe", () => {
    const plan: NeuVerteilenInput = {
      items: [{ id: "a", pointIndex: 0, phase: "probe", minuten: 10, date: "2026-01-08", doneAt: null }],
      punkte: [{ sicherheit: 90 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "ueberfaellig", sicherheiten: [90] });
    expect(ergebnis.behalten).toEqual([]);
    expect(ergebnis.neu.some((i) => i.phase === "probe")).toBe(false);
  });

  it("behaltenes lernen schränkt die Folgetag-Regel für eine neue üben-Einheit desselben Punkts ein", () => {
    // Lernen am 14. bleibt (nicht ueberfaellig), Sicherheit < 40 loest eine
    // zusaetzliche ueben-Einheit fuer denselben Punkt aus -- die darf wegen
    // der Folgetag-Regel nicht vor dem 15. landen, obwohl vorher noch Tage
    // mit freiem Budget waeren.
    const plan: NeuVerteilenInput = {
      items: [{ id: "a", pointIndex: 0, phase: "lernen", minuten: 20, date: "2026-09-14", doneAt: null }],
      punkte: [{ sicherheit: 20 }],
    };
    const ergebnis = neuVerteilen(plan, {
      heuteISO: "2026-09-10",
      jetztHM: "10:00",
      pruefungISO: "2026-09-20",
      schultag: alleWerktage,
      minutesWeekday: 60,
      minutesWeekend: 60,
      sicherheiten: [20],
      umfang: "ueberfaellig",
    });

    expect(ergebnis.behalten).toEqual(["a"]);
    expect(ergebnis.zusaetzlich).toBe(1);
    const ueben = ergebnis.neu.find((i) => i.pointIndex === 0 && i.phase === "ueben");
    expect(ueben).toBeDefined();
    expect(ueben!.date > "2026-09-14").toBe(true);
  });

  it("Punkt < 40 mit nur erledigter üben (keine offene) bekommt trotzdem eine zusätzliche", () => {
    // Die üben-Einheit wurde vor Wochen abgehakt, als die Sicherheit noch
    // hoch war. Die Sicherheit ist seitdem unter 40 gefallen -- die Garantie
    // "schwacher Punkt bekommt eine Uebung" darf sich nicht auf die laengst
    // erledigte Einheit verlassen, sondern muss eine neue, offene anlegen.
    const plan: NeuVerteilenInput = {
      items: [
        { id: "a", pointIndex: 0, phase: "ueben", minuten: 10, date: "2026-01-01", doneAt: "2026-01-01T09:00:00Z" },
      ],
      punkte: [{ sicherheit: 20 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "ueberfaellig", sicherheiten: [20] });
    expect(ergebnis.zusaetzlich).toBe(1);
    expect(ergebnis.neu.some((i) => i.pointIndex === 0 && i.phase === "ueben")).toBe(true);
  });

  it("erledigte Einheiten bleiben unverändert", () => {
    const plan: NeuVerteilenInput = {
      items: [
        { id: "a", pointIndex: 0, phase: "lernen", minuten: 20, date: "2026-01-08", doneAt: "2026-01-08T09:00:00Z" },
      ],
      punkte: [{ sicherheit: 80 }],
    };
    const ergebnis = neuVerteilen(plan, { ...basisOpts, umfang: "alle_offen", sicherheiten: [80] });
    expect(ergebnis.behalten).toEqual(["a"]);
  });
});
