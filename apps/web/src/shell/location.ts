import type { CampaignId } from "@taverns/api";
import { useMatchRoute, useParams } from "@tanstack/react-router";

/**
 * The three facts the shell needs about where you are, all read off the router.
 *
 * **Nothing here is state and nothing is a prop.** The old shell was handed a
 * `route` object that `App.tsx` had computed; the router now owns the URL, so a
 * second copy threaded down through twelve screens would be a second answer to
 * "where am I" — and the one that could disagree, because it is the one nobody
 * updates. Every screen renders `AppShell` with no location prop at all, which
 * is also what makes it impossible for a new screen to pass the wrong one.
 *
 * `useMatchRoute` is typed against the route tree, so a path that does not
 * exist fails to compile rather than silently never matching.
 */

/** Which app this is: the DM's tool, or the player's. */
export type Mode = "dm" | "player";

/**
 * Which app you are in.
 *
 * **Derived from the match, never stored beside it.** That is what makes the
 * switch a mode rather than a filter without needing a second piece of state to
 * keep in step — there is one answer, the URL is it, and every screen, every
 * nav item and the pill itself read the same function. A role is otherwise a
 * fact about a *pair* (this account, this campaign), so a mode held globally is
 * under-determined the moment you open a table: reading it off the route means
 * the campaign you are looking at is always the campaign the mode is about.
 *
 * It asks one question — *is this route under `/play`* — rather than listing
 * the player screens by name, so a player screen added tomorrow is in player
 * mode by where it sits in the tree. `join` and `gallery` name no mode and
 * answer `dm`. Neither is a DM screen — the invitation page runs before there
 * is anybody to have a role — and the answer only decides which nav they draw.
 */
export function useMode(): Mode {
  const matchRoute = useMatchRoute();
  return matchRoute({ to: "/play", fuzzy: true }) ? "player" : "dm";
}

/**
 * Which nav item is lit — **one value across two rows**, which is how the sixth
 * delivery's *"nothing appears on both rows"* is enforced rather than
 * remembered.
 *
 * The shell draws a global row (everything above a campaign) and, inside a
 * campaign, a second row of that campaign's screens. Both rows light an item by
 * asking whether its section is this one, and since there is exactly one answer,
 * **being inside a campaign is the same fact as no global item being lit.** The
 * delivery's own `GlobalItem` does this: `active={screen === n.id}`, with the
 * campaign screens named nowhere in the global list.
 *
 * A campaign and the fight inside it are both *within* the campaign's Overview,
 * so those routes light the same item — the underline says which part of the app
 * you are in, not which URL you are at, and an unlit nav on a campaign page
 * reads as a bug. That is the old "a fight lights Campaigns" rule translated one
 * level down, which is where the campaign's own screens now live. The bestiary,
 * the Chronicle and the party stay their own sections for the reason they always
 * were: they are screens you go *to* from a campaign rather than views of one.
 *
 * **The second axis is the mode**, and it is the same rule one level up: a
 * player's campaign is *within* their tables. There is no route that is both, so
 * the two axes cannot fight.
 *
 * `playChronicle` is its own section like `chronicle` is, and is deliberately
 * **not** folded into it: the two are different screens over different
 * endpoints, and one section shared between them would light a nav item that
 * points somewhere the reader cannot go.
 *
 * A character sheet is *within* the roster it was opened from, so both light
 * `Characters` — the same containment `run` has with the campaign's Overview.
 */
export type Section =
  /* The global row: everything above a campaign. */
  | "campaigns"
  | "play"
  | "playCharacters"
  | "gallery"
  /* The DM's campaign row. */
  | "overview"
  | "encounters"
  | "notes"
  | "party"
  | "chronicle"
  | "bestiary"
  /* The player's campaign row. */
  | "playOverview"
  | "playChronicle";

export function useSection(): Section {
  const matchRoute = useMatchRoute();
  const mode = useMode();

  if (matchRoute({ to: "/gallery" })) return "gallery";
  if (mode === "player") {
    if (matchRoute({ to: "/play/campaigns/$campaignId/chronicle" })) return "playChronicle";
    // Fuzzy, so the splat under a player's campaign lands on its Overview for
    // the reason the DM's does: the campaign was legible, the section was not.
    if (matchRoute({ to: "/play/campaigns/$campaignId", fuzzy: true })) return "playOverview";
    if (matchRoute({ to: "/play/characters", fuzzy: true })) return "playCharacters";
    return "play";
  }
  if (matchRoute({ to: "/campaigns/$campaignId/bestiary" })) return "bestiary";
  if (matchRoute({ to: "/campaigns/$campaignId/chronicle" })) return "chronicle";
  if (matchRoute({ to: "/campaigns/$campaignId/party" })) return "party";
  if (matchRoute({ to: "/campaigns/$campaignId/encounters" })) return "encounters";
  if (matchRoute({ to: "/campaigns/$campaignId/notes" })) return "notes";
  // Anything else *inside* a campaign is that campaign's Overview — the index,
  // a fight, and the splat a half-typed section falls back through.
  if (matchRoute({ to: "/campaigns/$campaignId", fuzzy: true })) return "overview";
  return "campaigns";
}

/**
 * The campaign this route is about, if it names one.
 *
 * The decoded, branded id from the match rather than the raw segment: the
 * router already refused anything it did not mint (see `routes.tsx`), so what
 * reaches here is a `CampaignId` or nothing at all. It is what decides whether
 * the campaign-scoped nav items are drawn — from the campaign list there is no
 * campaign yet, so they are absent rather than disabled.
 */
export function useCampaignId(): CampaignId | undefined {
  return useParams({ strict: false }).campaignId;
}
