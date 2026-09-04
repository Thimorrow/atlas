import { describe, expect, it } from "vitest";
import { LEHRPLAN_NRW_G9_KLASSE_10, lehrplanFuer } from "@/lib/lehrplan/nrw-g9-klasse-10";

// --- Reiner Datentest, kein DB-Zugriff ---------------------------------------

describe("LEHRPLAN_NRW_G9_KLASSE_10", () => {
  it("hat für jedes Fach mindestens ein Inhaltsfeld", () => {
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      expect(fach.inhaltsfelder.length, `Fach ohne Inhaltsfeld: ${fach.fach}`).toBeGreaterThan(0);
      for (const inhaltsfeld of fach.inhaltsfelder) {
        expect(inhaltsfeld.schwerpunkte.length, `Inhaltsfeld ohne Schwerpunkt: ${fach.fach}/${inhaltsfeld.titel}`).toBeGreaterThan(0);
      }
    }
  });

  it("hat für jedes Fach eine Quelle", () => {
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      expect(fach.quelle.length, `Fach ohne Quelle: ${fach.fach}`).toBeGreaterThan(0);
    }
  });

  it("hat keine doppelten Aliase über Fächer hinweg", () => {
    const gesehen = new Map<string, string>();
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      for (const alias of fach.aliase) {
        const key = alias.trim().toLowerCase();
        const vorhandenBei = gesehen.get(key);
        expect(vorhandenBei, `Alias "${alias}" gehört sowohl zu "${vorhandenBei}" als auch zu "${fach.fach}"`).toBeUndefined();
        gesehen.set(key, fach.fach);
      }
    }
  });

  it("hat keine doppelten Fachnamen, die zugleich Alias eines anderen Fachs sind", () => {
    const namen = new Map<string, string>();
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      namen.set(fach.fach.trim().toLowerCase(), fach.fach);
    }
    for (const fach of LEHRPLAN_NRW_G9_KLASSE_10) {
      for (const alias of fach.aliase) {
        const key = alias.trim().toLowerCase();
        const eigenerName = fach.fach.trim().toLowerCase();
        if (namen.has(key) && key !== eigenerName) {
          throw new Error(`Alias "${alias}" von "${fach.fach}" kollidiert mit Fachname "${namen.get(key)}"`);
        }
      }
    }
  });
});

describe("lehrplanFuer", () => {
  it("findet ein Fach über den exakten Namen", () => {
    const treffer = lehrplanFuer("Mathematik");
    expect(treffer?.fach).toBe("Mathematik");
  });

  it("findet ein Fach über einen Alias", () => {
    const treffer = lehrplanFuer("Mathe");
    expect(treffer?.fach).toBe("Mathematik");
  });

  it("ist case-insensitiv", () => {
    expect(lehrplanFuer("mathematik")?.fach).toBe("Mathematik");
    expect(lehrplanFuer("MATHE")?.fach).toBe("Mathematik");
    expect(lehrplanFuer("bio")?.fach).toBe("Biologie");
  });

  it("ignoriert umgebende Leerzeichen", () => {
    expect(lehrplanFuer("  Mathematik  ")?.fach).toBe("Mathematik");
    expect(lehrplanFuer("  Mathe ")?.fach).toBe("Mathematik");
  });

  it("findet Fächer über gängige Untis-Kürzel", () => {
    expect(lehrplanFuer("D")?.fach).toBe("Deutsch");
    expect(lehrplanFuer("E")?.fach).toBe("Englisch");
    expect(lehrplanFuer("BI")?.fach).toBe("Biologie");
    expect(lehrplanFuer("CH")?.fach).toBe("Chemie");
    expect(lehrplanFuer("PH")?.fach).toBe("Physik");
    expect(lehrplanFuer("GE")?.fach).toBe("Geschichte");
    expect(lehrplanFuer("EK")?.fach).toBe("Erdkunde");
    expect(lehrplanFuer("ER")?.fach).toBe("Evangelische Religionslehre");
    expect(lehrplanFuer("L")?.fach).toBe("Latein");
    expect(lehrplanFuer("SP")?.fach).toBe("Sport");
    expect(lehrplanFuer("IF")?.fach).toBe("Informatik");
  });

  // Faecher, die dieser Schueler nicht belegt hat, stehen bewusst nicht in der
  // Vorlage -- ein Lehrplan, den er nie braucht, waere nur Rauschen im Seed.
  it("kennt die nicht belegten Fächer nicht", () => {
    for (const fach of ["Französisch", "Französisch", "F", "Spanisch", "S", "Katholische Religionslehre", "KR", "Praktische Philosophie", "PP", "Kunst", "KU", "Musik", "MU"]) {
      expect(lehrplanFuer(fach), `unerwartet gefunden: ${fach}`).toBeNull();
    }
  });

  it("gibt null für ein unbekanntes Fach zurück", () => {
    expect(lehrplanFuer("Astronomie")).toBeNull();
    expect(lehrplanFuer("")).toBeNull();
    expect(lehrplanFuer("   ")).toBeNull();
  });
});
