"use client";

import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Option = { value: string | number; children: ReactNode; disabled?: boolean };

export function Select({ value, onValueChange, children, className, ...props }: Omit<ComponentProps<"button">, "value" | "onChange"> & {
  value: string | number;
  onValueChange: (value: string) => void;
}) {
  const options = Children.toArray(children).filter(isValidElement<Option>);
  const selected = options.find((option) => String(option.props.value) === String(value));
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button {...props} type="button" className={cn("inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", className)}>
          <span className="truncate">{selected?.props.children ?? "Auswählen …"}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Menu.Trigger>
      <DropdownMenuContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        <Menu.RadioGroup value={String(value)} onValueChange={onValueChange}>
          {options.map((option) => (
            <Menu.RadioItem key={String(option.props.value)} value={String(option.props.value)} disabled={option.props.disabled}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
              <span className="w-4 shrink-0"><Menu.ItemIndicator><Check className="size-4" /></Menu.ItemIndicator></span>
              {option.props.children}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </DropdownMenuContent>
    </Menu.Root>
  );
}
