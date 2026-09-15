# Atlas Designsystem

Interaktive Referenz: `/design-system`. Sie nutzt die echten Button-Komponenten und die globalen Farben. Beispiele verändern keine Daten.

## Grundlage

Atlas bleibt monochrom. Geist ist die Schrift, bestehende Abstände, Rundungen und Flächen bleiben erhalten. Farben und Interaktionsdauer liegen in `app/globals.css`; `components/ui/button.tsx` definiert die wiederverwendbaren Schaltflächen.

## Interaktionen

| Element | Hover | Gedrückt |
| --- | --- | --- |
| Neutrale Schaltfläche, Icon, anklickbare Zeile/Karte | `interaction-hover` | `interaction-pressed` |
| Hauptaktion | `primary-hover` | `primary-pressed` |
| Dezente Löschaktion | `danger-hover`, roter Text | `danger-pressed` |
| Bestätigte Löschaktion | `destructive-hover`, weißer Text | `destructive-pressed` |
| Textlink | Vordergrundfarbe und Unterstreichung | Vordergrundfarbe |

- Keine frei gewählten Hover-Transparenzen wie `accent/40` oder `accent/60`.
- Neutrale Hover-Flächen sind deckend: gleiches Ergebnis auf Seite, Karte und Popover.
- `interaction` definiert Farbwechsel mit 150 ms und `ease`, inklusive Tastaturfokus. Vorhandene Fokus-Ringe bleiben verwendbar.
- `hover:` gilt nur mit Maus/Trackpad und nicht bei `disabled`, `aria-disabled="true"` oder Radix `data-disabled`.
- `press:` liefert auch auf Touch ein Feedback und schließt deaktivierte Elemente aus.
- `aria-disabled` ist nur die Zustandsbeschreibung; die Komponente muss die Aktion selbst unterbinden. Für Buttons bevorzugt natives `disabled` verwenden.
- Die vorhandene Einstellung für reduzierte Bewegung deaktiviert Übergänge.
- Auswahl (`bg-accent`, Markierungsbalken oder `bg-primary`) bleibt ein eigener dauerhafter Zustand. Hover-Klassen bei bedingten Auswahlvarianten nur im nicht ausgewählten Zweig setzen.
- Nicht anklickbare Zeilen: weder Hover noch Press. Fachfarbige Stundenblöcke behalten ihre fachliche Farbe und nutzen ihren bestehenden Ring als Rückmeldung.
- Textlinks haben keine flächige Füllung. Neue Textaktionen nutzen `Button variant="link"` bzw. dessen Klassen.

## Verwendung

```tsx
<Button>Speichern</Button>
<Button variant="outline">Abbrechen</Button>
<Button variant="ghost" size="icon" aria-label="Bearbeiten"><Pencil /></Button>
<Button variant="destructive">Endgültig löschen</Button>
<Button variant="destructive-ghost">Entfernen</Button>
<Button disabled>Wird gespeichert …</Button>
```

Für Links mit Schaltflächenoptik `buttonVariants` verwenden. Für spezielle Zeilen:

```tsx
<Link
  href="/aufgaben"
  className="interaction rounded-lg px-3 py-3 hover:bg-interaction-hover press:bg-interaction-pressed"
>
  Aufgaben öffnen
</Link>
```

Keine zusätzliche `transition-*`, `duration-*` oder `ease-*`-Klasse auf diese Elemente setzen. Dropdown-Einträge verwenden denselben neutralen Hover-Token für Radix `data-highlighted`, damit Maus und Tastatur gleich aussehen.
