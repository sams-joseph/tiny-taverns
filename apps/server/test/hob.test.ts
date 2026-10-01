import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type HobEvent,
  HobUnavailable,
  NotFound,
} from "@taverns/api";
import { ConfigProvider, Context, Effect, Layer, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { assistantFromConfig } from "../src/app.js";
import {
  ACCOUNT_NOUNS,
  aQuestionAboutIt,
  askedForABuild,
  Hob,
  printedTheCall,
} from "../src/assistant/Hob.js";
import {
  HobToolkit,
  NO_VOCABULARY,
  coreToolkitListing,
  accountToolkitListing,
  accountToolkitOver,
  coreToolkitOver,
  playerToolkitListing,
  playerToolkitOver,
} from "../src/assistant/toolkit.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Acts } from "../src/repo/Acts.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignStories } from "../src/repo/CampaignStories.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { HobDirectWrites } from "../src/repo/HobDirectWrites.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { NpcPreps } from "../src/repo/NpcPrep.js";
import { NpcSheets } from "../src/repo/NpcSheets.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Party } from "../src/repo/Party.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { aPlayerAt, anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import {
  type ChatRequest,
  reasoningChunks,
  refused,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";
import { describeLayer } from "./support/suite.js";

/**
 * Hob: what it can reach, what it cannot, and what happens when nothing is
 * behind it.
 *
 * Four claims, and the second is the one this file exists for:
 *
 * - **the answer arrives in pieces**, through a real provider layer over a
 *   scripted OpenAI-compatible endpoint, with a real tool call in the middle of
 *   it that reads real rows out of real Postgres;
 * - **Hob cannot cross a campaign boundary**, by ownership or by credential
 *   scope. An assistant that leaks looks like helpfulness, which makes this the
 *   most important assertion in the repository as well as in this file;
 * - **an unconfigured server degrades rather than breaks**, exactly as the
 *   identity seam does;
 * - **there is no second data path** — no SQL and no `SqlClient` anywhere under
 *   `src/assistant/`, so the visibility predicate the HTTP API uses is the only
 *   one there is.
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
  EquipmentRepo.layer,
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  HobDirectWrites.layer.pipe(Layer.provide(LiveEvents.layer)),
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
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Acts.layer,
  PrepItems.layer,
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM with two tables, and a stranger with a third.
 *
 * Both of the first DM's campaigns contain the ferryman, deliberately: anything
 * of Sixpence's that comes back through the Salt Road is a leak between two
 * tables run by the same person, which is the exact hole `Actor.campaignId`
 * closed and the one an assistant is most likely to reopen.
 */
const makeFixture = Effect.gen(function* () {
  const creatures = yield* Creatures;
  const notes = yield* Notes;
  const beats = yield* Beats;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));

  yield* as(
    notes.create(campaign.id, {
      title: "The ferryman's price",
      body: "He asks for a name, not for coin. Nobody has asked him why.",
      kind: "read_aloud",
      visibility: "shared",
    }),
  );
  const crateNote = yield* as(
    notes.create(campaign.id, {
      title: "What is in the crate",
      body: "A ledger, three teeth, and the reason the marsh is quiet.",
      kind: "note",
    }),
  );

  // The same word, in the other table. Same account, same DM.
  yield* as(
    notes.create(otherTable.id, {
      title: "The ferryman at Sixpence",
      body: "A different ferryman entirely, and he takes coin.",
      kind: "note",
      visibility: "shared",
    }),
  );

  const night = yield* as(sessions.create(campaign.id, { number: 12, visibility: "shared" }));
  const nightElsewhere = yield* as(sessions.create(otherTable.id, { number: 3 }));

  yield* as(
    beats.create(campaign.id, night.id, {
      body: "The ferryman is called Cazril. He will not take coin, only a name.",
      visibility: "shared",
    }),
  );
  yield* as(
    beats.create(otherTable.id, nightElsewhere.id, {
      body: "The ferryman of Sixpence took the coin after all.",
      visibility: "shared",
    }),
  );

  // Two creatures in this DM's Library and one in somebody else's, so
  // `listCreatures` has something to answer *and* something it must not: the
  // usable-creature read is the one where "everything this table can build
  // from" is the whole request, which is the shape a cross-account leak hides
  // in most easily. (A DM's own Library reaches all of their tables by design
  // since the instancing decision of 2026-09-02 — the boundary is the account
  // and the explicit group share, not the table.)
  const goblin = yield* as(
    creatures.libraryCreate({
      name: "Marsh Goblin",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 13,
      hp: 7,
      environments: ["Marsh"],
    }),
  );
  yield* as(
    creatures.libraryCreate({
      name: "Reed Stalker",
      type: "Beast",
      cr: "2",
      ac: 14,
      hp: 33,
    }),
  );
  const drakeOwner = yield* anAccount("A stranger with a drake");
  yield* withActor(drakeOwner)(
    creatures.libraryCreate({
      name: "Sixpence Drake",
      type: "Dragon",
      cr: "3",
      ac: 15,
      hp: 45,
    }),
  );

  const stranger = yield* anAccount("Someone else");
  const strangerCampaign = yield* withActor(stranger)(
    createCampaign({ name: "A different table", visibility: "shared" }),
  );

  // A table with a real player membership and the master toggle off, which is
  // the ordinary state of a campaign nobody has shared yet. It is what makes
  // "a player's conversation is reachable exactly while the table is" a
  // measurement rather than a reading of the predicate.
  const unsharedCampaign = yield* as(createCampaign({ name: "The quiet table" }));

  return {
    dm,
    /** A credential minted for the Salt Road and nothing else. */
    scopedDm: scopedTo(dm, campaign.id),
    player: yield* aPlayerAt(campaign.id, "Pim"),
    /** A second player at the same table — one player is not two. */
    otherPlayer: yield* aPlayerAt(campaign.id, "Wren"),
    unsharedCampaign,
    unsharedPlayer: yield* aPlayerAt(unsharedCampaign.id, "Odd"),
    campaign,
    otherTable,
    strangerCampaign,
    night,
    crateNote,
    goblin,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/** The one question the record can answer and a model could not invent. */
const ASKED = "Who is the ferryman?";

const MAX_TOKENS = 512;

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/**
 * Ask Hob, with a scripted model behind it.
 *
 * The default script is the shape every grounded answer has: round one asks for
 * a search, round two writes the sentence.
 */
const ask = (
  actor: Actor,
  campaignId: CampaignId,
  options?: {
    readonly rounds?: ReadonlyArray<ReadonlyArray<Parameters<typeof textChunks>[0] | object>>;
    readonly query?: string;
    /** What the DM typed. `ASKED` is a question about the record, deliberately. */
    readonly text?: string;
    readonly apiUrl?: string;
    readonly model?: string;
  },
) => {
  const model = scriptedModel({
    model: options?.model ?? "scripted-local",
    maxTokens: MAX_TOKENS,
    ...(options?.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
    rounds: (options?.rounds as never) ?? [
      toolCallChunks("searchCampaign", { query: options?.query ?? "ferryman" }),
      textChunks("The ferryman ", "is called ", "Cazril."),
    ],
  });

  return Effect.gen(function* () {
    const hob = yield* Hob;
    const stream = yield* hob.ask(campaignId, { text: options?.text ?? ASKED });
    const events = yield* Stream.runCollect(stream);
    return { events: Array.from(events), requests: model.requests() } satisfies Asked;
  }).pipe(
    withActor(actor),
    Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
  );
};

/** What a scripted model was shown, as one searchable string. */
const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);

const texts = (events: ReadonlyArray<HobEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "delta" ? [event.data.text] : []));

/** Every sentence a `failed` event carried, which must never be more than one. */
const apologies = (events: ReadonlyArray<HobEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "failed" ? [event.data.message] : []));

/** The thread and the turn an answer was written into, said before a word of it. */
const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

/**
 * A scripted round with the fixture's real creature id in it.
 *
 * The id is minted when the file's layer is built, so a round declared at
 * module scope cannot name it. Substituting into the serialised arguments keeps
 * the scripts readable where they are written.
 */
const withGoblin = (chunks: ReadonlyArray<unknown>) =>
  Effect.map(
    Fixture,
    (fixture): ReadonlyArray<unknown> =>
      JSON.parse(
        JSON.stringify(chunks).replaceAll(
          '\\"creatureId\\":\\"\\"',
          `\\"creatureId\\":\\"${fixture.goblin.id}\\"`,
        ),
      ) as ReadonlyArray<unknown>,
  );

describeLayer("hob", shared, (it) => {
  describe("answering", () => {
    it.effect("streams the reply in pieces rather than in one finished paragraph", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id);

        // Three deltas, not one — the panel is a conversation surface and the
        // designers chose it over a one-shot palette deliberately.
        expect(texts(events)).toEqual(["The ferryman ", "is called ", "Cazril."]);
        // The thread and the turn come first, before a word of the answer: the
        // client needs both before it needs any of it.
        expect(events[0]?.event).toBe("began");
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect("calls a tool, and says so on the wire", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id);
        const steps = events.flatMap((event) => (event.event === "tool" ? [event.data] : []));

        expect(steps.map((step) => `${step.name}:${step.phase}`)).toEqual([
          "searchCampaign:called",
          "searchCampaign:answered",
        ]);
        expect(steps[0]?.detail).toBe("ferryman");
        // Three hits: the note, the beat, and the other note that mentions him.
        expect(steps[1]?.detail).toMatch(/^\d+ results?$/);
      }),
    );

    it.effect("sends the tool result back to the model, which streamText alone does not", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The package's `streamText` resolves tool calls and then stops — the
        // results are never returned to the model. `Hob`'s own round loop is what
        // supplies the second call, and without it every grounded question would
        // come back empty. Two requests is that loop, observed.
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id);

        expect(requests).toHaveLength(2);
        expect(shownTo(requests.slice(1))).toContain("Cazril");
      }),
    );

    it.effect("grounds the answer in rows a tool read, not in a context blob", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id);

        // The first request is the prompt Hob composed. It carries the question and
        // the campaign's name, and no campaign material whatsoever: "Cazril" is in
        // the record and must not appear until a tool has been called.
        const opening = shownTo(requests.slice(0, 1));
        expect(opening).toContain("The Salt Road");
        expect(opening).toContain(ASKED);
        expect(opening).not.toContain("Cazril");
        expect(opening).not.toContain("three teeth");
      }),
    );

    it.effect("sends the configured max_tokens on every request", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The habit that makes the beta-102 capability trap impossible: a provider
        // package that does not recognise a model id caps output silently, and the
        // first symptom is an answer cut off mid-sentence. See `hobMaxTokens`.
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id);

        expect(requests.length).toBeGreaterThan(0);
        for (const request of requests) expect(request.max_tokens).toBe(MAX_TOKENS);
      }),
    );

    it.effect("uses max_completion_tokens for the official OpenAI endpoint", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          apiUrl: "https://api.openai.com/v1",
        });

        expect(requests.length).toBeGreaterThan(0);
        for (const request of requests) {
          expect(request.max_completion_tokens).toBe(MAX_TOKENS);
          expect(request.max_tokens).toBeUndefined();
          expect(request.reasoning_effort).toBeUndefined();
        }
      }),
    );

    it.effect("disables Luna reasoning so Chat Completions can use Hob's function tools", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          apiUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
        });

        expect(requests.length).toBeGreaterThan(0);
        for (const request of requests) {
          expect(request.reasoning_effort).toBe("none");
          expect(request.tools?.length).toBeGreaterThan(0);
        }
      }),
    );

    it.effect("offers the model every tool, and a campaign id in none of them", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id);
        const tools = requests[0]?.tools ?? [];

        expect(
          tools.map((tool) => (tool.function as { name: string } | undefined)?.name).sort(),
        ).toEqual([
          "getCreature",
          "getNpc",
          "listCreatures",
          "listSessions",
          // Planning: an act on the Chronicle at a night the campaign has, and
          // the next night with its checklist. The creator's alone.
          "proposeAct",
          "proposeBeat",
          // The campaign's own story so far: drafted from the one reader below,
          // kept only by the creator's accept. No other toolkit has either.
          "proposeCampaignStory",
          "proposeEncounter",
          "proposeNight",
          "proposeNightSummary",
          "proposeNote",
          // A new NPC for the Cast, with an optional sheet composed as
          // `proposeNpcSheet`'s is; kept only by the creator's accept. No other
          // toolkit has it.
          "proposeNpc",
          "proposeNpcAwareness",
          // An NPC's stat sheet, built like a character's and kept only by the
          // creator's accept; `getNpc` above reads it back. No other toolkit has it.
          "proposeNpcSheet",
          "readCampaignStorySources",
          // The two group-context reads — the chronicle and the accepted summary,
          // keyed on the proof's own group. Read-only; what they can answer is
          // bounded by what the group admitted (the group-Hob boundary decision).
          "readSharedWorldSummary",
          "searchCampaign",
          "searchSharedWorldHistory",
          "sessionLog",
          "sessionRecap",
        ]);
        // The structural half of the boundary: the campaign is closed over from the
        // request path, so a model that hallucinated another campaign's id has
        // nowhere to put it. Not refused — unrepresentable.
        expect(JSON.stringify(tools).toLowerCase()).not.toContain("campaignid");

        // `listCreatures` takes nothing, exactly as `listSessions` does: "what is in
        // this campaign" has no parameter to get wrong, which is most of why it is
        // the tool a small model can actually reach for.
        const listCreatures = tools.find(
          (tool) => (tool.function as { name?: string } | undefined)?.name === "listCreatures",
        )?.function as { parameters?: { properties?: object } } | undefined;
        expect(listCreatures?.parameters?.properties ?? {}).toEqual({});
      }),
    );

    it.effect("adds the direct resource spend tool only when this live fight enables it", () =>
      Effect.gen(function* () {
        const direct = yield* Effect.gen(function* () {
          const campaigns = yield* Campaigns;
          const characters = yield* Characters;
          const encounters = yield* Encounters;
          const runs = yield* EncounterRuns;
          const party = yield* Party;
          const sessions = yield* Sessions;

          const dm = yield* anAccount("Direct Hob DM");
          const as = withActor(dm);
          const campaign = yield* as(
            createCampaign({ name: "The Direct Road", visibility: "shared" }),
          );
          const player = yield* aPlayerAt(campaign.id, "Brannoc");
          const character = yield* withActor(player)(
            characters.createOwn(campaign.id, {
              name: "Brannoc",
              playerName: "Pim",
              level: 3,
              className: "Fighter",
              ac: 18,
              hpMax: 31,
              sheet: {
                notes: "",
                abilities: [],
                traits: [],
                resources: [
                  {
                    id: "res:second-wind",
                    name: "Second Wind",
                    used: 0,
                    max: 1,
                    recharge: "short",
                  },
                ],
              },
            }),
          );
          yield* withActor(player)(party.join(campaign.id, { characterId: character.id }));
          const session = yield* as(
            sessions.create(campaign.id, { number: 1, visibility: "shared" }),
          );
          yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
          const encounter = yield* as(
            encounters.create(campaign.id, { name: "The Direct Fight", visibility: "shared" }),
          );
          const proof = yield* asDm(dm, campaign.id);
          const run = yield* runs.start(proof, session.id, {
            encounterId: encounter.id,
            includeParty: true,
            visibility: "shared",
          });
          const enabled = yield* runs.update(proof, session.id, run.id, {
            allowHobDirectWrites: true,
          });
          return { dm, campaign, session, run: enabled, character };
        }).pipe(Effect.orDie);

        const { events, requests } = yield* ask(direct.dm, direct.campaign.id, {
          text: "Spend Brannoc's Second Wind.",
          rounds: [
            toolCallChunks(
              "spendCharacterResource",
              { target: "target:1", amount: 1 },
              "call_spend",
            ),
            textChunks("Second Wind is spent."),
          ] as never,
        });

        const tools = requests[0]?.tools ?? [];
        const names = tools.map((tool) => (tool.function as { name?: string } | undefined)?.name);
        expect(names).toContain("spendCharacterResource");
        const spend = tools.find(
          (tool) =>
            (tool.function as { name?: string } | undefined)?.name === "spendCharacterResource",
        )?.function as { parameters?: unknown } | undefined;
        const schema = JSON.stringify(spend?.parameters ?? {});
        expect(schema).toContain("target:1");
        expect(schema).toContain("enum");
        expect(schema).not.toContain("campaignId");

        expect(
          events.flatMap((event) =>
            event.event === "tool" ? [`${event.data.name}:${event.data.phase}`] : [],
          ),
        ).toEqual(["spendCharacterResource:called", "spendCharacterResource:answered"]);

        const checked = yield* Effect.gen(function* () {
          const writes = yield* HobDirectWrites;
          const proof = yield* asDm(direct.dm, direct.campaign.id);
          const updates = yield* writes.list(proof, direct.session.id, direct.run.id);
          const sql = yield* SqlClient.SqlClient;
          const rows = yield* sql<{ readonly used: number }>`
          select (resource.value ->> 'used')::integer as used
          from character
          cross join lateral jsonb_array_elements(character.body -> 'resources') as resource(value)
          where character.id = ${direct.character.id}
            and resource.value ->> 'id' = 'res:second-wind'
        `;
          return { updates, used: rows[0]?.used };
        }).pipe(withActor(direct.dm), Effect.orDie);

        expect(checked.used).toBe(1);
        expect(checked.updates).toHaveLength(1);
        expect(checked.updates[0]).toMatchObject({
          characterName: "Brannoc",
          resourceId: "res:second-wind",
          resourceName: "Second Wind",
          beforeUsed: 0,
          afterUsed: 1,
        });
      }),
    );

    it.effect("reports a model that answers with nothing but tool calls", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("searchCampaign", { query: "ferryman" }, "a"),
            toolCallChunks("searchCampaign", { query: "ferryman" }, "b"),
            toolCallChunks("searchCampaign", { query: "ferryman" }, "c"),
            toolCallChunks("searchCampaign", { query: "ferryman" }, "d"),
          ] as never,
        });

        expect(events.at(-1)).toMatchObject({ event: "failed" });
        expect(texts(events)).toEqual([]);
      }),
    );

    it.effect("takes the nulls its own tool schema asks the model for", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **The bug this pins killed every answer that used an optional
        // parameter, and looked like the model refusing to call a tool.** What we
        // publish is not what `Schema.optional` says: the provider rewrites
        // optionals into OpenAI strict mode, so `source` and `limit` go out as
        // *required* with a `null` member — asserted below, because it is the
        // premise — and an endpoint that turns that schema into a grammar leaves
        // the model no other way to say "no filter". It sends `null`, the decode
        // side used the untransformed schema, refused it, and the whole stream
        // died one round in with a schema error and no tool step on screen.
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("searchCampaign", { query: "ferryman", source: null, limit: null }),
            textChunks("The ferryman is called Cazril."),
          ] as never,
        });

        const search = (requests[0]?.tools ?? []).find(
          (tool) => (tool.function as { name?: string } | undefined)?.name === "searchCampaign",
        )?.function as
          | {
              parameters?: {
                required?: ReadonlyArray<string>;
                properties?: Record<string, unknown>;
              };
            }
          | undefined;
        expect(search?.parameters?.required).toContain("source");
        expect(JSON.stringify(search?.parameters)).toContain(`"null"`);

        // And what the endpoint compiles into a grammar is what a handler will
        // accept, in both directions. `source` offers the enum, a real null and the
        // words a template writes when it cannot spell one — and nothing wider: a
        // string arm would swallow a mistyped `"creatur"` as "no filter".
        const source = JSON.stringify(search?.parameters?.properties?.source);
        expect(source).toContain(`"note","beat","creature","character","npc"`);
        expect(source).toContain(`"","null","Null","NULL","none","None","NONE"`);
        expect(source).not.toContain(`{"type":"string"}`);
        // `query` no longer carries a minimum on the wire, which is the half of the
        // empty-search fix the model can see. The rule moved into the handler; see
        // the tool-call tests below.
        expect(JSON.stringify(search?.parameters?.properties?.query)).not.toContain("minLength");

        expect(
          events.flatMap((event) =>
            event.event === "tool" ? [`${event.data.name}:${event.data.phase}`] : [],
          ),
        ).toEqual(["searchCampaign:called", "searchCampaign:answered"]);
        expect(texts(events)).toEqual(["The ferryman is called Cazril."]);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect(
      "says so when the model ran out of room, instead of reporting a finished answer",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // A reasoning model spends `HOB_MAX_TOKENS` on thinking nobody sees, and
          // `toHobEvent` drops reasoning parts on purpose. Without this report the
          // DM gets `began` … `done` and an empty panel — measured against a real
          // Qwen3-8B, twice in six ordinary questions.
          const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
            rounds: [reasoningChunks("Hmm, the DM is asking about the ferryman.")] as never,
          });

          expect(events.map((event) => event.event)).toEqual(["began", "failed"]);
          expect(events.at(-1)).toMatchObject({ event: "failed" });
          expect(JSON.stringify(events.at(-1)?.data)).toContain("HOB_MAX_TOKENS");
        }),
    );

    it.effect("says so when the thinking arrived as prose, which is the report itself", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The same run against an endpoint that does not split reasoning out of
        // `content`: the panel fills with the model's chain of thought and no tool
        // is ever called. "All I ever get back are text deltas" — and the answer is
        // a number, not a broken toolkit.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            reasoningChunks("Hmm, the DM is asking about the ferryman.", { inline: true }),
          ] as never,
        });

        expect(texts(events)).toEqual(["<think>Hmm, the DM is asking about the ferryman."]);
        expect(events.at(-1)?.event).toBe("failed");
      }),
    );

    it.effect("says so when the model stopped without saying anything at all", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Nothing is written to the thread for an empty answer, so a bare `done`
        // leaves a spinner that stopped and a transcript that will not remember it.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [textChunks()] as never,
        });

        expect(events.map((event) => event.event)).toEqual(["began", "failed"]);
      }),
    );

    it.effect("tells the model when a tool refused, rather than tearing the answer down", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `failureMode: "return"`. A model that guesses a session id gets a
        // `NotFound` it can read and apologise for; the DM keeps their stream.
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("sessionRecap", { sessionId: fixture.strangerCampaign.id }),
            textChunks("I could not find that night."),
          ] as never,
        });

        expect(events.at(-1)?.event).toBe("done");
        expect(texts(events)).toEqual(["I could not find that night."]);
        expect(shownTo(requests.slice(1))).toContain("NotFound");
      }),
    );
  });

  /**
   * Every failure sentence in the panel is one somebody wrote.
   *
   * `HobFailure.message` is rendered verbatim inside a conversation the DM is
   * having, so the standard is not "no stack traces" but "nothing the framework,
   * the provider or the codec wrote". These are the fingerprints of the dump this
   * surface actually shipped — a page of `Expected "note" | "beat" | …` naming
   * every tool in the toolkit, over `LanguageModel.streamText: Invalid output:`.
   */
  const FRAMEWORK_WORDS = [
    "LanguageModel.",
    "Toolkit.",
    "Invalid output",
    "Expected ",
    " at [",
    "SchemaError",
    "AiError",
    "streamText",
  ];

  const failures = (events: ReadonlyArray<HobEvent>): ReadonlyArray<string> =>
    events.flatMap((event) => (event.event === "failed" ? [event.data.message] : []));

  const expectNoFrameworkWords = (events: ReadonlyArray<HobEvent>): void => {
    for (const message of failures(events)) {
      for (const word of FRAMEWORK_WORDS) expect(message).not.toContain(word);
    }
  };

  describe("a tool call the framework cannot read", () => {
    it.effect(
      "takes the word 'null' for an unset optional, which is all this endpoint can write",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // **Defect 1, measured six times out of six.** A chat template whose
          // tool-call format is XML hands llama.cpp untyped parameter *text*, which it
          // coerces through the published JSON schema: an integer optional's `null`
          // parses as JSON null and a *string* optional's stays the string `"null"`.
          // Both mean "not given" and only one used to decode.
          const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
            rounds: [
              toolCallChunks("searchCampaign", { query: "ferryman", source: "null", limit: null }),
              textChunks("The ferryman is called Cazril."),
            ] as never,
          });

          expect(
            events.flatMap((event) =>
              event.event === "tool" ? [`${event.data.name}:${event.data.phase}`] : [],
            ),
          ).toEqual(["searchCampaign:called", "searchCampaign:answered"]);
          // Absent, not "null" read as a filter: the beat is a `beat` and the note a
          // `note`, and both are in the answer.
          expect(shownTo(requests.slice(1))).toContain("Cazril");
          expect(texts(events)).toEqual(["The ferryman is called Cazril."]);
          expect(events.at(-1)?.event).toBe("done");
        }),
    );

    it.effect("takes every spelling of absent a model reaches for, on a whole propose call", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The same conversion reaches the propose path directly: four attempts at
        // `proposeEncounter` with its optionals unset produced `"null"` three times
        // and `"None"` once. Each of those used to kill the answer *and* the card.
        // Restricted-shaped: the optional is unset and the required ones are real.
        // (The enum it was measured on, the DM-set band, has since gone; the
        // search tool's `source` above is the enum case.)
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("proposeEncounter", {
              name: "Ambush in the reeds",
              tags: "null",
              creatures: [{ creatureId: fixture.goblin.id, count: 3 }],
            }),
            textChunks("Three goblins in the reeds."),
          ] as never,
        });

        const proposed = events.flatMap((event) =>
          event.event === "proposal" ? [event.data.proposal] : [],
        );
        expect(proposed).toHaveLength(1);
        // Absent means absent, and the column defaults answer — not the word.
        expect(proposed[0]).toMatchObject({
          target: "encounter",
          name: "Ambush in the reeds",
          tags: [],
        });
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect(
      "refuses an empty search where the model can hear it, and names what to call instead",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // **The escape both models reached for.** Asked to build an encounter with
          // no hint, they searched for everything — `query: ""` — which the tool's own
          // schema forbade, one layer above any handler, killing the answer. The rule
          // is unchanged; only the place it is enforced moved, so the "no" is now
          // something Hob reads and acts on.
          const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
            rounds: [
              toolCallChunks("searchCampaign", { query: "" }),
              textChunks("Let me look at the bestiary instead."),
            ] as never,
          });

          expect(
            events.flatMap((event) =>
              event.event === "tool" ? [`${event.data.name}:${event.data.phase}`] : [],
            ),
          ).toEqual(["searchCampaign:called", "searchCampaign:answered"]);
          const told = shownTo(requests.slice(1));
          expect(told).toContain("Conflict");
          expect(told).toContain("listCreatures");
          expect(texts(events)).toEqual(["Let me look at the bestiary instead."]);
          expect(events.at(-1)?.event).toBe("done");
        }),
    );

    it.effect("hands a malformed argument back to the model instead of ending the answer", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **Defect 2.** A tool call's arguments are decoded by the framework, inside
        // `streamText`, before any handler runs — so `failureMode: "return"` never
        // applied to them and one bad value failed the whole stream. What the DM saw
        // was a schema error; what the thread kept was nothing.
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("proposeEncounter", {
              name: "Ambush in the reeds",
              creatures: [{ creatureId: "not-a-uuid", count: 3 }],
            }),
            toolCallChunks(
              "proposeEncounter",
              {
                name: "Ambush in the reeds",
                creatures: [{ creatureId: fixture.goblin.id, count: 3 }],
              },
              "call_2",
            ),
            textChunks("Three goblins in the reeds."),
          ] as never,
        });

        // The model was told, in a message it can act on, and it did.
        expect(requests).toHaveLength(3);
        // The unreadable call never reached the history: no tool call is left in
        // it with nothing answering, which a provider refuses outright.
        expect(requests[1]?.messages?.some((message) => "tool_calls" in message)).toBe(false);
        const correction = String(requests[1]?.messages?.at(-1)?.content ?? "");
        expect(correction).toContain("could not be read");
        // **What it says is one precise thing, not the codec's whole complaint.** A
        // stream part is a union over every tool, so the raw message carries a line
        // per tool that did not match — a page of context a small model spends
        // instead of thinking, and one that reads as an instruction to go and call
        // `listSessions`. Only the pairs whose path names the arguments survive.
        expect(correction).toContain(`Expected a UUID, got "not-a-uuid"`);
        expect(correction).toContain(".creatures[0].creatureId");
        expect(correction).not.toContain("listSessions");
        expect(correction).not.toContain("tool-result");
        // And the answer survived it: the second attempt landed, the card was made,
        // and the DM got prose rather than an apology.
        expect(
          events.flatMap((event) => (event.event === "proposal" ? [event.data] : [])),
        ).toHaveLength(1);
        expect(texts(events)).toEqual(["Three goblins in the reeds."]);
        expect(events.at(-1)?.event).toBe("done");
        expect(failures(events)).toEqual([]);
      }),
    );

    it.effect("gives up in words when the model never learns to spell the call", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The budget is not infinite and a free retry would be a loop with no
        // ceiling, so a run of unreadable calls ends — as a sentence about the
        // model, never as the schema error that names the campaign toolkit.
        const bad = toolCallChunks("searchCampaign", { query: "ferryman", limit: "lots" });
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [bad, bad, bad, bad, bad] as never,
        });

        // Charged to the same budget an ordinary round is, which is what bounds it:
        // the fifth script entry is never reached, however willing the model is.
        expect(requests).toHaveLength(4);
        expect(events.at(-1)?.event).toBe("failed");
        expect(failures(events)).toHaveLength(1);
        expectNoFrameworkWords(events);
      }),
    );

    it.effect("says nothing the framework wrote, whatever went wrong", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The rule, over every failure this surface can reach: the endpoint refusing
        // outright, the model emitting a shape the codec cannot read, and the model
        // running out of room. `HobFailure.message` is rendered verbatim in a
        // conversation the DM is having.
        const shapes: ReadonlyArray<{
          readonly rounds: ReadonlyArray<unknown>;
          readonly says: string;
        }> = [
          { rounds: [refused(500)], says: "The model endpoint failed while answering." },
          { rounds: [refused(401)], says: "refused Hob's credential" },
          { rounds: [refused(429)], says: "asking too often" },
          {
            // A response part the codec cannot read at all — not a tool call, the
            // provider's own shape.
            rounds: [
              [
                { object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: 7 } }] },
                "[DONE]",
              ],
            ],
            says: "HOB_MAX_TOKENS",
          },
          { rounds: [reasoningChunks("Thinking about the ferryman.")], says: "HOB_MAX_TOKENS" },
        ];

        for (const shape of shapes) {
          const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
            rounds: shape.rounds as never,
          });
          expect(failures(events)).toHaveLength(1);
          expect(failures(events)[0]).toContain(shape.says);
          expectNoFrameworkWords(events);
        }
      }),
    );
  });

  describe("running out of rounds", () => {
    /** The one call that fills the proposal slot, for the tests below. */
    const proposes = toolCallChunks(
      "proposeEncounter",
      { name: "Ambush in the reeds", creatures: [{ creatureId: "", count: 3 }] },
      "call_offer",
    );

    it.effect("does not call a turn that offered something a failure", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **The pair that cannot both be true.** `tail` puts the proposal at the
        // very end so it cannot land after a `done`, so a failure emitted from a
        // round necessarily arrives *before* the card — and "Hob kept looking things
        // up and never got to an answer" beside the answer reads as a contradiction
        // of the thing arriving one event later. Measured against a real 8B, which
        // told the DM exactly that while a good `proposeEncounter` was on its way.
        const search = toolCallChunks("searchCampaign", { query: "goblin" }, "call_look");
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [yield* withGoblin(proposes), search, search, search] as never,
        });

        // The budget really is gone — four provider rounds, every one of them a
        // tool call — and the turn still ends cleanly.
        expect(failures(events)).toEqual([]);
        expect(events.map((event) => event.event).slice(-2)).toEqual(["proposal", "done"]);
      }),
    );

    it.effect("still says so when the rounds went nowhere at all", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The other half, and the reason this is a question about the slot rather
        // than a softening: with nothing offered there is genuinely nothing to show,
        // so the report stands. Without this the fix would be indistinguishable from
        // deleting the failure.
        const search = toolCallChunks("searchCampaign", { query: "goblin" }, "call_look");
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [search, search, search, search] as never,
        });

        expect(failures(events)).toHaveLength(1);
        expect(failures(events)[0]).toContain("never got to an answer");
        expect(events.at(-1)?.event).toBe("failed");
      }),
    );

    it.effect("does not call an offer a failure when the rounds went on unreadable calls", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The same question on the other path into exhaustion, and the one this
        // change made likelier: a recovery is charged to the budget, so a model that
        // offers something good and then garbles one more call is a way to run out
        // that did not exist before `recover` did.
        const bad = toolCallChunks(
          "searchCampaign",
          { query: "goblin", limit: "lots" },
          "call_bad",
        );
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [yield* withGoblin(proposes), bad, bad, bad] as never,
        });

        expect(requests).toHaveLength(4);
        expect(failures(events)).toEqual([]);
        expect(events.map((event) => event.event).slice(-2)).toEqual(["proposal", "done"]);
      }),
    );

    it.effect("still says so when unreadable calls offered nothing", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Pinned beside the last one for the reason above: the failure has to
        // survive where it is the only thing left to say.
        const bad = toolCallChunks(
          "searchCampaign",
          { query: "goblin", limit: "lots" },
          "call_bad",
        );
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [bad, bad, bad, bad] as never,
        });

        expect(failures(events)).toHaveLength(1);
        expectNoFrameworkWords(events);
      }),
    );
  });

  describe("listing the bestiary", () => {
    it.effect("answers what this campaign can put in a fight, ids first", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **Defect 4, and the reason "build me an encounter" came back as prose.**
        // The only reach into the bestiary was lexical and needed a word, so a model
        // with no hint guessed nouns off the campaign's name, got nothing every
        // time, and concluded it could not propose anything. `Creatures.list` was
        // already shipped; only the tool was missing.
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [
            toolCallChunks("listCreatures", {}),
            toolCallChunks(
              "proposeEncounter",
              { name: "Reeds at dusk", creatures: [{ creatureId: fixture.goblin.id, count: 4 }] },
              "call_2",
            ),
            textChunks("Four goblins in the reeds."),
          ] as never,
        });

        const listed = shownTo(requests.slice(1, 2));
        expect(listed).toContain("Marsh Goblin");
        expect(listed).toContain("Reed Stalker");
        // The id the model needs is in the answer under the name it has where it is
        // going, so a roster costs no second read.
        expect(listed).toContain("creatureId");
        expect(listed).toContain(fixture.goblin.id);
        expect(listed).toContain("Small Humanoid");
        // And the whole stat block is not: fifty documents is a context window a
        // local model drowns in, which is the failure this area exists to stop.
        expect(listed).not.toContain("statBlock");

        expect(
          events.flatMap((event) => (event.event === "proposal" ? [event.data] : [])),
        ).toHaveLength(1);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect("lists no other table's creatures, on a credential that reaches both", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The same leak the ferryman guards on the search path, on the read where
        // "everything in the campaign" is the whole request. The DM owns both
        // tables; the campaign is closed over from the path and nothing else.
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          rounds: [toolCallChunks("listCreatures", {}), textChunks("Two of them.")] as never,
        });

        const listed = shownTo(requests.slice(1));
        expect(listed).toContain("Marsh Goblin");
        expect(listed).not.toContain("Sixpence Drake");
      }),
    );
  });

  describe("what Hob offered, remembered", () => {
    it.effect("carries a saved proposal back into the next question's prompt", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **Defect 3.** The card is on the DM's screen and in `assistant_turn`, and
        // the prompt was assembled from `text` alone — so "make that harder" reached
        // a model that could see a sentence about an encounter and nothing about
        // what was in it. A turn where Hob offered a card and said *nothing* was
        // dropped from the prompt entirely, which is exactly what the propose tools'
        // own instruction ("say one short line and stop") makes likely.
        const model = scriptedModel({
          model: "scripted-local",
          maxTokens: MAX_TOKENS,
          rounds: [
            toolCallChunks("proposeEncounter", {
              name: "Ambush in the reeds",
              tags: ["marsh"],
              creatures: [{ creatureId: fixture.goblin.id, count: 3 }],
            }),
            textChunks("Three goblins."),
            textChunks("Make it five."),
          ],
        });

        const asked = yield* Effect.gen(function* () {
          const hob = yield* Hob;
          const first = yield* hob.ask(fixture.campaign.id, { text: "Build me an encounter" });
          const events = Array.from(yield* Stream.runCollect(first));
          const began = events.find((event) => event.event === "began");
          const threadId = began?.event === "began" ? began.data.threadId : undefined;
          const second = yield* hob.ask(fixture.campaign.id, {
            text: "Make it harder",
            threadId,
          });
          yield* Stream.runCollect(second);
          return model.requests();
        }).pipe(
          withActor(fixture.dm),
          Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
        );

        // The third request is the second question's opening prompt: the history it
        // carries is what Hob remembers of the evening.
        const remembered = shownTo(asked.slice(2, 3));
        expect(remembered).toContain("Ambush in the reeds");
        expect(remembered).toContain("Marsh Goblin");
        // The id, because it is the one thing a follow-up cannot re-derive without
        // spending another round looking for a creature it has already been shown.
        expect(remembered).toContain(fixture.goblin.id);
        // And whether it is a row in the campaign yet, which is the whole safety
        // property of a proposal.
        expect(remembered).toContain("not yet accepted");
      }),
    );
  });

  describe("the boundary — proven, not argued", () => {
    it.effect("refuses a campaign the credential was not minted for, before any stream", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Same account, same DM, a campaign they really do own. The refusal is an
        // `Effect` failure and not an event inside a 200, so it is a 404 on the
        // wire — and the model is never called at all.
        const result = yield* Effect.gen(function* () {
          const hob = yield* Hob;
          return yield* hob.ask(fixture.otherTable.id, { text: ASKED });
        }).pipe(
          withActor(fixture.scopedDm),
          Effect.provide(
            Hob.layer({ model: "scripted-local" }).pipe(
              Layer.provide(
                scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] }).layer,
              ),
            ),
          ),
          Effect.result,
        );

        expect(result._tag).toBe("Failure");
        // `NotFound`, not `Forbidden`: "it exists but is not yours" is itself a
        // disclosure.
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("never shows a scoped credential's Hob another table's rows", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The leak that would look like a feature. Both campaigns have a ferryman;
        // only one of them may reach the model.
        const { requests } = yield* ask(fixture.scopedDm, fixture.campaign.id);
        const shown = shownTo(requests);

        expect(shown).toContain("Cazril");
        expect(shown).not.toContain("Sixpence");
        expect(shown).not.toContain("took the coin after all");
      }),
    );

    it.effect(
      "still cannot build the DM's tool surface for a player, and shows them nothing extra",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // **The captain reversed *players do not talk to Hob* on 2026-08-26, and
          // this test is what that reversal moved rather than removed.** It used to
          // read "cannot be built for a player at all": there was one `handlersFor`,
          // it took the `CampaignCreatorActor`, and a player's tool surface was not something to
          // refuse but something that could not be constructed.
          //
          // What is still true is the half that was doing the work. `dmHandlersFor`
          // still takes the proof, and a player still cannot obtain one — so the
          // campaign toolkit that includes the combat log and a stat block remains
          // unbuildable for them. What replaced the refusal is a *second, smaller*
          // toolkit rather than a weaker proof, which is the distinction the block
          // below measures.
          const refused = yield* Effect.flip(asDm(fixture.player, fixture.campaign.id)).pipe(
            Effect.orDie,
          );
          expect(refused).toBeInstanceOf(NotFound);

          // And underneath it, unchanged: a tool handler's read is the repository's
          // read with this actor, so the row's own visibility applies inside the tool
          // exactly as it does inside the HTTP handler, because it is the same
          // `WHERE` clause. Driven straight at `Search` with the player's actor,
          // which is what the tool *does* now call.
          const hits = yield* Effect.flatMap(Search, (search) =>
            search.search(fixture.campaign.id, { q: "crate" }),
          ).pipe(withActor(fixture.player), Effect.orDie);

          const shown = JSON.stringify(hits);
          expect(shown).not.toContain("three teeth");
          expect(shown).not.toContain(fixture.crateNote.id);
        }),
    );

    it.effect(
      "answers a player, and offers them the character toolkit rather than the campaign toolkit",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // The reversal, measured at the one place it is visible: the toolkit is
          // what the provider is *shown*, so a player who was bound to the DM's
          // handlers with a narrower predicate underneath would still be offered
          // `getCreature` — a stat block, which is precisely what the product says a
          // player must not have.
          const { events, requests } = yield* ask(fixture.player, fixture.campaign.id);
          const tools = requests[0]?.tools ?? [];

          expect(
            tools.map((tool) => (tool.function as { name: string } | undefined)?.name).sort(),
          ).toEqual(["listStartingSpells", "proposeCharacter", "searchCampaign"]);
          // The structural half of the boundary is identical on this side: the
          // campaign is still closed over from the request path.
          expect(JSON.stringify(tools).toLowerCase()).not.toContain("campaignid");

          expect(events[0]?.event).toBe("began");
          expect(events.at(-1)?.event).toBe("done");
        }),
    );

    it.effect("gives a player the shared half of the record and no more, inside the tool", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `searchCampaign` is the one tool both toolkits have, and it is written
        // once for exactly this reason: the predicate is what makes a DM's answer
        // wide and a player's narrow, so there is no second, "player-safe" search
        // to disagree with the first. Measured on what the *model* was shown, which
        // is the only place a leak here would surface.
        const { requests } = yield* ask(fixture.player, fixture.campaign.id, {
          rounds: [
            toolCallChunks("searchCampaign", { query: "ferryman" }),
            textChunks("The ferryman is called Cazril."),
          ] as never,
        });
        const shown = shownTo(requests.slice(1));

        // The `shared` beat reached them; the `dm` note did not.
        expect(shown).toContain("Cazril");
        expect(shown).not.toContain("three teeth");
        // And the other table is as far away as it is for a DM.
        expect(shown).not.toContain("Sixpence");
      }),
    );

    it.effect("keeps a player's conversation out of their DM's, in both directions", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The disjointness `0016` bought, and the reason it is not a nicety: the
        // panel resumes *the newest thread*, so without it a player asking Hob
        // would change which conversation their DM is shown — and a DM reaching a
        // player's turn could accept a `character` proposal into their own
        // ownership.
        const mine = yield* ask(fixture.player, fixture.campaign.id);
        const { threadId: playerThread } = begunIn(mine.events);
        const theirs = yield* ask(fixture.dm, fixture.campaign.id);
        const { threadId: dmThread } = begunIn(theirs.events);

        const threads = (actor: Actor, reach: "dm" | "own") =>
          Effect.flatMap(HobThreads, (repo) => repo.list(reach, fixture.campaign.id)).pipe(
            withActor(actor),
            Effect.orDie,
          );

        const dmSees = (yield* threads(fixture.dm, "dm")).map((thread) => thread.id);
        const playerSees = (yield* threads(fixture.player, "own")).map((thread) => thread.id);

        expect(dmSees).toContain(dmThread);
        expect(dmSees).not.toContain(playerThread);
        expect(playerSees).toContain(playerThread);
        expect(playerSees).not.toContain(dmThread);

        // And naming the other's thread directly does not smuggle it across, in
        // either direction: the reach is a `WHERE` clause, not a list filter.
        const reachedByDm = yield* Effect.flatMap(HobThreads, (repo) =>
          repo.turns("dm", fixture.campaign.id, playerThread),
        ).pipe(withActor(fixture.dm), Effect.result);
        expect(reachedByDm._tag).toBe("Failure");

        const reachedByPlayer = yield* Effect.flatMap(HobThreads, (repo) =>
          repo.turns("own", fixture.campaign.id, dmThread),
        ).pipe(withActor(fixture.player), Effect.result);
        expect(reachedByPlayer._tag).toBe("Failure");
      }),
    );

    it.effect("keeps one player's conversation out of another's", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `ownRowWritable` compares `account_id` to the actor's own account and to
        // nothing a caller supplied, so there is no request shape that asks for
        // somebody else's evening.
        const mine = yield* ask(fixture.player, fixture.campaign.id);
        const { threadId } = begunIn(mine.events);

        const listed = yield* Effect.flatMap(HobThreads, (repo) =>
          repo.list("own", fixture.campaign.id),
        ).pipe(withActor(fixture.otherPlayer), Effect.orDie);
        expect(listed.map((thread) => thread.id)).not.toContain(threadId);

        const smuggled = yield* Effect.flatMap(HobThreads, (repo) =>
          repo.turns("own", fixture.campaign.id, threadId),
        ).pipe(withActor(fixture.otherPlayer), Effect.result);
        expect(smuggled._tag).toBe("Failure");
        expect(smuggled._tag === "Failure" && smuggled.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("refuses a player at a table their DM has not shared", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The campaign half of `ownRowWritable` is `withinReadableCampaign`, the
        // same fragment `character` composes — so a player's conversation is
        // reachable exactly while the table is, and the master toggle is untouched
        // by the reversal. `unsharedCampaign` has a live player membership and
        // `visibility: "dm"`.
        const result = yield* Effect.gen(function* () {
          const hob = yield* Hob;
          return yield* hob.ask(fixture.unsharedCampaign.id, { text: ASKED });
        }).pipe(
          withActor(fixture.unsharedPlayer),
          Effect.provide(
            Hob.layer({ model: "scripted-local" }).pipe(
              Layer.provide(
                scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] }).layer,
              ),
            ),
          ),
          Effect.result,
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("refuses a stranger's campaign", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const result = yield* Effect.gen(function* () {
          const hob = yield* Hob;
          return yield* hob.ask(fixture.strangerCampaign.id, { text: ASKED });
        }).pipe(
          withActor(fixture.dm),
          Effect.provide(
            Hob.layer({ model: "scripted-local" }).pipe(
              Layer.provide(
                scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] }).layer,
              ),
            ),
          ),
          Effect.result,
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("with no model configured", () => {
    /**
     * The environment is supplied as a provider rather than by writing to
     * `process.env`: `ConfigProvider.fromEnv()` copies the environment into a trie
     * when it is constructed and the default provider is a `Context.Reference`, so
     * the first config read in a process freezes it for the whole run. Mutating
     * `process.env` in a test changes nothing, silently.
     */
    const hobThroughEnv = <A, E>(
      env: Record<string, string>,
      use: (hob: (typeof Hob)["Service"]) => Effect.Effect<A, E, CurrentActor>,
    ) =>
      Effect.flatMap(Fixture, (fixture) =>
        Effect.flatMap(Hob, use).pipe(
          withActor(fixture.dm),
          Effect.provide(
            assistantFromConfig.pipe(
              Layer.provide([
                Campaigns.layer,
                CampaignStories.layer,
                Creatures.layer,
                CampaignCreatorActors.layer,
                HobThreads.layer,
                Recap.layer,
                Search.layer,
                SessionEvents.layer,
                Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
                Acts.layer,
                PrepItems.layer,
              ]),
            ),
          ),
          // Outermost, so it covers the layer's construction and not only the
          // effect that runs afterwards.
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
          Effect.result,
        ),
      );

    it.effect("builds, and reports itself unavailable", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const status = yield* hobThroughEnv({}, (hob) => hob.status(fixture.campaign.id));

        expect(status._tag).toBe("Success");
        // The campaign's name is still answered: the panel's context strip has to be
        // true whether or not a model is behind it.
        expect(status._tag === "Success" && status.success).toMatchObject({
          available: false,
          model: null,
          campaign: "The Salt Road",
        });
      }),
    );

    it.effect("refuses a status read for a campaign it may not see", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // "Is Hob switched on" must not be a cheaper question than any other.
        const status = yield* hobThroughEnv({}, (hob) => hob.status(fixture.strangerCampaign.id));

        expect(status._tag).toBe("Failure");
        expect(status._tag === "Failure" && status.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("answers a question with a declared unavailability, not a crash", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const result = yield* hobThroughEnv({}, (hob) =>
          hob.ask(fixture.campaign.id, { text: ASKED }),
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(HobUnavailable);
      }),
    );

    it.effect("still refuses a campaign it may not read, rather than leaking that it is off", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // "The assistant is switched off" must not be a cheaper way to learn which
        // campaigns exist than asking it a question.
        const result = yield* hobThroughEnv({}, (hob) =>
          hob.ask(fixture.strangerCampaign.id, { text: ASKED }),
        );

        expect(result._tag).toBe("Failure");
        expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("is off when only half of the configuration is present", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // An endpoint with no model name would fail on the first question from
        // inside a stream, which is a far worse way to find out.
        const status = yield* hobThroughEnv({ HOB_API_URL: "http://127.0.0.1:8080/v1" }, (hob) =>
          hob.status(fixture.campaign.id),
        );

        expect(status._tag === "Success" && status.success.available).toBe(false);
      }),
    );

    it.effect("is on when both halves are, and names the model", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The other half of the switch: without it, "unset means off" would also be
        // satisfied by a layer that is off unconditionally.
        const status = yield* hobThroughEnv(
          { HOB_API_URL: "http://127.0.0.1:8080/v1", HOB_MODEL: "qwen2.5-3b-instruct" },
          (hob) => hob.status(fixture.campaign.id),
        );

        expect(status._tag === "Success" && status.success).toMatchObject({
          available: true,
          model: "qwen2.5-3b-instruct",
        });
      }),
    );
  });

  /**
   * **The captain's report, and the two halves of answering it.**
   *
   * A DM asks Hob to build something, the model answers in prose, and they get a
   * plausible sentence and no card — with nothing saying Hob tried and failed. It
   * is the common case rather than the rare one: with every tool offered, the
   * captain's own configured 4B chose a `propose*` tool once in five attempts.
   *
   * The first three tests are the report. **The four after them are the more
   * important half**: a false positive here — telling somebody the model refused
   * when they never asked it to build anything, or when it built the thing — is
   * worse than saying nothing, and the last one is the ordering pair
   * `gotNowhere` already refuses and this must not reintroduce.
   */
  describe("a model that would not use its build tools", () => {
    it.effect("says so when the DM asked for one and got prose", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Build me an encounter for the reeds.",
          rounds: [textChunks("Reed stalkers ", "would suit the marsh.")] as never,
        });

        // The prose still stands — it is what the model said, and dropping it would
        // be a worse lie than the silence this replaces.
        expect(texts(events)).toEqual(["Reed stalkers ", "would suit the marsh."]);
        expect(events.map((event) => event.event)).toEqual(["began", "delta", "delta", "failed"]);
        expect(apologies(events)).toHaveLength(1);
        expect(apologies(events)[0]).toContain("built nothing you can save");
        expect(apologies(events)[0]).toContain("write it yourself");
      }),
    );

    it.effect("says so when the model printed the arguments in a fence, as the 4B did", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // The captured shape, close to verbatim: the tool's name is in the sentence
        // and the arguments are in the block. The ask here is deliberately *not*
        // one the wording test would catch — this signature has to stand alone.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "The reeds need something tonight.",
          rounds: [
            textChunks(
              "I'm offering an encounter called **Goblin Ambush**.\n\n" +
                '```json\n{ "name": "Goblin Ambush", "tags": [],\n' +
                '  "creatures": [ { "creatureId": "d0ca", "count": 3 } ] }\n```\n',
            ),
          ] as never,
        });

        expect(events.at(-1)?.event).toBe("failed");
        expect(apologies(events)[0]).toContain("built nothing you can save");
      }),
    );

    it.effect("says so when the model named the call in its reply, as the 1B did", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `proposeEncounter "The Marsh Encounter: Swamp Stompers": A Bullywug mob…`
        // — drawn in the panel as ordinary reply text, with `proposal IS NULL` on
        // the turn behind it. Again an ask the wording test does not catch.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Anything for the marsh tonight?",
          rounds: [
            textChunks(
              'proposeEncounter "The Marsh Encounter: Swamp Stompers": ' +
                "A Bullywug mob on the prowl.",
            ),
          ] as never,
        });

        expect(events.at(-1)?.event).toBe("failed");
        expect(apologies(events)[0]).toContain("built nothing you can save");
      }),
    );

    it.effect("names the way on that fits who asked, and says nothing about the other one", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Write me a note about the lantern-keeper.",
          rounds: [textChunks("He keeps the lamps and little else.")] as never,
        });

        const said = apologies(events)[0] ?? "";
        expect(said).toContain("write it yourself");
        expect(said).not.toContain("fill the sheet in");
        // Never the framework's own words, whatever else it says.
        expect(said).not.toContain("Expected ");
        expect(said).not.toContain("LanguageModel.");
      }),
    );

    it.effect("stays quiet on an ordinary question, which is most of what is asked", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `ASKED` is "Who is the ferryman?" — the shape of nearly every question
        // this panel gets, and the shape a false positive would spoil.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id);

        expect(apologies(events)).toEqual([]);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect("stays quiet when a question about the record only looks like a request", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // A make-verb and a build noun, in a sentence asking what is already
        // written down. This is the false positive the wording test is shaped
        // around, and it is worth a round trip rather than only a unit assertion.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "What did I write in that note about the ambush?",
          rounds: [textChunks("Nothing about an ambush.")] as never,
        });

        expect(apologies(events)).toEqual([]);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect("stays quiet when something was built — the pair it must never make", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // **The ordering bug the reliability work fixed, arriving by a new door.**
        // A card and "it built nothing" are the one pair that cannot both be true,
        // and the gate is structural: `tail` reads the proposal slot at the very
        // end, after every round, so there is no order in which both are emitted.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Build me an encounter for the reeds.",
          rounds: (yield* withGoblin([
            toolCallChunks("proposeEncounter", {
              name: "Reed ambush",
              creatures: [{ creatureId: "", count: 3 }],
            }),
            textChunks("Three of them, in the reeds."),
          ])) as never,
        });

        expect(events.some((event) => event.event === "proposal")).toBe(true);
        expect(apologies(events)).toEqual([]);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect(
      "says nothing reached the DM when the tool refused the call, not that none was made",
      () =>
        Effect.gen(function* () {
          const fixture = yield* Fixture;
          // It reached for a build tool and got an answer it could read — an invented
          // creature id comes back as a `NotFound` through `failureMode: "return"`.
          // Saying "no usable build tool call" there would be a true-sounding
          // sentence about the wrong thing; saying nothing trusts a reply that may
          // claim the card is on screen. So the turn ends in the one true report.
          const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
            text: "Build me an encounter for the reeds.",
            rounds: [
              toolCallChunks("proposeEncounter", {
                name: "Reed ambush",
                creatures: [{ creatureId: fixture.strangerCampaign.id, count: 3 }],
              }),
              textChunks("Your ambush is ready to view."),
            ] as never,
          });

          expect(events.some((event) => event.event === "proposal")).toBe(false);
          expect(events.some((event) => event.event === "done")).toBe(false);
          const said = apologies(events);
          expect(said).toHaveLength(1);
          expect(said[0]).toContain("nothing reached you");
          expect(said[0]).not.toContain("usable build tool call");
        }),
    );

    it.effect("stays quiet when a refused call was fixed and offered in the same turn", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Build me an encounter for the reeds.",
          rounds: (yield* withGoblin([
            toolCallChunks("proposeEncounter", {
              name: "Reed ambush",
              creatures: [{ creatureId: fixture.strangerCampaign.id, count: 3 }],
            }),
            toolCallChunks("proposeEncounter", {
              name: "Reed ambush",
              creatures: [{ creatureId: "", count: 3 }],
            }),
            textChunks("Three of them, in the reeds."),
          ])) as never,
        });

        expect(events.some((event) => event.event === "proposal")).toBe(true);
        expect(apologies(events)).toEqual([]);
        expect(events.at(-1)?.event).toBe("done");
      }),
    );

    it.effect("says one thing, never two, when the answer already failed for its own reason", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // A build ask that also ran out of room. `truncated` names the knob and is
        // the useful sentence; a second apology under it would be noise, and
        // `broke` is what keeps this to one.
        const { events } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Build me an encounter for the reeds.",
          rounds: [reasoningChunks("Hmm, what lives in a marsh.")] as never,
        });

        expect(apologies(events)).toHaveLength(1);
        expect(apologies(events)[0]).toContain("HOB_MAX_TOKENS");
      }),
    );

    it.effect("runs no tool a round that ran out of room asked for", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Since effect 4.0.0-rc.113 a response that stops for `length` resolves its
        // tool calls with a synthesized failure instead of running their handlers:
        // a call written in the last tokens before the cap is not trusted to be the
        // call the model meant. So a well-formed offer in a truncated round makes no
        // card, and what the DM is told is the knob, once.
        const cutOff = (yield* withGoblin(
          toolCallChunks("proposeEncounter", {
            name: "Ambush in the reeds",
            creatures: [{ creatureId: "", count: 3 }],
          }),
        )).map((chunk) =>
          typeof chunk === "string"
            ? chunk
            : JSON.parse(
                JSON.stringify(chunk).replace(
                  '"finish_reason":"tool_calls"',
                  '"finish_reason":"length"',
                ),
              ),
        );
        const { events, requests } = yield* ask(fixture.dm, fixture.campaign.id, {
          text: "Build me an encounter for the reeds.",
          rounds: [cutOff] as never,
        });

        expect(requests).toHaveLength(1);
        expect(events.some((event) => event.event === "proposal")).toBe(false);
        expect(apologies(events)).toHaveLength(1);
        expect(apologies(events)[0]).toContain("HOB_MAX_TOKENS");
      }),
    );
  });

  /**
   * **The judgement, written out as a table.**
   *
   * The two surfaces answer "was a build asked for" differently and the asymmetry
   * is a fact about them rather than a hedge: the DM's panel is general chat, so
   * silence is the default and the wording has to opt in; a player's is the
   * character-drafting composer and nothing else, whose input is normally a
   * paragraph with no verb in it, so a draft is the default and a question about
   * the one on screen is the way out.
   *
   * This is where the whole of it is visible, and the misses are listed beside
   * the hits on purpose: the rule is deliberately timid, and a test that only
   * showed what it catches would hide the half that was chosen.
   */
  describe("what counts as asking for a build", () => {
    const DM_ASKS: ReadonlyArray<readonly [string, boolean]> = [
      // Asked for, plainly.
      ["Build me an encounter for the reeds.", true],
      ["Can you write me an encounter?", true],
      ["make a note that the ferryman wants a name", true],
      ["I need a beat for what just happened", true],
      ["come up with a fight for the crossing", true],
      ["give me an encounter with goblins", true],
      ["Build the ambush.", true],
      ["Build me something for the reeds.", true],
      ["write something about the lantern-keeper", true],
      ["draft some read-aloud for the marsh", true],
      // A new member of the Cast, which `proposeNpc` drafts.
      ["Make an NPC for the ferry crossing", true],
      ["add a blacksmith to the cast", true],
      ["create a villain for the reeds", true],
      // The next night and its checklist, which `proposeNight` drafts, and an
      // act, `proposeAct`'s.
      ["Plan next session", true],
      ["prep the next night for me", true],
      ["add an act for the heist", true],
      // Not asked for. Every one of these is a question this panel really gets.
      ["Who is the ferryman?", false],
      ["Who wrote this note?", false],
      ["What did I write in that note about the ambush?", false],
      ["Did I make a note about the crate?", false],
      ["How do I make an encounter?", false],
      ["Tell me about the ambush at the crossing", false],
      ["What happened in the last fight?", false],
      ["Summarise the last encounter", false],
      ["give me a summary of last session", false],
      ["give me something to read about the ferryman", false],
      ["Who is in the cast?", false],
      ["Did I already make an NPC for the ferry?", false],
      ["What happened last session?", false],
      ["Which act are we in?", false],
      ["Make the innkeeper act nervous when they arrive", false],
      ["I plan to run the fight tomorrow, what CR fits?", false],
      // Misses, kept visible: each is a build ask the rule lets past, because
      // erring towards silence is the instruction.
      ["Give me a name for the ferryman", false],
      ["Note what just happened.", false],
      ["Something for the reeds, again.", false],
    ];

    it.each(DM_ASKS)("%s", (asked, expected) => {
      expect(askedForABuild(asked)).toBe(expected);
    });

    const ACCOUNT_ASKS: ReadonlyArray<readonly [string, boolean]> = [
      // A Shared World, which `proposeSharedWorld` drafts.
      ["Make me a shared world", true],
      ["build a world for my horror games", true],
      ["create a campaign in the marshes", true],
      // Not asked for: a setting is a thing to talk about, not a thing to keep.
      ["suggest a setting for a horror one-shot", false],
      ["What game should I run?", false],
    ];

    it.each(ACCOUNT_ASKS)("account: %s", (asked, expected) => {
      expect(askedForABuild(asked, ACCOUNT_NOUNS)).toBe(expected);
    });

    const PLAYER_ASKS: ReadonlyArray<readonly [string, boolean]> = [
      // The composer's ordinary input: a description, with no verb anywhere.
      ["A wood elf who grew up in a river town. Quiet, terrible liar.", true],
      ["Make her a ranger instead.", true],
      ["Can you make her taller?", true],
      ["Someone who bleeds for their oaths.", true],
      // A question about the draft already on screen.
      ["What did you give her for skills?", false],
      ["Why is her wisdom so high?", false],
      ["Is she any good in a fight?", false],
      // Not a question, so still a draft ask — the timid direction here is the
      // other one, because this surface has no other purpose.
      ["what about a ranger", true],
    ];

    it.each(PLAYER_ASKS)("player: %s", (asked, expected) => {
      expect(!aQuestionAboutIt(asked)).toBe(expected);
    });

    it("reads a printed call out of prose and out of a fence, and nothing else", () => {
      // The name in call position — the 1B's shape, and a JavaScript-looking one.
      expect(printedTheCall('proposeEncounter "Swamp Stompers": a Bullywug mob.')).toBe(true);
      expect(printedTheCall("```\nproposeCharacter({ name: 'Sorrel' })\n```")).toBe(true);
      expect(printedTheCall('{ "name": "proposeEncounter", "arguments": {} }')).toBe(true);
      // The arguments in a fence, with the name only in the sentence above it —
      // the 4B's shape, which the first half cannot see.
      expect(
        printedTheCall(
          'Offering an ambush.\n```json\n{ "creatures": [{ "creatureId": "d0" }] }\n```',
        ),
      ).toBe(true);
      // A model saying which tool it used, having used it, is not this; nor is a
      // fenced list of the tools it has; nor is read-aloud text in a block.
      expect(printedTheCall("I offered it with proposeEncounter.")).toBe(false);
      expect(printedTheCall("I will use proposeEncounter to build it.")).toBe(false);
      expect(printedTheCall("```\nproposeEncounter\nproposeNote\n```")).toBe(false);
      expect(printedTheCall("Here is the read-aloud:\n```\nThe reeds part.\n```")).toBe(false);
    });

    it.effect("fingerprints argument names that are really in the published schemas", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // `BUILD_ARGUMENTS` is a hand-written fingerprint of this toolkit's own
        // parameter names. A rename upstream would leave it matching nothing, and
        // nothing else would notice — so it is checked against what actually goes
        // on the wire, DM side and player side.
        const { requests } = yield* ask(fixture.dm, fixture.campaign.id);
        const dmTools = JSON.stringify(requests[0]?.tools ?? []);
        expect(dmTools).toContain("creatureId");
        expect(dmTools).toContain("readAloud");
        expect(dmTools).toContain("sourceExcerpt");
        const drafting: { readonly parametersSchema: { readonly fields: object } } =
          playerToolkitOver(NO_VOCABULARY).tools.proposeCharacter;
        expect(Object.keys(drafting.parametersSchema.fields)).toContain("abilityOrder");
        const campaign: { readonly parametersSchema: { readonly fields: object } } =
          accountToolkitOver(NO_VOCABULARY, []).tools.proposeCampaign;
        expect(Object.keys(campaign.parametersSchema.fields)).toContain("partyName");
      }),
    );

    it("keeps the naming convention the detector reads", () => {
      // `isBuildTool` is `/^propose[A-Z]/` rather than a list, so it cannot fall
      // out of step with the toolkits — as long as this holds. A build tool named
      // anything else would go unreported, silently, which is the failure this
      // whole area exists to remove.
      const dm = Object.keys(HobToolkit.tools);
      const player = Object.keys(playerToolkitListing(NO_VOCABULARY).tools);
      expect(dm.filter((name) => /^propose[A-Z]/.test(name)).sort()).toEqual([
        "proposeAct",
        "proposeBeat",
        "proposeCampaignStory",
        "proposeEncounter",
        "proposeNight",
        "proposeNightSummary",
        "proposeNote",
        "proposeNpc",
        "proposeNpcAwareness",
        "proposeNpcSheet",
      ]);
      expect(player.filter((name) => /^propose[A-Z]/.test(name))).toEqual(["proposeCharacter"]);
      const account = Object.keys(accountToolkitListing(NO_VOCABULARY, []).tools);
      expect(account.filter((name) => /^propose[A-Z]/.test(name)).sort()).toEqual([
        "proposeCampaign",
        "proposeCharacter",
        "proposeSharedWorld",
      ]);
      // And nothing that builds is spelled another way: every remaining tool is a
      // read, by the list `the assistant seam` above pins.
      expect(
        [...dm, ...player, ...account].filter((name) =>
          /^(draft|offer|suggest|create)[A-Z]/.test(name),
        ),
      ).toEqual([]);
    });
  });

  describe("the assistant seam", () => {
    const assistantDirectory = fileURLToPath(new URL("../src/assistant", import.meta.url));

    const sources = (directory: string): ReadonlyArray<string> =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return sources(path);
        return entry.name.endsWith(".ts") ? [path] : [];
      });

    /**
     * Comments removed, so the rule can be *described* in the files it governs.
     *
     * Crude on purpose — it does not know about a `//` inside a string literal —
     * and that is the right trade here: a false positive is a failing test
     * somebody reads, and there is no construct in this directory that would
     * produce a false negative.
     */
    const code = (path: string): string =>
      readFileSync(path, "utf8")
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/\/\/.*$/gm, "");

    it("writes no SQL of its own", () => {
      // The reconciliation with the session-history work is one sentence: the
      // index belongs to the history, and the assistant consumes it. Nothing
      // about that is visible in a passing HTTP test — a SQL template added to a
      // tool handler would work perfectly and quietly create a second search path
      // over one corpus, which is where the visibility seam gets re-derived
      // slightly wrong. This file is the only thing that notices.
      const offenders = sources(assistantDirectory)
        .filter((path) => {
          const source = code(path);
          return /\bsql`/.test(source) || /"effect\/unstable\/sql"/.test(source);
        })
        .map((path) => path.slice(assistantDirectory.length + 1));

      expect(offenders).toEqual([]);
    });

    it("reaches the record only through repositories that require an actor", () => {
      // Every tool handler is one repository call, and every one of those returns
      // `Effect<…, …, CurrentActor>` — so an unscoped read does not compile.
      // Listing them here means another capability is a visible edit rather than
      // a quiet one.
      expect(Object.keys(HobToolkit.tools).sort()).toEqual([
        "getCreature",
        "getNpc",
        "listCreatures",
        "listSessions",
        "proposeAct",
        "proposeBeat",
        // The campaign's own story so far: drafted from the one reader below,
        // kept only by the creator's accept. No other toolkit has either.
        "proposeCampaignStory",
        "proposeEncounter",
        "proposeNight",
        "proposeNightSummary",
        "proposeNote",
        // A new NPC for the Cast, with an optional sheet composed as
        // `proposeNpcSheet`'s is; kept only by the creator's accept. No other
        // toolkit has it.
        "proposeNpc",
        "proposeNpcAwareness",
        // An NPC's stat sheet, built like a character's and kept only by the
        // creator's accept; `getNpc` above reads it back. No other toolkit has it.
        "proposeNpcSheet",
        "readCampaignStorySources",
        // The two group-context reads — the chronicle and the accepted summary,
        // keyed on the proof's own group. Read-only; what they can answer is
        // bounded by what the group admitted (the group-Hob boundary decision).
        "readSharedWorldSummary",
        "searchCampaign",
        "searchSharedWorldHistory",
        "sessionLog",
        "sessionRecap",
      ]);
    });

    it("counts the player's three tools, and the one the cap adds", () => {
      // The player's toolkit is built per request now, so it cannot be counted as
      // a module constant — but the same property has to hold, and this is where
      // it does: a third capability offered to a player is an edit to this list.
      //
      // `listOptions` is the *only* thing the cap adds, which is the design's own
      // constraint on itself: the schema may vary with the vocabulary and the
      // toolkit may not vary for anything else.
      expect(Object.keys(playerToolkitOver(NO_VOCABULARY).tools).sort()).toEqual([
        "listStartingSpells",
        "proposeCharacter",
        "searchCampaign",
      ]);
      expect(Object.keys(playerToolkitListing(NO_VOCABULARY).tools).sort()).toEqual([
        "listOptions",
        "listStartingSpells",
        "proposeCharacter",
        "searchCampaign",
      ]);
    });

    it("counts the core drafting toolkit: the player's without the campaign search", () => {
      // Drafting with no campaign has no record to search, so it has no tool to
      // search one with; the core rules are its whole vocabulary.
      expect(Object.keys(coreToolkitOver(NO_VOCABULARY).tools).sort()).toEqual([
        "listStartingSpells",
        "proposeCharacter",
      ]);
      expect(Object.keys(coreToolkitListing(NO_VOCABULARY).tools).sort()).toEqual([
        "listOptions",
        "listStartingSpells",
        "proposeCharacter",
      ]);
    });

    it("counts the account panel's toolkit: the core drafting one plus campaigns and worlds", () => {
      // Outside any campaign Hob drafts the three things an account makes on its
      // own. Campaign content needs a campaign and a Chronicle entry a world;
      // their tools are absent here.
      expect(Object.keys(accountToolkitOver(NO_VOCABULARY, []).tools).sort()).toEqual([
        "listStartingSpells",
        "proposeCampaign",
        "proposeCharacter",
        "proposeSharedWorld",
      ]);
      expect(Object.keys(accountToolkitListing(NO_VOCABULARY, []).tools).sort()).toEqual([
        "listOptions",
        "listStartingSpells",
        "proposeCampaign",
        "proposeCharacter",
        "proposeSharedWorld",
      ]);
    });
  });
});
