import { Button } from "@/components/ui/button";

const variants = ["default", "secondary", "outline", "ghost", "destructive", "destructive-ghost", "link"] as const;
const labels = ["Hauptaktion", "Sekundär", "Umrandet", "Unauffällig", "Löschen", "Löschsymbol", "Textlink"];

export default function DesignSystemPage() {
  return (
    <main className="h-full overflow-y-auto p-6 lg:p-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Atlas · Designsystem</p>
          <h1 className="text-3xl font-semibold tracking-tight">Ein Verhalten. Überall.</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Muster zum Ausprobieren: Bewege die Maus über die Elemente, halte sie gedrückt
            oder navigiere mit Tab. Diese Beispiele verändern keine Schuldaten.
            Hell- und Dunkelmodus folgen deiner Atlas-Einstellung.
          </p>
        </header>
        <section aria-labelledby="buttons" className="space-y-4">
          <h2 id="buttons" className="text-lg font-semibold">Schaltflächen</h2>
          <div className="divide-y rounded-xl border bg-card px-4">
            {variants.map((variant, i) => (
              <div key={variant} className="grid grid-cols-1 items-center gap-4 py-5 sm:grid-cols-[1fr_1fr_1fr]">
                <span className="text-sm text-muted-foreground">{labels[i]}</span>
                <Button variant={variant} className="justify-self-start">Beispiel</Button>
                <Button variant={variant} disabled className="justify-self-start">Deaktiviert</Button>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="surfaces" className="space-y-4">
          <h2 id="surfaces" className="text-lg font-semibold">Flächen und Zustände</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Ruhezustand", "bg-card"],
              ["Hover · Maus darüber", "bg-interaction-hover"],
              ["Gedrückt", "bg-interaction-pressed"],
            ].map(([label, color]) => (
              <div key={label} className={`rounded-xl border p-5 text-sm ${color}`}>{label}</div>
            ))}
          </div>
          <button type="button" className="interaction w-full rounded-lg border bg-card px-4 py-4 text-left text-sm hover:bg-interaction-hover press:bg-interaction-pressed">
            Interaktive Zeile · gleiche Rückmeldung wie eine neutrale Schaltfläche
          </button>
          <p className="text-sm text-muted-foreground">Nicht anklickbare Inhalte erhalten keinen Hover-Effekt. Ausgewählte Einträge behalten ihre Markierung.</p>
        </section>
      </div>
    </main>
  );
}
