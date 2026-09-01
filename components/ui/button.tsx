import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // F11: `scale` muss in der Transition-Liste stehen -- Tailwind v4 emittiert fuer
  //      `scale-[0.96]` die eigenstaendige `scale`-Property (nicht `transform`),
  //      sonst snappt der Press instant.
  // F12: explizite Atlas-Kurve + Dauer statt der Material-Default-Kurve.
  // A1 (Touch): `before` blaeht die Treffflaeche unsichtbar auf 44x44 auf, ohne die
  // sichtbare Groesse zu aendern -- -4px auf jeder Seite reicht bei jeder Size hier
  // (kleinste sichtbare Hoehe ist 36px). `touch-action: manipulation` unterdrueckt
  // Doppeltipp-Zoom auf dem Button selbst.
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,scale,opacity] duration-150 ease-[var(--ease-atlas)] [touch-action:manipulation] active:scale-[0.96] before:absolute before:-inset-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        // A1 (Touch): reale Trefferflaeche liegt dank des `before`-Pseudo-Elements
        // oben immer bei >= 44x44, auch wenn die sichtbare Groesse kleiner bleibt.
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-[13px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
