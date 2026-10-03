import type {
  Campaign,
  CampaignId,
  Combatant,
  CombatantId,
  Creature,
  CreatureId,
  EncounterRun,
  EncounterRunBoard,
  EncounterRunId,
  HobDirectResourceUpdate,
  Roll,
  Session,
  SessionId,
} from "@taverns/api";
import { Effect, Option } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { apiAtom, writableApiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import type { Resource } from "../api/failure";
import { reads, type Invalidation } from "../api/keys";
import { isDead } from "./deathSaves";

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

/**
 * The fight's board — its own copy of the grid, its map's picture, and its fog.
 *
 * **Writable, as the fight is (`liveStateAtom`).** The Fog tool's write answers
 * with the board, newer than any read, and the runner draws that answer
 * straight away rather than re-reading it (`RunScreen.tsx`'s `paintFog`).
 *
 * Names no reads: the fog is the one thing the product writes on a fight's
 * board, and only this screen writes it, so a key would have no other writer;
 * another of the DM's tabs is heard through the doorbell's `board-fog-updated`.
 * A grid edit on the encounter's page is the next fight's, by design
 * (`EncounterRunBoard`), and Hob finishing the picture is polled for by the
 * band that shows it.
 */
export const runBoardAtom = Atom.family((path: RunPath) =>
  writableApiAtom(
    (client): Effect.Effect<EncounterRunBoard | null, unknown> =>
      client.runs.board({ params: path }),
    [],
  ),
);

/** The most `rolls.list` answers at once (`packages/api` `Roll.ts`). */
const ROLLS_READ = 100;

/**
 * The night's rolls: the players' tray and the DM's own dice (`dice.ts`). Both
 * share this one read and every throw of an act is its own row, so it reads as
 * many as the API allows and the *Rolls* dock cuts the merged lines to
 * `DOCK_KEPT`. A session read; the doorbell refreshes it, payloads do not, and
 * a DM roll names it.
 */
export const rollsAtom = Atom.family((path: RunPath) =>
  apiAtom(
    (client): Effect.Effect<ReadonlyArray<Roll>, unknown> =>
      client.rolls.list({
        params: { campaignId: path.campaignId, sessionId: path.sessionId },
        query: { limit: ROLLS_READ },
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

/**
 * What hiding a combatant from players, or showing it again, changes outside
 * the fight: only what a seated player's table answers, where the server drops
 * a hidden row in SQL. Not the party — visibility is the fight's row alone and
 * is not written through to the character.
 */
export const combatantVisibilityWrites = (campaignId: CampaignId): Invalidation => [
  reads.playerTable(campaignId),
];

/**
 * What a stroke of the Fog tool changes outside the fight: only the seated
 * player's table, whose board covers the fogged squares and loses what stands
 * on them. The DM's own board takes the write's answer (`runBoardAtom`).
 */
export const boardFogWrites = (campaignId: CampaignId): Invalidation => [
  reads.playerTable(campaignId),
];

/**
 * What setting or rolling a party member's death saves changes outside the
 * fight: the character, which the server writes through to (the party), and
 * the seated player's table, which draws them on that player's own row.
 */
export const deathSaveWrites = (campaignId: CampaignId): Invalidation => [
  reads.party(campaignId),
  reads.playerTable(campaignId),
];

/**
 * The row after `at` in an initiative order, wrapping to the top: who is up
 * next. Nothing when the order is that one row alone. The order is the
 * server's and is never re-sorted here, so this is the row `nextTurn` walks to
 * on the DM's order, and on a player's (`play/turnBanner.ts`) the next row that
 * player may see.
 */
export const nextAfter = <Row>(order: ReadonlyArray<Row>, at: number): Row | undefined =>
  order.length > 1 && at >= 0 ? order[(at + 1) % order.length] : undefined;

/** "Brannoc is up · Goblin Boss next": the marker, and the row after it (`nextAfter`). */
export const upLine = (
  combatants: ReadonlyArray<Combatant>,
  activeId: CombatantId | null,
): string => {
  const at = combatants.findIndex((row) => row.id === activeId);
  const active = combatants[at];
  if (active === undefined) return "Nobody is up";
  const next = nextAfter(combatants, at);
  return next === undefined
    ? `${active.displayName} is up`
    : `${active.displayName} is up · ${next.displayName} next`;
};

/**
 * Whether a combatant is out of the fight, which the initiative strip and the
 * tokens (`tokenState`) draw faded and struck through: an NPC at zero hit points, which
 * `nextTurn` skips, or a PC with three failed death saves (`isDead`). A PC at zero who is
 * still making them is not out — they still get a turn
 * (`Combatant.deathSaves`, `repo/vitals.ts`).
 */
export const outOfTheFight = (combatant: Combatant, hp: number): boolean =>
  combatant.kind === "npc" ? hp === 0 : isDead(combatant);

/** The bar's line while the fight is rolling initiative: `Rolling initiative · 4 players, 7 monsters`. */
export const rollingLine = (combatants: ReadonlyArray<Combatant>): string => {
  const party = combatants.filter((row) => row.kind === "pc").length;
  const monsters = combatants.length - party;
  return `Rolling initiative · ${String(party)} ${party === 1 ? "player" : "players"}, ${String(
    monsters,
  )} ${monsters === 1 ? "monster" : "monsters"}`;
};

/** Whether the fight has a board to draw, so the layout can close the gap when it has none. */
export const hasBoard = (resource: Resource<EncounterRunBoard | null>): boolean =>
  !(resource.state === "ready" && resource.value === null);
