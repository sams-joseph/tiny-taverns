import {
  type Actor,
  type CampaignCharacterId,
  Conflict,
  CurrentActor,
  type HobEvent,
  NotFound,
  type Session,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Stream } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
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
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Party } from "../src/repo/Party.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { aCampaignBy, aCharacterAt, aPlayerAt, anAccount, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * A night's entry in the Chronicle: the summary the DM keeps on it and whose
 * night it was (`0070_session_entry.ts`).
 *
 * What this file holds the line on, each with real actors minted the shipped
 * way:
 *
 * - **only the creator writes either**, and a player's write is `NotFound`;
 * - **a player reads a summary only on a night the DM shared**, because the
 *   night itself is what they cannot read, and the spotlight pointer only
 *   through the seat's own predicate;
 * - **the Shared World is told a summary only of a shared night**, where its
 *   title is told whatever the switch says;
 * - **Hob drafts, and only the DM's accept keeps it**, stamped `assistant`
 *   with the turn, through the scripted model and never a real one.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  CampaignCreatorActors.layer,
  Creatures.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  EquipmentRepo.layer,
  GroupHistory.layer,
  Groups.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
  Options.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
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
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_session_entry")));

const runtime = ManagedRuntime.make(services);

const as = <A, E, R>(actor: Actor, effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.provideService(effect, CurrentActor, actor);

const run = <A, E>(effect: Effect.Effect<A, E, Layer.Success<typeof services>>) =>
  runtime.runPromise(effect);

/** The same, answering the failure rather than throwing it. */
const refusal = <A, E>(effect: Effect.Effect<A, E, Layer.Success<typeof services>>) =>
  runtime.runPromise(Effect.flip(effect));

/** Planted in the night the DM has not shared: no player read may carry it. */
const UNSHARED = "DMONLYSUMMARY the bargain was sealed in blood.";

const fixture = Effect.gen(function* () {
  const sessions = yield* Sessions;
  const party = yield* Party;
  const dm = yield* anAccount("Jo");
  const campaign = yield* aCampaignBy(dm, { name: "The Salt Road", visibility: "shared" });
  const player = yield* aPlayerAt(campaign.id, "Pim");
  // Pim's seat is shared with the table; the DM's own character's is not.
  const brannoc = yield* aCharacterAt(
    campaign.id,
    player,
    { name: "Brannoc" },
    { seatVisibility: "shared" },
  );
  const odo = yield* aCharacterAt(campaign.id, dm, { name: "Odo" });
  const retired = yield* aCharacterAt(campaign.id, dm, { name: "Tamsin" });
  yield* as(dm, party.leave(campaign.id, retired.seatId));
  // A seat at another of Jo's tables.
  const elsewhere = yield* aCampaignBy(dm, { name: "Elsewhere" });
  const stranger = yield* aCharacterAt(elsewhere.id, dm, { name: "Fen" });

  const started = { startedAt: DateTime.nowUnsafe(), endedAt: DateTime.nowUnsafe() };
  const shared = yield* as(
    dm,
    sessions.create(campaign.id, { number: 1, title: "The ford", visibility: "shared" }),
  );
  yield* as(dm, sessions.update(campaign.id, shared.id, started));
  const unshared = yield* as(dm, sessions.create(campaign.id, { number: 2, title: "The bog" }));
  yield* as(dm, sessions.update(campaign.id, unshared.id, started));
  const planned = yield* as(dm, sessions.create(campaign.id, { number: 3 }));

  return {
    dm,
    player,
    campaign,
    brannoc: brannoc.seatId,
    odo: odo.seatId,
    retired: retired.seatId,
    stranger: stranger.seatId,
    shared,
    unshared,
    planned,
  };
});

let f: Effect.Success<typeof fixture>;

beforeAll(async () => {
  f = await run(fixture);
}, 60_000);
afterAll(async () => void (await runtime.dispose()), 60_000);

const update = (
  actor: Actor,
  id: Session["id"],
  patch: Parameters<Sessions["Service"]["update"]>[2],
) => Effect.flatMap(Sessions, (sessions) => as(actor, sessions.update(f.campaign.id, id, patch)));

const read = (actor: Actor, id: Session["id"]) =>
  Effect.flatMap(Sessions, (sessions) => as(actor, sessions.findById(f.campaign.id, id)));

describe("writing a night's entry", () => {
  it("is the creator's, and an authored summary says so", async () => {
    const written = await run(
      update(f.dm, f.shared.id, {
        summary: "  The party crossed the ford and paid the ferryman in salt.  ",
        spotlightSeatId: f.brannoc,
      }),
    );
    expect(written.summary).toBe("The party crossed the ford and paid the ferryman in salt.");
    expect(written.summaryOrigin).toBe("authored");
    expect(written.summaryAssistantTurnId).toBeNull();
    expect(written.spotlightSeatId).toBe(f.brannoc);

    // An edit keeps the summary's origin, as an edited note keeps its own.
    const edited = await run(
      update(f.dm, f.shared.id, { summary: "They crossed the ford and paid in salt." }),
    );
    expect(edited.summary).toBe("They crossed the ford and paid in salt.");
    expect(edited.summaryOrigin).toBe("authored");
    // Untouched by a patch that does not name it.
    expect(edited.spotlightSeatId).toBe(f.brannoc);

    // A blank is a clear, and a clear takes all three columns.
    const cleared = await run(update(f.dm, f.shared.id, { summary: "   ", spotlightSeatId: null }));
    expect(cleared.summary).toBeNull();
    expect(cleared.summaryOrigin).toBeNull();
    expect(cleared.summaryAssistantTurnId).toBeNull();
    expect(cleared.spotlightSeatId).toBeNull();
  });

  it("answers a player's write as the ordinary not-found, and changes nothing", async () => {
    await run(update(f.dm, f.shared.id, { summary: "The DM's words." }));
    for (const patch of [
      { summary: "PLAYERWROTE this" },
      { summary: null },
      { spotlightSeatId: f.brannoc },
    ] as const) {
      const refused = await refusal(update(f.player, f.shared.id, patch));
      expect(refused).toBeInstanceOf(NotFound);
      expect(refused).toMatchObject({ resource: "session" });
    }
    const after = await run(read(f.dm, f.shared.id));
    expect(after.summary).toBe("The DM's words.");
    expect(after.spotlightSeatId).toBeNull();
  });

  it("names only a live seat of this campaign", async () => {
    // Another campaign's seat: the composite key makes it unrepresentable,
    // and the repository says so as a `NotFound` rather than a failed statement.
    const foreign = await refusal(update(f.dm, f.shared.id, { spotlightSeatId: f.stranger }));
    expect(foreign).toMatchObject({ _tag: "NotFound", resource: "seat" });
    // A retired seat is inert everywhere, here too.
    const retired = await refusal(update(f.dm, f.shared.id, { spotlightSeatId: f.retired }));
    expect(retired).toMatchObject({ _tag: "NotFound", resource: "seat" });
    // An id that is no seat at all.
    const invented = await refusal(
      update(f.dm, f.shared.id, {
        spotlightSeatId: "00000000-0000-4000-8000-000000000000" as CampaignCharacterId,
      }),
    );
    expect(invented).toMatchObject({ _tag: "NotFound", resource: "seat" });
    expect((await run(read(f.dm, f.shared.id))).spotlightSeatId).toBeNull();
  });
});

describe("what a player reads of it", () => {
  beforeAll(async () => {
    await run(
      update(f.dm, f.shared.id, { summary: "SHAREDSUMMARY the ford.", spotlightSeatId: f.brannoc }),
    );
    await run(update(f.dm, f.unshared.id, { summary: UNSHARED, spotlightSeatId: f.brannoc }));
  }, 60_000);

  it("carries the summary on a shared night, and no byte of an unshared one", async () => {
    const reads = await run(
      Effect.gen(function* () {
        const sessions = yield* Sessions;
        const recap = yield* Recap;
        return {
          list: yield* as(f.player, sessions.list(f.campaign.id)),
          found: yield* as(f.player, sessions.findById(f.campaign.id, f.shared.id)),
          night: yield* as(f.player, recap.readAsPlayer(f.campaign.id, f.shared.id)),
        };
      }),
    );
    expect(reads.list.map((night) => [night.number, night.summary])).toEqual([
      [1, "SHAREDSUMMARY the ford."],
    ]);
    expect(reads.found.summary).toBe("SHAREDSUMMARY the ford.");
    expect(reads.night.session.summary).toBe("SHAREDSUMMARY the ford.");
    expect(JSON.stringify(reads)).not.toContain("DMONLYSUMMARY");

    // The unshared night is not there to be read at all.
    expect(await refusal(read(f.player, f.unshared.id))).toBeInstanceOf(NotFound);
    expect(
      await refusal(
        Effect.flatMap(Recap, (recap) =>
          as(f.player, recap.readAsPlayer(f.campaign.id, f.unshared.id)),
        ),
      ),
    ).toBeInstanceOf(NotFound);

    // The creator reads both.
    const dmList = await run(Effect.flatMap(Sessions, (s) => as(f.dm, s.list(f.campaign.id))));
    expect(dmList.map((night) => night.summary)).toEqual([
      null,
      UNSHARED,
      "SHAREDSUMMARY the ford.",
    ]);
  });

  it("names the spotlight only through a seat the player can read", async () => {
    // Brannoc's seat is shared: the player is told whose night it was.
    expect((await run(read(f.player, f.shared.id))).spotlightSeatId).toBe(f.brannoc);

    // Odo's seat is the DM's own and unshared: to the player, nobody's.
    await run(update(f.dm, f.shared.id, { spotlightSeatId: f.odo }));
    expect((await run(read(f.player, f.shared.id))).spotlightSeatId).toBeNull();
    const recap = await run(
      Effect.flatMap(Recap, (r) => as(f.player, r.readAsPlayer(f.campaign.id, f.shared.id))),
    );
    expect(recap.session.spotlightSeatId).toBeNull();
    expect(JSON.stringify(recap)).not.toContain(f.odo);
    // The creator still reads the pointer.
    expect((await run(read(f.dm, f.shared.id))).spotlightSeatId).toBe(f.odo);
  });
});

describe("what the Shared World is told of it", () => {
  it("tells a shared night's summary, and never an unshared one's", async () => {
    await run(update(f.dm, f.shared.id, { summary: "SHAREDSUMMARY the ford." }));
    await run(update(f.dm, f.unshared.id, { summary: UNSHARED }));
    const told = await run(
      Effect.gen(function* () {
        const history = yield* GroupHistory;
        const dmOf = yield* asDm(f.dm, f.campaign.id);
        const world = f.campaign.contextId;
        return {
          shared: yield* as(f.player, history.nightStory(world, f.campaign.id, f.shared.id)),
          unshared: yield* as(f.player, history.nightStory(world, f.campaign.id, f.unshared.id)),
          sharedEntry: yield* as(f.dm, history.fromRecap(world, dmOf, f.shared.id)),
          unsharedEntry: yield* as(f.dm, history.fromRecap(world, dmOf, f.unshared.id)),
        };
      }),
    );
    expect(told.shared.summary).toBe("SHAREDSUMMARY the ford.");
    expect(told.sharedEntry.body).toContain("SHAREDSUMMARY the ford.");
    // The night is still listed, by its number and title, as before.
    expect(told.unshared.title).toBe("The bog");
    expect(told.unshared.summary).toBeNull();
    expect(told.unsharedEntry.title).toBe("Session 2 — The bog");
    expect(JSON.stringify([told.unshared, told.unsharedEntry])).not.toContain("DMONLYSUMMARY");
  });
});

describe("a summary Hob drafts", () => {
  /** Ask with a scripted model, and collect everything it emitted and was sent. */
  const ask = (
    actor: Actor,
    sessionId: Session["id"],
    rounds: ReadonlyArray<ReadonlyArray<unknown>>,
  ) => {
    const model = scriptedModel({
      model: "scripted-local",
      maxTokens: 512,
      rounds: rounds as never,
    });
    return runtime.runPromise(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(f.campaign.id, {
          text: "Draft a summary of this night for the Chronicle.",
          intent: "nightSummary",
          sessionId,
        });
        const events: ReadonlyArray<HobEvent> = Array.from(yield* Stream.runCollect(stream));
        return { events, requests: model.requests() };
      }).pipe(
        (effect) => as(actor, effect),
        Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
      ),
    );
  };

  const accept = (actor: Actor, threadId: string, turnId: string) =>
    runtime.runPromise(
      Effect.flatMap(Proposals, (proposals) =>
        as(actor, proposals.accept("dm", f.campaign.id, threadId as never, turnId as never)),
      ).pipe(Effect.result),
    );

  it("offers a draft, writes nothing until the DM keeps it, then keeps it as Hob's", async () => {
    await run(update(f.dm, f.shared.id, { summary: null }));
    const drafted = "They crossed the ford at dusk and paid the ferryman in salt.";
    const { events, requests } = await ask(f.dm, f.shared.id, [
      toolCallChunks("sessionRecap", { sessionId: f.shared.id }),
      toolCallChunks("proposeNightSummary", { sessionId: f.shared.id, summary: drafted }),
      textChunks("Here is a draft for session 1."),
    ]);

    // The night is bound before the model is called: its id is in the prompt,
    // so the draft costs no round spent finding it.
    expect(JSON.stringify(requests[0])).toContain(f.shared.id);
    const tools = (requests[0]?.tools ?? []).map(
      (tool) => (tool.function as { name: string } | undefined)?.name,
    );
    expect(tools).toContain("proposeNightSummary");

    const began = events.find((event) => event.event === "began");
    const proposed = events.find((event) => event.event === "proposal");
    if (began?.event !== "began" || proposed?.event !== "proposal") throw new Error("no offer");
    expect(proposed.data.proposal).toEqual({
      target: "nightSummary",
      sessionId: f.shared.id,
      sessionNumber: 1,
      text: drafted,
    });
    expect(events.at(-1)?.event).toBe("done");

    // A proposal is not a row.
    expect((await run(read(f.dm, f.shared.id))).summary).toBeNull();

    // A player cannot keep it: the campaign's conversation is not theirs.
    const byPlayer = await accept(f.player, began.data.threadId, began.data.turnId);
    expect(byPlayer._tag).toBe("Failure");
    expect((await run(read(f.dm, f.shared.id))).summary).toBeNull();

    const kept = await accept(f.dm, began.data.threadId, began.data.turnId);
    if (kept._tag !== "Success" || kept.success.accepted !== "nightSummary") {
      throw new Error("not kept");
    }
    expect(kept.success.session.summary).toBe(drafted);
    expect(kept.success.session.summaryOrigin).toBe("assistant");
    expect(kept.success.session.summaryAssistantTurnId).toBe(began.data.turnId);
    // The night's own provenance is untouched: the DM made the night.
    expect(kept.success.session.origin).toBe("authored");
    expect(kept.success.session.assistantTurnId).toBeNull();

    // One accept is one write.
    const again = await accept(f.dm, began.data.threadId, began.data.turnId);
    expect(again._tag === "Failure" && again.failure).toBeInstanceOf(Conflict);

    // The DM's edit keeps it Hob's, with the turn it came from.
    const edited = await run(update(f.dm, f.shared.id, { summary: `${drafted} Mostly.` }));
    expect(edited.summaryOrigin).toBe("assistant");
    expect(edited.summaryAssistantTurnId).toBe(began.data.turnId);
  }, 60_000);

  it("refuses to draft a night nobody has played, where the model can hear it", async () => {
    const { events, requests } = await ask(f.dm, f.planned.id, [
      toolCallChunks("proposeNightSummary", { sessionId: f.planned.id, summary: "Nothing yet." }),
      textChunks("That night has not been played yet."),
    ]);
    expect(events.some((event) => event.event === "proposal")).toBe(false);
    expect(JSON.stringify(requests.at(-1))).toContain("has not been played yet");
  }, 60_000);

  it("is the creator's to ask for: anybody else is told the night is not there", async () => {
    const refused = await runtime.runPromise(
      Effect.flip(
        Effect.gen(function* () {
          const hob = yield* Hob;
          return yield* hob.ask(f.campaign.id, {
            text: "Draft a summary of this night.",
            intent: "nightSummary",
            sessionId: f.shared.id,
          });
        }).pipe(
          (effect) => as(f.player, effect),
          Effect.provide(
            Hob.layer({ model: "scripted-local" }).pipe(
              Layer.provide(
                scriptedModel({ model: "scripted-local", maxTokens: 512, rounds: [] }).layer,
              ),
            ),
          ),
        ),
      ),
    );
    expect(refused).toMatchObject({ _tag: "NotFound", resource: "session" });
  }, 60_000);
});
