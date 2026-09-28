import {
  type Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  type Campaign,
  CurrentActor,
  type HobEvent,
  type SessionId,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Stream } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignStories } from "../src/repo/CampaignStories.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
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
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { anAccount, aPlayerAt, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks, type ChatRequest } from "./support/model.js";

/**
 * **Hob drafts a campaign's story so far; only the creator's accept keeps it.**
 *
 * The Shared World's Story So Far pattern, one table's nights over: the
 * creator's Hob reads the kept story and the nights ended since
 * (`readCampaignStorySources`), and `proposeCampaignStory` offers a
 * replacement whose coverage is the newest night it was shown — captured by
 * the server, never by the model. Driven end to end with the scripted model
 * (no real model API): what the model is shown, that a proposal is not a row,
 * that the accept writes `origin = 'assistant'` with the turn and lands `dm`,
 * that a player cannot keep it, and that a refresh starts where the kept story
 * stops.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  CampaignStories.layer,
  Groups.layer,
  GroupHistory.layer,
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  EquipmentRepo.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
  NpcPreps.layer,
  Options.layer,
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      CampaignStories.layer,
      Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
      EncounterCreatures.layer,
      Encounters.layer,
      GroupHistory.layer,
      Notes.layer,
      Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_campaign_story")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Two ended nights and one still on the table, each beat carrying a sentinel
 * so what the model is shown is a grep: the DM's own beats (shared or not) of
 * the ended nights, and nothing of the night still running.
 */
const makeFixture = Effect.gen(function* () {
  const beats = yield* Beats;
  const sessions = yield* Sessions;
  const jo = yield* anAccount("Jo");
  const as = withActor(jo);
  const campaign = yield* as(createCampaign({ name: "The Salt Road" }));
  const player = yield* aPlayerAt(campaign.id, "Ilse");

  const played = (number: number, state: "running" | "ended") =>
    Effect.gen(function* () {
      const session = yield* as(sessions.create(campaign.id, { number }));
      const now = DateTime.nowUnsafe();
      yield* as(
        sessions.update(
          campaign.id,
          session.id,
          state === "ended" ? { startedAt: now, endedAt: now } : { startedAt: now },
        ),
      );
      return session.id;
    });

  const first = yield* played(1, "ended");
  // Night 1 is shared with the table and carries the DM's own summary; night 2
  // is not shared, so nothing of it — even a beat marked shared — was shown.
  yield* as(
    sessions.update(campaign.id, first, {
      visibility: "shared",
      summary: "NIGHTSUMMARY the troll's bridge fell behind them.",
    }),
  );
  yield* as(
    beats.create(campaign.id, first, {
      body: "SHOWNBEAT the toll bridge fell into the river.",
      visibility: "shared",
    }),
  );
  yield* as(beats.create(campaign.id, first, { body: "HIDDENBEAT the troll is Odo's father." }));
  const second = yield* played(2, "ended");
  yield* as(
    beats.create(campaign.id, second, {
      body: "SECONDBEAT the party reached the salt flats.",
      visibility: "shared",
    }),
  );
  const third = yield* played(3, "running");
  yield* as(beats.create(campaign.id, third, { body: "TONIGHTBEAT the flats are singing." }));

  return { jo, player, campaign, third };
}).pipe(Effect.orDie);

let fixture: {
  readonly jo: Actor;
  readonly player: Actor;
  readonly campaign: Campaign;
  readonly third: SessionId;
};

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

const ask = (
  rounds: ReadonlyArray<ReadonlyArray<unknown>>,
  text = "Write up the story so far.",
) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: 4096,
    rounds: rounds as never,
  });
  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(fixture.campaign.id, { text });
      const events = Array.from(yield* Stream.runCollect(stream));
      return { events, requests: model.requests() };
    }).pipe(
      withActor(fixture.jo),
      Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const proposedIn = (events: ReadonlyArray<HobEvent>) => {
  const proposal = events.find((event) => event.event === "proposal");
  return proposal?.event === "proposal" ? proposal.data.proposal : undefined;
};

/** The sources the reader answered, parsed, as the model was shown them. */
interface ShownNight {
  readonly number: number;
  readonly summary: { readonly text: string; readonly shownToPlayers: boolean } | null;
  readonly beats: ReadonlyArray<{ readonly text: string; readonly shownToPlayers: boolean }>;
}
const sourcesShown = (requests: ReadonlyArray<ChatRequest>): ReadonlyArray<ShownNight> => {
  for (const message of requests.at(-1)?.messages ?? []) {
    if (message["role"] !== "tool" || typeof message["content"] !== "string") continue;
    const parsed = JSON.parse(message["content"]) as {
      readonly nights?: ReadonlyArray<ShownNight>;
    };
    if (parsed.nights !== undefined) return parsed.nights;
  }
  throw new Error("the model was not shown the story's sources");
};

/** What each tool answered, as the model was shown it in the last round. */
const toolResults = (requests: ReadonlyArray<ChatRequest>): string =>
  JSON.stringify((requests.at(-1)?.messages ?? []).filter((message) => message["role"] === "tool"));

const accept = (actor: Actor, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  runtime.runPromise(
    Effect.flatMap(Proposals, (proposals) =>
      proposals.accept("dm", fixture.campaign.id, threadId, turnId),
    ).pipe(withActor(actor), Effect.result),
  );

const kept = () =>
  runtime.runPromise(
    Effect.gen(function* () {
      const creator = yield* asDm(fixture.jo, fixture.campaign.id);
      return yield* Effect.flatMap(CampaignStories, (stories) => stories.read(creator));
    }).pipe(Effect.orDie),
  );

const STORY = "The party crossed the toll bridge and reached the salt flats.";
const PREVIOUSLY = "Last time, the bridge fell behind you and the flats opened ahead.";

describe("a story drafted by the creator's Hob", () => {
  let threadId: AssistantThreadId;
  let turnId: AssistantTurnId;

  it("reads the ended nights, offers a story covering the newest, and writes nothing", async () => {
    const { events, requests } = await ask([
      toolCallChunks("readCampaignStorySources", {}),
      toolCallChunks(
        "proposeCampaignStory",
        { text: STORY, previously: PREVIOUSLY },
        "call_propose",
      ),
      textChunks("Here is the story so far."),
    ]);
    ({ threadId, turnId } = begunIn(events));

    const shown = toolResults(requests);
    // The DM's own record of the ended nights, each beat flagged for the
    // Previously that is read to the players.
    expect(shown).toContain("SHOWNBEAT");
    expect(shown).toContain("HIDDENBEAT");
    expect(shown).toContain("SECONDBEAT");
    expect(shown).toContain("shownToPlayers");
    // A night still on the table is not a night the story can follow.
    expect(shown).not.toContain("TONIGHTBEAT");

    // The DM's kept summary of a night rides with it, and "shown" is what a
    // player was really told: a shared beat on an unshared night was not.
    const nights = sourcesShown(requests);
    expect(nights.map((night) => night.number)).toEqual([1, 2]);
    expect(nights[0]?.summary).toEqual({
      text: "NIGHTSUMMARY the troll's bridge fell behind them.",
      shownToPlayers: true,
    });
    expect(nights[0]?.beats).toEqual([
      { text: "SHOWNBEAT the toll bridge fell into the river.", shownToPlayers: true },
      { text: "HIDDENBEAT the troll is Odo's father.", shownToPlayers: false },
    ]);
    expect(nights[1]?.summary).toBeNull();
    expect(nights[1]?.beats).toEqual([
      { text: "SECONDBEAT the party reached the salt flats.", shownToPlayers: false },
    ]);

    expect(proposedIn(events)).toEqual({
      target: "campaignStory",
      text: STORY,
      previously: PREVIOUSLY,
      afterSessionNumber: 2,
    });
    // Offered, not kept.
    expect(await kept()).toBeNull();
  });

  it("is refused to a player, and kept by the creator as the assistant's, unshared", async () => {
    const refused = await accept(fixture.player, threadId, turnId);
    expect(refused._tag).toBe("Failure");
    expect(await kept()).toBeNull();

    const accepted = await accept(fixture.jo, threadId, turnId);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "campaignStory") {
      throw new Error("the story was not kept");
    }
    expect(accepted.success.story).toMatchObject({
      text: STORY,
      previously: PREVIOUSLY,
      afterSessionNumber: 2,
      visibility: "dm",
      origin: "assistant",
      assistantTurnId: turnId,
    });
    expect(await kept()).toEqual(accepted.success.story);

    const twice = await accept(fixture.jo, threadId, turnId);
    expect(twice._tag).toBe("Failure");
  });

  it("refuses a proposal made without reading the sources first", async () => {
    const { events, requests } = await ask([
      toolCallChunks("proposeCampaignStory", { text: "An unread rewrite." }),
      textChunks("I should read first."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    expect(toolResults(requests)).toContain("readCampaignStorySources before proposing");
    expect((await kept())?.text).toBe(STORY);
  });

  it("refreshes from where the kept story stops, and a replacement lands unshared again", async () => {
    // The creator shares the kept story; then night 3 ends.
    await runtime.runPromise(
      Effect.flatMap(CampaignStories, (stories) =>
        stories.put(fixture.campaign.id, {
          text: STORY,
          previously: PREVIOUSLY,
          visibility: "shared",
        }),
      ).pipe(withActor(fixture.jo), Effect.orDie),
    );
    const now = DateTime.nowUnsafe();
    await runtime.runPromise(
      Effect.flatMap(Sessions, (sessions) =>
        sessions.update(fixture.campaign.id, fixture.third, { endedAt: now }),
      ).pipe(withActor(fixture.jo), Effect.orDie),
    );

    const { events, requests } = await ask([
      toolCallChunks("readCampaignStorySources", {}),
      toolCallChunks(
        "proposeCampaignStory",
        { text: `${STORY} The flats sang.`, previously: null },
        "call_propose",
      ),
      textChunks("Updated."),
    ]);
    const shown = toolResults(requests);
    // The kept story, and only the night after it.
    expect(shown).toContain(STORY);
    expect(shown).toContain("TONIGHTBEAT");
    expect(shown).not.toContain("SHOWNBEAT");
    expect(shown).not.toContain("SECONDBEAT");
    expect(proposedIn(events)).toMatchObject({ afterSessionNumber: 3, previously: null });

    const { threadId: thread, turnId: turn } = begunIn(events);
    const accepted = await accept(fixture.jo, thread, turn);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "campaignStory") {
      throw new Error("the refresh was not kept");
    }
    expect(accepted.success.story).toMatchObject({
      afterSessionNumber: 3,
      previously: null,
      visibility: "dm",
      assistantTurnId: turn,
    });
  });
});
