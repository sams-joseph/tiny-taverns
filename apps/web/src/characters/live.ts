import type { Character, PlayerLiveTable } from "@taverns/api";

/**
 * What the live banner says, as one pure function.
 *
 * It is separate from the screen and separately tested for the reason
 * `chronicle/fight.ts` is: everything decided here is decided *quietly*. Every
 * branch below renders a plausible English sentence, so a wrong one reads as a
 * working banner and is only caught by a fixture that can tell two right-looking
 * answers apart.
 *
 * ### The states, and what each is
 *
 * There are four, and the first is by far the most common:
 *
 * 1. **nothing to say** — `null` from the endpoint. Nobody is playing, *or* the
 *    DM has not shared tonight, and the banner cannot tell those apart because
 *    the server deliberately does not: a session the DM keeps to themselves is
 *    not visible, which is the master toggle working. The screen draws
 *    **nothing at all** in this state, which is what the delivery draws
 *    (`MyCharacters.jsx`'s `live ? … : null`) and what the product's own rule
 *    about absent controls requires — a *Go to the table* that led nowhere
 *    would be the stubbed field a screen must never render.
 * 2. **the night, and no fight** — a session opened in a tavern, which
 *    `Session` calls the ordinary state of an evening rather than a night
 *    nobody has played.
 * 3. **a fight, and this character is in it** — the useful case, and the one
 *    the *"it's your turn"* line exists for.
 * 4. **a fight, and this character is not** — the DM is running something else,
 *    or somebody else's table is mid-fight. Said out loud rather than left to
 *    be inferred from an absent turn line, because a player looking at their own
 *    sheet has every reason to think the fight on it is theirs.
 *
 * ### Whose turn it is, and how *"yours"* is decided
 *
 * By comparing two things the answer already contains — the seat this character
 * holds and the combatant `upNext` names — rather than by any field claiming
 * ownership. `PlayerLiveTable.seats` is only ever this account's own characters
 * (`ownRowReadable` on the server), so a seat matching this character's id is
 * proof enough and there is nothing here to get wrong about somebody else's row.
 *
 * `upNext` is `null` when the DM has set no marker **or** has hidden the row it
 * names, and the two are indistinguishable on purpose. The banner then says the
 * round and stops, which is true either way.
 */
export interface LiveBanner {
  /** *"The Salt Road is playing right now"* — the one line in bold. */
  readonly headline: string;
  /** *"Session 12 · round 3 · it's your turn"* — the line under it. */
  readonly detail: string;
  /** Whether this character is one of the rows in the fight. */
  readonly inTheFight: boolean;
  /** Whether the DM's marker is on this character. */
  readonly yourTurn: boolean;
}

export const liveBanner = (
  live: PlayerLiveTable | null,
  character: Character,
  /**
   * The campaign's name, from `GET /me/campaigns`.
   *
   * Not on `PlayerLiveTable`, and deliberately: `campaignId` is the join key and
   * that endpoint is the one that names campaigns — the rule `Character` itself
   * already follows. Absent for a membership that arrived between the two reads,
   * so the headline falls back to something that is still true.
   */
  campaignName: string | undefined,
): LiveBanner | undefined => {
  if (live === null) return undefined;

  const fight = live.fight;
  const seat = fight?.seats.find((row) => row.characterId === character.id);
  const inTheFight = seat !== undefined;
  const yourTurn =
    seat !== undefined && fight?.upNext !== null && fight?.upNext.combatantId === seat.combatantId;

  const detail: ReadonlyArray<string> = [
    `Session ${String(live.sessionNumber)}`,
    ...(fight === null
      ? // Not "no fight yet": the evening may be entirely a tavern, and a
        // "yet" would promise one is coming.
        ["nothing on the table"]
      : [
          `round ${String(fight.round)}`,
          ...(yourTurn
            ? ["it's your turn"]
            : fight.upNext === null
              ? []
              : [`${fight.upNext.displayName} is up`]),
          ...(inTheFight ? [] : [`${character.name} is not in this fight`]),
        ]),
  ];

  return {
    headline: `${campaignName ?? "Your table"} is playing right now`,
    detail: detail.join(" · "),
    inTheFight,
    yourTurn,
  };
};
