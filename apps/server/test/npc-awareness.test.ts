import { describe, expect } from "@effect/vitest";
import { type Actor, type AssistantTurnId, CurrentActor, type HobEvent } from "@taverns/api";
import { Context, Effect, Layer, Result, Stream } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Acts } from "../src/repo/Acts.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignStories } from "../src/repo/CampaignStories.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcPreps } from "../src/repo/NpcPrep.js";
import { NpcSheets } from "../src/repo/NpcSheets.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { describeLayer } from "./support/suite.js";

const MAX_TOKENS = 4096;

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  CampaignStories.layer,
  Groups.layer,
  GroupHistory.layer,
  Creatures.layer,
  CampaignCreatorActors.layer,
  EquipmentRepo.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
  NpcPreps.layer,
  NpcSheets.layer,
  Options.layer,
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Acts.layer,
  PrepItems.layer,
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_npc_awareness")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const makeFixture = Effect.gen(function* () {
  const creators = yield* CampaignCreatorActors;
  const npcs = yield* Npcs;
  const notes = yield* Notes;

  const dm = yield* anAccount("Awareness DM");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Silver Ford", visibility: "shared" }));
  const creator = yield* as(creators.of(campaign.id));
  const npc = yield* npcs.create(creator, {
    name: "Cazril",
    role: "ferryman",
    persona: { identity: { summary: "Keeper of the ford." } },
    privateMaterial: { secrets: "Cazril owes a moonlit debt." },
  });
  const note = yield* as(
    notes.create(campaign.id, {
      title: "Cazril's secret price",
      body: "Cazril bargains with names rather than coin.",
      visibility: "dm",
    }),
  );
  const other = yield* as(createCampaign({ name: "The Other Ford", visibility: "shared" }));
  const otherNote = yield* as(
    notes.create(other.id, {
      title: "Wrong ford",
      body: "This source must not validate for Cazril.",
      visibility: "dm",
    }),
  );

  return {
    dm,
    creator,
    campaignId: campaign.id,
    npcId: npc.id,
    sourceNoteId: note.id,
    otherNoteId: otherNote.id,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-awareness.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const begunTurn = (events: ReadonlyArray<HobEvent>) => {
  const event = events.find((item) => item.event === "began");
  if (event?.event !== "began") throw new Error("Hob did not begin");
  return event.data.turnId;
};

describeLayer("npc-awareness", shared, (it) => {
  describe("Hob-researched NPC awareness candidates", () => {
    it.effect(
      "validates source ids against the NPC's own campaign before a candidate can be stored",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const refused = yield* Effect.flatMap(NpcAwareness, (awareness) =>
            awareness.validateDraft(fixture.creator, {
              npcId: fixture.npcId,
              kind: "knowledge",
              body: "This should not be stored.",
              sourceKind: "note",
              sourceId: fixture.otherNoteId,
              sourceLabel: "Wrong ford",
              sourceExcerpt: "This source belongs to another campaign.",
              rationale: "Cross-campaign source validation should refuse it.",
            }),
          ).pipe(withActor(fixture.dm), Effect.result);
          expect(Result.isFailure(refused)).toBe(true);
        }),
    );

    it.effect(
      "lets campaign Hob queue a review candidate, then approves the stored content only",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const model = scriptedModel({
            model: "scripted-local",
            maxTokens: MAX_TOKENS,
            rounds: [
              toolCallChunks("proposeNpcAwareness", {
                npcId: fixture.npcId,
                kind: "knowledge",
                body: "Cazril knows the ford takes names as payment.",
                sourceKind: "note",
                sourceId: fixture.sourceNoteId,
                sourceLabel: "Cazril's secret price",
                sourceExcerpt: "Cazril bargains with names rather than coin.",
                rationale: "This changes how Cazril answers toll questions.",
              }),
              textChunks("I queued that for review."),
            ],
          });

          const { events, candidates } = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            const awareness = yield* NpcAwareness;
            const stream = yield* hob.ask(fixture.campaignId, {
              text: "Research what Cazril should know about the ford price.",
            });
            const collected = Array.from(yield* Stream.runCollect(stream));
            return {
              events: collected,
              candidates: yield* awareness.list(fixture.creator, fixture.npcId),
            };
          }).pipe(
            withActor(fixture.dm),
            Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
          );

          expect(
            events.flatMap((event) =>
              event.event === "tool" ? [`${event.data.name}:${event.data.phase}`] : [],
            ),
          ).toEqual(["proposeNpcAwareness:called", "proposeNpcAwareness:answered"]);
          expect(candidates).toHaveLength(1);
          const candidate = candidates[0]!;
          expect(candidate).toMatchObject({
            kind: "knowledge",
            state: "pending",
            body: "Cazril knows the ford takes names as payment.",
            sourceKind: "note",
            sourceId: fixture.sourceNoteId,
            sourceLabel: "Cazril's secret price",
            sourceExcerpt: "Cazril bargains with names rather than coin.",
            rationale: "This changes how Cazril answers toll questions.",
            origin: "assistant",
            assistantTurnId: begunTurn(events),
          });

          const approved = yield* Effect.flatMap(NpcAwareness, (awareness) =>
            awareness.approve(fixture.creator, fixture.npcId, candidate.id, {
              expectedVersion: candidate.version,
            }),
          ).pipe(withActor(fixture.dm));
          expect(approved.state).toBe("approved");
          expect(approved.acceptedKnowledgeFactId).not.toBeNull();

          const checked = yield* Effect.gen(function* () {
            const knowledge = yield* NpcKnowledge;
            const facts = yield* knowledge.list(fixture.creator, fixture.npcId);
            const repeat = yield* Effect.result(
              (yield* NpcAwareness).approve(fixture.creator, fixture.npcId, candidate.id, {
                expectedVersion: candidate.version,
              }),
            );
            return { facts, repeat };
          }).pipe(withActor(fixture.dm));
          expect(checked.facts).toHaveLength(1);
          expect(checked.facts[0]).toMatchObject({
            body: candidate.body,
            sourceKind: "note",
            sourceId: fixture.sourceNoteId,
            sourceLabel: "Cazril's secret price",
            origin: "assistant",
            assistantTurnId: candidate.assistantTurnId,
          });
          expect(Result.isFailure(checked.repeat)).toBe(true);
        }),
    );

    it.effect(
      "counts queued awareness candidates as output when the model spends the whole round budget",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          const before = yield* Effect.flatMap(NpcAwareness, (awareness) =>
            awareness.list(fixture.creator, fixture.npcId),
          ).pipe(withActor(fixture.dm));
          const model = scriptedModel({
            model: "scripted-local",
            maxTokens: MAX_TOKENS,
            rounds: [0, 1, 2, 3].map((index) =>
              toolCallChunks(
                "proposeNpcAwareness",
                {
                  npcId: fixture.npcId,
                  kind: "knowledge",
                  body: `Cazril keeps awareness candidate ${String(index)} from Hob's research.`,
                  sourceKind: "manual",
                  sourceId: null,
                  sourceLabel: "",
                  sourceExcerpt: "",
                  rationale: "",
                },
                `call_awareness_${String(index)}`,
              ),
            ),
          });

          const { events, after } = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            const awareness = yield* NpcAwareness;
            const stream = yield* hob.ask(fixture.campaignId, {
              text: "Research four things Cazril should know.",
            });
            const collected = Array.from(yield* Stream.runCollect(stream));
            return {
              events: collected,
              after: yield* awareness.list(fixture.creator, fixture.npcId),
            };
          }).pipe(
            withActor(fixture.dm),
            Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
          );

          expect(events.some((event) => event.event === "failed")).toBe(false);
          expect(events.at(-1)?.event).toBe("done");
          expect(after).toHaveLength(before.length + 4);
        }),
    );

    it.effect("approves memory candidates as draft memory and rejects stale edits", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const turn = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const rows = yield* sql<{ readonly id: string }>`
            insert into assistant_thread (campaign_id, title)
            values (${fixture.campaignId}, 'awareness direct test')
            returning id
          `;
          const turns = yield* sql<{ readonly id: AssistantTurnId }>`
            with made as (select gen_random_uuid() as id)
            insert into assistant_turn (id, thread_id, who, body, origin, assistant_turn_id)
            select made.id, ${rows[0]!.id}, 'hob', 'candidate', 'assistant', made.id from made
            returning id
          `;
          return turns[0]!.id;
        }).pipe(Effect.orDie);

        const candidate = yield* Effect.flatMap(NpcAwareness, (awareness) =>
          awareness.recordFromHob(fixture.creator, turn, {
            npcId: fixture.npcId,
            kind: "memory",
            body: "Cazril remembers that Brannoc paid with a false name.",
            sourceKind: "recap",
            sourceId: null,
            sourceLabel: "Session 4 recap",
            sourceExcerpt: "Brannoc gave the ferry a false name.",
            rationale: "This should color future negotiations.",
          }),
        ).pipe(withActor(fixture.dm));

        const stale = yield* Effect.flatMap(NpcAwareness, (awareness) =>
          awareness.update(fixture.creator, fixture.npcId, candidate.id, {
            expectedVersion: candidate.version + 1,
            body: "A stale edit should not land.",
          }),
        ).pipe(withActor(fixture.dm), Effect.result);
        expect(Result.isFailure(stale)).toBe(true);

        const approved = yield* Effect.flatMap(NpcAwareness, (awareness) =>
          awareness.approve(fixture.creator, fixture.npcId, candidate.id, {
            expectedVersion: candidate.version,
          }),
        ).pipe(withActor(fixture.dm));
        expect(approved.acceptedMemoryId).not.toBeNull();

        const memories = yield* Effect.flatMap(NpcMemories, (repo) =>
          repo.list(fixture.creator, fixture.npcId),
        ).pipe(withActor(fixture.dm));
        expect(memories).toEqual([
          expect.objectContaining({
            id: approved.acceptedMemoryId,
            status: "draft",
            body: candidate.body,
            sourceKind: "recap",
            sourceLabel: "Session 4 recap",
            origin: "assistant",
            assistantTurnId: candidate.assistantTurnId,
          }),
        ]);
      }),
    );
  });
});
