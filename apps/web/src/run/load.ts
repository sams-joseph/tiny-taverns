import type {
  Campaign,
  CampaignId,
  Combatant,
  Creature,
  CreatureId,
  CreatureSort,
  EncounterRun,
  EncounterRunId,
  Session,
  SessionId,
  PageCursor,
} from "@taverns/api";
import { Effect, Option } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, writableApiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads, type Invalidation } from "../api/keys";
import { collectPages, WHOLE_LIST } from "../api/page";

/**
 * What the runner reads, split by how often it changes — and the atoms over it.
 *
 * The campaign, the night and the bestiary are read once; only the two rows a
 * fight *changes* are re-read afterwards. That split is the whole reason this
 * file has two Effects rather than one: the doorbell rings on every hit, every
 * turn and every condition, and re-reading the campaign and the bestiary each
 * time would be six requests where two will do.
 *
 * **The split is an atom boundary now, not only an Effect one.** It used to be
 * one `runViewAtom` over all five endpoints, with the live half re-read
 * separately by `run/state.ts` into a `useState` copy — so the fight existed
 * twice and the two copies could disagree about what the server last said. They
 * are one atom now, `liveStateAtom`, which the doorbell refreshes and a write's
 * own answer edits. `runViewAtom` is what the screen renders and is derived
 * from both, exactly as `party/load.ts` derives its roster.
 */

/** The ids every live endpoint takes. Passed around as one value. */
export interface RunPath {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
}

/** The half of the screen that a fight changes. */
export interface LiveState {
  readonly run: EncounterRun;
  /**
   * In the order the server returned them, which is initiative order —
   * `initiative desc, created_at asc, id asc`. The client does not re-sort:
   * that ordering is also what `nextTurn` walks, so a second implementation of
   * it here could disagree with the marker the server moves.
   */
  readonly combatants: ReadonlyArray<Combatant>;
}

/** The half of the screen a fight does not change, read once. */
export interface RunFrame {
  readonly campaign: Campaign;
  readonly session: Session;
  /**
   * The bestiary, indexed — the stat-block panel's whole source.
   *
   * A combatant carries `creatureId` as *provenance*, not as an access path
   * (`Combatant.ts`), so a stat block is a lookup that may legitimately miss:
   * the creature may have been deleted, or may be one this credential cannot
   * read. The panel says so rather than rendering an empty document.
   */
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
}

/** Everything the runner renders. */
export interface RunView extends RunFrame, LiveState {}

/**
 * The two rows a fight writes, re-read after every change.
 *
 * Concurrent, because neither depends on the other, and both because a turn
 * advance moves a pointer on the run *and* nothing on the combatants while a
 * hit moves hit points on a combatant and nothing on the run — a client that
 * guessed which had changed would be wrong on the third kind of event.
 */
export const loadLiveState =
  ({ campaignId, sessionId, runId }: RunPath) =>
  (client: TavernsClient) =>
    Effect.gen(function* () {
      const [run, combatants] = yield* Effect.all(
        [
          client.runs.findById({ params: { campaignId, sessionId, runId } }),
          client.combatants.list({ params: { campaignId, sessionId, runId } }),
        ],
        { concurrency: "unbounded" },
      );
      return { run, combatants } satisfies LiveState;
    });

/**
 * The three reads a fight never changes, in one round.
 *
 * All concurrent: every one of them is addressed by an id already in the route,
 * so there is no waterfall to be had. Three hooks would give the runner eight
 * combinations of loading and failed to render while a DM waits with their
 * finger on the table.
 */
export const loadRunFrame = (path: RunPath) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const { campaignId, sessionId } = path;
    const [campaign, session, creatures] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.sessions.findById({ params: { campaignId, sessionId } }),
        // The whole reachable bestiary, because this is a lookup table from a
        // combatant's `creatureId` to a row — a page of it would leave holes.
        collectPages((cursor: PageCursor<CreatureSort> | undefined) =>
          client.creatures.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
        ),
      ],
      { concurrency: "unbounded" },
    );

    return {
      campaign,
      session,
      creatures: new Map(creatures.map((creature) => [creature.id, creature])),
    } satisfies RunFrame;
  });

/**
 * The campaign, the night and the bestiary, read once and never again by a hit.
 *
 * It names no reads for the reason every write in `run/` names none: what a
 * fight changes is the fight, and the two rows that hold it are the atom below.
 */
export const runFrameAtom = Atom.family((path: RunPath) => apiAtom(loadRunFrame(path), []));

/**
 * The fight itself — the one place the run and its combatants live.
 *
 * **Writable, which is what makes it the one place.** The runner learns what it
 * just did from its own write's answer rather than from the doorbell (that is
 * how it stays usable with the connection down), and before this that answer
 * had nowhere to go but a second copy of the fight in React state. Now
 * `nextTurn`'s run and `damage`'s combatant are written straight in, and the
 * next refresh replaces them with whatever the server holds. See
 * `writableApiAtom`.
 *
 * **It still names no reads, and the reason has changed.** It used to be that a
 * refresh would reset the optimistic layer; that is no longer true — the
 * pending hit points are the controller's and survive a refresh, which is rule
 * two of `run/state.ts` working. What is true is that nothing in the product
 * writes this fight except the runner itself, so a reactivity key would have no
 * writer. If one ever does — a player's own damage, say — this is where it goes,
 * and it is now safe to put it here.
 */
export const liveStateAtom = Atom.family((path: RunPath) =>
  writableApiAtom(loadLiveState(path), []),
);

/**
 * What the screen renders: the frame and the fight, as one value and three
 * states.
 *
 * **A live re-read that fails after a good one must not become an error card**,
 * which is the one thing `AsyncResult.all` alone would get wrong — it passes a
 * failure straight through, and a fight the DM can still read beats an error
 * card where the initiative list was. So a failure that carries a previous
 * success contributes that success here, and the failure itself is what
 * `run/state.ts` renders as *"this may be a moment behind"*. A failure with **no**
 * previous success is the first load failing, and that is an error card.
 *
 * Refreshing a derived atom re-runs its read and hands back the same cached
 * parts, so the second argument names them — the same reason `party/load.ts`
 * gives, and what makes the failure notice's *Try again* try both halves again.
 */
export const runViewAtom = Atom.family((path: RunPath) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<RunView, unknown> => {
      const live = get(liveStateAtom(path));
      const shown =
        AsyncResult.isFailure(live) && Option.isSome(live.previousSuccess)
          ? live.previousSuccess.value
          : live;
      return AsyncResult.map(
        AsyncResult.all({ frame: get(runFrameAtom(path)), live: shown }),
        ({ frame, live: rows }): RunView => ({ ...frame, ...rows }),
      );
    },
    (refresh) => {
      refresh(runFrameAtom(path));
      refresh(liveStateAtom(path));
    },
  ),
);

/** `"Half-orc paladin · Ilse"` — the fixtures' `sub` line, assembled here. */
export const subtitleOf = (combatant: Combatant): string | undefined => {
  const parts = [combatant.subtitle, combatant.playerName].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length === 0 ? undefined : parts.join(" · ");
};

/**
 * What saving a combatant changes outside the fight it is in.
 *
 * **`conditions` is written through to the `character` row** — one transaction,
 * `repo/vitals.ts` — so a condition typed on the initiative list moves what the
 * DM's party strip and party screen say, on a screen this dialog has never
 * seen. That is the one thing here that is not the fight's own.
 *
 * The fight itself is deliberately absent: the runner learns what it just did
 * from the write's own answer and from the stream, and nothing outside this
 * screen reads a combatant. Removing one names nothing at all for the same
 * reason — `combatant.character_id` is provenance, not a write-through.
 *
 * Named rather than inlined so the reason has somewhere to live and the list is
 * assertable; `characters/write.ts`'s `ownCharacterWrites` is the same shape for
 * the same reason.
 */
export const combatantWrites = (campaignId: CampaignId): Invalidation => [
  reads.characters(campaignId),
];
