import { describe, expect } from "@effect/vitest";
import {
  type AssistantThreadId,
  type AssistantTurnId,
  CurrentActor,
  type HobEvent,
  type RaceBody,
  type SpellId,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { aPerson, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import {
  type ChatRequest,
  type Round,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob drafting a character with no campaign** — `/me/hob`, the account's own
 * conversation against the core rules.
 *
 * Over the real application, so the reach, the toolkit, the accept and the
 * portrait trigger are the shipped ones; only the model and the image
 * endpoint are scripted. Four claims:
 *
 * - **the thread is the account's and nothing else's** — no campaign, no
 *   world, and another account reaches it through no path;
 * - **the toolkit is the core rules** — no campaign or Shared World tool, no
 *   Library original, no campaign's words in anything sent to the model;
 * - **keeping it makes an unseated character** — `origin = 'assistant'`, the
 *   turn on it, no seat, and one portrait;
 * - **another account cannot keep it**.
 */

/**
 * The model's script, appended to per question: `scriptedModel` reads the
 * round at each request's index, so a test pads to the requests made so far
 * and pushes its own.
 */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-draft", maxTokens: 512, rounds: script });
const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "draft-portraits" });

const database = migratedDatabase("taverns_test_hob_draft");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-draft" }).pipe(Layer.provide(model.layer)),
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("hob-draft-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 10, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(ImageRecords.layer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** The same call, answering the failure's tag rather than dying on it. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const settled = () => Effect.flatMap(HobImages, (drawing) => drawing.idle);

const DESCRIBED =
  "A wood elf who grew up in a river town, apprenticed to a herbalist. Quiet, watches everything.";

/** A draft a well-behaved model makes, in the core rules' own words. */
const aDraft = (over: Record<string, unknown> = {}) =>
  toolCallChunks("proposeCharacter", {
    name: "Sorrel Ash",
    race: "Elf",
    subrace: null,
    className: "Druid",
    subclass: null,
    background: "Acolyte",
    abilityOrder: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
    skills: ["Nature", "Perception"],
    backstory: "She left the river town with the herbal under her coat.",
    bond: null,
    ideal: null,
    flaw: null,
    appearance: "Thirties, wiry, mud to the knees.",
    kit: ["Herbalism kit"],
    cantrips: null,
    spells: null,
    preparedSpells: null,
    rationale: ["Wisdom is highest because you described someone who watches."],
    ...over,
  });

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask `/me/hob/ask` as somebody, with these rounds scripted. */
const ask = (
  token: string,
  options: {
    readonly text?: string;
    readonly threadId?: AssistantThreadId;
    readonly rounds?: ReadonlyArray<Round>;
  } = {},
): Effect.Effect<Asked, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...(options.rounds ?? [aDraft(), textChunks("Here she is.")]));
    const events = yield* as(token, (client) =>
      Effect.flatMap(
        client.meHob.ask({
          // The create screen's composer, which says so: the account's panel
          // asks without `intent` and is `hob-account.test.ts`'s.
          payload: {
            text: options.text ?? DESCRIBED,
            intent: "character",
            ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
          },
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    return { events: Array.from(events), requests: model.requests().slice(before) };
  });

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const proposedIn = (events: ReadonlyArray<HobEvent>) => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data : undefined;
};

const toolNames = (request: ChatRequest | undefined): ReadonlyArray<string> =>
  (request?.tools ?? [])
    .map((tool) => (tool as { readonly function?: { readonly name?: string } }).function?.name)
    .filter((name): name is string => name !== undefined)
    .sort();

const characterCount = () =>
  sql((sql) => sql<{ readonly count: string }>`select count(*)::text as count from character`).pipe(
    Effect.map((rows) => Number(rows[0]?.count ?? "0")),
  );

/** A homebrew race in an account's own Library: never core rules. */
const MARSHBORN: RaceBody = {
  speed: 30,
  size: "Medium",
  abilityBonuses: [{ ability: "CON", amount: 2 }],
  hpPerLevel: 0,
  traits: [],
  subraces: [],
};

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  yield* importSystemSpells();
  // Signed up and invited nowhere: the account the captain could not make a
  // character with.
  const fresh = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const dm = yield* aPerson("Fen");
  expect(yield* as(fresh.token, (client) => client.me.campaigns())).toEqual([]);
  yield* as(fresh.token, (client) =>
    client.library.createOption({
      payload: { kind: "race", name: "Marshborn", body: MARSHBORN },
    }),
  );
  // A table the DM runs, with something at it the drafting surface must never
  // show the model.
  const saltRoad = yield* as(dm.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  yield* as(dm.token, (client) =>
    client.notes.create({
      params: { campaignId: saltRoad.id },
      payload: {
        title: "SALT_ROAD_SENTINEL",
        body: "The ferryman is the drowned king.",
        visibility: "shared",
      },
    }),
  );
  return { fresh, stranger, dm, saltRoad };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-draft.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer(
  "hob-draft",
  shared,
  (it) => {
    describe("the thread belongs to the account and nothing else", () => {
      it.effect("starts one with no campaign and no world, owned by the asker", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const { events } = yield* ask(fresh.token);
          const { threadId } = begunIn(events);
          expect(proposedIn(events)?.proposal.target).toBe("character");
          expect(events.at(-1)?.event).toBe("done");

          const rows = yield* sql(
            (sql) =>
              sql<{
                readonly campaign_id: string | null;
                readonly group_id: string | null;
                readonly account_id: string | null;
              }>`select campaign_id, group_id, account_id from assistant_thread where id = ${threadId}`,
          );
          expect(rows).toEqual([
            { campaign_id: null, group_id: null, account_id: fresh.actor.accountId },
          ]);

          const threads = yield* as(fresh.token, (client) => client.meHob.threads());
          const listed = threads.find((thread) => thread.id === threadId);
          expect(listed).toMatchObject({ campaignId: null, worldId: null });
          const turns = yield* as(fresh.token, (client) =>
            client.meHob.turns({ params: { threadId } }),
          );
          expect(turns.map((turn) => turn.who)).toEqual(["user", "hob"]);
          expect(turns[1]?.proposal?.target).toBe("character");
        }),
      );

      it.effect("is NotFound to another account on every path, and the model is never called", () =>
        Effect.gen(function* () {
          const { fresh, stranger, dm, saltRoad } = yield* Fixture;
          const { events } = yield* ask(fresh.token);
          const { threadId, turnId } = begunIn(events);

          expect(
            yield* refusal(stranger.token, (client) =>
              client.meHob.turns({ params: { threadId } }),
            ),
          ).toBe("NotFound");
          const theirs = yield* as(stranger.token, (client) => client.meHob.threads());
          expect(theirs.map((thread) => thread.id)).not.toContain(threadId);

          const before = model.requests().length;
          expect(
            yield* refusal(stranger.token, (client) =>
              client.meHob.ask({
                payload: { threadId, text: "Make her a ranger.", intent: "character" },
              }),
            ),
          ).toBe("NotFound");
          expect(model.requests().length).toBe(before);

          // And nothing reaches it through a campaign's Hob either: it is in no
          // campaign, so the campaign arms never match it.
          expect(
            yield* refusal(fresh.token, (client) =>
              client.hob.turns({ params: { campaignId: saltRoad.id, threadId } }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(dm.token, (client) =>
              client.hob.accept({
                params: { campaignId: saltRoad.id, threadId, turnId },
                payload: {},
              }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect("keeps a campaign's creator's drafting thread off that campaign's panel", () =>
        Effect.gen(function* () {
          const { dm, saltRoad } = yield* Fixture;
          const { events } = yield* ask(dm.token);
          const { threadId } = begunIn(events);
          const panel = yield* as(dm.token, (client) =>
            client.hob.threads({ params: { campaignId: saltRoad.id } }),
          );
          expect(panel.map((thread) => thread.id)).not.toContain(threadId);
          expect(
            yield* refusal(dm.token, (client) =>
              client.hob.turns({ params: { campaignId: saltRoad.id, threadId } }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect("continues the same thread, and shows the model the draft it already offered", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const first = yield* ask(fresh.token);
          const { threadId } = begunIn(first.events);
          const second = yield* ask(fresh.token, {
            threadId,
            text: "Make her a ranger instead.",
            rounds: [aDraft({ className: "Ranger" }), textChunks("A ranger, then.")],
          });
          expect(begunIn(second.events).threadId).toBe(threadId);
          expect(JSON.stringify(second.requests[0]?.messages)).toContain(
            'You offered the player a character called \\"Sorrel Ash\\"',
          );
        }),
      );
    });

    describe("the toolkit is the core rules and nothing else", () => {
      it.effect("offers two drafting tools and no campaign or Shared World tool", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const { requests } = yield* ask(fresh.token);
          expect(toolNames(requests[0])).toEqual(["listStartingSpells", "proposeCharacter"]);
          const shown = JSON.stringify(requests[0]?.tools);
          expect(shown.toLowerCase()).not.toContain("campaignid");
          expect(shown).not.toContain("searchCampaign");
          expect(shown).not.toContain("SharedWorld");
        }),
      );

      it.effect("names the core rules' vocabulary, and no Library original", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const { requests } = yield* ask(fresh.token);
          const shown = JSON.stringify(requests[0]?.tools);
          expect(shown).toContain("Barbarian");
          expect(shown).toContain("Dragonborn");
          expect(shown).toContain("Acolyte");
          // The asker's own homebrew race is their Library, not the core rules.
          expect(shown).not.toContain("Marshborn");
          expect(shown).toContain("in the core rules");
        }),
      );

      it.effect("sends a campaign's creator no word of their campaign", () =>
        Effect.gen(function* () {
          const { dm } = yield* Fixture;
          const { requests } = yield* ask(dm.token);
          const shown = JSON.stringify(requests);
          expect(shown).not.toContain("The Salt Road");
          expect(shown).not.toContain("SALT_ROAD_SENTINEL");
          expect(shown).not.toContain("drowned king");
        }),
      );

      it.effect("resolves starting spells from the core rules and keeps their ids", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const fireBolt = yield* sql(
            (sql) => sql<{ readonly id: SpellId }>`
        select id from spell where name = 'Fire Bolt' and campaign_id is null and account_id is null
      `,
          );
          const spellId = fireBolt[0]!.id;
          const { events, requests } = yield* ask(fresh.token, {
            rounds: [
              toolCallChunks("listStartingSpells", { className: "Wizard", subclass: null }),
              aDraft({ className: "Wizard", cantrips: [spellId] }),
              textChunks("A wizard."),
            ],
          });
          // The list the model was shown carried the bundled spell.
          expect(JSON.stringify(requests[1]?.messages)).toContain("Fire Bolt");
          const proposed = proposedIn(events);
          if (proposed?.proposal.target !== "character") throw new Error("no character proposal");
          expect(JSON.stringify(proposed.proposal.sheet.spellcasting)).toContain(spellId);
        }),
      );
    });

    describe("keeping the draft", () => {
      it.effect(
        "makes an unseated character drafted by Hob, and draws its portrait and banner once",
        () =>
          Effect.gen(function* () {
            const { fresh } = yield* Fixture;
            const { events } = yield* ask(fresh.token);
            const { threadId, turnId } = begunIn(events);
            const drawnBefore = images.requests().length;

            const accepted = yield* as(fresh.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            );
            if (accepted.accepted !== "character") throw new Error("not a character");
            expect(accepted.character.name).toBe("Sorrel Ash");
            expect(accepted.character.className).toBe("Druid");
            expect(accepted.character.portraitPending).toBe(true);
            yield* settled();
            expect(images.requests().length - drawnBefore).toBe(2);

            const rows = yield* sql(
              (sql) => sql<{
                readonly account_id: string;
                readonly origin: string;
                readonly assistant_turn_id: string | null;
                readonly seats: number;
                readonly portraits: number;
              }>`
        select character.account_id, character.origin, character.assistant_turn_id,
               (select count(*) from campaign_character
                where campaign_character.character_id = character.id)::int as seats,
               (select count(*) from character_portrait
                where character_portrait.character_id = character.id)::int as portraits
        from character where character.id = ${accepted.character.id}
      `,
            );
            expect(rows).toEqual([
              {
                account_id: fresh.actor.accountId,
                origin: "assistant",
                assistant_turn_id: turnId,
                seats: 0,
                portraits: 1,
              },
            ]);

            const mine = yield* as(fresh.token, (client) => client.me.characters());
            expect(
              mine.find((entry) => entry.character.id === accepted.character.id)?.seats,
            ).toEqual([]);
            const turns = yield* as(fresh.token, (client) =>
              client.meHob.turns({ params: { threadId } }),
            );
            expect(turns.find((turn) => turn.id === turnId)?.acceptedAt).not.toBeNull();
          }),
      );

      it.effect("is one character however many times it is kept", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const { events } = yield* ask(fresh.token);
          const { threadId, turnId } = begunIn(events);
          yield* as(fresh.token, (client) =>
            client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
          );
          const count = yield* characterCount();
          expect(
            yield* refusal(fresh.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            ),
          ).toBe("Conflict");
          expect(yield* characterCount()).toBe(count);
        }),
      );

      it.effect("refuses another account's draft, and makes nothing", () =>
        Effect.gen(function* () {
          const { fresh, stranger } = yield* Fixture;
          const { events } = yield* ask(fresh.token);
          const { threadId, turnId } = begunIn(events);
          const count = yield* characterCount();
          expect(
            yield* refusal(stranger.token, (client) =>
              client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
            ),
          ).toBe("NotFound");
          expect(yield* characterCount()).toBe(count);
          // Still the owner's to keep.
          const accepted = yield* as(fresh.token, (client) =>
            client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
          );
          expect(accepted.accepted).toBe("character");
        }),
      );

      it.effect("finds nothing to keep on a turn that offered nothing", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const { events } = yield* ask(fresh.token, {
            text: "What did you give her for skills?",
            rounds: [textChunks("Nature and Perception.")],
          });
          const { threadId, turnId } = begunIn(events);
          expect(
            yield* refusal(fresh.token, (client) =>
              client.meHob.accept({
                params: { threadId, turnId: turnId as AssistantTurnId },
                payload: {},
              }),
            ),
          ).toBe("NotFound");
        }),
      );
    });

    describe("with no model configured", () => {
      it.effect("says so, and asks nothing", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const off = yield* Effect.gen(function* () {
            const hob = yield* Hob;
            const status = yield* hob.draftStatus;
            const asked = yield* Effect.flip(hob.askDraft({ text: DESCRIBED }));
            return { status, asked: asked._tag };
          }).pipe(
            Effect.provide(Hob.unavailable),
            Effect.provideService(CurrentActor, fresh.actor),
          );
          expect(off).toEqual({
            status: { available: false, model: null },
            asked: "HobUnavailable",
          });
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
