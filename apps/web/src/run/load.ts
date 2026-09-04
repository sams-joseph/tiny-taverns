import type {
  Campaign,
  CampaignId,
  Combatant,
  Creature,
  CreatureId,
  EncounterRun,
  EncounterRunId,
  HobDirectResourceUpdate,
  Roll,
  Session,
  SessionId,
} from "@taverns/api";
import { Effect, Option } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, writableApiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads, type Invalidation } from "../api/keys";

/**
 * What the runner reads, split by how often it changes — and the atoms over it.
 *
 * The campaign, the night and the bestiary are read once; only the live run,
 * its combatants and Hob's audit rows are re-read afterwards. That split is the
 * whole reason this file has two Effects rather than one: the doorbell rings on
 * every hit, every turn and every condition, and re-reading the campaign and
 * the bestiary each time would be six requests where the live slice will do.
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
  /** Hob's audited direct resource spends for this fight, newest first. */
  readonly directUpdates: ReadonlyArray<HobDirectResourceUpdate>;
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
   * The stat blocks behind this fight's combatants, indexed by creature id.
   *
   * Resolved per combatant through `creatures.findById` rather than by
   * collecting the corpus list: since the instancing decision of 2026-09-02
   * that list is the picker's (the bundle, the Library, the group's shares)
   * and never contains the campaign instances a fight's rows point at — only
   * the by-id read reaches those. A combatant carries `creatureId` as
   * *provenance*, not as an access path (`Combatant.ts`), so a lookup may
   * legitimately miss: the creature may have been deleted, or may be one this
   * credential cannot read. The panel says so rather than rendering an empty
   * document.
   */
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
}

/** Everything the runner renders. */
export interface RunView extends RunFrame, LiveState {}

/**
 * The live slice a fight writes, re-read after every change.
 *
 * Concurrent, because none depends on the other, and all three because a turn
 * advance moves a pointer on the run, a hit moves hit points on a combatant,
 * and Hob's direct spend adds an audit row — a client that guessed which had
 * changed would be wrong on the third kind of event.
 */
export const loadLiveState =
  ({ campaignId, sessionId, runId }: RunPath) =>
  (client: TavernsClient) =>
    Effect.gen(function* () {
      const [run, combatants, directUpdates] = yield* Effect.all(
        [
          client.runs.findById({ params: { campaignId, sessionId, runId } }),
          client.combatants.list({ params: { campaignId, sessionId, runId } }),
          client.runs.hobDirectUpdates({ params: { campaignId, sessionId, runId } }),
        ],
        { concurrency: "unbounded" },
      );
      return { run, combatants, directUpdates } satisfies LiveState;
    });

/**
 * The reads a fight never changes, in one round plus one.
 *
 * The campaign, the night and this run's combatant list load concurrently;
 * then each distinct `creatureId` on the list resolves through
 * `creatures.findById`, concurrently and tolerating misses. Two rounds rather
 * than one because which stat blocks a fight needs is written on its own rows
 * — the same cost `campaign/load.ts` pays for the same reason. A fight's set
 * of creatures is fixed at seed time (`CombatantCreate` carries no creature),
 * so reading it in the frame cannot go stale under the doorbell.
 */
export const loadRunFrame = (path: RunPath) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const { campaignId, sessionId, runId } = path;
    const [campaign, session, combatants] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.sessions.findById({ params: { campaignId, sessionId } }),
        client.combatants.list({ params: { campaignId, sessionId, runId } }),
      ],
      { concurrency: "unbounded" },
    );

    const creatureIds = [
      ...new Set(
        combatants
          .map((combatant) => combatant.creatureId)
          .filter((creatureId): creatureId is CreatureId => creatureId !== null),
      ),
    ];
    const creatures = yield* Effect.all(
      creatureIds.map((creatureId) =>
        client.creatures
          .findById({ params: { campaignId, creatureId } })
          // Provenance, not an access path: a deleted or unreadable creature
          // is an ordinary miss the panel has a sentence for.
          .pipe(Effect.catchTag("NotFound", () => Effect.succeed(undefined))),
      ),
      { concurrency: "unbounded" },
    );

    return {
      campaign,
      session,
      creatures: new Map(
        creatures
          .filter((creature): creature is Creature => creature !== undefined)
          .map((creature) => [creature.id, creature]),
      ),
    } satisfies RunFrame;
  });

/**
 * The campaign, the night and the bestiary, read once and never again by a hit.
 *
 * It names no reads for the reason every write in `run/` names none: what a
 * fight changes is the fight, and the live rows that hold it are the atom below.
 */
export const runFrameAtom = Atom.family((path: RunPath) => apiAtom(loadRunFrame(path), []));

/**
 * The fight itself — the one place the run, its combatants and Hob's audit live.
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

/** The dice tray is a session read. The doorbell refreshes it; payloads do not. */
export const rollsAtom = Atom.family((path: RunPath) =>
  apiAtom(
    (client): Effect.Effect<ReadonlyArray<Roll>, unknown> =>
      client.rolls.list({
        params: { campaignId: path.campaignId, sessionId: path.sessionId },
        query: { limit: 12 },
      }),
    [reads.rolls(path.sessionId)],
  ),
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
export const combatantWrites = (campaignId: CampaignId): Invalidation => [reads.party(campaignId)];
