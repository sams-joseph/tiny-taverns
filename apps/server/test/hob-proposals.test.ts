import {
  Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type HobEvent,
  NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Notes } from "../src/repo/Notes.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * The conversation, and how a proposal becomes a row.
 *
 * Two gaps closed together, because they were one: a turn had nothing to point
 * at until conversations were saved, and an accepted row is the only reason to
 * save one. What this file holds the line on:
 *
 * - **the conversation survives** — a thread is rows, so the panel can be
 *   reloaded and a second question continues the first;
 * - **a proposal is not a row** — Hob offering an encounter leaves the campaign
 *   exactly as it was, and the *only* thing that changes it is an accept;
 * - **an accepted row is ordinary** — it is found by search, it turns up in the
 *   recap, and its roster is real — while carrying `origin: 'assistant'` and
 *   the turn that produced it;
 * - **the boundary holds either way** — a credential minted for one table can
 *   neither read another table's conversations nor accept into it.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Creatures.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  HobThreads.layer,
  Notes.layer,
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      EncounterCreatures.layer,
      Encounters.layer,
      Notes.layer,
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_proposals")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const MAX_TOKENS = 512;

/** One DM, two tables, and a marsh creature to build a fight out of. */
const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const sessions = yield* Sessions;

  const issued = yield* accounts.issue("Jo");
  const dm = new Actor({ accountId: issued.accountId, role: "dm", campaignId: null });
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road" }));
  const otherTable = yield* as(campaigns.create({ name: "Salt and Sixpence" }));

  const croaker = yield* as(
    creatures.create(campaign.id, {
      name: "Bullywug Croaker",
      type: "humanoid",
      size: "Medium",
      cr: "1/4",
      ac: 15,
      hp: 11,
    }),
  );
  const elsewhere = yield* as(
    creatures.create(otherTable.id, {
      name: "Sixpence Gull",
      type: "beast",
      cr: "1/8",
      ac: 12,
      hp: 7,
    }),
  );

  const night = yield* as(sessions.create(campaign.id, { number: 12 }));
  yield* as(campaigns.update(campaign.id, { currentSessionId: night.id }));

  return {
    dm,
    scopedDm: new Actor({ accountId: issued.accountId, role: "dm", campaignId: campaign.id }),
    campaign,
    otherTable,
    croaker,
    elsewhere,
    night,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

/** Ask Hob with a scripted model, and collect everything it emitted. */
const ask = (options: {
  readonly actor?: Actor;
  readonly campaignId?: CampaignId;
  readonly text: string;
  readonly threadId?: AssistantThreadId;
  readonly rounds: ReadonlyArray<ReadonlyArray<unknown>>;
}) => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: options.rounds as never,
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(options.campaignId ?? fixture.campaign.id, {
        threadId: options.threadId,
        text: options.text,
      });
      const events = Array.from(yield* Stream.runCollect(stream));
      return { events, requests: model.requests() };
    }).pipe(
      withActor(options.actor ?? fixture.dm),
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
  return proposal?.event === "proposal" ? proposal.data : undefined;
};

/** The roster the model is scripted to ask for. */
const anEncounter = (creatureId: string, count = 3) =>
  toolCallChunks("proposeEncounter", {
    name: "Song in the reeds",
    difficulty: "Hard",
    tags: ["Marsh"],
    creatures: [{ creatureId, count }],
  });

const counts = (campaignId: CampaignId) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{
        readonly notes: string;
        readonly beats: string;
        readonly encounters: string;
      }>`
        select
          (select count(*) from note where note.campaign_id = ${campaignId}) as notes,
          (select count(*) from beat
             join session on session.id = beat.session_id
             where session.campaign_id = ${campaignId}) as beats,
          (select count(*) from encounter where encounter.campaign_id = ${campaignId}) as encounters
      `;
      return {
        notes: Number(rows[0]!.notes),
        beats: Number(rows[0]!.beats),
        encounters: Number(rows[0]!.encounters),
      };
    }).pipe(Effect.orDie),
  );

const accept = (
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
  options?: { readonly actor?: Actor; readonly campaignId?: CampaignId },
) =>
  runtime.runPromise(
    Effect.flatMap(Proposals, (proposals) =>
      proposals.accept(options?.campaignId ?? fixture.campaign.id, threadId, turnId),
    ).pipe(withActor(options?.actor ?? fixture.dm), Effect.result),
  );

describe("the conversation is kept", () => {
  it("saves both sides of an exchange, and reads them back in order", async () => {
    const { events } = await ask({
      text: "Who is the ferryman?",
      rounds: [textChunks("Nobody has written that down yet.")],
    });
    const { threadId, turnId } = begunIn(events);

    const turns = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.turns(fixture.campaign.id, threadId)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );

    expect(turns.map((turn) => turn.who)).toEqual(["user", "hob"]);
    expect(turns[0]?.text).toBe("Who is the ferryman?");
    expect(turns[1]?.text).toBe("Nobody has written that down yet.");
    // The id the client was handed before the answer existed is the row the
    // answer landed in — which is what makes it usable as an accept target.
    expect(turns[1]?.id).toBe(turnId);
    // A hob turn is the assistant's own content, and the turn that produced it
    // is itself. `0010` says why.
    expect(turns[1]?.proposal).toBeNull();
    expect(turns[1]?.acceptedAt).toBeNull();
  }, 60_000);

  it("continues a thread when it is named, and starts a new one when it is not", async () => {
    const first = await ask({
      text: "What did they do about the crate?",
      rounds: [textChunks("They buried it.")],
    });
    const { threadId } = begunIn(first.events);

    const second = await ask({
      threadId,
      text: "And the ledger inside it?",
      rounds: [textChunks("Nothing about a ledger.")],
    });

    expect(begunIn(second.events).threadId).toBe(threadId);
    // The saved conversation is what the model is shown — the client sends one
    // question and cannot rewrite what it was told before.
    const shown = JSON.stringify(second.requests);
    expect(shown).toContain("They buried it.");
    expect(shown).toContain("And the ledger inside it?");

    const elsewhere = await ask({
      text: "Something else entirely.",
      rounds: [textChunks("Right.")],
    });
    expect(begunIn(elsewhere.events).threadId).not.toBe(threadId);
    expect(JSON.stringify(elsewhere.requests)).not.toContain("They buried it.");
  }, 60_000);

  it("names a thread after the question that started it", async () => {
    const { events } = await ask({
      text: "Give me a name for the ferryman at the crossing, something northern",
      rounds: [textChunks("Cazril.")],
    });
    const { threadId } = begunIn(events);

    const threads = await runtime.runPromise(
      Effect.flatMap(HobThreads, (repo) => repo.list(fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );

    // Newest first, so the thread just used is the one the panel resumes.
    expect(threads[0]?.id).toBe(threadId);
    expect(threads[0]?.title).toBe("Give me a name for the ferryman at the crossing, something…");
  }, 60_000);
});

describe("a proposal is not a row", () => {
  it("changes nothing in the campaign until somebody accepts it", async () => {
    const before = await counts(fixture.campaign.id);

    const { events } = await ask({
      text: "Build me something for the reeds.",
      rounds: [anEncounter(fixture.croaker.id), textChunks("Here you go.")],
    });

    const proposed = proposedIn(events);
    expect(proposed?.proposal.target).toBe("encounter");
    // The whole safety property, measured rather than argued: Hob offered an
    // encounter, said a sentence about it, and the campaign is untouched.
    expect(await counts(fixture.campaign.id)).toEqual(before);
  }, 60_000);

  it("keeps the offer on the turn, so a reload still shows the card", async () => {
    const { events } = await ask({
      text: "Something for the reeds, again.",
      rounds: [anEncounter(fixture.croaker.id, 2), textChunks("This one is smaller.")],
    });
    const { threadId, turnId } = begunIn(events);

    const turns = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.turns(fixture.campaign.id, threadId)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    const answer = turns.find((turn) => turn.id === turnId);

    expect(answer?.proposal).toMatchObject({
      target: "encounter",
      name: "Song in the reeds",
      difficulty: "Hard",
    });
    expect(answer?.acceptedAt).toBeNull();
  }, 60_000);

  it("resolves the roster through the bestiary rather than trusting the model", async () => {
    const { events } = await ask({
      text: "Build me something for the reeds.",
      rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
    });
    const proposed = proposedIn(events);

    // The display half comes out of the row, so the card cannot show a creature
    // that is not there or a rating the model made up.
    expect(proposed?.proposal).toMatchObject({
      roster: [{ creatureId: fixture.croaker.id, count: 3, name: "Bullywug Croaker", cr: "1/4" }],
    });
  }, 60_000);

  it("refuses a creature from another table, and tells the model so", async () => {
    // The leak that would look like a feature, in the write direction: an
    // encounter in this campaign made of a creature from a different one.
    const { events, requests } = await ask({
      actor: fixture.scopedDm,
      text: "Use that gull.",
      rounds: [anEncounter(fixture.elsewhere.id), textChunks("I could not find that creature.")],
    });

    expect(proposedIn(events)).toBeUndefined();
    expect(JSON.stringify(requests.slice(1))).toContain("NotFound");
  }, 60_000);

  it("offers one thing per turn, because an accept names a turn", async () => {
    const { events, requests } = await ask({
      text: "Two things, please.",
      rounds: [
        anEncounter(fixture.croaker.id),
        toolCallChunks("proposeNote", { title: "Also this", body: "A second offer." }),
        textChunks("One at a time."),
      ],
    });

    // The first offer survives; the second is refused rather than replacing it.
    expect(proposedIn(events)?.proposal.target).toBe("encounter");
    expect(JSON.stringify(requests.slice(2))).toContain("Conflict");
  }, 60_000);
});

describe("accepting one", () => {
  it("makes a real encounter, with its creatures and its provenance", async () => {
    const { events } = await ask({
      text: "Build the ambush.",
      rounds: [anEncounter(fixture.croaker.id, 6), textChunks("Six of them.")],
    });
    const { threadId, turnId } = begunIn(events);

    const accepted = await accept(threadId, turnId);
    expect(accepted._tag).toBe("Success");
    if (accepted._tag !== "Success") return;
    if (accepted.success.accepted !== "encounter") throw new Error("expected an encounter");
    const encounter = accepted.success.encounter;

    expect(encounter.name).toBe("Song in the reeds");
    expect(encounter.difficulty).toBe("Hard");
    expect(encounter.tags).toEqual(["Marsh"]);
    // Computed per read, so this is the roster really being there.
    expect(encounter.creatureCount).toBe(6);
    expect(encounter.origin).toBe("assistant");
    expect(encounter.assistantTurnId).toBe(turnId);

    const roster = await runtime.runPromise(
      Effect.flatMap(EncounterCreatures, (repo) =>
        repo.list(fixture.campaign.id, encounter.id),
      ).pipe(withActor(fixture.dm), Effect.orDie),
    );
    expect(roster).toHaveLength(1);
    expect(roster[0]?.creatureId).toBe(fixture.croaker.id);
    expect(roster[0]?.count).toBe(6);
    // The roster line carries the same trail — every row an accept writes does.
    expect(roster[0]?.origin).toBe("assistant");
    expect(roster[0]?.assistantTurnId).toBe(turnId);

    // And it reads back through the ordinary endpoint, unchanged.
    const read = await runtime.runPromise(
      Effect.flatMap(Encounters, (repo) => repo.findById(fixture.campaign.id, encounter.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(read.creatureCount).toBe(6);
    expect(read.visibility).toBe("dm");
  }, 60_000);

  it("refuses a second accept rather than making a second row", async () => {
    const { events } = await ask({
      text: "Build it again.",
      rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
    });
    const { threadId, turnId } = begunIn(events);

    expect((await accept(threadId, turnId))._tag).toBe("Success");
    const twice = await accept(threadId, turnId);

    expect(twice._tag).toBe("Failure");
    // `Conflict`, not `NotFound`: it is not missing, it is already there.
    expect(twice._tag === "Failure" && twice.failure).toBeInstanceOf(Conflict);
  }, 60_000);

  it("makes a note that search finds like any other", async () => {
    const { events } = await ask({
      text: "Write me something about the lantern-keeper.",
      rounds: [
        toolCallChunks("proposeNote", {
          title: "The lantern-keeper",
          body: "She trims the wicks at dusk and will not say who pays her.",
          readAloud: true,
        }),
        textChunks("Read it slow."),
      ],
    });
    const { threadId, turnId } = begunIn(events);

    const accepted = await accept(threadId, turnId);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "note") {
      throw new Error("expected a note");
    }
    expect(accepted.success.note.kind).toBe("read_aloud");
    expect(accepted.success.note.origin).toBe("assistant");
    expect(accepted.success.note.assistantTurnId).toBe(turnId);

    // The `tsvector` is a generated column, so an accepted row is indexed by
    // the statement that inserted it — there is no reindex step to forget.
    const hits = await runtime.runPromise(
      Effect.flatMap(Search, (search) =>
        search.search(fixture.campaign.id, { q: "lantern-keeper" }),
      ).pipe(withActor(fixture.dm), Effect.orDie),
    );
    expect(hits.map((hit) => hit.id)).toContain(accepted.success.note.id);
  }, 60_000);

  it("makes a beat that the recap reads back like any other", async () => {
    const { events } = await ask({
      text: "Note what just happened.",
      rounds: [
        toolCallChunks("proposeBeat", {
          body: "They gave the ferryman a name that was not theirs.",
        }),
        textChunks("Filed."),
      ],
    });
    const { threadId, turnId } = begunIn(events);

    const accepted = await accept(threadId, turnId);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "beat") {
      throw new Error("expected a beat");
    }
    // Filed against the night the campaign is running, resolved at accept time.
    expect(accepted.success.beat.sessionId).toBe(fixture.night.id);
    expect(accepted.success.beat.origin).toBe("assistant");
    expect(accepted.success.beat.assistantTurnId).toBe(turnId);

    const recap = await runtime.runPromise(
      Effect.flatMap(Recap, (repo) => repo.read(fixture.campaign.id, fixture.night.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(recap.beats.map((beat) => beat.id)).toContain(accepted.success.beat.id);

    const hits = await runtime.runPromise(
      Effect.flatMap(Search, (search) =>
        search.search(fixture.campaign.id, { q: "ferryman", source: "beat" }),
      ).pipe(withActor(fixture.dm), Effect.orDie),
    );
    expect(hits.map((hit) => hit.id)).toContain(accepted.success.beat.id);
  }, 60_000);

  it("refuses a turn that offered nothing", async () => {
    const { events } = await ask({
      text: "Just answer me.",
      rounds: [textChunks("Answered.")],
    });
    const { threadId, turnId } = begunIn(events);

    const result = await accept(threadId, turnId);
    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the boundary, on both halves", () => {
  it("hides another table's conversations from a scoped credential", async () => {
    const { events } = await ask({
      text: "A private question.",
      rounds: [textChunks("A private answer.")],
      campaignId: fixture.otherTable.id,
    });
    const { threadId } = begunIn(events);

    // The thread exists, in a campaign this credential does not reach.
    const listed = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.list(fixture.otherTable.id)).pipe(
        withActor(fixture.scopedDm),
        Effect.result,
      ),
    );
    expect(listed._tag).toBe("Failure");
    expect(listed._tag === "Failure" && listed.failure).toBeInstanceOf(NotFound);

    // And naming the thread directly, through the campaign it *can* reach, does
    // not smuggle it across: the id is a claim, and containment is checked.
    const smuggled = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.turns(fixture.campaign.id, threadId)).pipe(
        withActor(fixture.scopedDm),
        Effect.result,
      ),
    );
    expect(smuggled._tag).toBe("Failure");
  }, 60_000);

  it("refuses an accept aimed at another campaign", async () => {
    const { events } = await ask({
      text: "Build something over here.",
      rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
    });
    const { threadId, turnId } = begunIn(events);
    const before = await counts(fixture.otherTable.id);

    // The turn is real and the proposal is real; the campaign in the path is
    // not the one it belongs to. Accepting must not write into either.
    const result = await accept(threadId, turnId, { campaignId: fixture.otherTable.id });

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
    expect(await counts(fixture.otherTable.id)).toEqual(before);
  }, 60_000);

  it("refuses an accept from a credential minted for another table", async () => {
    const { events } = await ask({
      text: "One for the other table.",
      rounds: [
        toolCallChunks("proposeNote", { title: "Elsewhere", body: "Not yours." }),
        textChunks("Here."),
      ],
      campaignId: fixture.otherTable.id,
    });
    const { threadId, turnId } = begunIn(events);

    const result = await accept(threadId, turnId, {
      actor: fixture.scopedDm,
      campaignId: fixture.otherTable.id,
    });

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});
