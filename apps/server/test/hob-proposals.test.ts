import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type HobEvent,
  MAX_PAGE_SIZE,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Advancement } from "../src/repo/Advancement.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Acts } from "../src/repo/Acts.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignStories } from "../src/repo/CampaignStories.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { NpcPreps } from "../src/repo/NpcPrep.js";
import { NpcSheets } from "../src/repo/NpcSheets.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { describeLayer } from "./support/suite.js";

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
  Advancement.layer.pipe(Layer.provide(LiveEvents.layer)),
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
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
  NpcPreps.layer,
  NpcSheets.layer,
  Options.layer,
  Proposals.layer.pipe(
    Layer.provide([
      Advancement.layer.pipe(Layer.provide(LiveEvents.layer)),
      Groups.layer,
      CampaignCreatorActors.layer,
      NpcSheets.layer,
      Npcs.layer,
      NpcPreps.layer,
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      CampaignStories.layer,
      Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
      EncounterCreatures.layer,
      Encounters.layer,
      GroupHistory.layer,
      Notes.layer,
      Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
      Acts.layer,
      PrepItems.layer,
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Acts.layer,
  PrepItems.layer,
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_proposals")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const MAX_TOKENS = 512;

/** One DM, two tables, and a marsh creature to build a fight out of. */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const creatures = yield* Creatures;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(createCampaign({ name: "The Salt Road" }));
  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence" }));

  const croaker = yield* as(
    creatures.libraryCreate({
      name: "Bullywug Croaker",
      type: "humanoid",
      size: "Medium",
      cr: "1/4",
      ac: 15,
      hp: 11,
    }),
  );
  // A creature the campaign cannot use: another account's Library original.
  // Nothing has shared it anywhere, so a proposal naming it must be refused.
  const strangerAccount = yield* anAccount("Bo");
  const elsewhere = yield* withActor(strangerAccount)(
    creatures.libraryCreate({
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
    scopedDm: scopedTo(dm, campaign.id),
    campaign,
    otherTable,
    croaker,
    elsewhere,
    night,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-proposals.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

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

  return Effect.gen(function* () {
    const fixture = yield* Fixture;
    return yield* Effect.gen(function* () {
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
    );
  });
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
    tags: ["Marsh"],
    creatures: [{ creatureId, count }],
  });

const counts = (campaignId: CampaignId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly notes: string;
      readonly beats: string;
      readonly encounters: string;
      readonly nights: string;
      readonly prep: string;
      readonly acts: string;
    }>`
        select
          (select count(*) from note where note.campaign_id = ${campaignId}) as notes,
          (select count(*) from beat
             join session on session.id = beat.session_id
             where session.campaign_id = ${campaignId}) as beats,
          (select count(*) from encounter where encounter.campaign_id = ${campaignId}) as encounters,
          (select count(*) from session where session.campaign_id = ${campaignId}) as nights,
          (select count(*) from prep_item
             join session on session.id = prep_item.session_id
             where session.campaign_id = ${campaignId}) as prep,
          (select count(*) from campaign_act where campaign_act.campaign_id = ${campaignId}) as acts
      `;
    return {
      notes: Number(rows[0]!.notes),
      beats: Number(rows[0]!.beats),
      encounters: Number(rows[0]!.encounters),
      nights: Number(rows[0]!.nights),
      prep: Number(rows[0]!.prep),
      acts: Number(rows[0]!.acts),
    };
  }).pipe(Effect.orDie);

const accept = (
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
  options?: { readonly actor?: Actor; readonly campaignId?: CampaignId },
) =>
  Effect.gen(function* () {
    const fixture = yield* Fixture;
    return yield* Effect.flatMap(Proposals, (proposals) =>
      proposals.accept("dm", options?.campaignId ?? fixture.campaign.id, threadId, turnId),
    ).pipe(withActor(options?.actor ?? fixture.dm), Effect.result);
  });

describeLayer("hob-proposals", shared, (it) => {
  describe("the conversation is kept", () => {
    it.effect("saves both sides of an exchange, and reads them back in order", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Who is the ferryman?",
          rounds: [textChunks("Nobody has written that down yet.")],
        });
        const { threadId, turnId } = begunIn(events);

        const turns = yield* Effect.flatMap(HobThreads, (threads) =>
          threads.turns("dm", fixture.campaign.id, threadId),
        ).pipe(withActor(fixture.dm), Effect.orDie);

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
      }),
    );

    it.effect("continues a thread when it is named, and starts a new one when it is not", () =>
      Effect.gen(function* () {
        const first = yield* ask({
          text: "What did they do about the crate?",
          rounds: [textChunks("They buried it.")],
        });
        const { threadId } = begunIn(first.events);

        const second = yield* ask({
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

        const elsewhere = yield* ask({
          text: "Something else entirely.",
          rounds: [textChunks("Right.")],
        });
        expect(begunIn(elsewhere.events).threadId).not.toBe(threadId);
        expect(JSON.stringify(elsewhere.requests)).not.toContain("They buried it.");
      }),
    );

    it.effect("names a thread after the question that started it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Give me a name for the ferryman at the crossing, something northern",
          rounds: [textChunks("Cazril.")],
        });
        const { threadId } = begunIn(events);

        const threads = yield* Effect.flatMap(HobThreads, (repo) =>
          repo.list("dm", fixture.campaign.id),
        ).pipe(withActor(fixture.dm), Effect.orDie);

        // Newest first, so the thread just used is the one the panel resumes.
        expect(threads[0]?.id).toBe(threadId);
        expect(threads[0]?.title).toBe(
          "Give me a name for the ferryman at the crossing, something…",
        );
      }),
    );
  });

  describe("a proposal is not a row", () => {
    it.effect("changes nothing in the campaign until somebody accepts it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const before = yield* counts(fixture.campaign.id);

        const { events } = yield* ask({
          text: "Build me something for the reeds.",
          rounds: [anEncounter(fixture.croaker.id), textChunks("Here you go.")],
        });

        const proposed = proposedIn(events);
        expect(proposed?.proposal.target).toBe("encounter");
        // The whole safety property, measured rather than argued: Hob offered an
        // encounter, said a sentence about it, and the campaign is untouched.
        expect(yield* counts(fixture.campaign.id)).toEqual(before);
      }),
    );

    it.effect("keeps the offer on the turn, so a reload still shows the card", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Something for the reeds, again.",
          rounds: [anEncounter(fixture.croaker.id, 2), textChunks("This one is smaller.")],
        });
        const { threadId, turnId } = begunIn(events);

        const turns = yield* Effect.flatMap(HobThreads, (threads) =>
          threads.turns("dm", fixture.campaign.id, threadId),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        const answer = turns.find((turn) => turn.id === turnId);

        expect(answer?.proposal).toMatchObject({
          target: "encounter",
          name: "Song in the reeds",
        });
        expect(answer?.acceptedAt).toBeNull();
      }),
    );

    it.effect("resolves the roster through the bestiary rather than trusting the model", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Build me something for the reeds.",
          rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
        });
        const proposed = proposedIn(events);

        // The display half comes out of the row, so the card cannot show a creature
        // that is not there or a rating the model made up.
        expect(proposed?.proposal).toMatchObject({
          roster: [
            { creatureId: fixture.croaker.id, count: 3, name: "Bullywug Croaker", cr: "1/4" },
          ],
        });
      }),
    );

    it.effect("refuses a creature from another table, and tells the model so", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The leak that would look like a feature, in the write direction: an
        // encounter in this campaign made of a creature from a different one.
        const { events, requests } = yield* ask({
          actor: fixture.scopedDm,
          text: "Use that gull.",
          rounds: [
            anEncounter(fixture.elsewhere.id),
            textChunks("I could not find that creature."),
          ],
        });

        expect(proposedIn(events)).toBeUndefined();
        expect(JSON.stringify(requests.slice(1))).toContain("NotFound");
      }),
    );

    it.effect("offers one thing per turn, because an accept names a turn", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events, requests } = yield* ask({
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
      }),
    );
  });

  describe("accepting one", () => {
    it.effect("makes a real encounter, with its creatures and its provenance", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // One the DM made by hand first, so "at the end" is after something.
        const handMade = yield* Effect.flatMap(Encounters, (repo) =>
          repo.create(fixture.campaign.id, { name: "The ford at dusk" }),
        ).pipe(Effect.provideService(CurrentActor, fixture.dm), Effect.orDie);
        const { events } = yield* ask({
          text: "Build the ambush.",
          rounds: [anEncounter(fixture.croaker.id, 6), textChunks("Six of them.")],
        });
        const { threadId, turnId } = begunIn(events);

        const accepted = yield* accept(threadId, turnId);
        expect(accepted._tag).toBe("Success");
        if (accepted._tag !== "Success") return;
        if (accepted.success.accepted !== "encounter") throw new Error("expected an encounter");
        const encounter = accepted.success.encounter;

        expect(encounter.name).toBe("Song in the reeds");
        expect(encounter.tags).toEqual(["Marsh"]);
        // Computed per read, so this is the roster really being there.
        expect(encounter.creatureCount).toBe(6);
        expect(encounter.origin).toBe("assistant");
        expect(encounter.assistantTurnId).toBe(turnId);

        const roster = yield* Effect.all([
          EncounterCreatures,
          asDm(fixture.dm, fixture.campaign.id),
        ]).pipe(
          Effect.flatMap(([repo, dm]) => repo.list(dm, encounter.id)),
          Effect.orDie,
        );
        expect(roster).toHaveLength(1);
        // The source was the DM's Library original, so the accept minted the
        // campaign's internal instance and pointed the line at it — the instancing
        // decision of 2026-09-02. The instance is the plumbing, the name is what
        // the line carries.
        expect(roster[0]?.creatureId).not.toBe(fixture.croaker.id);
        expect(roster[0]?.name).toBe("Bullywug Croaker");
        expect(roster[0]?.count).toBe(6);
        // The roster line carries the same trail — every row an accept writes does.
        expect(roster[0]?.origin).toBe("assistant");
        expect(roster[0]?.assistantTurnId).toBe(turnId);

        // And it reads back through the ordinary endpoint, unchanged.
        const read = yield* Effect.all([Encounters, asDm(fixture.dm, fixture.campaign.id)]).pipe(
          Effect.flatMap(([repo, dm]) => repo.findById(dm, encounter.id)),
          Effect.orDie,
        );
        expect(read.creatureCount).toBe(6);
        expect(read.visibility).toBe("dm");

        // At the end of the DM's planned order, through the same append as the
        // encounter made by hand before it.
        const planned = yield* Effect.all([Encounters, asDm(fixture.dm, fixture.campaign.id)]).pipe(
          Effect.flatMap(([repo, dm]) => repo.list(dm, { limit: MAX_PAGE_SIZE })),
          Effect.orDie,
        );
        expect(planned.items.slice(-2).map((each) => each.id)).toEqual([handMade.id, encounter.id]);
      }),
    );

    it.effect("refuses a second accept rather than making a second row", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Build it again.",
          rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
        });
        const { threadId, turnId } = begunIn(events);

        expect((yield* accept(threadId, turnId))._tag).toBe("Success");
        const twice = yield* accept(threadId, turnId);

        expect(twice._tag).toBe("Failure");
        // `Conflict`, not `NotFound`: it is not missing, it is already there.
        expect(twice._tag === "Failure" && twice.failure).toBeInstanceOf(Conflict);
      }),
    );

    it.effect("makes a note that search finds like any other", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
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

        const accepted = yield* accept(threadId, turnId);
        if (accepted._tag !== "Success" || accepted.success.accepted !== "note") {
          throw new Error("expected a note");
        }
        expect(accepted.success.note.kind).toBe("read_aloud");
        expect(accepted.success.note.origin).toBe("assistant");
        expect(accepted.success.note.assistantTurnId).toBe(turnId);

        // The `tsvector` is a generated column, so an accepted row is indexed by
        // the statement that inserted it — there is no reindex step to forget.
        const hits = yield* Effect.flatMap(Search, (search) =>
          search.search(fixture.campaign.id, { q: "lantern-keeper" }),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        expect(hits.map((hit) => hit.id)).toContain(accepted.success.note.id);
      }),
    );

    it.effect(
      "keeps the category Hob named, and leaves a note uncategorised when it named none",
      () =>
        Effect.gen(function* () {
          const offerAndAccept = (title: string, category: string | null) =>
            Effect.gen(function* () {
              const { events } = yield* ask({
                text: `Write me a note about ${title}.`,
                rounds: [
                  // `null` is how a strict-mode endpoint says "not given".
                  toolCallChunks("proposeNote", { title, body: "Written down.", category }),
                  textChunks("There."),
                ],
              });
              const { threadId, turnId } = begunIn(events);
              const accepted = yield* accept(threadId, turnId);
              if (accepted._tag !== "Success" || accepted.success.accepted !== "note") {
                throw new Error("expected a note");
              }
              return { note: accepted.success.note, turnId };
            });

          const named = yield* offerAndAccept("the ferryman", "npc");
          expect(named.note).toMatchObject({
            category: "npc",
            kind: "note",
            visibility: "dm",
            origin: "assistant",
            assistantTurnId: named.turnId,
            pinnedAt: null,
          });

          const unnamed = yield* offerAndAccept("the weather", null);
          expect(unnamed.note.category).toBeNull();
        }),
    );

    it.effect("makes a beat that the recap reads back like any other", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Note what just happened.",
          rounds: [
            toolCallChunks("proposeBeat", {
              body: "They gave the ferryman a name that was not theirs.",
            }),
            textChunks("Filed."),
          ],
        });
        const { threadId, turnId } = begunIn(events);

        const accepted = yield* accept(threadId, turnId);
        if (accepted._tag !== "Success" || accepted.success.accepted !== "beat") {
          throw new Error("expected a beat");
        }
        // Filed against the night the campaign is running, resolved at accept time.
        expect(accepted.success.beat.sessionId).toBe(fixture.night.id);
        expect(accepted.success.beat.origin).toBe("assistant");
        expect(accepted.success.beat.assistantTurnId).toBe(turnId);

        const recap = yield* Effect.flatMap(Recap, (repo) =>
          Effect.flatMap(asDm(fixture.dm, fixture.campaign.id), (dm) =>
            repo.read(dm, fixture.night.id),
          ),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        expect(recap.beats.map((beat) => beat.id)).toContain(accepted.success.beat.id);

        const hits = yield* Effect.flatMap(Search, (search) =>
          search.search(fixture.campaign.id, { q: "ferryman", source: "beat" }),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        expect(hits.map((hit) => hit.id)).toContain(accepted.success.beat.id);
      }),
    );

    it.effect("makes the next night with its checklist and its act, planned rather than open", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const before = yield* counts(fixture.campaign.id);
        const { events } = yield* ask({
          text: "Plan next session.",
          rounds: [
            toolCallChunks("proposeNight", {
              title: "The reed maze",
              prep: ["Sketch the reed maze", "Name the frog envoy"],
              actTitle: "Act II · Under the reeds",
            }),
            textChunks("Planned."),
          ],
        });
        // Offered, and still nothing in the campaign.
        expect(proposedIn(events)?.proposal.target).toBe("night");
        expect(yield* counts(fixture.campaign.id)).toEqual(before);

        const { threadId, turnId } = begunIn(events);
        const accepted = yield* accept(threadId, turnId);
        if (accepted._tag !== "Success" || accepted.success.accepted !== "night") {
          throw new Error("expected a night");
        }
        const { session, prep, act } = accepted.success;
        // One past the highest the campaign has, and never the night it is running.
        expect(session.number).toBe(fixture.night.number + 1);
        expect(session.origin).toBe("assistant");
        expect(session.assistantTurnId).toBe(turnId);
        expect(prep.map((item) => [item.label, item.origin, item.assistantTurnId])).toEqual([
          ["Sketch the reed maze", "assistant", turnId],
          ["Name the frog envoy", "assistant", turnId],
        ]);
        expect(act?.firstSessionNumber).toBe(session.number);
        expect(act?.origin).toBe("assistant");
        expect(yield* counts(fixture.campaign.id)).toEqual({
          ...before,
          nights: before.nights + 1,
          prep: before.prep + 2,
          acts: before.acts + 1,
        });

        // The campaign still points at the night it is running.
        const campaign = yield* Effect.flatMap(Campaigns, (repo) =>
          repo.findById(fixture.campaign.id),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        expect(campaign.currentSessionId).toBe(fixture.night.id);
      }),
    );

    it.effect("makes an act at a night the campaign has", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const before = yield* counts(fixture.campaign.id);
        const { events } = yield* ask({
          text: "Add an act starting tonight.",
          rounds: [
            toolCallChunks("proposeAct", {
              title: "Act I · The ferry",
              sessionNumber: fixture.night.number,
            }),
            textChunks("Started."),
          ],
        });
        expect(yield* counts(fixture.campaign.id)).toEqual(before);
        const { threadId, turnId } = begunIn(events);
        const accepted = yield* accept(threadId, turnId);
        if (accepted._tag !== "Success" || accepted.success.accepted !== "act") {
          throw new Error("expected an act");
        }
        expect(accepted.success.act).toMatchObject({
          title: "Act I · The ferry",
          firstSessionNumber: fixture.night.number,
          origin: "assistant",
          assistantTurnId: turnId,
        });
        expect(yield* counts(fixture.campaign.id)).toEqual({ ...before, acts: before.acts + 1 });
      }),
    );

    it.effect("refuses a turn that offered nothing", () =>
      Effect.gen(function* () {
        const { events } = yield* ask({
          text: "Just answer me.",
          rounds: [textChunks("Answered.")],
        });
        const { threadId, turnId } = begunIn(events);

        const result = yield* accept(threadId, turnId);
        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("founds a Shared World from the account's own thread, and nowhere else", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The account panel's draft, kept through `acceptDraft`: the asker owns
        // the world, and the row carries the turn it came from.
        const model = scriptedModel({
          model: "scripted-local",
          maxTokens: MAX_TOKENS,
          rounds: [
            toolCallChunks("proposeSharedWorld", {
              name: "The Salt Marches",
              description: "Reed country, where the tide keeps its own calendar.",
            }),
            textChunks("A world of reeds."),
          ] as never,
        });
        const { events } = yield* Effect.gen(function* () {
          const hob = yield* Hob;
          const stream = yield* hob.askDraft({ text: "Make me a Shared World of salt marshes." });
          return { events: Array.from(yield* Stream.runCollect(stream)) };
        }).pipe(
          withActor(fixture.dm),
          Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
        );
        const { threadId, turnId } = begunIn(events);

        // A campaign's accept cannot reach an account thread's turn.
        const throughCampaign = yield* accept(threadId, turnId);
        expect(throughCampaign._tag === "Failure" && throughCampaign.failure).toBeInstanceOf(
          NotFound,
        );

        const kept = yield* Effect.flatMap(Proposals, (proposals) =>
          proposals.acceptDraft(threadId, turnId),
        ).pipe(withActor(fixture.dm), Effect.orDie);
        if (kept.accepted !== "sharedWorld") throw new Error("not a Shared World");
        expect(kept.sharedWorld).toMatchObject({
          name: "The Salt Marches",
          description: "Reed country, where the tide keeps its own calendar.",
          ownerAccountId: fixture.dm.accountId,
        });
        const rows = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql<{ readonly origin: string; readonly assistant_turn_id: string }>`
          select origin, assistant_turn_id from play_group where id = ${kept.sharedWorld.id}
        `,
        ).pipe(Effect.orDie);
        expect(rows).toEqual([{ origin: "assistant", assistant_turn_id: turnId }]);
        const mine = yield* Effect.flatMap(Groups, (groups) => groups.mine).pipe(
          withActor(fixture.dm),
        );
        expect(
          mine.find((membership) => membership.sharedWorld.id === kept.sharedWorld.id)?.isOwner,
        ).toBe(true);

        // Kept once.
        const again = yield* Effect.flatMap(Proposals, (proposals) =>
          proposals.acceptDraft(threadId, turnId),
        ).pipe(withActor(fixture.dm), Effect.result);
        expect(again._tag === "Failure" && again.failure).toBeInstanceOf(Conflict);
      }),
    );
  });

  describe("the boundary, on both halves", () => {
    it.effect("hides another table's conversations from a scoped credential", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "A private question.",
          rounds: [textChunks("A private answer.")],
          campaignId: fixture.otherTable.id,
        });
        const { threadId } = begunIn(events);

        // The thread exists, in a campaign this credential does not reach.
        const listed = yield* Effect.flatMap(HobThreads, (threads) =>
          threads.list("dm", fixture.otherTable.id),
        ).pipe(withActor(fixture.scopedDm), Effect.result);
        expect(listed._tag).toBe("Failure");
        expect(listed._tag === "Failure" && listed.failure).toBeInstanceOf(NotFound);

        // And naming the thread directly, through the campaign it *can* reach, does
        // not smuggle it across: the id is a claim, and containment is checked.
        const smuggled = yield* Effect.flatMap(HobThreads, (threads) =>
          threads.turns("dm", fixture.campaign.id, threadId),
        ).pipe(withActor(fixture.scopedDm), Effect.result);
        expect(smuggled._tag).toBe("Failure");
      }),
    );

    it.effect("refuses an accept aimed at another campaign", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Build something over here.",
          rounds: [anEncounter(fixture.croaker.id), textChunks("Here.")],
        });
        const { threadId, turnId } = begunIn(events);
        const before = yield* counts(fixture.otherTable.id);

        // The turn is real and the proposal is real; the campaign in the path is
        // not the one it belongs to. Accepting must not write into either.
        const result = yield* accept(threadId, turnId, { campaignId: fixture.otherTable.id });

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
        expect(yield* counts(fixture.otherTable.id)).toEqual(before);
      }),
    );

    it.effect("refuses a planned night accepted into another campaign", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "Plan next session.",
          rounds: [
            toolCallChunks("proposeNight", { title: "Elsewhere", prep: ["Not yours"] }),
            textChunks("Planned."),
          ],
        });
        const { threadId, turnId } = begunIn(events);
        const before = yield* counts(fixture.otherTable.id);

        const result = yield* accept(threadId, turnId, { campaignId: fixture.otherTable.id });

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
        expect(yield* counts(fixture.otherTable.id)).toEqual(before);
      }),
    );

    it.effect("refuses an accept from a credential minted for another table", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask({
          text: "One for the other table.",
          rounds: [
            toolCallChunks("proposeNote", { title: "Elsewhere", body: "Not yours." }),
            textChunks("Here."),
          ],
          campaignId: fixture.otherTable.id,
        });
        const { threadId, turnId } = begunIn(events);

        const result = yield* accept(threadId, turnId, {
          actor: fixture.scopedDm,
          campaignId: fixture.otherTable.id,
        });

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );
  });
});
