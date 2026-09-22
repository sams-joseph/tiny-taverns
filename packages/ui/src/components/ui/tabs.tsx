import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * An underline bar: the active trigger is semibold with a 2px accent rule;
 * inactive triggers are muted. Triggers are 13px medium sentence case.
 *
 * This is the only in-screen navigation pattern — never a pill group or a
 * segmented control. The pill below is the global row's, and nowhere else's.
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("group/tabs flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex items-end gap-0.5 border-b border-hairline", className)}
      {...props}
    />
  );
}

/**
 * The underline itself, as a recipe rather than as a class list inside one
 * component.
 *
 * It is exported because this pattern is used at two levels: a tab strip inside
 * a screen, and the app's own top-level navigation. The delivery is explicit
 * that those must read identically ("the active item uses the same 2px accent
 * underline as `Tabs`, so navigation reads identically at both levels"), and the
 * only way to keep that true is for both to wear the same recipe — a second copy
 * of the class list is a second thing to change when the designers move the
 * underline. `-mb-px` is part of it: it pulls the 2px border down over the
 * hairline its container draws, whether that container is a `TabsList` or the
 * top bar.
 *
 * Anything reusing it supplies its own box — height, padding, gap — and gets the
 * type, the colours and the `data-active` underline. The active state is that
 * attribute: Base UI sets it on the selected tab, and a plain `<a>` may set it
 * itself.
 */
const tabsTriggerVariants = cva([
  "-mb-px inline-flex h-9 shrink-0 items-center justify-center gap-1.5 px-3",
  "border-b-2 border-transparent bg-transparent",
  "font-sans text-label leading-none font-medium whitespace-nowrap text-muted-foreground",
  "cursor-pointer transition-control outline-none",
  "hover:text-foreground",
  "data-active:border-accent data-active:font-semibold data-active:text-heading",
  "focus-visible:ring-focus",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
]);

/**
 * The global row's pill: the delivery's 26px control, and **every control on
 * that row is one** — the nav links and *Ask Hob* alike.
 *
 * It sits beside the underline because the two are the app's two navigation
 * tiers, and the difference between them is the information: an underline says
 * *which part of this campaign you are reading*, and the row above it is not
 * about a campaign at all. Drawn the same way, the bar would read as ten peers
 * of one kind rather than two tiers. So each tier has exactly one recipe, and
 * both live here.
 *
 * The states are the delivery's, from `GlobalItem` and its *Ask Hob* beside it:
 * `here` is the sunken fill under a hairline, `on` is the accent-soft fill under
 * an accent border that says a panel is open, `idle` is the quiet one, and
 * `quiet` is `idle` with a hairline — a button among links, and the hairline is
 * what says so.
 */
const navPillVariants = cva(
  [
    "flex h-6.5 shrink-0 items-center gap-1.75 rounded-pill border px-2.5",
    "text-caption leading-none font-medium whitespace-nowrap transition-control",
  ],
  {
    variants: {
      state: {
        idle: "border-transparent text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
        quiet:
          "border-hairline text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
        here: "border-hairline bg-surface-sunken text-heading",
        on: "border-accent bg-accent-soft text-accent-ink",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  },
);

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ className }))}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-body-s outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, navPillVariants, tabsTriggerVariants };
