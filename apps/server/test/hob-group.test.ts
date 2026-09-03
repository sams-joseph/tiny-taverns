import {
  type Actor,
  type Campaign,
  CurrentActor,
  type GroupId,
  type HobEvent,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Stream } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Characters } from "../src/repo/Characters.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { Options } from "../src/repo/Options.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks, type ChatRequest } from "./support/model.js";

/**
 * Group Hob, measured at the provider wire — the group-Hob boundary decision
 * of 2026-09-01 as assertions.
 *
 * The decision grants Hob **all canonical events across the group** — played
 * sessions, story beats, combat outcomes, shared recaps — and forbids it
 * everything unplayed: private notes, planned encounters, prep lines, drafts.
 * An assistant that leaks looks like helpfulness, so the flagship tests here
 * do not argue about predicates: they capture every byte sent to the model
 * and count occurrences of planted secrets. Canonical bytes must be present;
 * prep bytes must appear **zero times, in any request, ever**; and another
 * group's record must be just as absent.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Groups.layer,
  GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  Encounters.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Options.layer,
  PrepItems.layer,
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      Characters.layer,
      EncounterCreatures.layer,
      Encounters.layer,
      GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
      Notes.layer,
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_group")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One group with two creators, canonical history at both tables, and a
 * planted secret behind every kind of unplayed prep the decision names.
 *
 * The secrets carry sentinel tokens so the wire assertions are greps rather
 * than arguments: a sentinel that appears anywhere in a captured provider
 * request is a leak whatever route it took.
 */
const makeFixture = Effect.gen(function* () {
  const beats = yield* Beats;
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const invites = yield* Invites;
  const notes = yield* Notes;
  const prep = yield* PrepItems;
  const sessions = yield* Sessions;
  const threads = yield* HobThreads;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(createCampaign({ name: "The Salt Road" }));
  const groupId = saltRoad.groupId;

  // Wren: a live member who created the second campaign in Jo's group.
  const wren = yield* anAccount("Wren");
  const issued = yield* withActor(jo)(invites.create(groupId, { label: "Wren" })).pipe(
    Effect.orDie,
  );
  yield* withActor(wren)(invites.redeem(issued.token)).pipe(Effect.orDie);
  const hagsBargain = yield* withActor(wren)(
    campaigns.create(groupId, { name: "The Hag's Bargain" }),
  ).pipe(Effect.orDie);
  const asWren = withActor(wren);

  // Pim: a player at the Salt Road — a group member who created nothing.
  const pim = yield* aPlayerAt(saltRoad.id, "Pim");

  // ── Canonical history at Wren's table: a played night, a beat, a fight. ──
  const played = yield* asWren(sessions.create(hagsBargain.id, { number: 1, title: "The bog" }));
  yield* asWren(sessions.update(hagsBargain.id, played.id, { startedAt: DateTime.nowUnsafe() }));
  yield* asWren(
    beats.create(hagsBargain.id, played.id, { body: "CANONBEAT the hag took the lantern." }),
  );
  const marsh = yield* asWren(
    creatures.libraryCreate({
      name: "Reed Stalker",
      type: "Monstrosity",
      cr: "1",
      ac: 13,
      hp: 22,
    }),
  );
  const fought = yield* asWren(
    encounters.create(hagsBargain.id, { name: "CANONFIGHT ambush in the reeds" }),
  );
  yield* asWren(campaigns.update(hagsBargain.id, { currentSessionId: played.id }));
  const wrenDm = yield* Effect.flatMap(CampaignCreatorActors, (actors) =>
    asWren(actors.of(hagsBargain.id)),
  );
  const run = yield* Effect.flatMap(EncounterRuns, (r) =>
    r.start(wrenDm, played.id, { encounterId: fought.id }),
  );
  yield* Effect.flatMap(EncounterRuns, (r) => r.end(wrenDm, played.id, run.id));
  void marsh;

  // ── Unplayed prep at Wren's table: every kind the decision keeps private. ──
  yield* asWren(
    notes.create(hagsBargain.id, {
      title: "SECRETNOTE the hidden door",
      body: "SECRETNOTE behind the waterfall.",
    }),
  );
  const planned = yield* asWren(sessions.create(hagsBargain.id, { number: 2 }));
  yield* asWren(
    prep.create(hagsBargain.id, planned.id, { label: "SECRETPREP sharpen the ambush" }),
  );
  yield* asWren(encounters.create(hagsBargain.id, { name: "SECRETENCOUNTER ambush at dawn" }));
  const draft = yield* asWren(threads.start("dm", hagsBargain.id, "SECRETDRAFT the twist is"));
  void draft;

  // ── Another group entirely. ──
  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(createCampaign({ name: "Salt and Sixpence" }));
  const night = yield* withActor(fen)(sessions.create(elsewhere.id, { number: 1 }));
  yield* withActor(fen)(
    sessions.update(elsewhere.id, night.id, { startedAt: DateTime.nowUnsafe() }),
  );
  yield* withActor(fen)(
    beats.create(elsewhere.id, night.id, { body: "OTHERGROUP the dragon fell." }),
  );

  // The chronicle: Wren shares the played night, so the group's record holds a
  // copy — the ordinary way canonical history arrives.
  yield* Effect.flatMap(GroupHistory, (h) => asWren(h.fromRecap(groupId, wrenDm, played.id)));

  return { jo, wren, pim, fen, groupId, saltRoad, hagsBargain, elsewhere, played, planned };
});

interface Fixture {
  readonly jo: Actor;
  readonly wren: Actor;
  readonly pim: Actor;
  readonly fen: Actor;
  readonly groupId: GroupId;
  readonly saltRoad: Campaign;
  readonly hagsBargain: Campaign;
  readonly elsewhere: Campaign;
  readonly played: { readonly id: SessionId };
  readonly planned: { readonly id: SessionId };
}

let fixture: Fixture;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
}, 60_000);

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask group Hob with a scripted model; capture everything sent to it. */
const askGroup = (
  actor: Actor,
  groupId: GroupId,
  options?: {
    readonly rounds?: ReadonlyArray<ReadonlyArray<object | string>>;
    readonly text?: string;
    readonly threadId?: Asked["events"] extends never ? never : string;
  },
): Promise<Asked> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: 4096,
    rounds: (options?.rounds as never) ?? [
      toolCallChunks("listPlayedNights", {}),
      textChunks("Two nights have been played."),
    ],
  });
  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.askGroup(groupId, {
        text: options?.text ?? "What has happened across the group so far?",
        ...(options?.threadId === undefined ? {} : { threadId: options.threadId as never }),
      });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
    }).pipe(
      withActor(actor),
      Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);

describe("what the model is shown", () => {
  it("carries the other table's canonical night and not one byte of its prep", async () => {
    // Jo asks — a member who did NOT create the Hag's Bargain — and the
    // scripted model walks the whole canonical surface: the timeline, the
    // night's story, the chronicle.
    const { requests } = await askGroup(fixture.jo, fixture.groupId, {
      rounds: [
        toolCallChunks("listPlayedNights", {}),
        toolCallChunks("nightStory", {
          campaignId: fixture.hagsBargain.id,
          sessionId: fixture.played.id,
        }),
        toolCallChunks("searchGroupHistory", { query: "lantern" }),
        textChunks("The hag took the lantern, and the reeds ambush was fought to a finish."),
      ],
    });
    const shown = shownTo(requests);

    // Canonical, present: the beat verbatim (from nightStory and from the
    // shared recap copy) and the fight by name.
    expect(shown).toContain("CANONBEAT");
    expect(shown).toContain("CANONFIGHT");

    // Unplayed prep, absent — zero occurrences, any request, any round. This
    // is the decision's boundary measured rather than argued.
    expect(shown).not.toContain("SECRETNOTE");
    expect(shown).not.toContain("SECRETPREP");
    expect(shown).not.toContain("SECRETENCOUNTER");
    expect(shown).not.toContain("SECRETDRAFT");

    // Another group's record: just as absent.
    expect(shown).not.toContain("OTHERGROUP");

    // The structural half: the group is closed over from the path, so a model
    // that hallucinated another group's id has nowhere to put it.
    const tools = requests[0]?.tools ?? [];
    expect(JSON.stringify(tools).toLowerCase()).not.toContain("groupid");
  }, 60_000);

  it("refuses the planned night through the tool, as the ordinary not-found", async () => {
    // The model asks for the *unplayed* session's story — the exact probe the
    // boundary exists for — and gets a NotFound it can read, never the prep.
    const { requests } = await askGroup(fixture.jo, fixture.groupId, {
      rounds: [
        toolCallChunks("nightStory", {
          campaignId: fixture.hagsBargain.id,
          sessionId: fixture.planned.id,
        }),
        textChunks("That night has not been played."),
      ],
    });
    const shown = shownTo(requests);
    expect(shown).not.toContain("SECRETPREP");
    expect(shown).toContain("NotFound");
  }, 60_000);

  it("is a 404 for a stranger before the model is ever called", async () => {
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
        const hob = yield* Hob;
        return yield* Effect.flip(hob.askGroup(fixture.groupId, { text: "anything" }));
      }).pipe(
        withActor(fixture.fen),
        Effect.provide(
          Hob.layer({ model: "scripted-local" }).pipe(
            Layer.provide(
              scriptedModel({ model: "scripted-local", maxTokens: 4096, rounds: [] }).layer,
            ),
          ),
        ),
      ),
    );
    expect(refused).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the group's one shared conversation", () => {
  it("is resumable by another member, and partitioned from every campaign thread", async () => {
    const first = await askGroup(fixture.jo, fixture.groupId, {
      rounds: [textChunks("Noted.")],
      text: "Remember the lantern.",
    });
    const began = first.events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    const threadId = began.data.threadId;

    // Wren resumes Jo's thread: the group's conversation is the group's.
    const listed = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.list("group", fixture.groupId)).pipe(
        withActor(fixture.wren),
      ),
    );
    expect(listed.map((thread) => thread.id)).toContain(threadId);
    expect(listed[0]?.groupId).toBe(fixture.groupId);
    expect(listed[0]?.campaignId).toBeNull();

    // ...and Pim, a mere player at one table, reads it too — group membership
    // is the whole gate, the chronicle's own audience.
    const forPim = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) =>
        threads.turns("group", fixture.groupId, threadId),
      ).pipe(withActor(fixture.pim)),
    );
    expect(forPim.some((turn) => turn.text === "Remember the lantern.")).toBe(true);

    // The partition: the campaign's own panel never lists the group thread,
    // and the group list never carries Wren's campaign draft.
    const campaignThreads = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.list("dm", fixture.saltRoad.id)).pipe(
        withActor(fixture.jo),
      ),
    );
    expect(campaignThreads.map((thread) => thread.id)).not.toContain(threadId);
    expect(listed.some((thread) => thread.title.includes("SECRETDRAFT"))).toBe(false);

    // A stranger gets the ordinary 404.
    const refused = await runtime.runPromise(
      Effect.flip(
        Effect.flatMap(HobThreads, (threads) => threads.list("group", fixture.groupId)),
      ).pipe(withActor(fixture.fen)),
    );
    expect(refused).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the chronicle proposal", () => {
  it("is offered by the model, kept by a different member, and once only", async () => {
    const asked = await askGroup(fixture.jo, fixture.groupId, {
      rounds: [
        toolCallChunks("proposeGroupEntry", {
          title: "The lantern",
          body: "Both tables now know the hag holds the lantern.",
        }),
        textChunks("Offered a line for the chronicle."),
      ],
      text: "Write that down for the group.",
    });
    const proposed = asked.events.find((event) => event.event === "proposal");
    if (proposed?.event !== "proposal") throw new Error("no proposal event");
    const began = asked.events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");

    // Wren accepts what Jo's question produced — any live member may, the
    // same audience a hand-written entry has.
    const accepted = await runtime.runPromise(
      Effect.flatMap(Proposals, (proposals) =>
        proposals.acceptGroup(fixture.groupId, began.data.threadId, began.data.turnId),
      ).pipe(withActor(fixture.wren)),
    );
    if (accepted.accepted !== "groupHistory") throw new Error("wrong accept arm");
    expect(accepted.entry.origin).toBe("assistant");
    expect(accepted.entry.assistantTurnId).toBe(began.data.turnId);
    expect(accepted.entry.body).toContain("the hag holds the lantern");

    // In the chronicle now, by the ordinary read.
    const listed = await runtime.runPromise(
      Effect.flatMap(GroupHistory, (h) => h.list(fixture.groupId)).pipe(withActor(fixture.jo)),
    );
    expect(listed.some((entry) => entry.id === accepted.entry.id)).toBe(true);

    // The second tap is a conflict; a stranger's accept is the ordinary 404.
    const again = await runtime.runPromise(
      Effect.flip(
        Effect.flatMap(Proposals, (proposals) =>
          proposals.acceptGroup(fixture.groupId, began.data.threadId, began.data.turnId),
        ),
      ).pipe(withActor(fixture.jo)),
    );
    expect(again._tag).toBe("Conflict");
    const stranger = await runtime.runPromise(
      Effect.flip(
        Effect.flatMap(Proposals, (proposals) =>
          proposals.acceptGroup(fixture.groupId, began.data.threadId, began.data.turnId),
        ),
      ).pipe(withActor(fixture.fen)),
    );
    expect(stranger).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the campaign panel's group context", () => {
  it("reads the chronicle and the summary, and still cannot name another table's prep", async () => {
    // Jo asks their own campaign's Hob; the model reaches for the two group
    // tools the DM toolkit gained.
    const model = scriptedModel({
      model: "scripted-local",
      maxTokens: 4096,
      rounds: [
        toolCallChunks("searchGroupHistory", { query: "lantern" }),
        toolCallChunks("readGroupSummary", {}),
        textChunks("The group's record has the lantern night."),
      ] as never,
    });
    const { requests } = await runtime.runPromise(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(fixture.saltRoad.id, {
          text: "What happened at the other table?",
        });
        yield* Stream.runCollect(stream);
        return { requests: model.requests() };
      }).pipe(
        withActor(fixture.jo),
        Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
      ),
    );
    const shown = shownTo(requests);
    // The shared night's copy answers — canonical context on the campaign
    // panel — while the sentinel set stays at zero: the toolkit has no tool
    // that reaches another campaign's tables, so the boundary is structural.
    expect(shown).toContain("CANONBEAT");
    expect(shown).not.toContain("SECRETNOTE");
    expect(shown).not.toContain("SECRETENCOUNTER");
    expect(shown).not.toContain("SECRETDRAFT");
    expect(shown).not.toContain("OTHERGROUP");
  }, 60_000);
});
