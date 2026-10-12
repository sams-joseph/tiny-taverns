import {
  CampaignId,
  type Combatant,
  CombatantId,
  type Creature,
  type CreatureId,
  CurrentActor,
  type DiagonalRule,
  type EncounterRun,
  type EncounterRunBoard,
  EncounterRunId,
  type EncounterRunScene,
  type NotFound,
  type NpcSpell,
  type NpcTurnOptions,
  npcTurnOptions,
  SessionId,
  spellcastingOf,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { BattleMaps } from "./BattleMaps.js";
import { Campaigns } from "./Campaigns.js";
import { Combatants } from "./Combatants.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { Creatures } from "./Creatures.js";
import { EncounterRuns } from "./EncounterRuns.js";
import { runOnTable, underFog } from "./liveTables.js";
import { dieOnSqlError, fromColumns } from "./rows.js";
import { RunScenes } from "./RunScenes.js";
import { Spells } from "./Spells.js";

/**
 * **The fight on a campaign's table, as its creator reads it** — everything a
 * model needs to choose a monster's turn, gathered from the reads the runner
 * itself makes: the run, its order, its board, its scene, the campaign's
 * diagonal rule and the stat blocks behind its creature rows. Nothing here
 * re-decides what is legal: whoever is up, when it is a monster, is read
 * through `npcTurnOptions`, the one rule the runner draws its marks from.
 *
 * Behind the `CampaignCreatorActor` proof on every method, as every runner
 * read is, so a player cannot reach it: there is no proof to give it, and a
 * run in another campaign is `NotFound` through the reads it composes.
 */
export interface TableFightRead {
  readonly sessionId: SessionId;
  readonly run: EncounterRun;
  /** The fight's board, or `null` for a fight with none. Its picture is not signed here. */
  readonly board: EncounterRunBoard | null;
  readonly diagonals: DiagonalRule;
  /** In initiative order, as `Combatants.list` answers it and `nextTurn` walks it. */
  readonly combatants: ReadonlyArray<Combatant>;
  /** The rows standing under fog (`liveTables.ts`' `underFog`), which the party cannot see. */
  readonly underFog: ReadonlySet<CombatantId>;
  /**
   * The creatures behind the fight's rows, by id. Provenance, not an access
   * path: a deleted creature is an ordinary miss, as it is to the runner.
   */
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
  /** The spells those stat blocks' spellcasting names, by lower-cased name (`Spells.named`). */
  readonly spells: ReadonlyMap<string, NpcSpell>;
  /** The run's scene: the encounter's tactic lines as beats, and its challenge. */
  readonly scene: EncounterRunScene;
  /** What whoever is up may do, when it is a monster's turn; absent otherwise. */
  readonly options: NpcTurnOptions | undefined;
}

const FoggedRow = fromColumns(Schema.Struct({ id: CombatantId }));
const OnTableRow = fromColumns(Schema.Struct({ sessionId: SessionId, runId: EncounterRunId }));

export class TableFight extends Context.Service<
  TableFight,
  {
    /** The fight on this campaign's table (`runOnTable`), read; `undefined` when there is none. */
    readonly onTable: (dm: CampaignCreatorActor) => Effect.Effect<TableFightRead | undefined>;
    /** One fight of this campaign's, named by its night and its run. */
    readonly read: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<TableFightRead, NotFound>;
  }
>()("TableFight") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const runs = yield* EncounterRuns;
      const combatants = yield* Combatants;
      const maps = yield* BattleMaps;
      const scenes = yield* RunScenes;
      const campaigns = yield* Campaigns;
      const creatures = yield* Creatures;
      const spells = yield* Spells;

      const live = SqlSchema.findOneOption({
        Request: Schema.toType(CampaignId),
        Result: OnTableRow,
        execute: (campaignId) => runOnTable(sql, campaignId),
      });
      /** Beneath `read`'s gate, which has already proved the run the creator's. */
      const fogged = SqlSchema.findAll({
        Request: Schema.toType(EncounterRunId),
        Result: FoggedRow,
        execute: (runId) => sql`
          select combatant.id from combatant
          where combatant.encounter_run_id = ${runId} and ${underFog(sql)}
        `,
      });

      const read = (dm: CampaignCreatorActor, sessionId: SessionId, runId: EncounterRunId) =>
        Effect.gen(function* () {
          // The two corpus-scoped reads take the proof's actor as the ambient one.
          const as = Effect.provideService(CurrentActor, dm.actor);
          // The run first: its gate is what the fog read below stands beneath.
          const run = yield* runs.findById(dm, sessionId, runId);
          const [rows, board, scene, campaign, fog] = yield* Effect.all(
            [
              combatants.list(dm, sessionId, runId),
              maps.forRun(dm, sessionId, runId),
              scenes.read(dm, sessionId, runId),
              campaigns.findById(dm.campaign).pipe(as),
              dieOnSqlError(fogged(runId)),
            ],
            { concurrency: "unbounded" },
          );

          const creatureIds = [
            ...new Set(rows.flatMap((row) => (row.creatureId === null ? [] : [row.creatureId]))),
          ];
          const found = yield* Effect.all(
            creatureIds.map((id) =>
              creatures.findById(dm.campaign, id).pipe(
                as,
                Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
              ),
            ),
            { concurrency: "unbounded" },
          );
          const byId = new Map(
            found.flatMap((creature) => (creature === undefined ? [] : [[creature.id, creature]])),
          );

          const names = [
            ...new Set(
              [...byId.values()].flatMap((creature) =>
                spellcastingOf(creature.statBlock).flatMap(({ spellcasting }) =>
                  spellcasting.spells.map((spell) => spell.name.toLowerCase()),
                ),
              ),
            ),
          ];
          const spellRows = yield* spells.named(dm, names);
          const spellMap = new Map<string, NpcSpell>(
            spellRows.map((spell) => [
              spell.name.toLowerCase(),
              {
                name: spell.name,
                level: spell.level,
                range: spell.range,
                castingTime: spell.castingTime,
                spell: spell.spell,
              },
            ]),
          );

          const statBlocks = new Map(
            [...byId.values()].map((creature) => [creature.id, creature.statBlock]),
          );
          const up = rows.find((row) => row.id === run.activeCombatantId);
          const options =
            up === undefined || up.kind === "pc"
              ? undefined
              : npcTurnOptions(
                  {
                    run,
                    combatants: rows,
                    board: board ?? undefined,
                    diagonals: campaign.diagonalRule,
                    statBlocks,
                    spells: spellMap,
                  },
                  up.id,
                );

          return {
            sessionId,
            run,
            board,
            diagonals: campaign.diagonalRule,
            combatants: rows,
            underFog: new Set(fog.map((row) => row.id)),
            creatures: byId,
            spells: spellMap,
            scene,
            options,
          } satisfies TableFightRead;
        });

      return {
        onTable: (dm) =>
          Effect.gen(function* () {
            const found = Option.getOrUndefined(yield* dieOnSqlError(live(dm.campaign)));
            if (found === undefined) return undefined;
            // The pointer was read beneath the proof a moment ago; a fight
            // ended or removed in between reads as no fight.
            return yield* read(dm, found.sessionId, found.runId).pipe(
              Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
            );
          }),
        read,
      };
    }),
  );

  /**
   * The layer Hob holds: over the **bare** live repositories, which sign
   * nothing (no `ImageUrls` reaches them), so a board's picture and a seat's
   * portrait never become a bearer URL a model could repeat. The handlers'
   * signed copies are `Layer.fresh` in `app.ts` so these stay unsigned.
   */
  static readonly unsigned = this.layer.pipe(
    Layer.provide([
      EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
      Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
      BattleMaps.layer.pipe(Layer.provide(LiveEvents.layer)),
      RunScenes.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      Creatures.layer,
      Spells.layer,
    ]),
  );
}
