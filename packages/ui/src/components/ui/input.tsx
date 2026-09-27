import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "../../lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Monospace value — dice notation, HP, modifiers. This system's one addition. */
  mono?: boolean;
}

/**
 * A bare input, like shadcn's: no label, hint, error or icon slot — compose those
 * yourself around it.
 *
 * 38px tall, 6px radius, 1px border, filled `--surface-sunken`: the delivery's
 * readme makes inputs "wells", so a field reads darker than the card or dialog it
 * sits in. Every field-like box (select trigger, combobox, textarea) shares that
 * fill. Focus swaps the border to `--accent` and adds the `--ring`. Pass `mono`
 * for anything numeric.
 */
function Input({ className, type, mono = false, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-mono={mono || undefined}
      className={cn(
        "block h-control w-full min-w-0 rounded-control border border-strong bg-surface-sunken px-3",
        "text-foreground transition-control outline-none placeholder:text-faint",
        mono ? "font-mono text-mono font-medium" : "font-sans text-body-s",
        "focus-visible:border-accent focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:focus-visible:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
