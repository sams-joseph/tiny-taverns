import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { CampaignId } from "@taverns/api";
import { Button, cn, Icon, tabsTriggerVariants, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { SignInSurface } from "../auth/SignInSurface";
import { HobRegion } from "../hob/HobDock";
import { useCampaignId, useMode, useSection, type Mode, type Section } from "./location";

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
 * builds that link itself from the route — it knows the id and the mode — and
 * takes only the name, which is data no router can supply. That replaced a
 * `NavContext` every campaign screen passed a hand-built `link` to: seven call
 * sites, seven chances to point the way home at the wrong route, and the player
 * screens had to remember to point at `/play/…`.
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
 * The global row: everything that is above any campaign.
 *
 * **A function of the mode alone**, which is what makes it the row that never
 * changes as you move around inside a table — the delivery's whole reason for
 * splitting the bar. It is read off the router (`useMode`) rather than passed
 * in, so the bar can never light a section the URL is not in.
 *
 * `Campaigns` leads in both modes, as the delivery has it, on the `layers`
 * glyph it names. *Tables* is what the player's copy of it is called here, and
 * has been since the role switch shipped: it is the same screen answering
 * *"which tables do I sit at"*.
 *
 * **`Characters` is global and campaign-scoped nowhere**, which the delivery
 * agrees with and the API decided first: `GET /me/characters` is the one read on
 * `character` with no campaign in its path, because *"which characters are
 * mine"* is asked across every table at once.
 *
 * ### Library is deliberately not here yet
 *
 * The delivery puts the Bestiary on this row, as **Library**, above any
 * campaign. **The read for it exists now** — `GET /library/creatures`, landed
 * alongside this — but the screen over it does not, and an item is earned by a
 * screen rather than by an endpoint. `creatures.list` cannot stand in: it hangs
 * off `/campaigns/:campaignId/creatures`, and that path is the *only* thing
 * gating the global `system` rows it returns beside the campaign's own, so there
 * is nothing for a campaign-less route to read *through*.
 *
 * So **Bestiary stays on the campaign row for now**, where it works. Moving it
 * up before the screen exists would strand a working screen behind a nav item
 * that goes nowhere, which is the rule that has kept *Run* out of every row
 * since the second delivery. This is a deferral with a date on it, not an
 * oversight: when `#/library` is real the swap is one item moving from
 * `campaignNavFor` to the list below, and `useSection` gaining a case.
 */
const globalNavFor = (mode: Mode): ReadonlyArray<NavItem> => {
  if (mode === "player") {
    return [
      { label: "Tables", icon: "layers", link: { to: "/play" }, section: "play" },
      {
        label: "Characters",
        icon: "user",
        link: { to: "/play/characters" },
        section: "playCharacters",
      },
      { label: "Components", icon: "panel-left", link: { to: "/gallery" }, section: "gallery" },
    ];
  }

  return [
    { label: "Campaigns", icon: "layers", link: { to: "/campaigns" }, section: "campaigns" },
    { label: "Components", icon: "panel-left", link: { to: "/gallery" }, section: "gallery" },
  ];
};

/**
 * The campaign row: the screens inside one table, and only ever inside one.
 *
 * Every item here names the campaign in its path because every endpoint behind
 * it does — which is the same fact that makes the row exist at all. From the
 * campaign list there is no campaign yet, so there is no row rather than a row
 * of disabled items.
 *
 * **The rule that a screen earns its item on the day it exists survives the
 * split, and it is what makes both rows shorter than the drawing.** The
 * delivery's DM row is Overview / Encounters / Party / Notes / Chronicle and all
 * five are built. Its player row is *My character* / *At the table* /
 * *Chronicle*:
 *
 * - *At the table* has no screen. The player projection of a fight is an open
 *   decision, not an unwritten component, and a nav item that goes nowhere is
 *   the same lie as a stubbed field — the rule that has kept *Run* out of the
 *   DM's row since the second delivery.
 * - *My character* is not campaign-scoped here. The sheet is
 *   `/play/characters/$characterId`, reached from the roster that `Characters`
 *   on the global row already points at, so an item here would be a second
 *   answer to where a sheet lives — and the delivery's own rule is that nothing
 *   appears on both rows.
 * - The player's *Overview* is `PlayerCampaignScreen`, which exists and is what
 *   the row's title already goes to, so it is drawn as the row's first item for
 *   the reason the DM's is.
 *
 * **`Bestiary` and `Party` stay out of the player's row entirely**, and that is
 * not merely "undrawn": `members.list` is behind the `DmActor` gate and a
 * player's projection of a roster is *nothing* rather than a narrower list
 * (`AGENTS.md`). A control that exists and then errors is worse than one that is
 * absent.
 */
const campaignNavFor = (mode: Mode, campaignId: CampaignId): ReadonlyArray<NavItem> => {
  if (mode === "player") {
    return [
      {
        label: "Overview",
        link: { to: "/play/campaigns/$campaignId", params: { campaignId } },
        section: "playOverview",
      },
      {
        // `playChronicle`, never the DM's `chronicle` route — that screen reads
        // `recap.read`, which is behind the `DmActor` gate and would answer a
        // player a 404. Two routes, two sections, so neither can light the
        // other's item.
        label: "Chronicle",
        link: { to: "/play/campaigns/$campaignId/chronicle", params: { campaignId } },
        section: "playChronicle",
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
    {
      // Drawn as *Library* on the global row by the delivery, and it will move
      // there — see `globalNavFor`. Until the global read exists it belongs to
      // the campaign whose path is what scopes it.
      label: "Bestiary",
      link: { to: "/campaigns/$campaignId/bestiary", params: { campaignId } },
      section: "bestiary",
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
    // `Link` would additionally light *Tables* while a sheet is open, because
    // `/play` is a prefix of the URL, and *Overview* on every screen inside a
    // campaign, because the campaign index is a prefix of all of them. `exact`
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
 * pair, and the table you DM has no player screen to be shown. That is also
 * what lets it hang here rather than only on the two lists — from a fight or a
 * bestiary, *Player* means "the tables I sit at", which is a sentence that is
 * true wherever it is read.
 *
 * **It takes no prop and cannot be switched off**, and that is the fix rather
 * than a detail: see `TopNav`.
 *
 * `aria-pressed` as the delivery has it, and a real `<a>`: this is navigation
 * wearing a toggle's clothes, so it must behave like navigation.
 */
function RoleSwitch({ mode }: { readonly mode: Mode }) {
  const options = [
    { id: "dm", icon: "crown", label: "DM", link: { to: "/campaigns" } },
    { id: "player", icon: "user", label: "Player", link: { to: "/play" } },
  ] as const satisfies ReadonlyArray<{
    id: Mode;
    icon: IconName;
    label: string;
    link: LinkProps;
  }>;

  return (
    <div
      aria-label="Role"
      className="flex shrink-0 gap-0.5 rounded-pill border border-hairline bg-surface-sunken p-0.5"
    >
      {options.map((option) => {
        const on = option.id === mode;
        return (
          <Link
            key={option.id}
            {...option.link}
            // Exact, and no active class, for the reasons `NavLink` gives.
            // `aria-pressed` is what says which side is on here: this is a
            // toggle wearing a link's clothes, and the mode it names is true
            // across a whole half of the app rather than at one URL.
            activeOptions={{ exact: true }}
            activeProps={{}}
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
          </Link>
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
 * The app's own bar: where you are in the product, who you are, and **which of
 * the two apps you are in**.
 *
 * Not sticky and not on the layering scale — it is a flex row *above* the
 * scrolling column rather than something floating over it, so it never overlaps
 * anything and never has to win.
 *
 * ### The role switch is part of the bar, not a favour a screen does
 *
 * It was a `roleSwitch` prop defaulting to `false`, offered by the two campaign
 * lists and by nothing else, and on the DM's list only once the account already
 * held a `player` membership. Both halves failed the same way: the pill
 * vanished the moment you went anywhere, and the one place it could appear was
 * hidden from exactly the account that needed it — **you could not reach player
 * mode until you were a player, and the control that takes you there was hidden
 * until you were one.** Every account that predates the invitation is in that
 * state, which is why the captain saw no toggle at all.
 *
 * So it is drawn from `modeOf(route)` like the nav is, with no prop to pass and
 * nothing to opt into. **A control every screen must remember is one every new
 * screen will forget**, and there is no shape of forgetting left: a screen that
 * renders this shell has the switch, and a screen that does not render this
 * shell has no bar to put it in.
 *
 * That settles the single-role account too, and the answer is the honest empty
 * state rather than a hidden control: *Player* on an account that sits at no
 * table lands on `#/play`, which says nobody has invited you yet and that a
 * table appears once its DM shares it. A DM who has been handed a link to
 * somebody else's table can therefore find it — the actual need underneath —
 * without being told a URL.
 *
 * **Where you are is read from the router, not handed down.** There is no
 * `route` prop to pass and none to get wrong; see `shell/location.ts`.
 */
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
  const mode = useMode();
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
          {globalNavFor(mode).map((item) => (
            <GlobalNavLink key={item.label} item={item} active={item.section === section} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Absent in player mode rather than present and failing. Asking Hob is
              a write — `HobThreads.start` needs `campaignWritable` — so a player
              gets the ordinary `NotFound`, and the captain settled that players
              do not talk to Hob at all. A button that opens a panel which can
              only apologise is the DM chrome this mode exists to keep out of the
              way.

              It is on the *global* row, where the delivery puts it, and that is
              right even though every question it can ask is about a campaign:
              the panel is the app's, opens over whatever you are reading, and a
              button that moved between rows as you navigated would be a control
              you have to look for. */}
          {mode === "dm" && <AskHobButton onClick={onAskHob} />}
          {/* Unconditional, and that is the point — see this component's own
              note. It is the bar's, like the nav, rather than something each
              screen remembers to ask for. */}
          <RoleSwitch mode={mode} />
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
          <CampaignHome mode={mode} campaignId={campaignId} name={campaignName} />
          {/* The badge is this row's decoration, so it is the second thing to
              give way — the campaign's own screens say which night it is in
              their subtitle, and a narrow bar has to keep its controls. */}
          <div className="hidden shrink-0 @2xl:block">{campaignBadge}</div>
          <nav aria-label="This campaign" className="ml-2 flex items-stretch self-stretch">
            {campaignNavFor(mode, campaignId).map((item) => (
              <CampaignNavLink key={item.label} item={item} active={item.section === section} />
            ))}
          </nav>
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
 * goes is a fact about the route — the id is in the URL and the mode decides
 * which of the two campaign screens is home — so there is nothing for a screen
 * to get wrong. It replaced a `link` prop that seven screens each passed by
 * hand, four of which had to remember the `/play/…` prefix.
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
  mode,
  campaignId,
  name,
}: {
  readonly mode: Mode;
  readonly campaignId: CampaignId;
  readonly name?: string;
}) {
  const link: LinkProps =
    mode === "player"
      ? { to: "/play/campaigns/$campaignId", params: { campaignId } }
      : { to: "/campaigns/$campaignId", params: { campaignId } };

  return (
    <Link
      {...link}
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
