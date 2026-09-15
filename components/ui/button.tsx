import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Gemeinsame Farb-, Fokus- und Press-Zustaende: app/globals.css.
  // A1 (Touch): `before` blaeht die Treffflaeche unsichtbar auf 44x44 auf, ohne die
  // sichtbare Groesse zu aendern -- -4px auf jeder Seite reicht bei jeder Size hier
  // (kleinste sichtbare Hoehe ist 36px). `touch-action: manipulation` unterdrueckt
  // Doppeltipp-Zoom auf dem Button selbst.
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium interaction [touch-action:manipulation] press:scale-[0.96] before:absolute before:-inset-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover press:bg-primary-pressed",
        outline: "border border-border-control bg-background hover:bg-interaction-hover press:bg-interaction-pressed hover:text-accent-foreground",
        ghost: "hover:bg-interaction-hover press:bg-interaction-pressed hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-interaction-hover press:bg-interaction-pressed",
        destructive: "bg-destructive-fill text-destructive-foreground hover:bg-destructive-hover press:bg-destructive-pressed",
        "destructive-ghost": "text-destructive hover:bg-danger-hover press:bg-danger-pressed hover:text-destructive",
        link: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline press:text-foreground",
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
