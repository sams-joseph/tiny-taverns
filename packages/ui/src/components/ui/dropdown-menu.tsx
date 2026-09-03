import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";

/**
 * Composed dropdown menu on Base UI's `Menu` — the registry's `base-nova`
 * dropdown-menu restyled to the design system, exactly as `select.tsx` and
 * `popover.tsx` were. A menu is a list of *commands* (and radio choices)
 * behind one trigger — the sort icon-button is the first consumer — where a
 * `Select` is a form value and a `Popover` is a small anchored surface of
 * arbitrary controls.
 *
 * The popup portals to `document.body` on `z-popup`, above `z-dialog`, for the
 * select's reason: a menu opened from a control inside a dialog must not lose
 * the click to the dialog's own backdrop.
 */
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" className={cn(className)} {...props} />
  );
}

function DropdownMenuContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-popup"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-(--available-height) max-w-(--available-width) min-w-36",
            "overflow-x-hidden overflow-y-auto",
            "rounded-md border border-strong bg-surface-raised p-1 shadow-3",
            "origin-(--transform-origin) outline-none",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const ITEM =
  "relative flex h-8.5 w-full items-center gap-2 px-3 " +
  "rounded-xs font-sans text-body-s text-foreground " +
  "cursor-pointer transition-control outline-none select-none " +
  "data-highlighted:bg-slate-700 " +
  "data-disabled:pointer-events-none data-disabled:opacity-50";

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(ITEM, className)} {...props} />
  );
}

function DropdownMenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return (
    <MenuPrimitive.Group data-slot="dropdown-menu-group" className={cn(className)} {...props} />
  );
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("px-3 py-1.5 text-label-s font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuRadioGroup({ className, ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      className={cn(className)}
      {...props}
    />
  );
}

/**
 * A radio row — the sort menu's shape. The active choice takes the soft
 * `--accent-soft` / `--accent-ink` selection treatment the select's chosen
 * item wears, plus the check the indicator draws, so "which one is on" reads
 * two ways.
 */
function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(ITEM, "data-checked:bg-accent-soft data-checked:text-accent-ink", className)}
      {...props}
    >
      <span className="flex flex-1 items-center gap-2 whitespace-nowrap">{children}</span>
      <MenuPrimitive.RadioItemIndicator
        render={<Icon name="check" size={14} className="pointer-events-none shrink-0" />}
      />
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("pointer-events-none my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
