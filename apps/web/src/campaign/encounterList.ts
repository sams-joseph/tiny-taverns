import type {
  DifficultyBand,
  Encounter,
  EncounterId,
  EncounterKind,
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
 * keeps the order they were written in; played is most recent first, which is
 * the one a DM is likeliest to want the log of.
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

/** The pane's "Combat · Played · Session 12". */
export const groupLabel = (encounter: Encounter, liveId: EncounterId | undefined): string => {
  const group = groupOf(encounter, liveId);
  return group === "live"
    ? "On the table now"
    : group === "unplayed"
      ? "Not yet played"
      : playedLabel(encounter);
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
