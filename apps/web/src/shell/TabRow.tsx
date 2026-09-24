import { Link, type LinkProps } from "@tanstack/react-router";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
  Icon,
  tabsTriggerVariants,
} from "@taverns/ui";
import { navLinkProps } from "./navLink";

/**
 * A row of underlined tabs that never scrolls and never spills: the items that
 * do not fit go into a *More* menu at the end of the row, in an order the
 * caller states.
 *
 * **No chrome row is a scroll container**, and a tab strip that runs past the
 * edge is either clipped (the shell's frame clips sideways, so `scrollWidth`
 * never sees it) or a second scroller. So each item names the width below
 * which it leaves the row — `collapse` — and the row draws one *More* trigger
 * per band of width, listing exactly what that band hid. Only one band's
 * trigger is ever displayed; the others are `display: none` and out of the
 * accessibility tree, as are the hidden items, so nothing is announced twice.
 *
 * The widths are container queries against the nearest `@container` — the
 * row's own box — never the window: the campaign row is a container, and
 * `PageHeader`'s tab strip is one. They are a fixed ladder rather than a
 * measurement, so what collapses where is written down beside the items and
 * the Playwright suite (`apps/web/e2e/`) measures that it holds.
 */

/** A step of the ladder: below `2xl` (42rem) of the row, below `xl`, … */
export type Collapse = "2xl" | "xl" | "lg" | "md";

/**
 * The ladder, widest first. `hide` takes an item off the row below its step;
 * `more` shows the trigger for everything hidden at this step and above, from
 * the next step down up to this one, so exactly one trigger is ever drawn.
 * Literal class names, because Tailwind emits only what appears in a source
 * file (a class assembled from parts is never generated).
 */
const LADDER: ReadonlyArray<{
  readonly step: Collapse;
  readonly hide: string;
  readonly more: string;
}> = [
  { step: "2xl", hide: "@max-2xl:hidden", more: "@xl:@max-2xl:flex" },
  { step: "xl", hide: "@max-xl:hidden", more: "@lg:@max-xl:flex" },
  { step: "lg", hide: "@max-lg:hidden", more: "@md:@max-lg:flex" },
  { step: "md", hide: "@max-md:hidden", more: "@max-md:flex" },
];
const rung = (step: Collapse): number => LADDER.findIndex((entry) => entry.step === step);

export type TabRowItem = {
  readonly key: string;
  readonly label: string;
  readonly active: boolean;
  /** The row width below which this item is in the *More* menu instead. */
  readonly collapse?: Collapse;
} & (
  | { readonly link: LinkProps; readonly onSelect?: never }
  | { readonly onSelect: () => void; readonly link?: never }
);

/**
 * `h-auto self-stretch` so an item reaches the full height of its row rather
 * than keeping the tab strip's 36px, which is what lands the underline on the
 * row's own hairline (with the recipe's `-mb-px`). `px-3.25` is the delivery's
 * `CampItem` 13px; below the row's `@3xl` it tightens to 10px, the first thing
 * a narrow row gives up and the one nobody reads as a change.
 */
const itemClass = cn(tabsTriggerVariants(), "h-auto self-stretch px-2.5 @3xl:px-3.25");

export function TabRow({
  label,
  moreLabel,
  items,
  className,
}: {
  /** The `nav`'s accessible name. */
  readonly label: string;
  /** The *More* trigger's accessible name. */
  readonly moreLabel: string;
  readonly items: ReadonlyArray<TabRowItem>;
  readonly className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex items-stretch self-stretch", className)}>
      {items.map((item) => (
        <TabRowLink
          key={item.key}
          item={item}
          className={cn(
            itemClass,
            item.collapse !== undefined && LADDER[rung(item.collapse)]?.hide,
          )}
        />
      ))}
      {LADDER.map(({ step, more }, band) => {
        const hidden = items.filter(
          (item) => item.collapse !== undefined && rung(item.collapse) <= band,
        );
        return hidden.length === 0 ? null : (
          <More key={step} label={moreLabel} items={hidden} className={more} />
        );
      })}
    </nav>
  );
}

function TabRowLink({
  item,
  className,
}: {
  readonly item: TabRowItem;
  readonly className: string;
}) {
  if (item.link !== undefined)
    return (
      <Link {...item.link} {...navLinkProps(item.active)} className={className}>
        {item.label}
      </Link>
    );
  return (
    <button
      type="button"
      aria-current={item.active ? "page" : undefined}
      data-active={item.active ? "" : undefined}
      onClick={item.onSelect}
      className={cn(className, "cursor-pointer")}
    >
      {item.label}
    </button>
  );
}

/**
 * One band's *More*: underlined like the tabs it stands for, and lit when the
 * page you are on is one of the items it holds, because the row has to say
 * where you are even when the item that would say it is in the menu.
 */
function More({
  label,
  items,
  className,
}: {
  readonly label: string;
  readonly items: ReadonlyArray<TabRowItem>;
  readonly className: string;
}) {
  const here = items.some((item) => item.active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        data-active={here ? "" : undefined}
        className={cn(itemClass, "hidden", className)}
      >
        <Icon name="ellipsis" size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) =>
          item.link !== undefined ? (
            <DropdownMenuLinkItem
              key={item.key}
              aria-current={item.active ? "page" : undefined}
              render={<Link {...item.link} activeOptions={{ exact: true }} activeProps={{}} />}
            >
              {item.label}
            </DropdownMenuLinkItem>
          ) : (
            <DropdownMenuItem
              key={item.key}
              aria-current={item.active ? "page" : undefined}
              onClick={item.onSelect}
            >
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
