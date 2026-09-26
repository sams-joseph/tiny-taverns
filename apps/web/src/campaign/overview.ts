import type {
  Beat,
  CampaignId,
  Encounter,
  EncounterPrep,
  Note,
  PartySeat,
  Session,
} from "@taverns/api";
import { DateTime, Effect } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";
import type { CarriedFight } from "../chronicle/fight";
import { difficultyWord } from "./difficulty";
import { encounterPrepListAtom } from "./load";

/**
 * The Overview's rules about its data, apart from its cards so each can be
 * tested on its own and the card files export only components.
 */

/**
 * The last night the table finished, read back — the creator's `SessionRecap`
 * or a player's `PlayerSessionRecap`. *Last time* reads only the beats and how
 * each fight went, which the two share, so one card can take either.
 */
export interface LastNight {
  readonly session: Session;
  readonly recap: {
    readonly beats: ReadonlyArray<Beat>;
    readonly fights: ReadonlyArray<CarriedFight>;
  };
}

/**
 * The Overview's own read on top of the campaign view: the newest finished
 * night and its recap, or `undefined` before the table has finished one.
 *
 * **One atom making two calls**, because the second call's argument is the
 * first one's answer and there is no screen that wants the list without the
 * recap here. It is the frame's `extra`, so the Overview is still one resource
 * with three states, and a real atom rather than a derived one, so the frame's
 * *Try again* can refresh it.
 *
 * It answers `reads.sessions`, which finishing a night names — so the card
 * moves to the night just ended without a reload. `sessions.list` is newest
 * first (`session.number desc`), and the open night, if any, is the one with no
 * `endedAt`.
 */
export const lastNightAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) =>
      Effect.gen(function* () {
        const sessions = yield* client.sessions.list({ params: { campaignId } });
        const session = sessions.find((row) => row.endedAt !== null);
        if (session === undefined) return undefined;
        const recap = yield* client.recap.read({
          params: { campaignId, sessionId: session.id },
        });
        return { session, recap } satisfies LastNight;
      }),
    [reads.sessions(campaignId)],
  ),
);

/** What the Overview reads on top of the campaign view. */
export interface OverviewExtra {
  readonly lastNight: LastNight | undefined;
  /** Every encounter's prep, for *Next session*'s *Ready* and *Draft*. */
  readonly prep: ReadonlyArray<EncounterPrep>;
}

/**
 * The Overview's `extra`: *Last time*, and the encounters' prep the Encounters
 * page reads too — its atom, so moving between the two costs no request. Both
 * are the creator's, as the Overview is. Derived, so the frame's *Try again*
 * reaches it through the keys its parts answer (`reads.sessions`,
 * `reads.encounters`), which `campaignViewKeys` names.
 */
export const overviewExtraAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable((get: Atom.AtomContext): AsyncResult.AsyncResult<OverviewExtra, unknown> =>
    combine(
      get,
      AsyncResult.all({
        lastNight: get(lastNightAtom(campaignId)),
        prep: get(encounterPrepListAtom(campaignId)),
      }) as AsyncResult.AsyncResult<OverviewExtra, unknown>,
    ),
  ),
);

/**
 * The party's level, as the header draws it: one level when everyone at the
 * table is at it, the span when they are not.
 *
 * Never an average — *"Lvl 4.7"* is a level nobody at the table has. A seat
 * whose character is gone, or a character with no level written, says nothing
 * about it, and a party with no level at all draws no figure rather than a
 * guessed one.
 */
export const partyLevel = (party: ReadonlyArray<PartySeat>): string | undefined => {
  const levels = party.flatMap((row) =>
    row.character?.level == null ? [] : [row.character.level],
  );
  if (levels.length === 0) return undefined;
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  return low === high ? `Lvl ${String(low)}` : `Lvl ${String(low)}–${String(high)}`;
};

/** How many the card shows: the redesign draws three. */
const RECENT = 3;

/**
 * The notes touched last, newest first — by `updatedAt`, because a note
 * rewritten this morning is more recent than the order it was first written in.
 * Copied before sorting: `view.notes` is the frame's list and is shared.
 */
export const recentNotes = <N extends Pick<Note, "updatedAt">>(
  notes: ReadonlyArray<N>,
): ReadonlyArray<N> =>
  [...notes]
    .sort((a, b) => DateTime.toEpochMillis(b.updatedAt) - DateTime.toEpochMillis(a.updatedAt))
    .slice(0, RECENT);

/**
 * The prose the night opens on: the first read-aloud written for the first
 * encounter on deck.
 *
 * The redesign draws an *Opening read-aloud* and nothing marks a note as the
 * opening one, so this is the captain's rule for today's data — the first
 * encounter is the one the night reaches first, and its first read-aloud is
 * what gets read out when it does. Both lists are oldest first, so "first" is
 * the order the DM wrote them in. With no such note there is no inset, rather
 * than one stubbed with somebody else's prose.
 */
export const openingReadAloud = (
  encounters: ReadonlyArray<Encounter>,
  notes: ReadonlyArray<Note>,
): Note | undefined => {
  const first = encounters[0];
  if (first === undefined) return undefined;
  return notes.find(
    (note) =>
      note.kind === "read_aloud" &&
      note.body.trim() !== "" &&
      note.attachedTo?.kind === "encounter" &&
      note.attachedTo.id === first.id,
  );
};

/**
 * `Medium · 6 creatures · Marsh, Night` — what the wire has to say about an
 * encounter. The drawing's DC is not on `Encounter` and is left out; the band
 * is the one the server computed from the roster and the party. *Ready* or
 * *Draft* is the prep's, drawn beside this rather than in it.
 */
export const encounterDetail = (encounter: Encounter): string =>
  [
    difficultyWord(encounter.difficulty),
    encounter.creatureCount === 0
      ? "No creatures yet"
      : `${String(encounter.creatureCount)} ${encounter.creatureCount === 1 ? "creature" : "creatures"}`,
    encounter.tags.join(", "),
  ]
    .filter((part) => part !== "")
    .join(" · ");

/** The anchor of one shared note on a player's Overview, which its Recent notes row jumps to. */
export const sharedNoteAnchor = (id: string): string => `note-${id}`;
