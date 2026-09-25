import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import { useId, type ComponentProps, type ReactNode } from "react";

import { POPUP_ROW_HOVERED } from "../../lib/popup-row";
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

/**
 * A trigger's panel. Given a `hero` — a `NavigationMenuHero` — it is a
 * featured panel: the tile as a banner across the top and the column of links
 * under it, at every width. The panel is 28rem, capped at the room the
 * positioner leaves (`--available-width`) wherever the trigger sits.
 */
function NavigationMenuContent({
  className,
  children,
  hero,
  ...props
}: NavigationMenuPrimitive.Content.Props & { readonly hero?: ReactNode }) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        hero === undefined
          ? "flex min-w-44 flex-col p-1"
          : // Capped at the room less the popup's two hairline borders, which
            // together are one `0.5` spacing step: the positioner holds the
            // popup's outer box to `--available-width`, and a panel as wide as
            // that is clipped by the borders.
            "flex w-md max-w-[calc(var(--available-width)-var(--spacing)*0.5)] flex-col gap-1.5 p-1.5",
        className,
      )}
      {...props}
    >
      {hero === undefined ? (
        children
      ) : (
        <>
          {hero}
          <div className="flex min-w-0 flex-col">{children}</div>
        </>
      )}
    </NavigationMenuPrimitive.Content>
  );
}

/**
 * The featured tile of a panel: a picture, the part of the app the panel is,
 * and one line about it. It is decoration, not a destination — the panel's
 * first link is where the part of the app starts — so it is not focusable and
 * the picture's `alt` is empty; the label and tagline are read as the panel's
 * text. It spans the panel's top, and the picture is a 4:1 banner that covers
 * its band, the label and tagline under it on the tile's sunken surface.
 */
function NavigationMenuHero({
  className,
  src,
  srcSet,
  sizes,
  label,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly src: string;
  readonly srcSet?: string;
  readonly sizes?: string;
  readonly label: ReactNode;
}) {
  return (
    <div
      data-slot="navigation-menu-hero"
      className={cn(
        "flex flex-col overflow-hidden rounded-sm border border-hairline bg-surface-sunken",
        className,
      )}
      {...props}
    >
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        decoding="async"
        className="aspect-4/1 w-full object-cover"
      />
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="m-0 font-sans text-body-s font-semibold text-heading">{label}</p>
        <p className="m-0 font-sans text-caption text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/** A panel's row: the dropdown menu's item, so the two popups read alike. */
const ROW =
  "relative flex h-8.5 w-full items-center gap-2 px-3 " +
  "rounded-xs font-sans text-body-s whitespace-nowrap text-foreground " +
  "cursor-pointer transition-control outline-none select-none " +
  `${POPUP_ROW_HOVERED} ` +
  "data-active:bg-accent-soft data-active:text-accent-ink";

/** A row with a description under its title: the same row, two lines tall. */
const ENTRY =
  "relative flex w-full flex-col items-start gap-0.5 px-3 py-2 " +
  "rounded-xs font-sans text-foreground " +
  "cursor-pointer transition-control outline-none select-none " +
  `${POPUP_ROW_HOVERED} ` +
  "data-active:bg-accent-soft data-active:text-accent-ink";

/**
 * A destination. Pass the router's `Link` as `render`.
 *
 * Inside a `NavigationMenuContent` it is a panel row (`row`, the default); on
 * the list itself, beside the triggers, it is a pill (`pill`). `active` is the
 * page you are on — Base UI announces it as `aria-current="page"` and draws
 * `data-active` — and a pill lights `here` for it as a trigger does.
 *
 * A row may carry a `description`: a line under its title saying what is
 * there. The title alone is the link's name and the line is its description
 * (`aria-labelledby`, `aria-describedby`), so a screen reader announces
 * *Spells, link* and then what a spell shelf holds, not one run-on name.
 *
 * It closes the panel when followed, because the page under it is about to be
 * a different one.
 */
function NavigationMenuLink({
  className,
  variant = "row",
  active = false,
  closeOnClick = true,
  description,
  children,
  ...props
}: NavigationMenuPrimitive.Link.Props & {
  readonly variant?: "row" | "pill";
  readonly description?: ReactNode;
}) {
  const id = useId();
  const described = variant === "row" && description !== undefined;
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      active={active}
      closeOnClick={closeOnClick}
      aria-labelledby={described ? `${id}-title` : undefined}
      aria-describedby={described ? `${id}-description` : undefined}
      className={cn(
        variant === "pill"
          ? cn(
              navPillVariants({ state: active ? "here" : "idle" }),
              "outline-none focus-visible:ring-focus",
            )
          : described
            ? ENTRY
            : ROW,
        className,
      )}
      {...props}
    >
      {described ? (
        <>
          <span id={`${id}-title`} className="text-body-s font-medium">
            {children}
          </span>
          <span id={`${id}-description`} className="text-caption text-muted-foreground">
            {description}
          </span>
        </>
      ) : (
        children
      )}
    </NavigationMenuPrimitive.Link>
  );
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuHero,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
};
