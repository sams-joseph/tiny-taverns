import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";

/**
 * Composed combobox on Base UI's `Combobox` — the registry's `base-nova`
 * combobox restyled to the design system, exactly as `select.tsx` was.
 *
 * shadcn's `command` is *not* portable here: it is built on `cmdk`, which
 * depends on Radix packages, and `adherence.test.ts` holds the lockfile
 * Radix-free. Base UI's combobox is the same suggestion-list idiom on the
 * primitives this package already ships, including the chips-in-input parts
 * (`ComboboxChips` / `ComboboxChip` / `ComboboxChipsInput`) that a token
 * input needs — chip keyboard navigation (ArrowLeft into the chips,
 * Backspace on an empty input removing the last one) is the primitive's own.
 *
 * The popup portals to `document.body` on `z-popup`, above `z-dialog`, for the
 * select's reason: a combobox opened from inside a dialog must not lose the
 * click to the dialog's own backdrop.
 */
const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "block h-control w-full min-w-0 rounded-control border border-strong bg-surface-card px-3",
        "font-sans text-body-s text-foreground transition-control outline-none placeholder:text-faint",
        "focus-visible:border-accent focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset" | "anchor">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-popup"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-36",
            "overflow-x-hidden overflow-y-auto",
            "rounded-md border border-strong bg-surface-raised p-1 shadow-3",
            "origin-(--transform-origin) outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("scroll-py-1 overscroll-contain outline-none", className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex h-8.5 w-full items-center gap-2 px-3",
        "rounded-xs font-sans text-body-s text-foreground",
        "cursor-pointer transition-control outline-none select-none",
        "data-highlighted:bg-slate-700",
        "data-[selected]:bg-accent-soft data-[selected]:text-accent-ink",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="flex flex-1 items-center gap-2 whitespace-nowrap">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        render={<Icon name="check" size={14} className="pointer-events-none shrink-0" />}
      />
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-3 py-1.5 text-label-s font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "w-full px-3 py-2 text-body-s leading-body text-faint empty:m-0 empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("pointer-events-none my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

/**
 * The chips-in-input container: an `Input`-shaped box that holds the selected
 * values as removable chips with the text input inline after them. This is the
 * part a token/filter input composes; a plain-text combobox uses
 * `ComboboxInput` instead.
 */
function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-control w-full min-w-0 flex-wrap items-center gap-1.5 rounded-control",
        "border border-strong bg-surface-card px-2 py-1 transition-control",
        "focus-within:border-accent focus-within:ring-focus",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  removeLabel = "Remove",
  ...props
}: ComboboxPrimitive.Chip.Props & { readonly removeLabel?: string }) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex w-fit shrink-0 items-center gap-1 rounded-xs bg-surface-raised py-0.5 pl-2",
        "font-sans text-label-s leading-snug font-medium whitespace-nowrap text-slate-300",
        "data-highlighted:bg-accent-soft data-highlighted:text-accent-ink",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        className={cn(
          "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-xs",
          "text-faint transition-control outline-none hover:text-foreground",
        )}
        aria-label={removeLabel}
      >
        <Icon name="x" size={12} className="pointer-events-none" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chips-input"
      className={cn(
        "h-6 min-w-24 flex-1 bg-transparent font-sans text-body-s text-foreground",
        "outline-none placeholder:text-faint",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
};
