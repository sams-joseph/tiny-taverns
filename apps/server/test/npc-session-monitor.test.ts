import { randomUUID } from "node:crypto";
import {
  type Actor,
  CurrentActor,
  emptyCharacterSheet,
  type NpcId,
  type NpcSessionMonitor,
  type NpcTurnId,
} from "@taverns/api";
import { describe, expect } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { Statement } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcProposals } from "../src/repo/NpcProposals.js";
import { Npcs } from "../src/repo/Npcs.js";
import { NpcThreads } from "../src/repo/NpcThreads.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCharacterAt, anAccount, aPlayerAt, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The creator's NPC monitor costs the same number of statements however
 * many NPCs are open at the table.**
 *
 * The monitor is re-read on every doorbell during play, and it used to read
 * each open thread's NPC, lines, pending proposals and last finish one thread
 * at a time: four statements per thread. It now reads each of those once for
 * every thread, and this file holds both halves of that:
 *
 *   1. **The count does not grow with the table.** Measured with
 *      `Statement.CurrentTransformer`, which sees every statement the effect
 *      puts on the wire and nothing any other fiber does.
 *   2. **Reading every thread at once answers what reading each alone does.**
 *      Each entry is compared with the player-safe reads of the same NPC and
 *      thread, and each count and failure with what the fixture wrote.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Groups.layer,
  Invites.layer,
  Npcs.layer,
  NpcProposals.layer.pipe(
    Layer.provide([
      Campaigns.layer,
      Notes.layer,
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      NpcMemories.layer,
      NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
    ]),
  ),
  NpcThreads.layer.pipe(Layer.provide(LiveEvents.layer)),
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_npc_session_monitor")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** What `effect` answers, and the text of every statement it ran to answer it. */
const counted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const statements: Array<string> = [];
    const value = yield* Effect.provideService(effect, Statement.CurrentTransformer, (statement) =>
      Effect.sync(() => {
        statements.push(statement.compile()[0]);
        return statement;
      }),
    );
    return { value, statements };
  });

/**
 * A creator's table on a live night: four shared NPCs, a seated player, and
 * nothing open at the table yet.
 */
const makeFixture = Effect.gen(function* () {
  const npcs = yield* Npcs;
  const sessions = yield* Sessions;
  const campaigns = yield* Campaigns;

  const dm = yield* anAccount("Jo");
  const campaign = yield* withActor(dm)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const creator = yield* withActor(dm)(asDm(dm, campaign.id));
  const player = yield* aPlayerAt(campaign.id, "Pim");
  yield* aCharacterAt(campaign.id, player, { name: "Brannoc", sheet: emptyCharacterSheet });

  const session = yield* withActor(dm)(
    sessions.create(campaign.id, { number: 7, title: "Market voices", visibility: "shared" }),
  );
  yield* withActor(dm)(campaigns.update(campaign.id, { currentSessionId: session.id }));

  const cast: Array<NpcId> = [];
  for (const name of ["Cazril", "Wick", "Marrow", "Ilse"]) {
    const npc = yield* npcs.create(creator, {
      name,
      role: "a voice in the market",
      persona: { identity: { summary: `${name} keeps a stall.` } },
      visibility: "shared",
    });
    cast.push(npc.id);
  }
  return { dm, player, campaign, creator, session, cast };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-session-monitor.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/**
 * Open `npcId` at the table and give it a conversation: a player's line, then
 * one NPC reply per `pending` proposal (at least one), each filed against its
 * own reply. Every reply ends in `stop` but the last, which ends as `finish`
 * says; `null` means the NPC has not answered at all.
 */
const converse = (npcId: NpcId, finish: string | null, pending: number) =>
  Effect.gen(function* () {
    const { dm, player, campaign, creator, session } = yield* Fixture;
    const threads = yield* NpcThreads;
    const proposals = yield* NpcProposals;
    const thread = yield* threads.openSession(creator, npcId, session.id);
    yield* withActor(player)(
      threads.sessionAppend(campaign.id, session.id, npcId, {
        id: randomUUID() as NpcTurnId,
        who: "user",
        text: "What did you see at the ford?",
        requestId: `ask-${npcId}`,
      }),
    );
    if (finish === null) return thread;
    const replies = Math.max(1, pending);
    for (let index = 0; index < replies; index++) {
      const reply = randomUUID() as NpcTurnId;
      yield* withActor(dm)(
        threads.sessionAppend(campaign.id, session.id, npcId, {
          id: reply,
          who: "npc",
          text: `Lanterns, and a boat with no oars (${index}).`,
          model: "scripted-local",
          finishReason: index === replies - 1 ? finish : "stop",
        }),
      );
      if (index < pending) {
        yield* withActor(dm)(
          proposals.record(campaign.id, npcId, thread.id, reply, {
            kind: "beat",
            body: `A boat with no oars, noted ${index}.`,
          }),
        );
      }
    }
    return thread;
  });

const monitor = (configured: boolean) =>
  Effect.gen(function* () {
    const { creator, session } = yield* Fixture;
    const threads = yield* NpcThreads;
    return yield* threads.sessionMonitor(creator, session.id, "scripted-local", configured);
  });

describeLayer("npc-session-monitor", shared, (it) => {
  describe("the creator's NPC monitor", () => {
    it.effect("runs the same statements for one open NPC as for every open NPC", () =>
      Effect.gen(function* () {
        const [cazril, wick, marrow] = (yield* Fixture).cast;
        const none = yield* counted(monitor(true));
        yield* converse(cazril!, "stop", 1);
        const one = yield* counted(monitor(true));
        yield* converse(wick!, "length", 2);
        yield* converse(marrow!, null, 0);
        const all = yield* counted(monitor(true));

        // The night's gate and its threads; with no thread open, nothing else.
        expect(none.value).toEqual([]);
        expect(none.statements).toHaveLength(2);
        // Then the NPCs, the lines, the pending proposals and the last finishes,
        // once each for every thread.
        expect(one.value).toHaveLength(1);
        expect(all.value).toHaveLength(3);
        expect(one.statements).toHaveLength(2 + 4);
        expect(all.statements).toHaveLength(one.statements.length);
      }),
    );

    it.effect("answers for each open NPC what reading that NPC alone does", () =>
      Effect.gen(function* () {
        const { dm, campaign, creator, session, cast } = yield* Fixture;
        const [cazril, wick, marrow, ilse] = cast;
        const threads = yield* NpcThreads;
        // The previous test opened three; pause one so `available` differs.
        yield* threads.pauseSession(creator, marrow!, session.id);
        const monitored = yield* monitor(true);
        const unconfigured = yield* monitor(false);
        const alone = yield* Effect.forEach(monitored, (entry) =>
          withActor(dm)(
            Effect.all({
              npc: threads.sessionFind(campaign.id, session.id, entry.npc.id),
              turns: threads.sessionTurns(campaign.id, session.id, entry.npc.id),
            }),
          ),
        );

        const byNpc = (entries: ReadonlyArray<NpcSessionMonitor>, id: NpcId | undefined) =>
          entries.find((entry) => entry.npc.id === id)!;

        // Newest first, as the table last spoke; the NPC never opened is absent.
        expect(monitored.map((entry) => entry.npc.id)).toEqual([marrow, wick, cazril]);
        expect(monitored.map((entry) => entry.npc.id)).not.toContain(ilse);
        for (const [index, entry] of monitored.entries()) {
          expect(entry.npc).toEqual(alone[index]!.npc);
          expect(entry.turns).toEqual(alone[index]!.turns);
          expect(entry.thread.npcId).toBe(entry.npc.id);
          expect(entry.turns.every((turn) => turn.threadId === entry.thread.id)).toBe(true);
        }

        expect(byNpc(monitored, cazril).turns.map((turn) => [turn.who, turn.speakerName])).toEqual([
          ["user", "Pim"],
          ["npc", null],
        ]);
        expect(byNpc(monitored, marrow).turns.map((turn) => turn.who)).toEqual(["user"]);

        expect(byNpc(monitored, cazril).pendingProposals).toBe(1);
        expect(byNpc(monitored, wick).pendingProposals).toBe(2);
        expect(byNpc(monitored, marrow).pendingProposals).toBe(0);

        expect(byNpc(monitored, cazril).lastFailure).toBeNull();
        expect(byNpc(monitored, wick).lastFailure).toBe("Last reply ended with length.");
        expect(byNpc(monitored, marrow).lastFailure).toBeNull();

        expect(byNpc(monitored, cazril).available).toBe(true);
        expect(byNpc(monitored, marrow).available).toBe(false);
        expect(byNpc(monitored, marrow).thread.sessionState).toBe("paused");

        expect(unconfigured.map((entry) => entry.available)).toEqual([false, false, false]);
        expect(unconfigured.map((entry) => entry.lastFailure)).toEqual([
          "No model is configured behind NPC chat.",
          "No model is configured behind NPC chat.",
          "No model is configured behind NPC chat.",
        ]);
      }),
    );
  });
});
