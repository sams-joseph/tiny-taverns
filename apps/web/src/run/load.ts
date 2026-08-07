import type {
  Campaign,
  CampaignId,
  Combatant,
  Creature,
  CreatureId,
  EncounterRun,
  EncounterRunId,
  Session,
  SessionId,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the runner reads, split by how often it changes.
 *
 * Everything a fight needs is loaded once by `loadRunView`; only the two things
 * a fight *changes* are re-read afterwards. That split is the whole reason this
 * file has two Effects rather than one: the doorbell rings on every hit, every
 * turn and every condition, and re-reading the campaign and the bestiary each
 * time would be six requests where two will do.
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

/** Everything the runner renders. */
export interface RunView extends LiveState {
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
 * One Effect for the whole screen, exactly as `campaign/load.ts` composes the
 * campaign view.
 *
 * Five endpoints, one round, all concurrent: every one of them is addressed by
 * an id already in the route, so there is no waterfall to be had. Five hooks
 * would give the runner thirty-two combinations of loading and failed to render
 * while a DM waits with their finger on the table.
 */
export const loadRunView = (path: RunPath) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const { campaignId, sessionId } = path;
    const [campaign, session, live, creatures] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.sessions.findById({ params: { campaignId, sessionId } }),
        loadLiveState(path)(client),
        client.creatures.list({ params: { campaignId }, query: {} }),
      ],
      { concurrency: "unbounded" },
    );

    return {
      campaign,
      session,
      ...live,
      creatures: new Map(creatures.map((creature) => [creature.id, creature])),
    } satisfies RunView;
  });

/** `"Half-orc paladin · Ilse"` — the fixtures' `sub` line, assembled here. */
export const subtitleOf = (combatant: Combatant): string | undefined => {
  const parts = [combatant.subtitle, combatant.playerName].filter(
    (part): part is string => part !== null && part !== "",
  );
  return parts.length === 0 ? undefined : parts.join(" · ");
};
