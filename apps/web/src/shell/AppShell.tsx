import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { useAtomValue } from "@effect/atom-react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { CampaignId, CampaignRelation } from "@taverns/api";
import {
  BackLink,
  Badge,
  cn,
  Icon,
  Kbd,
  navPillVariants,
  tabsTriggerVariants,
  type IconName,
} from "@taverns/ui";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState, type ReactNode } from "react";
import { useApiAtom } from "../api/atoms";
import { SignInSurface } from "../auth/SignInSurface";
import { campaignAtom, campaignNightAtom } from "../campaign/load";
import { HobRegion } from "../hob/HobDock";
import {
  useCampaignId,
  useCampaignRelation,
  useCampaignSharedWorld,
  useSection,
  type Section,
} from "./location";
import { TopBarSlot } from "./slots";

/**
 * The shell: **two nav rows**, a per-screen bar under them, then the body.
 *
 * This is `ui_kits/dm-screen/AppShell.jsx` built out of the shipped components
 * and the theme's names — the prototype's inline styles and hand-rolled hover
 * state are the visual specification, not code to carry across.
 *
 * ### It is mounted once
 *
 * `shell/ShellLayout.tsx` is the only thing that renders it, as the component
 * of a pathless layout route, so the header, both rows, the bar's slot and the
 * Hob panel are the same nodes from one screen to the next. A screen reaches
 * into it at exactly one point: `TopBar`, which portals into the slot. Nothing
 * travels down from a screen as a prop, and nothing here is about a screen.
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
 * **The campaign row sources itself.** The way home is built from the route,
 * the name from `campaignAtom` and the creator's badge from `campaignNightAtom`.
 * A screen used to hand the row its name, badge and action, and the screens that
 * forgot drew a row missing them. The action has since moved off this row into
 * the per-screen bar (`shell/TopBar.tsx`) — where it sources itself the same
 * way, for the same reason.
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
 * ### Every row has a height, and the heights are written down here
 *
 *   44  the global row        `h-11`
 *   46  the campaign row      `h-11.5`
 *   76  the per-screen bar    `h-19`, in `@taverns/ui`'s `PageHeader`
 *   40  a screen's tab strip  `h-10`, in `@taverns/ui`'s `PageHeader`
 *
 * They are *fixed*, not minimums, and that is the whole of "sibling screens
 * line up": measured in Chromium at 1440, the bar was 61px on a screen with no
 * subtitle, 89 with one and 141 on the Cast at 760 where the action cluster
 * wrapped, so the content's top edge moved by 80px between tabs of the same
 * campaign. `PageHeader` reserves the subtitle line whether or not a screen has one
 * and the row does not wrap, so the number above is the number on every screen.
 *
 * ### Nothing here asks the window how wide it is
 *
 * The page edge is `px-page-sm` under `@3xl` of `@container/app` on the outer
 * frame, which is the same question a `sm:` breakpoint used to ask and is not
 * the same *kind* of question: everything else in the product turns over on the
 * width of the box it is in, and a shell with eight viewport breakpoints was the
 * one place that rule was written down and not followed. The frame is a
 * container so a row can ask about the app rather than about the screen behind
 * it, and `characters/` reaches for the same `/app` container to cancel this
 * padding with a negative margin — two spellings of one edge is how they drift.
 */

interface NavItem {
  readonly label: string;
  /**
   * The glyph, on the global row only.
   *
   * The campaign row draws labels and nothing else — `CampItem` in the delivery
   * renders `{item.label}` and no icon, and `CAMP_DM`/`CAMP_PLAYER` carry no
   * `icon` key to render. That is not only the drawing: six labelled items
   * beside a name and a badge is the widest thing in this bar, and the icons
   * were the part of it carrying no information the label did not.
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
 * `Campaigns` leads: the table is the primary thing somebody came here to
 * create or join. `Characters` is
 * account-owned and campaign-scoped nowhere — `GET /me/characters` is the one
 * read on `character` with no campaign in its path. `Library` is the
 * account-owned originals (monsters, rules, spells, equipment, magic items),
 * in no campaign, so it genuinely belongs above one; every account has a
 * Library, so there is no relation to gate it on.
 */
const globalNav: ReadonlyArray<NavItem> = [
  { label: "Campaigns", icon: "layers", link: { to: "/campaigns" }, section: "campaigns" },
  // Account-owned and campaign-scoped nowhere: `GET /me/characters` is the one
  // read on `character` with no campaign in its path.
  { label: "Characters", icon: "user", link: { to: "/characters" }, section: "characters" },
  // `footprints`, as the delivery names it — the same glyph the bestiary's own
  // empty state wears, which is what makes the two read as one corpus.
  { label: "Library", icon: "footprints", link: { to: "/library" }, section: "library" },
];

// The gallery is a tool for building the product, not a peer of Campaigns, so
// it is on the row only in a dev build. Read at render so a test can stub it.
const galleryNav: NavItem = {
  label: "Components",
  icon: "panel-left",
  link: { to: "/gallery" },
  section: "gallery",
};
const globalNavItems = (): ReadonlyArray<NavItem> =>
  import.meta.env.DEV ? [...globalNav, galleryNav] : globalNav;

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
      label: "Cast",
      link: { to: "/campaigns/$campaignId/cast", params: { campaignId } },
      section: "cast",
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
 * The global row's control — `navPillVariants`, the row's one recipe, which
 * `@taverns/ui` keeps beside the campaign row's underline. *Ask Hob* wears the
 * same one, because the alternative was what shipped: the four nav items at
 * 26px and *Ask Hob* wearing `Button size="sm"` at 32, measured, on a 44px row.
 */
function GlobalNavLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Link
      {...item.link}
      {...navLinkProps(active)}
      className={navPillVariants({ state: active ? "here" : "idle" })}
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
 * *Ask Hob*, part of the specified layout — and a pill, like everything else on
 * this row.
 *
 * The panel it opens is built elsewhere; this is the shell's half of the seam.
 * With no `onAskHob` handed down it still renders — it is the bar the designers
 * drew — and does nothing.
 *
 * **The open state is on the button.** `AppShell.jsx` draws it and the product
 * did not: a panel that ⌘K had toggled shut left the control looking exactly as
 * it did with the panel up, so the one control that has a state said nothing
 * about it. `aria-pressed` alongside the fill, because the colour is not the
 * announcement.
 */
function AskHobButton({
  open,
  onClick,
}: {
  readonly open: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onClick}
      className={cn(navPillVariants({ state: open ? "on" : "quiet" }), "cursor-pointer")}
    >
      <img src={markUrl} alt="" aria-hidden="true" width={16} height={16} className="rounded-xs" />
      Ask Hob
      {/* The hint, not the shortcut — ⌘K is `useHobPanel`'s and works whether
          or not this chip is drawn. So on a bar with no room to spare it goes
          the way the wordmark does, and the button keeps its words. */}
      <Kbd className="hidden @5xl:inline-block">&#8984;K</Kbd>
    </button>
  );
}

/**
 * *Ask Hob* with the relation applied — a component of its own so the
 * membership read happens only when the route names a campaign. At a table
 * this account merely plays at the button is absent rather than present and
 * failing: the docked panel's verbs are the creator's.
 */
function AskHobSlot({
  campaignId,
  open,
  onAskHob,
}: {
  readonly campaignId: CampaignId;
  readonly open: boolean;
  readonly onAskHob?: () => void;
}) {
  const relation = useCampaignRelation(campaignId);
  if (relation === "player") return null;
  return <AskHobButton open={open} onClick={onAskHob} />;
}

/** The route back out to this table's cross-campaign context, when explicit. */
function CampaignSharedWorldLink({ campaignId }: { readonly campaignId: CampaignId }) {
  const world = useCampaignSharedWorld(campaignId);
  if (world === undefined || world === null) return null;

  return (
    <Link
      to="/worlds/$worldId"
      params={{ worldId: world.id }}
      activeProps={{}}
      title={`${world.name} — Shared World`}
      aria-label={`${world.name} — Shared World`}
      className={cn(
        "flex min-w-6 shrink-0 items-center gap-1.5 rounded-control px-1.5 py-1",
        "text-caption leading-none font-medium whitespace-nowrap text-muted-foreground",
        "transition-control hover:bg-surface-sunken hover:text-foreground",
      )}
    >
      <Icon name="map" size={14} className="shrink-0 text-accent-ink" />
      {/* Below `@5xl` the chip is its glyph and nothing else — the first of the
          campaign row's three deliberate collapses, and the one that costs the
          least: the icon is still the way to the world and still says there is
          one. See `CampaignRow`. */}
      <span className="hidden max-w-32 truncate @5xl:block">{world.name}</span>
    </Link>
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
 * Where it goes is a fact about the route and the name is `campaignAtom`'s, so
 * there is nothing for a screen to get wrong. While the name is still loading
 * the chevron is drawn on its own rather than under a placeholder, which keeps
 * the row's height from moving and says nothing untrue in the meantime.
 *
 * **The name is the one elastic thing in the row, so it is the one that gives
 * way.** Inside the fixed title cell it truncates; below the row's own `@3xl` it
 * is `hidden` outright, because left as a plain shrinking flex item it squeezed
 * the *chevron* to zero width at 760 and took the way home with it. `min-w-4` is
 * the chevron's own width held as a floor. What is left below that is a
 * back-chevron, which is a control that says what it does without a label.
 */
function CampaignHome({ campaignId }: { readonly campaignId: CampaignId }) {
  const [campaign] = useApiAtom(campaignAtom(campaignId));
  const name = campaign.state === "ready" ? campaign.value.name : undefined;

  return (
    <BackLink
      // No `data-active`: this is the title, not an item, and the row's own
      // *Overview* is what lights when you are at it.
      render={<Link to="/campaigns/$campaignId" params={{ campaignId }} activeProps={{}} />}
      title="Campaign home"
      aria-label={name === undefined ? "Campaign home" : `${name} — campaign home`}
      // `shrink` undoes the idiom's `shrink-0`: here the name inside is the
      // row's one elastic thing, and `min-w-4` keeps the chevron as its floor.
      className="shrink gap-1.75 text-faint hover:text-muted-foreground"
    >
      {name !== undefined && (
        // `truncate`, not `whitespace-nowrap`: this is the one part of the row
        // that is arbitrary length, so it is the one that gives way — and
        // `hidden` below `@3xl`, where there is no longer room to give.
        <span className="hidden min-w-0 truncate font-display text-label leading-none font-semibold tracking-display text-heading @3xl:block">
          {name}
        </span>
      )}
    </BackLink>
  );
}

/**
 * The night the campaign is preparing, beside its name — the creator's only.
 *
 * The badge is this row's decoration, so it is the row's second collapse and it
 * goes at the same width the chip's label does: the campaign's own screens say
 * which night it is in their subtitle, and a narrow bar has to keep its
 * controls. A player's row has none because a player's session read is
 * visibility-gated and a badge that appears for some nights and not others says
 * something it does not mean to.
 */
function SessionBadge({ campaignId }: { readonly campaignId: CampaignId }) {
  const night = useAtomValue(campaignNightAtom(campaignId));
  const session = AsyncResult.isSuccess(night) ? night.value.session : undefined;
  if (session === undefined) return null;

  return (
    <div className="hidden shrink-0 @5xl:block">
      <Badge variant="secondary">Session {session.number}</Badge>
    </div>
  );
}

/**
 * The campaign row — present exactly when the route names a campaign, which is
 * the delivery's `inCampaign` read off the router instead of off a screen-id
 * list. A screen cannot render it by mistake and cannot forget it either.
 *
 * ### The tabs are anchored to a column, not to wherever the name ended
 *
 * The name, the world chip and the night badge share **one cell of fixed
 * width**, so the first tab starts at the same x whatever the campaign is
 * called. Measured at 1440 it did not: the first tab sat at 428 for a campaign
 * named *The Hollow Crown* and would sit anywhere else for a campaign named
 * anything else, which is what made the row read as five things floating rather
 * than two columns. `w-96` is the widest the cell's own contents get — 375px
 * measured, with the chip's label at its `max-w-32` ceiling and a three-digit
 * session — rounded up onto the scale; past that the name truncates, which is
 * the one thing in here that is arbitrary length.
 *
 * ### Below `@5xl` it collapses, in a stated order
 *
 * The cell is fixed only while there is room for it. Under 1024 the chip drops
 * to its icon, the badge goes, and the cell becomes as wide as what is left —
 * the row's width is needed by the tabs, which are the controls. The row is not
 * a scroller: the action that once pushed those links past the edge now belongs
 * to the per-screen bar (`shell/TopBar.tsx`). Future overflow here is a layout
 * defect to solve, not another scrolling surface inside the page.
 */
function CampaignRow({
  campaignId,
  section,
}: {
  readonly campaignId: CampaignId;
  readonly section: Section;
}) {
  const relation = useCampaignRelation(campaignId);

  return (
    // The `@container` is the bare row and the padding is on the box inside it,
    // because a container query resolves against the container's **content
    // box**: with `px-page` on the container itself, `@5xl` meant 1024 *plus the
    // 64px of page edge*, so the row collapsed at 1024 — measured — where the
    // decision says it should not have. Same shape as the global row above.
    <div className="@container">
      <div className="flex h-11.5 items-center px-page-sm @3xl/app:px-page">
        <div className="flex min-w-0 items-center gap-3 @5xl:w-96 @5xl:shrink-0">
          <CampaignHome campaignId={campaignId} />
          <CampaignSharedWorldLink campaignId={campaignId} />
          {relation === "creator" && <SessionBadge campaignId={campaignId} />}
        </div>
        <nav aria-label="This campaign" className="ml-2 flex min-w-0 items-stretch self-stretch">
          {campaignNavFor(relation, campaignId).map((item) => (
            <CampaignNavLink key={item.label} item={item} active={item.section === section} />
          ))}
        </nav>
      </div>
    </div>
  );
}

/**
 * The app's own bar: where you are in the product, and who you are.
 *
 * This component does not position itself. `AppShell` places it in the one
 * sticky chrome stack with the per-screen bar, so the rows stay pinned without
 * separately maintained `top` offsets.
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
function TopNav({
  hobOpen,
  onAskHob,
}: {
  readonly hobOpen: boolean;
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
          `main`'s `@container`. The page edge is the one question that is not
          the row's, so it asks `@container/app` — see this file's header.

          The container is the bare row and the padding is a box inside it: a
          container query resolves against the container's *content* box, so
          with the page edge on the container itself every threshold in here
          silently meant "that, plus 64px". */}
      <div className="@container">
        <div
          className={cn(
            // The hairline is on the sized box, not the container: `h-11` is a
            // border-box 44, so a border on a wrapper outside it would make the
            // row 45 and put every row below it a pixel out.
            "flex h-11 items-center gap-4 px-page-sm @3xl/app:px-page",
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
            {globalNavItems().map((item) => (
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
              <AskHobButton open={hobOpen} onClick={onAskHob} />
            ) : (
              <AskHobSlot campaignId={campaignId} open={hobOpen} onAskHob={onAskHob} />
            )}
            {/* Clerk's own components, unthemed on purpose — see SignInSurface.
              Renders nothing at all when no publishable key is configured, which
              is why the bar can carry it unconditionally. It moved here from the
              per-screen bar with the rail: it belongs to the app, not the page. */}
            <SignInSurface />
          </div>
        </div>
      </div>

      {campaignId !== undefined && <CampaignRow campaignId={campaignId} section={section} />}
    </header>
  );
}

export function AppShell({
  hobOpen,
  onAskHob,
  panel,
  fill,
  children,
}: {
  /**
   * Whether the panel is up, for the one control on the bar that has a state.
   *
   * It is `useHobPanel`'s `open` rather than anything this file holds: ⌘K and
   * Esc reach the same value, so a button drawing its own idea of open would be
   * wrong the first time somebody used the keyboard.
   */
  readonly hobOpen: boolean;
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
  readonly onAskHob: (() => void) | undefined;
  readonly panel: ReactNode;
  /**
   * Give the body the viewport's remaining height instead of letting the
   * document scroll.
   *
   * The prep screens scroll: they are a document, and the top bar is sticky
   * over it. The runner does not — it is one screenful with an initiative list
   * that scrolls *inside* a panel while the stat block stays put beside it, and
   * a DM who has to scroll to see whose turn it is has the wrong tool. That
   * needs a bounded height all the way down, which is what this swaps in: the
   * column stops scrolling, and `main` becomes a `min-h-0` flex child so its
   * own children can be told how tall they are. Declared by the route, as
   * `staticData.fill`.
   */
  readonly fill: boolean;
  readonly children: ReactNode;
}) {
  /** The bar's slot, published to the screen below once it has mounted. */
  const [bar, setBar] = useState<HTMLDivElement | null>(null);

  return (
    // `@container/app`, named, and it is the only container anything asks about
    // by name: it is the app's own frame, so it is what "how wide is the page
    // edge" means. The rows and `main` below each keep an unnamed `@container`
    // of their own for the questions that really are about their own width.
    <div
      className={`@container/app flex flex-col bg-surface-page ${
        fill ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      {/* One sticky stack, so the global row, campaign row, screen bar and its
          optional tabs pin as a unit. Keeping the slot here also means none of
          those rows needs its own scroll container or a calculated top offset. */}
      <div className="sticky top-0 z-chrome shrink-0">
        <TopNav hobOpen={hobOpen} onAskHob={onAskHob} />
        <div ref={setBar} />
      </div>
      <HobRegion bounded={fill}>
        <div
          className={`relative flex min-w-0 flex-1 flex-col ${fill ? "overflow-hidden" : "overflow-visible"}`}
        >
          {/* `@container`, so a screen's layout turns over on the width of the
              column it actually has. Every `fixed` overlay in the product is
              portalled to the body, so the containing block this establishes
              catches nothing. */}
          <main
            className={
              fill
                ? "@container flex min-h-0 flex-1 flex-col px-page-sm py-gutter @3xl/app:px-page"
                : "@container flex-1 px-page-sm py-page @3xl/app:px-page"
            }
          >
            <TopBarSlot.Provider value={bar}>{children}</TopBarSlot.Provider>
          </main>
        </div>
        {panel}
      </HobRegion>
    </div>
  );
}
