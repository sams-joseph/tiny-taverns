import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { CampaignId, CampaignRelation } from "@taverns/api";
import { Button, cn, Icon, tabsTriggerVariants, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { SignInSurface } from "../auth/SignInSurface";
import { HobRegion } from "../hob/HobDock";
import { useCampaignId, useCampaignRelation, useSection, type Section } from "./location";

/**
 * The fixed shell: **two nav rows**, a per-screen bar under them, a scrolling
 * body.
 *
 * This is `ui_kits/dm-screen/AppShell.jsx` built out of the shipped components
 * and the theme's names — the prototype's inline styles and hand-rolled hover
 * state are the visual specification, not code to carry across.
 *
 * ### Navigation has two tiers, and the rule is the shape rather than a habit
 *
 * The sixth delivery states it in its own header comment: *the thin top row is
 * everything ABOVE a campaign (your campaign list, the shared monster library,
 * your account); the second row exists only inside a campaign, is titled with
 * the campaign name — which is also the way home — and holds the
 * campaign-scoped screens. Nothing appears on both rows.*
 *
 * That last clause is not enforced by keeping two lists disjoint by hand. There
 * is **one** `Section` for the whole bar (`shell/location.ts`) and both rows ask
 * the same question of it, so "inside a campaign" and "no global item is lit"
 * are the same fact rather than two that could disagree. It is the delivery's
 * own mechanism — its `GlobalItem` is `active={screen === n.id}` and the
 * campaign screens appear in no global list.
 *
 * **The campaign's name is the way home**, so the second row's title is a link
 * to the campaign index with the delivery's back-chevron beside it. The shell
 * builds that link itself from the route — it knows the id — and takes only the
 * name, which is data no router can supply. That replaced a `NavContext` every
 * campaign screen passed a hand-built `link` to: seven call sites, seven
 * chances to point the way home at the wrong route.
 *
 * **The 260px rail is gone, and the width it took is still the point.** The
 * second delivery replaced it with one 56px row and gave the content the 260px
 * back; the sixth splits that row in two (44px + 46px) without taking any width
 * away, because both rows are horizontal. So the screens under this still
 * measure themselves against the column they have rather than against the
 * viewport: `main` is a `@container`, and so is each nav row — the question a
 * row asks is whether *it* fits its own contents, which the window does not
 * answer.
 *
 * Each screen composes this itself and supplies its own top bar, rather than
 * the shell reaching down for a title it would have to be told about anyway.
 */

interface NavItem {
  readonly label: string;
  /**
   * The glyph, on the global row only.
   *
   * The campaign row draws labels and nothing else — `CampItem` in the delivery
   * renders `{item.label}` and no icon, and `CAMP_DM`/`CAMP_PLAYER` carry no
   * `icon` key to render. That is not only the drawing: six labelled items plus
   * a name, a badge and *Start session* is the widest thing in this bar, and the
   * icons were the part of it carrying no information the label did not.
   */
  readonly icon?: IconName;
  /**
   * Where it goes, and **which section it is**, as one thing.
   *
   * `link` is `LinkProps` rather than a hand-built href, so a nav item pointing
   * at a route that does not exist — or one whose params it forgot — fails to
   * compile. That is most of what moving to a real router buys, and the nav is
   * where it matters: the items are built from a route that may or may not name
   * a campaign, which is exactly the shape a string template gets wrong.
   */
  readonly link: LinkProps;
  readonly section: Section;
}

/**
 * The global row: everything that is above any campaign, and the same four
 * items for every account — there is no mode left to branch on.
 *
 * `Groups` leads: the group is the top-level container for connected play, and
 * a campaign is reached through the group that holds it. `Characters` is
 * account-owned and campaign-scoped nowhere — `GET /me/characters` is the one
 * read on `character` with no campaign in its path. `Library` is the
 * account-owned originals (monsters, rules, spells, equipment, magic items),
 * in no campaign, so it genuinely belongs above one; every account has a
 * Library, so there is no relation to gate it on.
 */
const globalNav: ReadonlyArray<NavItem> = [
  // The group is home: the container your people, campaigns and shared
  // history live in. `layers`, the glyph the campaign list wore.
  { label: "Groups", icon: "layers", link: { to: "/groups" }, section: "groups" },
  // Account-owned and campaign-scoped nowhere: `GET /me/characters` is the one
  // read on `character` with no campaign in its path.
  { label: "Characters", icon: "user", link: { to: "/characters" }, section: "characters" },
  // `footprints`, as the delivery names it — the same glyph the bestiary's own
  // empty state wears, which is what makes the two read as one corpus.
  { label: "Library", icon: "footprints", link: { to: "/library" }, section: "library" },
  { label: "Components", icon: "panel-left", link: { to: "/gallery" }, section: "gallery" },
];

/**
 * The campaign row: the screens inside one table, derived from **what this
 * account is at it** rather than from a global mode.
 *
 * The creator gets the full row — every campaign-scoped screen that exists.
 * A player gets the three screens whose player projections exist: the campaign's
 * Overview (the participant projection the same URL renders them), Table (the
 * narrow live-fight projection), and Chronicle (whose screen reads
 * `recap.readAsPlayer` for them). *Party* and *Encounters* stay off the
 * player's row because their reads are behind the creator gate or answer
 * creator-only content — a control that exists and then
 * errors is worse than one that is absent. The corpora are on nobody's row:
 * since the instancing decision of 2026-09-02 a campaign has no corpus screens
 * at all — the Library is where creatures, rules, spells, equipment, magic
 * items and the compendium live, and a campaign only ever *uses* them through
 * encounters, fights and the create form.
 *
 * While the relation is still unknown — the membership read settling, or an
 * account that is no participant at all — the row draws no items: a flash of
 * creator controls at a player is chrome for somebody it does not belong to.
 */
const campaignNavFor = (
  relation: CampaignRelation | undefined,
  campaignId: CampaignId,
): ReadonlyArray<NavItem> => {
  if (relation === undefined) return [];
  if (relation === "player") {
    return [
      {
        label: "Overview",
        link: { to: "/campaigns/$campaignId", params: { campaignId } },
        section: "overview",
      },
      {
        label: "Table",
        link: { to: "/campaigns/$campaignId/table", params: { campaignId } },
        section: "table",
      },
      {
        label: "Chronicle",
        link: { to: "/campaigns/$campaignId/chronicle", params: { campaignId } },
        section: "chronicle",
      },
    ];
  }

  return [
    {
      label: "Overview",
      link: { to: "/campaigns/$campaignId", params: { campaignId } },
      section: "overview",
    },
    {
      label: "Encounters",
      link: { to: "/campaigns/$campaignId/encounters", params: { campaignId } },
      section: "encounters",
    },
    {
      label: "Party",
      link: { to: "/campaigns/$campaignId/party", params: { campaignId } },
      section: "party",
    },
    {
      label: "Notes",
      link: { to: "/campaigns/$campaignId/notes", params: { campaignId } },
      section: "notes",
    },
    {
      label: "Chronicle",
      link: { to: "/campaigns/$campaignId/chronicle", params: { campaignId } },
      section: "chronicle",
    },
  ];
};

/**
 * The props both rows' items share — everything except how they are dressed.
 *
 * **The active state is `item.section`, not `Link`'s own `activeProps`**, and
 * that is deliberate: a nav item is lit for a whole *part of the app* — a fight
 * lights its campaign's Overview, a character sheet lights Characters — which is
 * a broader question than whether this exact URL is the current one.
 * `data-active` rather than a hand-rolled class: it is the attribute Base UI's
 * own tab sets, and the same one the campaign row's recipe keys on.
 *
 * `Link` renders a real `<a href="#/…">`, so a section is still middle-clickable
 * and copyable — the property the hand-built anchors were here for, and it
 * survives because the href is what the router builds rather than what a
 * template guessed.
 */
const navLinkProps = (active: boolean) =>
  ({
    // **`Link` marks itself active on a prefix by default, and this bar's
    // question is not that one.** `item.section` answers the broader one above;
    // `Link` would additionally light *Characters* while a sheet is open, because
    // `/characters` is a prefix of the URL, and *Overview* on every screen inside
    // a campaign, because the campaign index is a prefix of all of them. `exact`
    // narrows its notion of active to "this is the page", which is always a case
    // `item.section` also calls active, so the two agree instead of fighting.
    // That matters because `Link` spreads its own `aria-current="page"` **after**
    // everything else and there is no way to turn that off; `activeProps={{}}`
    // only stops it appending a stray `active` class to the recipe's.
    activeOptions: { exact: true },
    activeProps: {},
    "aria-current": active ? ("page" as const) : undefined,
    "data-active": active ? "" : undefined,
  }) satisfies Partial<LinkProps> & Record<string, unknown>;

/**
 * A global-row item: a pill, not an underline.
 *
 * The delivery gives the two rows deliberately different recipes, and the
 * difference is the information: an underline says *which part of this campaign
 * you are reading*, and the row above it is not about a campaign at all. Drawn
 * the same way, the bar would read as ten peers of one kind rather than two
 * tiers — which is the whole thing the split was for.
 *
 * So this one is `GlobalItem`'s 26px pill, and it is written out rather than
 * pulled from a variant in `@taverns/ui`: it is this bar's own recipe and has no
 * second call site, unlike the underline, which is `Tabs`' and must not be
 * copied.
 */
function GlobalNavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Link
      {...item.link}
      {...navLinkProps(active)}
      className={cn(
        "flex h-6.5 shrink-0 items-center gap-1.75 rounded-pill border px-2.5",
        "text-caption leading-none font-medium whitespace-nowrap transition-control",
        active
          ? "border-hairline bg-surface-sunken text-heading"
          : "border-transparent text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
      )}
    >
      {item.icon !== undefined && (
        <Icon name={item.icon} size={13} className={active ? "text-accent-ink" : undefined} />
      )}
      {item.label}
    </Link>
  );
}

/**
 * A campaign-row item, wearing `Tabs`' own recipe.
 *
 * The delivery asks for this in as many words — `CampItem`'s comment is
 * *"campaign row items carry the 2px accent underline the system uses for
 * Tabs"* — and `tabsTriggerVariants` is that recipe, exported from `@taverns/ui`
 * for exactly this. Reproducing the class list here would be a second copy to
 * keep in step with the designers, and the whole point of the shared recipe is
 * that a tab strip inside a screen and the row above it move together.
 *
 * Label only: see `NavItem.icon`.
 */
function CampaignNavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Link
      {...item.link}
      {...navLinkProps(active)}
      // `h-auto self-stretch` so the item reaches the full 46px of the row
      // rather than keeping the tab strip's 36px, which is what lands the
      // underline on the header's own hairline (with the recipe's `-mb-px`).
      // `px-3.25` is `CampItem`'s 13px.
      className={cn(tabsTriggerVariants(), "h-auto self-stretch px-3.25")}
    >
      {item.label}
    </Link>
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
      {/* The hint, not the shortcut — ⌘K is `useHobPanel`'s and works whether
          or not this chip is drawn. So on a bar with no room to spare it goes
          the way the wordmark does, and the button keeps its words. */}
      <kbd className="hidden rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-micro leading-snug font-medium text-faint @5xl:inline-block">
        &#8984;K
      </kbd>
    </Button>
  );
}

/**
 * The app's own bar: where you are in the product, and who you are.
 *
 * Not sticky and not on the layering scale — it is a flex row *above* the
 * scrolling column rather than something floating over it, so it never
 * overlaps anything and never has to win.
 *
 * **There is no role switch.** The group architecture removed the premise: the
 * relation is per campaign (`useCampaignRelation`), so the campaign row and
 * the *Ask Hob* button derive themselves from what this account is at the
 * table the route names, and the same URL renders creator chrome to its
 * creator and participant chrome to a player. Nothing global is left for a
 * toggle to say.
 *
 * **Where you are is read from the router, not handed down.** There is no
 * `route` prop to pass and none to get wrong; see `shell/location.ts`.
 */
/**
 * *Ask Hob* with the relation applied — a component of its own so the
 * membership read happens only when the route names a campaign. At a table
 * this account merely plays at the button is absent rather than present and
 * failing: the docked panel's verbs are the creator's.
 */
function AskHobSlot({
  campaignId,
  onAskHob,
}: {
  readonly campaignId: CampaignId;
  readonly onAskHob?: () => void;
}) {
  const relation = useCampaignRelation(campaignId);
  if (relation === "player") return null;
  return <AskHobButton onClick={onAskHob} />;
}

/**
 * The campaign row's items, relation-derived — rendered only inside a
 * campaign, which is what keeps the membership read off every other screen.
 */
function CampaignRowNav({
  campaignId,
  section,
}: {
  readonly campaignId: CampaignId;
  readonly section: Section;
}) {
  const relation = useCampaignRelation(campaignId);
  return (
    <nav aria-label="This campaign" className="ml-2 flex items-stretch self-stretch">
      {campaignNavFor(relation, campaignId).map((item) => (
        <CampaignNavLink key={item.label} item={item} active={item.section === section} />
      ))}
    </nav>
  );
}

function TopNav({
  campaignName,
  campaignBadge,
  campaignActions,
  onAskHob,
}: {
  readonly campaignName?: string;
  readonly campaignBadge?: ReactNode;
  readonly campaignActions?: ReactNode;
  readonly onAskHob?: () => void;
}) {
  const section = useSection();
  const campaignId = useCampaignId();

  return (
    <header className="shrink-0 border-b border-hairline bg-surface-card">
      {/* The global row. `@container` on the row rather than on the header,
          because each row runs out of space at its own width and the question
          is always whether *this* row fits — which the window does not answer
          (a narrow window with a short nav has room to spare). Same rule as
          `main`'s `@container`. */}
      <div
        className={cn(
          "@container flex h-11 items-center gap-4 px-page-sm sm:px-page",
          campaignId !== undefined && "border-b border-hairline",
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          <img src={markUrl} alt="" aria-hidden="true" width={22} height={22} className="block" />
          {/* The one thing on this row that is decoration rather than a control,
              so it is the one that gives way when it runs out of room. The mark
              stays, so the corner still says where you are.

              The threshold is lower than it was: splitting the bar took the
              campaign's name, its badge and five nav items off this row, so what
              is left fits a long way further down. Re-derived in a browser
              rather than inherited — see this file's own note is not enough,
              the numbers are in the commit. */}
          <span className="hidden font-display text-subtitle leading-tight font-semibold tracking-display whitespace-nowrap text-heading @2xl:inline">
            Tiny Taverns
          </span>
        </div>

        <nav aria-label="Sections" className="flex items-center gap-1">
          {globalNav.map((item) => (
            <GlobalNavLink key={item.label} item={item} active={item.section === section} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* There is no role switch beside this any more: the relation is a
              fact about the pair (this account, this campaign), read off the
              membership row per campaign inside `AskHobSlot`, and a global
              toggle was a second answer to a per-campaign question. Above any
              campaign the button is simply the bar the designers drew. */}
          {campaignId === undefined ? (
            <AskHobButton onClick={onAskHob} />
          ) : (
            <AskHobSlot campaignId={campaignId} onAskHob={onAskHob} />
          )}
          {/* Clerk's own components, unthemed on purpose — see SignInSurface.
              Renders nothing at all when no publishable key is configured, which
              is why the bar can carry it unconditionally. It moved here from the
              per-screen bar with the rail: it belongs to the app, not the page. */}
          <SignInSurface />
        </div>
      </div>

      {/* The campaign row — present exactly when the route names a campaign,
          which is the delivery's `inCampaign` read off the router instead of off
          a screen-id list. A screen cannot render it by mistake and cannot
          forget it either. */}
      {campaignId !== undefined && (
        <div className="@container flex h-11.5 items-center gap-3 px-page-sm sm:px-page">
          <CampaignHome campaignId={campaignId} name={campaignName} />
          {/* The badge is this row's decoration, so it is the second thing to
              give way — the campaign's own screens say which night it is in
              their subtitle, and a narrow bar has to keep its controls. */}
          <div className="hidden shrink-0 @2xl:block">{campaignBadge}</div>
          <CampaignRowNav campaignId={campaignId} section={section} />
          {campaignActions !== undefined && (
            <div className="ml-auto flex shrink-0 items-center gap-2">{campaignActions}</div>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * The campaign row's title, which is also the way home.
 *
 * The delivery draws a back-chevron and the campaign's name as one button
 * pointing at the campaign's own home screen, and that is the whole of what the
 * rail's footer used to do: from a fight, from the bestiary, from the Chronicle,
 * the name is the way back to prep.
 *
 * **The shell builds the link, and the screen supplies only the name.** Where it
 * goes is a fact about the route — the id is in the URL — so there is nothing
 * for a screen to get wrong. It replaced a `link` prop that seven screens each
 * passed by hand.
 *
 * The name is data no router can supply, so it is a prop; while it is still
 * loading the chevron is drawn on its own rather than under a placeholder, which
 * keeps the row's height from moving and says nothing untrue in the meantime.
 *
 * **The name is the first thing to give way on a narrow bar, and it gives way
 * whole.** Measured in Chromium: this row needs 986px with six items, a badge
 * and *Start session*, so below about 1024 something has to go — and left as a
 * plain shrinking flex item the name squeezed the *chevron* to zero width at
 * 760, taking the way home with it. So the name is `hidden` under the row's own
 * `@3xl`, where it truncates instead, and `min-w-4` is the chevron's own width
 * held as a floor. What is left below that is a back-chevron, which is a control
 * that says what it does without a label.
 */
function CampaignHome({
  campaignId,
  name,
}: {
  readonly campaignId: CampaignId;
  readonly name?: string;
}) {
  return (
    <Link
      to="/campaigns/$campaignId"
      params={{ campaignId }}
      // No `data-active`: this is the title, not an item, and the row's own
      // *Overview* is what lights when you are at it.
      activeProps={{}}
      title="Campaign home"
      aria-label={name === undefined ? "Campaign home" : `${name} — campaign home`}
      className="flex min-w-4 items-center gap-1.75 text-faint transition-control hover:text-muted-foreground"
    >
      <Icon name="chevron-left" size={15} className="shrink-0" />
      {name !== undefined && (
        // `truncate`, not `whitespace-nowrap`: this is the one part of the row
        // that is arbitrary length, so it is the one that gives way — and
        // `hidden` below `@3xl`, where there is no longer room to give.
        <span className="hidden min-w-0 truncate font-display text-label leading-none font-semibold tracking-display text-heading @3xl:block">
          {name}
        </span>
      )}
    </Link>
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
 *
 * ### Tabs get their own row, below the header — the captain's rule
 *
 * > If we ever have tabs in the app like we do in the library I want those to
 * > be on their own row below the header. And any actions we have that belong
 * > to that tab should be inside of the content of that tab and not on the
 * > same hierarchical level as the tabs themselves.
 *
 * So `tabs` is a distinct full-width row under the title row, inside the same
 * sticky header so the strip's underline lands on the header's own bottom
 * hairline (the recipe's `-mb-px`, the campaign row's mechanism). `children`
 * stays for things that are genuinely header-level — a tab-scoped action does
 * not belong here or on the tab row; it goes inside that tab's content, which
 * for the Library screens is `FilterBar`'s `actions` slot.
 */
export function TopBar({
  title,
  subtitle,
  tabs,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  /** A tab strip, on its own row below the title — never beside it. */
  readonly tabs?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-chrome border-b border-hairline bg-surface-card">
      {/* `flex-wrap` with a floor under the title: on a phone-width column the
          action cluster drops under the title rather than squeezing the subtitle
          into a one-word column beside three buttons. A `min-w-0` title would
          never wrap anything — it fits any line at zero width — so the floor is
          what makes the wrap reachable. Measured at 390 on the character sheet;
          at 760 and above no screen's bar wraps. */}
      <div className="flex flex-wrap items-center gap-gutter px-page-sm py-3.5 sm:px-page">
        <div className="min-w-48 flex-1">
          <h1 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="mt-1 text-body-s leading-body text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5">{children}</div>
      </div>
      {tabs !== undefined && (
        // `items-stretch` with no bottom padding: the strip's items reach the
        // header's hairline, exactly as the campaign row's do.
        <div className="flex h-10 items-stretch overflow-x-auto px-page-sm sm:px-page">{tabs}</div>
      )}
    </header>
  );
}

export function AppShell({
  campaignName,
  campaignBadge,
  campaignActions,
  topBar,
  onAskHob,
  panel,
  fill = false,
  children,
}: {
  /**
   * What this table is called — the campaign row's title, and the way home.
   *
   * The screen supplies it because the shell has no way to know it (the same
   * reason the screen supplies its own `topBar`), and **only** it: where the
   * title links to is a fact about the route, so the shell builds that itself.
   * A screen that names no campaign in its URL has no campaign row at all and
   * anything passed here is ignored, which is the shape rather than a rule.
   */
  readonly campaignName?: string;
  /** The session badge beside the name, when the screen has read one. */
  readonly campaignBadge?: ReactNode;
  /**
   * Pushed right on the campaign row — *Start session*, in the delivery.
   *
   * A screen's own top bar is still where the things you do *to what you are
   * looking at* go; this is for the one action that belongs to the whole
   * campaign and is drawn on the row that names it. Only DM screens supply one,
   * which is the delivery's `!player` guard held as a shape instead of a check.
   */
  readonly campaignActions?: ReactNode;
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
      <TopNav
        campaignName={campaignName}
        campaignBadge={campaignBadge}
        campaignActions={campaignActions}
        onAskHob={onAskHob}
      />
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
