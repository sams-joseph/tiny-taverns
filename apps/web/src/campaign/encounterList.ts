import type {
  DifficultyBand,
  Encounter,
  EncounterId,
  EncounterKind,
  EncounterPlacement,
  EncounterPlayed,
  EncounterPrep,
} from "@taverns/api";
import { DateTime } from "effect";
import type { IconName } from "@taverns/ui";

/**
 * The Encounters page's rules about its rows, apart from the components so
 * each can be tested on its own (`encounterList.test.ts`).
 */

/**
 * The pills above the list. Single-select, and by kind alone: the captain's
 * call on the redesign was the drawing's pills with no search box. A skill
 * challenge and a hazard share one pill, as drawn.
 */
export type KindFilter = "all" | "combat" | "social" | "other";

export const KIND_FILTERS: ReadonlyArray<readonly [KindFilter, string]> = [
  ["all", "All"],
  ["combat", "Combat"],
  ["social", "Social"],
  ["other", "Challenges & hazards"],
];

export const matchesKind = (encounter: Encounter, filter: KindFilter): boolean =>
  filter === "all" ||
  (filter === "other"
    ? encounter.kind === "challenge" || encounter.kind === "hazard"
    : encounter.kind === filter);

/**
 * One glyph per kind. The drawing picks a glyph per encounter (a skull for the
 * hag, coins for the toll); nothing on the wire says which, so the kind decides.
 * Its own picks are kept where the kind is all they said: swords for a fight,
 * dice for a skill challenge.
 */
export const KIND_ICON: Readonly<Record<EncounterKind, IconName>> = {
  combat: "swords",
  social: "users",
  challenge: "dices",
  hazard: "triangle-alert",
};

/**
 * Where an encounter stands: on the table, never played, or played.
 *
 * The drawing groups by the night an encounter is prepped for; nothing
 * schedules an encounter to a night, so the captain's grouping is by what has
 * happened to it instead. The fight on the table is its own group because it is
 * the one a DM is looking for; `lastPlayed` leaves it out while it is live.
 */
export type EncounterGroup = "live" | "unplayed" | "played";

const GROUP_TITLES: ReadonlyArray<readonly [EncounterGroup, string]> = [
  ["live", "On the table now"],
  ["unplayed", "Not yet played"],
  ["played", "Played"],
];

export const groupOf = (encounter: Encounter, liveId: EncounterId | undefined): EncounterGroup =>
  encounter.id === liveId ? "live" : encounter.lastPlayed === null ? "unplayed" : "played";

const playedAt = (encounter: Encounter): number =>
  encounter.lastPlayed === null ? 0 : DateTime.toEpochMillis(encounter.lastPlayed.endedAt);

export interface EncounterSection {
  readonly group: EncounterGroup;
  readonly title: string;
  readonly encounters: ReadonlyArray<Encounter>;
}

/**
 * The list in the order it is drawn, empty groups left out. Not yet played
 * keeps the DM's planned order, which is the list's own (`encounters.list`
 * answers in it); played is most recent first, which is the one a DM is
 * likeliest to want the log of.
 */
export const sectionsOf = (
  encounters: ReadonlyArray<Encounter>,
  liveId: EncounterId | undefined,
): ReadonlyArray<EncounterSection> =>
  GROUP_TITLES.map(([group, title]) => {
    const rows = encounters.filter((encounter) => groupOf(encounter, liveId) === group);
    return {
      group,
      title,
      encounters: group === "played" ? [...rows].sort((a, b) => playedAt(b) - playedAt(a)) : rows,
    };
  }).filter((section) => section.encounters.length > 0);

/**
 * What is still to be played, in the order the night will reach it: the fight
 * on the table, then one carried off it and not yet picked up, then the rest in
 * the DM's order. A played encounter is over (an encounter is played once), so
 * it is left out. The Overview's *Next session* numbers these rows, and its
 * opening read-aloud is the first one's.
 */
export const onDeckOf = (
  encounters: ReadonlyArray<Encounter>,
  liveId: EncounterId | undefined,
): ReadonlyArray<Encounter> => {
  const of = (tag: Playthrough["_tag"]) =>
    encounters.filter((encounter) => playthroughOf(encounter, liveId)._tag === tag);
  return [...of("live"), ...of("carried"), ...of("unplayed")];
};

/**
 * The four moves the handle's menu offers, in the menu's order.
 */
export type OrderMove = "top" | "up" | "down" | "bottom";

export const ORDER_MOVES: ReadonlyArray<readonly [OrderMove, string]> = [
  ["top", "Move to top"],
  ["up", "Move up"],
  ["down", "Move down"],
  ["bottom", "Move to bottom"],
];

/**
 * Where a move puts an encounter, said the way the wire says it: before or
 * after another encounter, never a position (`EncounterPlacement`).
 *
 * **The anchors are the rows the DM can see**: `rows` is the *Not yet played*
 * section as drawn, under whatever kind pill is lit. *Move up* goes before the
 * row drawn above it and *Move to top* before the first row drawn; an
 * encounter the pill hides keeps its place relative to the ones around it. So
 * under a pill the move does what the DM sees, and the rows they cannot see are
 * not reordered behind their back.
 *
 * Nothing (`undefined`) when the move goes nowhere — the first row cannot go
 * up — which is when its menu item is disabled.
 */
export const placementFor = (
  rows: ReadonlyArray<Pick<Encounter, "id">>,
  encounterId: EncounterId,
  move: OrderMove,
): EncounterPlacement | undefined => {
  const at = rows.findIndex((row) => row.id === encounterId);
  const last = rows.length - 1;
  if (at === -1) return undefined;
  switch (move) {
    case "top":
      return at === 0 ? undefined : { before: rows[0]!.id };
    case "up":
      return at === 0 ? undefined : { before: rows[at - 1]!.id };
    case "down":
      return at === last ? undefined : { after: rows[at + 1]!.id };
    case "bottom":
      return at === last ? undefined : { after: rows[last]!.id };
  }
};

/**
 * The list with one encounter moved, as the server moves it
 * (`Encounters.move`): taken out, then put back before or after its anchor.
 * The same list when either is not in it, or it is its own anchor — the
 * server's no-op and `NotFound` both leave the order alone.
 */
export const placed = <E extends Pick<Encounter, "id">>(
  encounters: ReadonlyArray<E>,
  encounterId: EncounterId,
  placement: EncounterPlacement,
): ReadonlyArray<E> => {
  const anchor = "before" in placement ? placement.before : placement.after;
  const moving = encounters.find((encounter) => encounter.id === encounterId);
  if (moving === undefined || anchor === encounterId) return encounters;
  const rest = encounters.filter((encounter) => encounter.id !== encounterId);
  const at = rest.findIndex((encounter) => encounter.id === anchor);
  if (at === -1) return encounters;
  const index = "before" in placement ? at : at + 1;
  return [...rest.slice(0, index), moving, ...rest.slice(index)];
};

/** A row drawn on the screen, from its top edge to its bottom one. */
export interface RowSpan {
  readonly id: EncounterId;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where a dragged row lands, said the way a menu move says it: the gap between
 * the other rows nearest the pointer's `y`, so before the first row whose
 * middle is below it or after the last one above. `rows` is *Not yet played*
 * as drawn, in order, the dragged row among them; its own span is not a
 * target, since the carried row stays in its place, dimmed, until the drop.
 * As with the menu, the anchors are the rows the DM can see under the pill.
 *
 * Nothing (`undefined`) when the drop leaves the order as it is — back in its
 * own gap — which is when no drop line is drawn and a drop sends nothing.
 */
export const dropPlacement = (
  rows: ReadonlyArray<RowSpan>,
  encounterId: EncounterId,
  y: number,
): EncounterPlacement | undefined => {
  const others = rows.filter((row) => row.id !== encounterId);
  if (others.length === 0 || others.length === rows.length) return undefined;
  const above = others.filter((row) => (row.top + row.bottom) / 2 < y).length;
  const placement: EncounterPlacement =
    above === 0 ? { before: others[0]!.id } : { after: others[above - 1]!.id };
  const moved = placed(rows, encounterId, placement);
  return moved.every((row, at) => row.id === rows[at]!.id) ? undefined : placement;
};

/**
 * What the live region says once a row has moved: *"Toll bridge standoff moved
 * to 2 of 5, after The drowned chapel."* — its place among the rows drawn, and
 * the neighbour that says where that is. Nothing when it is not among them.
 */
export const movedWords = (
  rows: ReadonlyArray<Pick<Encounter, "id" | "name">>,
  encounterId: EncounterId,
): string | undefined => {
  const at = rows.findIndex((row) => row.id === encounterId);
  if (at === -1) return undefined;
  const place = `${rows[at]!.name} moved to ${String(at + 1)} of ${String(rows.length)}`;
  const beside =
    at > 0 ? `, after ${rows[at - 1]!.name}` : rows.length > 1 ? `, before ${rows[1]!.name}` : "";
  return `${place}${beside}.`;
};

/** The pane's "Combat · Played · Session 12". */
export const groupLabel = (encounter: Encounter, liveId: EncounterId | undefined): string => {
  const group = groupOf(encounter, liveId);
  return group === "live"
    ? "On the table now"
    : group === "unplayed"
      ? "Not yet played"
      : playedLabel(encounter);
};

/**
 * What an encounter still offers the DM. **An encounter is played once**
 * (`playthroughOf` in `repo/EncounterRuns.ts`, which refuses a second start),
 * so every press that would start one asks this rather than its own question:
 *
 * - `unplayed` is the only one that may be run;
 * - `live` is on the table, and its press goes back to it;
 * - `carried` came off the table at the end of a night and has not been picked
 *   up: the same playthrough, continued by `runs.resume` from `played.runId`;
 * - `played` is over, and its way in is its log.
 *
 * A carried fight that was picked up is live, or, once that ends, played by
 * its successor: `lastPlayed` is the most recent ended run, and the successor
 * ended after its predecessor.
 */
export type Playthrough =
  | { readonly _tag: "unplayed" }
  | { readonly _tag: "live" }
  | { readonly _tag: "carried"; readonly played: EncounterPlayed }
  | { readonly _tag: "played"; readonly played: EncounterPlayed };

export const playthroughOf = (
  encounter: Encounter,
  liveId: EncounterId | undefined,
): Playthrough => {
  if (encounter.id === liveId) return { _tag: "live" };
  const played = encounter.lastPlayed;
  if (played === null) return { _tag: "unplayed" };
  return played.endedReason === "carried"
    ? { _tag: "carried", played }
    : { _tag: "played", played };
};

/** `"Played · Session 12"`, or nothing for an encounter never played. */
export const playedLabel = (encounter: Encounter): string =>
  encounter.lastPlayed === null
    ? ""
    : `Played · Session ${String(encounter.lastPlayed.sessionNumber)}`;

/**
 * The header's line: `"1 on the table · 2 not yet played · 3 played"`, each
 * part only when there is one of it. Nothing when there are no encounters,
 * because the page's empty state says so.
 */
export const encountersSummary = (
  encounters: ReadonlyArray<Encounter>,
  liveId: EncounterId | undefined,
): string | undefined => {
  const count = (group: EncounterGroup) =>
    encounters.filter((encounter) => groupOf(encounter, liveId) === group).length;
  const parts = [
    [count("live"), "on the table"],
    [count("unplayed"), "not yet played"],
    [count("played"), "played"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, words]) => `${String(n)} ${words}`);
  return said.length === 0 ? undefined : said.join(" · ");
};

/**
 * The text colour each band is said in, as the drawing colours them: the quiet
 * neutral below Easy, then success, info, the accent and danger — read down the
 * list it escalates.
 */
export const BAND_TEXT: Readonly<Record<DifficultyBand, string>> = {
  Trivial: "text-muted-foreground",
  Easy: "text-success-ink",
  Medium: "text-info-ink",
  Hard: "text-accent-ink",
  Deadly: "text-danger-ink",
};

/**
 * What a row says after the kind: the computed band, or what the encounter is
 * run by when it is not a fight.
 *
 * A skill challenge is run by its DC, so it says that once the DM has set one
 * (`EncounterPrep.challenge`); a hazard says it is one, as drawn. A
 * conversation with nobody to fight says *No combat* rather than calling itself
 * unrated. Everything else is the server's band, or *Unrated* when the rule
 * could not rate it.
 */
export const ratingOf = (
  encounter: Encounter,
  prep: EncounterPrep | undefined,
): { readonly text: string; readonly band?: DifficultyBand } => {
  const challenge = prep?.challenge ?? null;
  if (encounter.kind === "challenge" && challenge?.kind === "challenge") {
    return { text: `DC ${String(challenge.dc)}` };
  }
  if (encounter.kind === "hazard") return { text: "Hazard" };
  if (encounter.difficulty._tag === "rated") {
    return { text: encounter.difficulty.band, band: encounter.difficulty.band };
  }
  if (encounter.kind === "social" && encounter.difficulty.reason === "no-creatures") {
    return { text: "No combat" };
  }
  return { text: "Unrated" };
};

/**
 * `"6 creatures"`, or nothing for a scene that is not a fight and has none —
 * *No creatures yet* is a fight's unfinished roster, not a conversation's.
 */
export const creatureWords = (encounter: Encounter): string | undefined =>
  encounter.creatureCount > 0 || encounter.kind === "combat"
    ? describeRoster(encounter)
    : undefined;

/** "6 creatures", or that there are none yet — the encounter page's fact. */
export const describeRoster = (encounter: Encounter): string =>
  encounter.creatureCount === 0
    ? "No creatures yet"
    : `${String(encounter.creatureCount)} ${encounter.creatureCount === 1 ? "creature" : "creatures"}`;
