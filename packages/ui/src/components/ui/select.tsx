import { Select as SelectPrimitive } from "@base-ui/react/select";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";

/**
 * Composed select. No `options` prop — you write the items.
 *
 * Matches `Input` visually: 38px, 6px radius, 1px border. The open list is an
 * 8px-radius popover on `--shadow-3`; the chosen item takes the soft
 * `--accent-soft` / `--accent-ink` selection treatment.
 *
 * The list portals to `document.body` on `z-popup`, which is *above* `z-dialog`
 * because a select is most often opened from a control inside a dialog. It sat
 * below, and the dialog's `fixed inset-0` backdrop then covered it — which reads
 * as "the dropdown does not open", because the click never reaches an option.
 */
const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn(className)} {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 overflow-hidden text-left text-ellipsis", className)}
      {...props}
    />
  );
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-control w-full items-center justify-between gap-2 px-3",
        "rounded-control border border-strong bg-surface-card",
        "font-sans text-body-s text-foreground whitespace-nowrap",
        "cursor-pointer transition-control outline-none select-none",
        "data-placeholder:text-faint",
        "data-popup-open:border-accent data-popup-open:ring-focus",
        "focus-visible:border-accent focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<Icon name="chevron-down" size={14} className="pointer-events-none shrink-0" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "side" | "sideOffset" | "alignItemWithTrigger">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-popup"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-x-hidden overflow-y-auto",
            "rounded-md border border-strong bg-surface-raised p-1 shadow-3",
            "origin-(--transform-origin) outline-none",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-3 py-1.5 text-label-s font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
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
      <SelectPrimitive.ItemText className="flex flex-1 items-center gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={<Icon name="check" size={14} className="pointer-events-none shrink-0" />}
      />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
