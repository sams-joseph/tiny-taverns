import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { useAtomValue } from "@effect/atom-react";
import { Link, useMatchRoute, useParams, type LinkProps } from "@tanstack/react-router";
import type { CampaignId, CampaignRelation } from "@taverns/api";
import {
  BackLink,
  Badge,
  Button,
  cn,
  Icon,
  Kbd,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuHero,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navPillVariants,
  type IconName,
} from "@taverns/ui";
import { AsyncResult } from "effect/unstable/reactivity";
import campaignsHero1x from "./heroes/campaigns-448.webp";
import campaignsHero2x from "./heroes/campaigns-768.webp";
import libraryHero1x from "./heroes/library-448.webp";
import libraryHero2x from "./heroes/library-768.webp";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useApiAtom } from "../api/atoms";
import { SignInSurface } from "../auth/SignInSurface";
import { useCampaignAct } from "../campaign/act";
import { campaignAtom, campaignNightAtom } from "../campaign/load";
import { HobFrame, HobRegion } from "../hob/HobDock";
import { SHELVES, useActiveShelf } from "../library/shelves";
import {
  useCampaignId,
  useCampaignRelation,
  useCampaignSharedWorld,
  useSection,
  type Section,
} from "./location";
import { TopBarSlot } from "./slots";
import { TabRow, type Collapse } from "./TabRow";

/**
 * The shell: **two nav rows**, a per-screen bar under them above any campaign,
 * then the body — and, when it is docked, the Hob panel beside all of it, full
 * height.
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
 * into it at exactly one point: `TopBar`, which portals into the slot — and,
 * inside a campaign, where there is no per-screen bar, draws the same header at
 * the top of the screen's content instead. Nothing travels down from a screen
 * as a prop, and nothing here is about a screen.
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
 * the name from `campaignAtom`, and the creator's badge and the campaign's own
 * press from `campaignNightAtom`. A screen used to hand the row its name, badge
 * and action, and the screens that forgot drew a row missing them.
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
 * Inside a campaign the chrome is the first two rows and nothing else — 90px on
 * every tab at every width — because there is no per-screen bar there: the
 * screen's header is the top of its content (see `TopBar`).
 *
 * ### Nothing here asks the window how wide it is
 *
 * The page edge is `px-page-sm` under `@3xl` of `@container/app` on the shell's
 * column, which is the same question a `sm:` breakpoint used to ask and is not
 * the same *kind* of question: everything else in the product turns over on the
 * width of the box it is in, and a shell with eight viewport breakpoints was the
 * one place that rule was written down and not followed. The column is a
 * container so a row can ask about the app rather than about the screen behind
 * it, and `characters/` reaches for the same `/app` container to cancel this
 * padding with a negative margin — two spellings of one edge is how they drift.
 */

interface NavItem {
  readonly label: string;
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
  /**
   * The campaign row's width below which this item waits in the row's *More*
   * menu instead — see `CampaignRow` for the order.
   */
  readonly collapse?: Collapse;
}

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
      collapse: "lg",
    },
    {
      label: "Notes",
      link: { to: "/campaigns/$campaignId/notes", params: { campaignId } },
      section: "notes",
      collapse: "lg",
    },
    {
      label: "Cast",
      link: { to: "/campaigns/$campaignId/cast", params: { campaignId } },
      section: "cast",
      collapse: "xl",
    },
    {
      label: "Chronicle",
      link: { to: "/campaigns/$campaignId/chronicle", params: { campaignId } },
      section: "chronicle",
      collapse: "xl",
    },
  ];
};

/** One destination in a global item's panel. */
interface GlobalEntry {
  readonly label: string;
  /** One line under the label on what is there. */
  readonly description: string;
  readonly link: LinkProps;
  /** This is the page you are on (or the list the page you are on is in). */
  readonly current: boolean;
}

/**
 * The global row: everything that is above any campaign, the same three items
 * for every account — there is no mode left to branch on — built on
 * `@taverns/ui`'s `NavigationMenu`.
 *
 * 1. **Campaigns** leads, and opens onto *Campaigns* and *Shared Worlds*: the
 *    table is the primary thing somebody came here to create or join, and a
 *    Shared World is the thing several tables connect to, so the two are one
 *    part of the app. A world's own screen lights this item.
 * 2. **Library** opens onto every shelf, from `library/shelves.ts` — the same
 *    list the Library's own tab row draws, so the two cannot disagree. It is
 *    the account-owned originals, in no campaign, so it genuinely belongs
 *    above one; every account has a Library, so there is nothing to gate it on.
 * 3. **Characters** is a plain link. It is account-owned and campaign-scoped
 *    nowhere — `GET /me/characters` is the one read on `character` with no
 *    campaign in its path — and it has no second page to list.
 *
 * ### A trigger is a button, and its page is the panel's first link
 *
 * The two items with panels are disclosure buttons, as shadcn's and Base UI's
 * are, not links that also open a menu: a control that navigates on a click
 * and discloses on a keypress cannot tell a screen reader which it is. The
 * pages stay one pointer click away because a panel opens on hover — the
 * click is on the link under it — and a keyboard reaches the first link with
 * Enter then Tab, or ArrowDown.
 *
 * ### What is lit
 *
 * An item is lit by `section` rather than by `Link`'s own notion of active: a
 * nav item is lit for a whole *part of the app* — a character sheet lights
 * Characters — which is broader than whether this URL is the current one. The
 * panel's own link for the page you are on carries `aria-current="page"`.
 * Inside a campaign nothing on this row is lit, because the campaign row says
 * where you are (see this file's header).
 *
 * Below the row's `@2xl` each item is its icon: the label is for screen readers
 * and the tooltip only — the row's second collapse, after the wordmark, and the
 * one that lets it fit a phone. A trigger keeps its chevron, which is what says
 * it opens something.
 */
function GlobalNav({ section }: { readonly section: Section }) {
  const matchRoute = useMatchRoute();
  const shelf = useActiveShelf();
  const onWorlds = matchRoute({ to: "/worlds", fuzzy: true }) !== false;

  const campaigns: ReadonlyArray<GlobalEntry> = [
    {
      label: "Campaigns",
      description: "Your tables: sessions, encounters, notes and the party",
      link: { to: "/campaigns" },
      current: matchRoute({ to: "/campaigns" }) !== false,
    },
    {
      label: "Shared Worlds",
      description: "Settings several campaigns share, with one chronicle",
      link: { to: "/worlds" },
      current: onWorlds,
    },
  ];
  const library: ReadonlyArray<GlobalEntry> = SHELVES.map((entry) => ({
    label: entry.label,
    description: entry.description,
    link: { to: entry.to },
    current: entry.to === shelf,
  }));

  return (
    <NavigationMenu aria-label="Sections">
      <NavigationMenuList>
        <GlobalPanel
          label="Campaigns"
          icon="layers"
          active={section === "campaigns"}
          hero={{
            image: [campaignsHero1x, campaignsHero2x],
            tagline: "Prep the night, run it live, keep the record",
          }}
          entries={campaigns}
        />
        {/* `footprints`, as the delivery names it — the same glyph the
            bestiary's own empty state wears, which is what makes the two read
            as one corpus. */}
        <GlobalPanel
          label="Library"
          icon="footprints"
          active={section === "library"}
          hero={{
            image: [libraryHero1x, libraryHero2x],
            tagline: "Your originals and the 2014 rules, outside any campaign",
          }}
          entries={library}
        />
        <NavigationMenuItem>
          <NavigationMenuLink
            variant="pill"
            active={section === "characters"}
            title="Characters"
            render={<Link to="/characters" activeOptions={{ exact: true }} activeProps={{}} />}
          >
            <GlobalLabel label="Characters" icon="user" active={section === "characters"} />
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

/**
 * A global item with a panel of destinations under it, and the panel's hero:
 * its picture, its name and one line about the part of the app it is.
 *
 * The picture is `heroes/`, made by `scripts/nav-heroes.mjs` at the hero's 1x
 * and 2x widths. The banner spans the panel, 28rem at most and the phone's
 * width below that, so `sizes` says both and the browser picks by density.
 */
function GlobalPanel({
  label,
  icon,
  active,
  hero,
  entries,
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly active: boolean;
  readonly hero: { readonly image: readonly [string, string]; readonly tagline: string };
  readonly entries: ReadonlyArray<GlobalEntry>;
}) {
  const [x1, x2] = hero.image;
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger active={active} title={label}>
        <GlobalLabel label={label} icon={icon} active={active} />
      </NavigationMenuTrigger>
      <NavigationMenuContent
        hero={
          <NavigationMenuHero
            src={x1}
            srcSet={`${x1} 448w, ${x2} 768w`}
            sizes="(min-width: 30rem) 28rem, 100vw"
            label={label}
          >
            {hero.tagline}
          </NavigationMenuHero>
        }
      >
        {entries.map((entry) => (
          <NavigationMenuLink
            key={entry.label}
            active={entry.current}
            description={entry.description}
            render={<Link {...entry.link} activeOptions={{ exact: true }} activeProps={{}} />}
          >
            {entry.label}
          </NavigationMenuLink>
        ))}
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

/** A global control's glyph and its label, which is screen-reader only below `@2xl`. */
function GlobalLabel({
  label,
  icon,
  active,
}: {
  readonly label: string;
  readonly icon: IconName;
  readonly active: boolean;
}) {
  return (
    <>
      <Icon name={icon} size={13} className={active ? "text-accent-ink" : undefined} />
      <span className="@max-2xl:sr-only">{label}</span>
    </>
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
 * way.** Inside the capped title group it truncates; below the row's own `@3xl` it
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
 * which night it is in their subtitle, and a narrow row has to keep its
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
 * The campaign's own press — *Start session*, *Start an encounter* or *Back to
 * the fight* — at the right end of the campaign row, on every one of its tabs.
 * The creator's only, which is the delivery's `!player` guard held as a shape
 * instead of a check: at a table this account merely plays at,
 * `campaignNightAtom` is visibility-gated and is never asked.
 *
 * **It sources itself from the route**, as the rest of the row does and for the
 * same reason: it was once a prop a screen passed, and the screens that forgot
 * drew chrome missing it (`campaign/campaignRow.test.tsx` is that bug's record).
 * `useCampaignAct` computes which of the three it is once; on the fight it
 * would send you back to, it is absent.
 *
 * **It is the screen's one peach primary**, on every campaign tab, so a tab's
 * own create verb is `secondary` or `outline` and the Overview's cards carry no
 * press of their own.
 *
 * Below the row's `@2xl` it is its icon: the label stays the accessible name
 * and the tooltip, and the three states have three glyphs.
 *
 * Two campaign screens go without it, because their own peach is their next
 * step: one encounter's page, whose *Run* is this press aimed at that encounter
 * (`campaign/EncounterScreen.tsx`, the same `run` from the same
 * `useCampaignAct`, so it goes back to a live fight exactly as this would), and
 * the character create form, a flow whose way out is *Cancel*, not a fight.
 */
function CampaignAct({ campaignId }: { readonly campaignId: CampaignId }) {
  const { act, dialogs } = useCampaignAct(campaignId);
  return (
    <>
      {act !== undefined && (
        <Button
          size="sm"
          title={act.label}
          onClick={act.press}
          // Square once it is its icon, the size of the row's other controls.
          className="ml-auto shrink-0 @max-2xl:w-8 @max-2xl:px-0"
        >
          <Icon name={act.icon} size={13} />
          <span className="@max-2xl:sr-only">{act.label}</span>
        </Button>
      )}
      {dialogs}
    </>
  );
}

/**
 * The campaign row — present exactly when the route names a campaign, which is
 * the delivery's `inCampaign` read off the router instead of off a screen-id
 * list. A screen cannot render it by mistake and cannot forget it either.
 *
 * ### The tabs start right after the name
 *
 * The name, the world chip and the night badge are one group, and the tabs
 * follow it at `ml-2`, so the row reads left to right from the page edge. An
 * earlier version held the group in a fixed `w-96` cell so the first tab sat at
 * one x for every campaign; the maintainer reversed that, preferring a row that
 * is left aligned to one with a gap after a short name. Where the tabs start
 * now depends on the name's length, and nothing should pin that x.
 *
 * The group is capped at `max-w-96` (the widest its contents get with the
 * chip's label at its `max-w-32` ceiling and a three-digit session), and the
 * tabs do not shrink, so a long name truncates rather than pushing the tabs off
 * the row.
 *
 * ### The campaign's press is at its right end
 *
 * The prototype of the Overview redesign draws it there, and the captain chose
 * the row over the per-screen bar it had moved to (2026-09-23). It was taken off
 * this row once because it overflowed at 760 — the row's last item reached
 * x=788 and the shell's clip cut the label mid-word — so the row now makes room
 * for it by collapsing, rather than by scrolling: **no chrome row is a scroll
 * container**, and overflow here is a layout defect.
 *
 * ### It collapses in a stated order
 *
 * Each step is a container query on this row, so it answers how wide the row
 * is — beside a docked Hob panel as much as on a phone:
 *
 * 1. Below `@5xl` the chip drops to its icon and the badge goes: decoration
 *    first, and the icon is still the way to the world.
 * 2. Below `@3xl` the name goes — the chevron keeps the way home — and the
 *    tabs tighten from 13px to 10px a side.
 * 3. Below `@2xl` the press is its icon.
 * 4. Below `@xl` *Cast* and *Chronicle* wait in a *More* menu at the end of the
 *    tabs.
 * 5. Below `@lg` *Party* and *Notes* join them, leaving *Overview* and
 *    *Encounters* — the night's two screens — on the row.
 *
 * Above `@3xl` a long name gives way before any of that, by truncating. A
 * player's row is three tabs and no press, and fits a phone without a step.
 */
function CampaignRow({
  campaignId,
  section,
}: {
  readonly campaignId: CampaignId;
  readonly section: Section;
}) {
  const relation = useCampaignRelation(campaignId);
  const matchRoute = useMatchRoute();
  // Decoded only on the encounter's own route, never on the list's splat.
  const onEncounter = useParams({ strict: false }).encounterId !== undefined;
  const ownPeach =
    onEncounter || matchRoute({ to: "/campaigns/$campaignId/characters/new" }) !== false;

  return (
    // The `@container` is the bare row and the padding is on the box inside it,
    // because a container query resolves against the container's **content
    // box**: with `px-page` on the container itself, `@5xl` meant 1024 *plus the
    // 64px of page edge*, so the row collapsed at 1024 — measured — where the
    // decision says it should not have. Same shape as the global row above.
    <div className="@container">
      <div className="flex h-11.5 items-center px-page-sm @3xl/app:px-page">
        <div className="flex min-w-0 max-w-96 items-center gap-3">
          <CampaignHome campaignId={campaignId} />
          <CampaignSharedWorldLink campaignId={campaignId} />
          {relation === "creator" && <SessionBadge campaignId={campaignId} />}
        </div>
        <TabRow
          label="This campaign"
          moreLabel="More of this campaign"
          // `mr-3` is the least room between the last tab and the press.
          className="mr-3 ml-2 shrink-0"
          items={campaignNavFor(relation, campaignId).map((item) => ({
            key: item.label,
            label: item.label,
            link: item.link,
            active: item.section === section,
            ...(item.collapse !== undefined && { collapse: item.collapse }),
          }))}
        />
        {relation === "creator" && !ownPeach && <CampaignAct campaignId={campaignId} />}
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
            // One step darker than the rows beneath it (`surface-page` under
            // their `surface-card`), so the app's own row reads as the top level.
            "flex h-11 items-center gap-4 bg-surface-page px-page-sm @3xl/app:px-page",
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

          <GlobalNav section={section} />

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
   * `onAskHob` is the top nav's *Ask Hob* button; `panel` is handed to
   * `hob/HobDock.tsx`'s `HobFrame`, the app's full-height row, which renders it
   * beside the whole shell. Inline, the panel is a column of the app from the
   * viewport's top to its bottom, and every bar narrows with `main` to make
   * room — the bars never run across above it.
   *
   * The overlaid form answers to a different box: the row under the chrome
   * stack, which **is** `HobRegion` — the component itself, rather than a second
   * copy of its class list kept in step by hand. It has to be: the region
   * publishes its own element through a context the frame lifts above both, and
   * the panel's overlaid form is portalled into that element and measured
   * against it. A row restated here would be `relative` and look right and
   * portal to `<body>`, where the scrim would cover the whole app including this
   * bar.
   *
   * So `Hob` is passed here bare and never wrapped in a region of its own — a
   * second region inside the frame takes the ref from the first, and the
   * overlay would size to it instead of to the content. `HobRegion` used
   * directly, with the dock inside it, is still the right thing where there is
   * no shell.
   *
   * A panel is inline simply by taking part in the frame's row, or an overlay
   * by positioning against the region — and the shell carries no chat state, no
   * shortcut and no breakpoint of its own. `useHobPanel` owns all three.
   */
  readonly onAskHob: (() => void) | undefined;
  readonly panel: ReactNode;
  readonly children: ReactNode;
}) {
  /** The bar's slot, published to the screen below once it has mounted. */
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const column = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);

  // The sticky stack's height, measured and published as `--chrome-height` on
  // the column, so a screen's own `sticky` can pin just under it — the window
  // is every screen's scroller, and the stack is what covers its top. Measured
  // rather than summed from the rows, because which rows there are is the
  // route's (a campaign row, a tab strip) and a sum kept by hand drifts.
  useLayoutEffect(() => {
    const from = stack.current;
    const to = column.current;
    if (from === null || to === null) return;
    const publish = () => to.style.setProperty("--chrome-height", `${from.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(from);
    return () => observer.disconnect();
  }, []);

  return (
    // The frame is the app's full-height row, and the shell is its first
    // column: the panel docks beside all of it, so opening Hob pushes the bars
    // over with `main` rather than sliding in under them. See `HobFrame`.
    <HobFrame panel={panel} className="bg-surface-page">
      {/* `@container/app`, named, and it is the only container anything asks
          about by name: it is the app's own column, so it is what "how wide is
          the page edge" means — beside an open panel that is the width the
          shell actually has. The rows and `main` below each keep an unnamed
          `@container` of their own for the questions that really are about
          their own width. */}
      <div ref={column} className="@container/app flex min-w-0 flex-1 flex-col">
        {/* One sticky stack, so the global row, campaign row, screen bar and its
            optional tabs pin as a unit. Keeping the slot here also means none of
            those rows needs its own scroll container or a calculated top offset. */}
        <div ref={stack} className="sticky top-0 z-chrome shrink-0">
          <TopNav hobOpen={hobOpen} onAskHob={onAskHob} />
          <div ref={setBar} />
        </div>
        <HobRegion>
          <div className="relative flex min-w-0 flex-1 flex-col overflow-visible">
            {/* `@container`, so a screen's layout turns over on the width of the
                column it actually has. Every `fixed` overlay in the product is
                portalled to the body, so the containing block this establishes
                catches nothing. */}
            <main className="@container flex-1 px-page-sm py-page @3xl/app:px-page">
              <TopBarSlot.Provider value={bar}>{children}</TopBarSlot.Provider>
            </main>
          </div>
        </HobRegion>
      </div>
    </HobFrame>
  );
}
