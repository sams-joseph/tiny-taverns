import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { navPillVariants } from "./tabs";

/**
 * Composed navigation menu on Base UI's `NavigationMenu` — the registry's
 * `base-nova` navigation-menu restyled to the design system, the way
 * `dropdown-menu.tsx` was. It is the global row's: a list of top-level
 * destinations, some of which open a panel of further destinations.
 *
 * It is not a `DropdownMenu`, and the difference is the pattern a screen
 * reader is told: a menu is a list of *commands* (`role="menu"`, typeahead,
 * focus trapped in the popup), where this is a `<nav>` of links in which a
 * trigger is a disclosure button (`aria-expanded`) and the panel it opens is
 * more links, reachable with Tab as well as with the arrows.
 *
 * **The controls are the global row's pill**, `navPillVariants`, because every
 * control on that row is one — a trigger and a plain link side by side must
 * not read as two kinds. `active` says the page you are on is this item or one
 * of its panel's links, and lights it `here`; an open trigger is lit the way a
 * hovered pill is, so the panel's owner is plain while the pointer is in it.
 *
 * As in shadcn's, the root renders the one shared positioner, so a caller
 * writes `List`, `Item`, `Trigger`, `Content` and `Link` and nothing else. The
 * popup portals to `document.body` on `z-popup`, above the sticky chrome it
 * opens from. It is capped at the room left below its trigger and scrolls
 * within itself past that, so a long panel never makes the page scroll.
 */
function NavigationMenu({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  ...props
}: NavigationMenuPrimitive.Root.Props &
  Pick<NavigationMenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn("relative flex items-center", className)}
      {...props}
    >
      {children}
      <NavigationMenuPrimitive.Portal>
        <NavigationMenuPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          className="isolate z-popup h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)"
        >
          <NavigationMenuPrimitive.Popup
            data-slot="navigation-menu-popup"
            className={cn(
              "h-(--popup-height) max-h-(--available-height) w-(--popup-width) max-w-(--available-width)",
              "rounded-md border border-strong bg-surface-raised shadow-3",
              "origin-(--transform-origin) outline-none",
            )}
          >
            <NavigationMenuPrimitive.Viewport
              data-slot="navigation-menu-viewport"
              className="relative size-full overflow-x-hidden overflow-y-auto"
            />
          </NavigationMenuPrimitive.Popup>
        </NavigationMenuPrimitive.Positioner>
      </NavigationMenuPrimitive.Portal>
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({ className, ...props }: NavigationMenuPrimitive.List.Props) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("flex list-none items-center gap-1", className)}
      {...props}
    />
  );
}

function NavigationMenuItem({ className, ...props }: NavigationMenuPrimitive.Item.Props) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

/** The open trigger, drawn as the pill's hover so the panel reads as its. */
const TRIGGER_OPEN = "data-popup-open:bg-surface-sunken data-popup-open:text-foreground";

/**
 * A pill that opens its item's panel — on hover, on a click, or on Enter,
 * Space or ArrowDown. It is a `<button>`, not a link: one control that both
 * navigates and discloses cannot say which it will do, so the destination it
 * stands for is the first link in its panel.
 *
 * `active` is the part of the app you are in. It is announced as
 * `aria-current="true"` — the current item of a set — rather than `page`,
 * because the button is not the page; the panel's own link is.
 */
function NavigationMenuTrigger({
  className,
  children,
  active = false,
  ...props
}: NavigationMenuPrimitive.Trigger.Props & { readonly active?: boolean }) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      aria-current={active ? "true" : undefined}
      data-active={active ? "" : undefined}
      className={cn(
        navPillVariants({ state: active ? "here" : "idle" }),
        !active && TRIGGER_OPEN,
        "group/navigation-menu-trigger cursor-pointer outline-none focus-visible:ring-focus",
        className,
      )}
      {...props}
    >
      {children}
      <Icon
        name="chevron-down"
        size={12}
        className="-mr-0.5 transition-control group-data-popup-open/navigation-menu-trigger:rotate-180"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({ className, ...props }: NavigationMenuPrimitive.Content.Props) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn("flex min-w-44 flex-col p-1", className)}
      {...props}
    />
  );
}

/** A panel's row: the dropdown menu's item, so the two popups read alike. */
const ROW =
  "relative flex h-8.5 w-full items-center gap-2 px-3 " +
  "rounded-xs font-sans text-body-s whitespace-nowrap text-foreground " +
  "cursor-pointer transition-control outline-none select-none " +
  "hover:bg-slate-700 focus-visible:bg-slate-700 " +
  "data-active:bg-accent-soft data-active:text-accent-ink";

/**
 * A destination. Pass the router's `Link` as `render`.
 *
 * Inside a `NavigationMenuContent` it is a panel row (`row`, the default); on
 * the list itself, beside the triggers, it is a pill (`pill`). `active` is the
 * page you are on — Base UI announces it as `aria-current="page"` and draws
 * `data-active` — and a pill lights `here` for it as a trigger does.
 *
 * It closes the panel when followed, because the page under it is about to be
 * a different one.
 */
function NavigationMenuLink({
  className,
  variant = "row",
  active = false,
  closeOnClick = true,
  ...props
}: NavigationMenuPrimitive.Link.Props & { readonly variant?: "row" | "pill" }) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      active={active}
      closeOnClick={closeOnClick}
      className={cn(
        variant === "row"
          ? ROW
          : cn(
              navPillVariants({ state: active ? "here" : "idle" }),
              "outline-none focus-visible:ring-focus",
            ),
        className,
      )}
      {...props}
    />
  );
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
};
