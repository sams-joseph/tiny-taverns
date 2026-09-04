import {
  type Actor,
  type AssistantTurnId,
  type CampaignId,
  type CharacterId,
  type CombatantId,
  CurrentActor,
  type EncounterRunId,
  type SessionId,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { HobDirectWrites } from "../src/repo/HobDirectWrites.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Party } from "../src/repo/Party.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const database = migratedDatabase("taverns_test_hob_direct");
const runtime = ManagedRuntime.make(Layer.mergeAll(servicesOver(database), database));
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

interface Fixture {
  readonly dm: Actor;
  readonly player: Actor;
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly combatantId: CombatantId;
  readonly characterId: CharacterId;
}

const turnId = (suffix: string): AssistantTurnId =>
  `2b1f2a1e-0034-4000-8000-${suffix}` as AssistantTurnId;

const seed = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const combatants = yield* Combatants;
  const encounters = yield* Encounters;
  const runs = yield* EncounterRuns;
  const party = yield* Party;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Direct Write DM");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Counter Table", visibility: "shared" }));
  const player = yield* aPlayerAt(campaign.id, "Pip");
  const character = yield* withActor(player)(
    characters.createOwn(campaign.id, {
      name: "Pip",
      playerName: "Pip",
      level: 1,
      className: "Fighter",
      ac: 16,
      hpMax: 12,
      sheet: {
        notes: "",
        abilities: [],
        traits: [],
        resources: [
          {
            id: "res:second-wind",
            name: "Second Wind",
            used: 0,
            max: 2,
            recharge: "short",
          },
        ],
      },
    }),
  );
  yield* withActor(player)(party.join(campaign.id, { characterId: character.id }));
  const session = yield* as(sessions.create(campaign.id, { number: 1, visibility: "shared" }));
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "The Counter Fight", visibility: "shared" }),
  );
  const proof = yield* asDm(dm, campaign.id);
  const run = yield* runs.start(proof, session.id, {
    encounterId: encounter.id,
    includeParty: true,
    visibility: "shared",
  });
  const rows = yield* combatants.list(proof, session.id, run.id);
  const pc = rows.find((combatant) => combatant.characterId === character.id);
  if (pc === undefined) return yield* Effect.die(new Error("the seeded fight has no PC"));
  return {
    dm,
    player,
    campaignId: campaign.id,
    sessionId: session.id,
    runId: run.id,
    combatantId: pc.id,
    characterId: character.id,
  } satisfies Fixture;
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof seed>;

beforeAll(async () => {
  fixture = await runtime.runPromise(seed);
}, 60_000);

const usedOf = (characterId: Fixture["characterId"]) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    Effect.map(
      sql<{ readonly used: number }>`
        select (resource.value ->> 'used')::integer as used
        from character
        cross join lateral jsonb_array_elements(character.body -> 'resources') as resource(value)
        where character.id = ${characterId}
          and resource.value ->> 'id' = 'res:second-wind'
      `,
      (rows) => rows[0]?.used,
    ),
  );

const spend = (call: string) =>
  Effect.gen(function* () {
    const threads = yield* HobThreads;
    const direct = yield* HobDirectWrites;
    const proof = yield* asDm(fixture.dm, fixture.campaignId);
    const context = yield* direct.currentTargets(proof);
    if (context === undefined || context.targets.length === 0) {
      return yield* Effect.die(new Error("no direct target"));
    }
    const target = context.targets[0]!;
    const thread = yield* threads.start("dm", fixture.campaignId, "spend it");
    const result = yield* direct.spendResource(proof, {
      threadId: thread.id,
      turnId: turnId(call === "first" ? "000000000001" : "000000000002"),
      toolCallId: call,
      sessionId: target.sessionId,
      runId: target.runId,
      combatantId: target.combatantId,
      characterId: target.characterId,
      characterName: target.characterName,
      resourceId: target.resourceId,
      amount: 1,
    });
    return result.update;
  }).pipe(withActor(fixture.dm));

describe("Hob direct resource writes", () => {
  it("is off by default and a mid-fight revoke makes an in-flight spend fail", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const direct = yield* HobDirectWrites;
        const runs = yield* EncounterRuns;
        const proof = yield* asDm(fixture.dm, fixture.campaignId);

        expect(yield* direct.currentTargets(proof)).toBeUndefined();
        yield* runs.update(proof, fixture.sessionId, fixture.runId, { allowHobDirectWrites: true });
        const enabled = yield* direct.currentTargets(proof);
        expect(enabled?.targets.map((target) => target.resourceName)).toEqual(["Second Wind"]);

        yield* runs.update(proof, fixture.sessionId, fixture.runId, {
          allowHobDirectWrites: false,
        });
        expect(yield* direct.currentTargets(proof)).toBeUndefined();

        const threads = yield* HobThreads;
        const thread = yield* threads.start("dm", fixture.campaignId, "spend it");
        const failed = yield* Effect.flip(
          direct.spendResource(proof, {
            threadId: thread.id,
            turnId: turnId("000000000010"),
            toolCallId: "revoked",
            sessionId: fixture.sessionId,
            runId: fixture.runId,
            combatantId: fixture.combatantId,
            characterId: fixture.characterId,
            characterName: "Pip",
            resourceId: "res:second-wind",
            amount: 1,
          }),
        );
        expect(failed).toMatchObject({ _tag: "Conflict" });
        expect(yield* usedOf(fixture.characterId)).toBe(0);
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );
  }, 60_000);

  it("audits a spend and undoes it only while the counter still has Hob's after value", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const runs = yield* EncounterRuns;
        const direct = yield* HobDirectWrites;
        const proof = yield* asDm(fixture.dm, fixture.campaignId);
        yield* runs.update(proof, fixture.sessionId, fixture.runId, { allowHobDirectWrites: true });

        const events = yield* SessionEvents;
        const first = yield* spend("first");
        expect(first).toMatchObject({ beforeUsed: 0, afterUsed: 1, resourceName: "Second Wind" });
        expect(yield* usedOf(fixture.characterId)).toBe(1);

        const duplicate = yield* spend("first");
        expect(duplicate.id).toBe(first.id);
        expect(yield* usedOf(fixture.characterId)).toBe(1);
        expect(
          (yield* events.listForRun(proof, fixture.sessionId, fixture.runId, 0, 200)).filter(
            (event) => event.kind === "hob-resource-spent",
          ),
        ).toHaveLength(1);

        const undone = yield* direct.undo(proof, fixture.sessionId, fixture.runId, first.id);
        expect(undone.undoneAt).not.toBeNull();
        expect(yield* usedOf(fixture.characterId)).toBe(0);
        expect(
          (yield* events.listForRun(proof, fixture.sessionId, fixture.runId, 0, 200)).filter(
            (event) => event.kind === "hob-resource-undone",
          ),
        ).toHaveLength(1);

        const again = yield* direct.undo(proof, fixture.sessionId, fixture.runId, first.id);
        expect(again.id).toBe(first.id);
        expect(yield* usedOf(fixture.characterId)).toBe(0);

        const second = yield* spend("second");
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          update character
          set body = jsonb_set(body, array['resources','0','used'], to_jsonb(0), false)
          where id = ${fixture.characterId}
        `;
        const refused = yield* Effect.flip(
          direct.undo(proof, fixture.sessionId, fixture.runId, second.id),
        );
        expect(refused).toMatchObject({ _tag: "Conflict" });
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );
  }, 60_000);
});
