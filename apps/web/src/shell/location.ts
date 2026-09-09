import type { CampaignId, CampaignRelation, GroupId } from "@taverns/api";
import { useMatchRoute, useParams } from "@tanstack/react-router";
import { useApiAtom } from "../api/atoms";
import { membershipsAtom } from "../campaign/load";

/**
 * The facts the shell needs about where you are, read off the router — plus
 * the one fact a router cannot supply: what this account *is* at the campaign
 * the route names.
 *
 * **Nothing here is a prop.** The router owns the URL, so a second copy
 * threaded down through screens would be a second answer to "where am I" — and
 * the one that could disagree, because it is the one nobody updates. Every
 * screen renders `AppShell` with no location prop at all.
 *
 * ### There is no mode any more, and that is the group architecture's shape
 *
 * The old shell carried a global DM/player mode in the URL (`/play/…`) and a
 * role switch to move between the two halves. The captain's decisions of
 * 2026-09-01 remove the premise: DM-ness is *per campaign* — the campaign's
 * creator, immutably — so the same campaign URL renders creator chrome to its
 * creator and participant chrome to a player, and there is nothing global left
 * for a toggle to say. `useCampaignRelation` is where the per-campaign answer
 * comes from: the same `GET /me/campaigns` read the campaign frame already
 * makes, whose rows carry a derived `relation`.
 */

/**
 * Which nav item is lit — **one value across two rows**, which is how the
 * sixth delivery's *"nothing appears on both rows"* is enforced rather than
 * remembered: being inside a campaign is the same fact as no global item being
 * lit.
 *
 * The global row is `Groups | Characters | Library | Components`. A group's
 * own screen is *within* Groups; a character sheet is *within* the roster it
 * was opened from, so both light `characters` — the same containment a fight
 * has with its campaign's Overview.
 *
 * **There is one Library section.** `/library` and its shelves all light
 * *Library* on the global row and let the screen's own tabs say which shelf is
 * open. Since the instancing decision of 2026-09-02 a campaign has no corpus
 * screens at all — creatures, rules, spells, equipment, magic items and the
 * compendium are Library shelves, and what a campaign *uses* of them shows up
 * inside encounters, fights and the create form rather than on rows of its
 * nav.
 */
export type Section =
  /* The global row: everything above a campaign. */
  | "campaigns"
  | "characters"
  | "library"
  | "gallery"
  /* The campaign row. */
  | "overview"
  | "encounters"
  | "notes"
  | "cast"
  | "party"
  | "chronicle"
  | "table";

export function useSection(): Section {
  const matchRoute = useMatchRoute();

  if (matchRoute({ to: "/gallery" })) return "gallery";
  // Above any campaign. `/library/rules` is a shelf inside Library, so a fuzzy
  // match on `/library` is what keeps the global row on the one destination.
  if (matchRoute({ to: "/library", fuzzy: true })) return "library";
  if (matchRoute({ to: "/characters", fuzzy: true })) return "characters";
  if (matchRoute({ to: "/campaigns/$campaignId/chronicle" })) return "chronicle";
  if (matchRoute({ to: "/campaigns/$campaignId/table" })) return "table";
  if (matchRoute({ to: "/campaigns/$campaignId/party" })) return "party";
  if (matchRoute({ to: "/campaigns/$campaignId/encounters" })) return "encounters";
  if (matchRoute({ to: "/campaigns/$campaignId/notes" })) return "notes";
  // One NPC's screen is *within* the cast, the way a sheet is within the roster.
  if (matchRoute({ to: "/campaigns/$campaignId/cast", fuzzy: true })) return "cast";
  // Anything else *inside* a campaign is that campaign's Overview — the index,
  // a fight, the character create form, and the splat a half-typed section
  // falls back through.
  if (matchRoute({ to: "/campaigns/$campaignId", fuzzy: true })) return "overview";
  // Campaigns is home. The old group routes stay within this destination.
  return "campaigns";
}

/**
 * The campaign this route is about, if it names one.
 *
 * The decoded, branded id from the match rather than the raw segment: the
 * router already refused anything it did not mint (see `routes.tsx`). It is
 * what decides whether the campaign-scoped nav items are drawn.
 */
export function useCampaignId(): CampaignId | undefined {
  return useParams({ strict: false }).campaignId;
}

/** The group this route is about, if it names one. */
export function useGroupId(): GroupId | undefined {
  return useParams({ strict: false }).groupId;
}

/**
 * What this account is at the campaign the route names — the relation the
 * chrome derives from, in place of the global mode it replaced.
 *
 * `undefined` only while the membership read is still settling: the campaign
 * row draws no items for that moment, because a row of creator controls
 * flashed at a player is chrome for somebody it does not belong to.
 *
 * **A failed read and an absent membership both fall back to `creator`.** The
 * bar has to keep working when the server is unreachable — that is exactly
 * when the nav matters most — and a stranger at a campaign URL gets creator
 * chrome over the honest `NotFound` the body already answers, which discloses
 * nothing the URL bar did not. The one state that must never happen is a
 * *player* seeing creator controls, and a player's membership read succeeding
 * is the same read their screen needs anyway.
 *
 * The read is `membershipsAtom`, the same atom the campaign frame and the
 * Library's copy select already hold, so on a campaign screen this costs no
 * extra request.
 */
export function useCampaignRelation(
  campaignId: CampaignId | undefined,
): CampaignRelation | undefined {
  const [resource] = useApiAtom(membershipsAtom);
  if (campaignId === undefined || resource.state === "loading") return undefined;
  if (resource.state === "failed") return "creator";
  return resource.value.find((row) => row.campaign.id === campaignId)?.relation ?? "creator";
}
