import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Button, cn, Icon, tabsTriggerVariants, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { SignInSurface } from "../auth/SignInSurface";
import { HobRegion } from "../hob/HobDock";
import { hrefFor, listFor, modeOf, type Mode, type Route } from "../routes";

/**
 * The fixed shell: a 56px top nav, a per-screen bar under it, a scrolling body.
 *
 * This is `ui_kits/dm-screen/AppShell.jsx` built out of the shipped components
 * and the theme's names — the prototype's inline styles and hand-rolled hover
 * state are the visual specification, not code to carry across.
 *
 * **The 260px rail is gone, and the width it took is the point of the change.**
 * The second delivery replaced it with one 56px row — mark and wordmark, the
 * nav, then the campaign, its session badge and *Ask Hob* pushed right — and the
 * content is what got the 260px back. So the screens under this measure
 * themselves against the column they now have rather than against the viewport:
 * `main` is a `@container`, and every layout that used to turn over at an `xl:`
 * or `lg:` viewport breakpoint asks the column instead. A breakpoint chosen when
 * a rail was eating 260px is a breakpoint that answers the wrong question now.
 *
 * Each screen composes this itself and supplies its own top bar, rather than
 * the shell reaching down for a title it would have to be told about anyway.
 */

interface NavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly route: Route;
}

/**
 * The kit names three sections; the app has the screens that exist to point
 * them at.
 *
 * `Run` is not here because it is not a destination — a fight is reached from
 * the campaign that owns it, and a top-level link could not know which run it
 * meant. A nav item that goes nowhere is the same lie as a stubbed field, so the
 * row carries what exists.
 *
 * **`Bestiary` and `Chronicle` are here only once a campaign is**, for the same
 * reason and one more: `creatures.list` hangs off
 * `/campaigns/:campaignId/creatures` and every source the Chronicle reads hangs
 * off `/campaigns/:campaignId` too, so neither has a meaning without a campaign
 * to read it through — and on both the path is the *only* thing scoping what
 * comes back. From the campaign list there is no campaign yet, so the items are
 * absent rather than disabled.
 *
 * The third delivery adds `Chronicle` with `scroll-text`
 * (`AppShell.jsx`'s one new line), which is the order kept here.
 */
const navFor = (route: Route): ReadonlyArray<NavItem> => {
  const campaignId = "campaignId" in route ? route.campaignId : undefined;

  /**
   * **The nav is a function of the route and the mode, and the mode is read off
   * the route** (`modeOf`) rather than passed in beside it — one answer, so the
   * bar can never light a section the URL is not in.
   *
   * The delivery's player nav is *Characters*, *At the table* and *Chronicle*.
   * None of the three is built, and the rule that keeps *Run* out of the DM's
   * row keeps them out of this one: a nav item that goes nowhere is the same lie
   * as a stubbed field. What a player has is the tables they sit at, so that is
   * what the row carries, and each of the drawn three earns its item the day its
   * screen exists.
   *
   * *Bestiary* and *Chronicle* are deliberately absent even inside a campaign.
   * They are not merely undrawn here — `recap.read` is behind the `DmActor` gate
   * and would answer a player a 404, and a control that exists and then errors
   * is worse than one that is absent.
   */
  if (modeOf(route) === "player") {
    return [
      { label: "Tables", icon: "book-open", route: { screen: "play" } },
      { label: "Components", icon: "panel-left", route: { screen: "gallery" } },
    ];
  }

  return [
    { label: "Campaigns", icon: "book-open", route: { screen: "campaigns" } },
    ...(campaignId === undefined
      ? []
      : [
          {
            label: "Bestiary",
            icon: "footprints",
            route: { screen: "bestiary", campaignId },
          } satisfies NavItem,
          {
            label: "Chronicle",
            icon: "scroll-text",
            route: { screen: "chronicle", campaignId },
          } satisfies NavItem,
        ]),
    { label: "Components", icon: "panel-left", route: { screen: "gallery" } },
  ];
};

/**
 * Which nav item is lit.
 *
 * A campaign and the fight inside it are both *within* Campaigns, so those
 * routes light the same item — the underline says which part of the app you are
 * in, not which URL you are at, and an unlit nav on a campaign page reads as a
 * bug. The bestiary and the Chronicle are their own sections: they are screens
 * you go *to* from a campaign rather than views of one.
 *
 * **The second axis is the mode**, and it is the same rule one level up: a
 * player's campaign is *within* their tables, so `#/play` and
 * `#/play/campaigns/:c` light one item. There is no route that is both, so the
 * two axes cannot fight.
 */
const sectionOf = (route: Route): Route["screen"] =>
  route.screen === "gallery" || route.screen === "bestiary" || route.screen === "chronicle"
    ? route.screen
    : modeOf(route) === "player"
      ? "play"
      : "campaigns";

/**
 * A nav item, wearing `Tabs`' own recipe.
 *
 * The delivery asks for this in as many words: the active item takes the same
 * 2px accent underline as a tab strip, "so navigation reads identically at both
 * levels". `tabsTriggerVariants` is that recipe, exported from `@taverns/ui` for
 * this — reproducing the class list here would be a second copy to keep in step
 * with the designers.
 *
 * A real `<a href="#/…">`, so a section is middle-clickable and copyable, and
 * `data-active` rather than a hand-rolled active class: it is the attribute Base
 * UI's own tab sets, and the same one the recipe's variants key on.
 */
function NavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <a
      href={hrefFor(item.route)}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      // `h-auto` so the item stretches to the bar rather than keeping the tab
      // strip's 36px, which is what puts the underline on the bar's own hairline.
      className={cn(tabsTriggerVariants(), "h-auto gap-2 self-stretch px-3.5")}
    >
      <Icon name={item.icon} size={16} className={active ? "text-verdigris-300" : undefined} />
      {item.label}
    </a>
  );
}

/**
 * The role switch: which app this is.
 *
 * `AppShell.jsx:42-60` draws it as a two-segment pill in the top row, and the
 * captain settled what it means — **a mode, not a filter.** Flipping it changes
 * the nav, the routes and the screens, not merely which rows a list shows.
 *
 * **So it is two links and holds no state**, which is the whole of how a mode
 * survives a reload, a bookmark and a middle click. The delivery's `setRole`
 * callback would have been a second answer to "which app am I in" beside the
 * URL, and the two would part company the first time somebody shared a link.
 *
 * It lands on the *list* on each side rather than trying to carry the campaign
 * across, because a campaign does not exist on both: role is a fact about a
 * pair, and the table you DM has no player screen to be shown.
 *
 * `aria-pressed` as the delivery has it, and a real `<a>`: this is navigation
 * wearing a toggle's clothes, so it must behave like navigation.
 */
function RoleSwitch({ mode }: { readonly mode: Mode }) {
  const options = [
    { id: "dm", icon: "crown", label: "DM" },
    { id: "player", icon: "user", label: "Player" },
  ] as const satisfies ReadonlyArray<{ id: Mode; icon: IconName; label: string }>;

  return (
    <div
      aria-label="Role"
      className="flex shrink-0 gap-0.5 rounded-pill border border-hairline bg-surface-sunken p-0.5"
    >
      {options.map((option) => {
        const on = option.id === mode;
        return (
          <a
            key={option.id}
            href={hrefFor(listFor(option.id))}
            aria-pressed={on}
            className={cn(
              "flex h-6.5 items-center gap-1.5 rounded-pill px-2.5 text-caption leading-none font-semibold whitespace-nowrap transition-control",
              on
                ? "bg-accent text-on-accent"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <Icon name={option.icon} size={13} />
            {option.label}
          </a>
        );
      })}
    </div>
  );
}

/**
 * *Ask Hob*, part of the specified layout.
 *
 * The panel it opens is built elsewhere; this is the shell's half of the seam.
 * With no `onAskHob` handed down it still renders — it is the bar the designers
 * drew — and does nothing.
 */
function AskHobButton({ onClick }: { readonly onClick?: () => void }) {
  return (
    <Button variant="secondary" size="sm" className="gap-2" onClick={onClick}>
      <img src={markUrl} alt="" aria-hidden="true" width={18} height={18} className="rounded-xs" />
      Ask Hob
      <kbd className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-micro leading-snug font-medium text-faint">
        &#8984;K
      </kbd>
    </Button>
  );
}

/**
 * The app's own bar: where you are in the product, and who you are.
 *
 * Not sticky and not on the layering scale — it is a flex row *above* the
 * scrolling column rather than something floating over it, so it never overlaps
 * anything and never has to win.
 */
function TopNav({
  route,
  context,
  onAskHob,
  roleSwitch = false,
}: {
  readonly route: Route;
  readonly context?: ReactNode;
  readonly onAskHob?: () => void;
  readonly roleSwitch?: boolean;
}) {
  const section = sectionOf(route);
  const mode = modeOf(route);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-hairline bg-surface-card px-page-sm sm:px-page">
      <div className="flex shrink-0 items-center gap-2">
        <img src={markUrl} alt="" aria-hidden="true" width={26} height={26} className="block" />
        <span className="font-display text-subtitle leading-tight font-semibold tracking-display whitespace-nowrap text-heading">
          Tiny Taverns
        </span>
      </div>

      <nav aria-label="Sections" className="flex h-full items-stretch">
        {navFor(route).map((item) => (
          <NavLink key={item.label} item={item} active={item.route.screen === section} />
        ))}
      </nav>

      {/* `min-w-0` rather than `shrink-0`: everything in this group but the
          campaign's name is a fixed size and says so itself, so the group is
          allowed to shrink and the name is what absorbs it. */}
      <div className="ml-auto flex min-w-0 items-center gap-4">
        {context}
        {roleSwitch && <RoleSwitch mode={mode} />}
        {/* Absent in player mode rather than present and failing. Asking Hob is
            a write — `HobThreads.start` needs `campaignWritable` — so a player
            gets the ordinary `NotFound`, and the captain settled that players do
            not talk to Hob at all. A button that opens a panel which can only
            apologise is the DM chrome this mode exists to keep out of the way. */}
        {mode === "dm" && <AskHobButton onClick={onAskHob} />}
        {/* Clerk's own components, unthemed on purpose — see SignInSurface.
            Renders nothing at all when no publishable key is configured, which
            is why the bar can carry it unconditionally. It moved here from the
            per-screen bar with the rail: it belongs to the app, not the page. */}
        <SignInSurface />
      </div>
    </header>
  );
}

/**
 * The top nav's right-hand pair: the campaign you are in, and its badges.
 *
 * Shared rather than composed twice, because the campaign view and the runner
 * both put the same thing there and the delivery draws it once. `href` is for
 * the screen that is *inside* the campaign — from a fight, the campaign's name
 * is the way back to prep, which is the one thing the rail used to carry that
 * this row would otherwise have dropped.
 */
export function NavContext({
  name,
  href,
  children,
}: {
  readonly name: string;
  readonly href?: string;
  readonly children?: ReactNode;
}) {
  // `truncate`, not `whitespace-nowrap`: this is the one part of the bar that is
  // arbitrary length, so it is the one that gives way. A campaign called
  // something long must not push *Ask Hob* off the end of a narrow window.
  const label = "truncate text-label leading-snug font-semibold text-foreground";
  return (
    <div className="flex min-w-0 items-center gap-2">
      {href === undefined ? (
        <span className={label}>{name}</span>
      ) : (
        <a href={href} className={cn(label, "hover:text-link-hover")}>
          {name}
        </a>
      )}
      {children}
    </div>
  );
}

/**
 * The sticky per-screen header: what you are looking at, and what you can do to
 * it.
 *
 * `--fs-display-s` at `--ls-display`, which is where the delivery puts it now
 * that the wordmark sits in its own row above — one step down from the rail-era
 * `--fs-display-m`, because this is no longer the only display-sized thing on
 * the screen.
 *
 * `z-chrome` is the bottom rung of the layering scale in `@taverns/ui`'s
 * `styles.css`: sticky page furniture, deliberately far below the overlay band
 * so a dialog's scrim covers it. Reach for a rung, never a number.
 */
export function TopBar({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-chrome flex items-center gap-gutter border-b border-hairline bg-surface-card px-page-sm py-3.5 sm:px-page">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-1 text-body-s leading-body text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">{children}</div>
    </header>
  );
}

export function AppShell({
  route,
  context,
  topBar,
  onAskHob,
  panel,
  roleSwitch = false,
  fill = false,
  children,
}: {
  readonly route: Route;
  /**
   * What you are in, pushed right in the top nav: the campaign's name and its
   * session badge. The screen supplies it because the shell has no way to know
   * it — the same reason the screen supplies its own `topBar`.
   */
  readonly context?: ReactNode;
  readonly topBar: ReactNode;
  /**
   * The seam for the Hob chat panel, and the whole of it.
   *
   * `onAskHob` is the top nav's *Ask Hob* button; `panel` is rendered as the
   * last child of the row under the top nav, and that row **is**
   * `hob/HobDock.tsx`'s `HobRegion` — the component itself now, rather than a
   * second copy of its class list kept in step by hand. It has to be: the region
   * publishes its own element through a context, and the panel's overlaid form
   * is portalled into that element and measured against it. A row restated here
   * would be `relative` and look right and portal to `<body>`, where the scrim
   * would cover the whole app including this bar.
   *
   * So `Hob` is passed here bare and never wrapped in a region of its own — a
   * second region inside this one is a second positioned ancestor, and the
   * overlay would size to it instead of to the content. `HobRegion` used
   * directly is still the right thing where there is no shell, which is what the
   * gallery's specimens do.
   *
   * A panel is inline simply by taking part in the row, or an overlay by
   * positioning against it — and the shell carries no chat state, no shortcut
   * and no breakpoint of its own. `useHobPanel` owns all three.
   */
  readonly onAskHob?: () => void;
  readonly panel?: ReactNode;
  /**
   * Offer the role switch here.
   *
   * **The screen decides, because the shell cannot know.** Whether there is a
   * player side at all is a fact about this account's memberships, and only a
   * screen that has read `GET /me/campaigns` holds it — the same reason the
   * shell is handed `context` rather than reaching for a campaign's name.
   *
   * So the two campaign lists pass it and nothing else does, which is also the
   * honest place for it: the DM's list offers it only once a `player`
   * membership exists (an account that is a DM everywhere and a player nowhere
   * — which is every account that predates the invitation — is not offered a
   * mode it has nothing in), and the player's list offers it unconditionally,
   * because that is the way back.
   *
   * Inside a campaign there is no switch, and that is not an omission. Role is
   * a fact about a pair, so on a table you are already at the question is
   * settled by the table; a pill there could only be inert or wrong, and the
   * nav's own first item is the way out of the mode.
   */
  readonly roleSwitch?: boolean;
  /**
   * Give the body the viewport's height instead of letting the page scroll.
   *
   * The prep screens scroll: they are a document, and the top bar is sticky
   * over it. The runner does not — it is one screenful with an initiative list
   * that scrolls *inside* a panel while the stat block stays put beside it, and
   * a DM who has to scroll to see whose turn it is has the wrong tool. That
   * needs a bounded height all the way down, which is what this swaps in: the
   * column stops scrolling, and `main` becomes a `min-h-0` flex child so its
   * own children can be told how tall they are.
   */
  readonly fill?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-page">
      <TopNav route={route} context={context} onAskHob={onAskHob} roleSwitch={roleSwitch} />
      <HobRegion>
        <div
          className={`relative flex min-w-0 flex-1 flex-col ${fill ? "overflow-hidden" : "overflow-auto"}`}
        >
          {topBar}
          {/* `@container`, so a screen's layout turns over on the width of the
              column it actually has. Every `fixed` overlay in the product is
              portalled to the body, so the containing block this establishes
              catches nothing. */}
          <main
            className={
              fill
                ? "@container flex min-h-0 flex-1 flex-col px-page-sm py-gutter sm:px-page"
                : "@container flex-1 px-page-sm py-page sm:px-page"
            }
          >
            {children}
          </main>
        </div>
        {panel}
      </HobRegion>
    </div>
  );
}
