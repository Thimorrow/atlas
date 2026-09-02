import { AlertCircle, Check, Info, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const colors = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["muted", "bg-muted"],
  ["primary", "bg-primary"],
  ["accent", "bg-accent"],
  ["destructive", "bg-destructive"],
] as const;

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-border pt-8">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-10 md:px-10 md:py-14">
        <header className="flex flex-col gap-5 border-b border-border pb-10">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Atlas / UI foundations</p>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] md:text-6xl">Ein System. Eine Sprache.</h1>
              <p className="max-w-xl text-pretty text-base leading-7 text-muted-foreground">Die lebende Referenz für Atlas. Bestehende Werte bleiben unverändert und werden als gemeinsame Bausteine dokumentiert.</p>
            </div>
            <span className="w-fit rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">v0.1 / stable</span>
          </div>
        </header>

        <Section eyebrow="01 / color" title="Semantische Farben">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {colors.map(([name, klass]) => (
              <div key={name} className="flex flex-col gap-2">
                <div className={`h-20 rounded-lg border border-border ${klass}`} />
                <p className="font-mono text-xs text-muted-foreground">--{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="02 / type" title="Typografie">
          <div className="grid gap-8 rounded-xl border border-border bg-card p-6 md:grid-cols-[1fr_280px] md:p-8">
            <div className="flex flex-col gap-5">
              <p className="text-5xl font-semibold tracking-[-0.05em] md:text-7xl">Atlas</p>
              <p className="text-2xl font-medium">Klar denken. Ruhig handeln.</p>
              <p className="max-w-lg leading-7 text-muted-foreground">Geist Sans trägt die Oberfläche: präzise in kleinen Größen, charaktervoll in Überschriften und immer mit ausreichend Luft.</p>
            </div>
            <div className="flex flex-col justify-end gap-3 border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="font-mono text-xs text-muted-foreground">GEIST MONO / LABEL</p>
              <p className="font-mono text-sm leading-6">0123456789<br />Mo · Di · Mi · Do · Fr</p>
            </div>
          </div>
        </Section>

        <Section eyebrow="03 / controls" title="Aktionen & Eingaben">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Speichern</Button><Button variant="secondary">Sekundär</Button><Button variant="outline">Abbrechen</Button><Button variant="ghost">Mehr Optionen</Button><Button size="icon" aria-label="Suchen"><Search /></Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">Suche<input className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" placeholder="Aufgaben durchsuchen" /></label>
            <label className="flex flex-col gap-2 text-sm font-medium">Deaktiviert<input disabled className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground" value="Nicht verfügbar" readOnly /></label>
          </div>
        </Section>

        <Section eyebrow="04 / feedback" title="Zustände">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><Check className="mt-0.5" data-icon="inline-start" /><div><p className="font-medium">Gespeichert</p><p className="text-sm leading-6 text-muted-foreground">Deine Änderungen sind sicher.</p></div></div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><Info className="mt-0.5 text-muted-foreground" /><div><p className="font-medium">Hinweis</p><p className="text-sm leading-6 text-muted-foreground">Der Stundenplan wird synchronisiert.</p></div></div>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"><AlertCircle className="mt-0.5 text-destructive" /><div><p className="font-medium">Fehler</p><p className="text-sm leading-6 text-muted-foreground">Bitte versuche es erneut.</p></div></div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /> Lädt…</div>
        </Section>
      </div>
    </main>
  );
}
