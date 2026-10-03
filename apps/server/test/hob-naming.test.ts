import { describe, expect, it as unit } from "@effect/vitest";
import { type AssistantThreadId, type HobEvent, type HobThread, TavernsApi } from "@taverns/api";
import { Context, Duration, Effect, Layer, Option, Redacted, Schedule, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { HobNamer, nameFrom } from "../src/assistant/HobNamer.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { aPerson, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, refused, scriptedModel, textChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob names a conversation it started** (`assistant/HobNamer.ts`): one more
 * round-trip after the first answer, written to `assistant_thread.name` and
 * read back through each surface's own `threads` list.
 *
 * The answer and the name are two scripted models, so each script reads as
 * what that model was asked: `answers` is Hob's, `names` the namer's. Claims:
 *
 * - **the answer does not wait for the name** — it is delivered whole, and the
 *   name lands after, on the thread the answer began;
 * - **only a new thread is named**, once: continuing one asks no name;
 * - **a namer that fails or says nothing changes nothing** — the answer is the
 *   same, the name stays null, and the list still has the question as `title`;
 * - **the name is the asker's to read and no one else's** — another account's
 *   lists never carry the thread, named or not.
 */

const answers: Array<Round> = [];
const names: Array<Round> = [];
const model = scriptedModel({ model: "scripted-naming", maxTokens: 512, rounds: answers });
const namer = scriptedModel({ model: "scripted-namer", maxTokens: 512, rounds: names });

const database = migratedDatabase("taverns_test_hob_naming");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-naming" }).pipe(
    Layer.provide(HobNamer.layer.pipe(Layer.provide(namer.layer))),
    Layer.provide(model.layer),
  ),
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("hob-naming-secret")),
  HobImages.layer({ generation: Option.none(), storageOn: false }),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
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

const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

/** Pads a script to the requests already made, then adds this question's rounds. */
const scripting = (
  script: Array<Round>,
  made: number,
  rounds: ReadonlyArray<Round>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    script.length = made;
    script.push(...rounds);
  });

/** The whole answer, collected: it has ended before this returns. */
const collect = <A, SE, SR, E, R>(asked: Effect.Effect<Stream.Stream<A, SE, SR>, E, R>) =>
  Effect.flatMap(asked, (stream) => Stream.runCollect(stream)).pipe(
    Effect.map((events) => Array.from(events)),
  );

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data.threadId;
};

/** The listed thread, once `named` says it is done — the namer runs after the answer. */
const settled = <R>(
  list: Effect.Effect<ReadonlyArray<HobThread>, never, R>,
  id: AssistantThreadId,
  named: (thread: HobThread | undefined) => boolean,
) =>
  list.pipe(
    Effect.map((threads) => threads.find((thread) => thread.id === id)),
    Effect.repeat({
      until: named,
      schedule: Schedule.spaced(Duration.millis(25)),
    }),
    Effect.timeout(Duration.seconds(10)),
    Effect.orDie,
  );

/** The namer's requests so far, so a test can wait for its own. */
const namerAsked = (count: number) =>
  Effect.sync(() => namer.requests().length).pipe(
    Effect.repeat({
      until: (made) => made >= count,
      schedule: Schedule.spaced(Duration.millis(25)),
    }),
    Effect.timeout(Duration.seconds(10)),
    Effect.orDie,
  );

const makeFixture = Effect.gen(function* () {
  // The account panel's vocabulary is the core rules, read before the model is.
  yield* importSystemEquipment();
  yield* importSystemOptions();
  const owner = yield* aPerson("Wren");
  const stranger = yield* aPerson("Tamsin");
  const table = yield* as(owner.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  return { owner, stranger, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-naming.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describe("nameFrom", () => {
  unit("keeps the first line and drops what a model dresses a name up in", () => {
    expect(nameFrom("The Drowned Bell")).toBe("The Drowned Bell");
    expect(nameFrom('**Name:** "The Drowned Bell."\nA ghost story.')).toBe("The Drowned Bell");
    expect(nameFrom("<think>A river, a bell.</think>\n\n“Bells Under the River”")).toBe(
      "Bells Under the River",
    );
  });

  unit("is nothing when nothing usable was said", () => {
    expect(nameFrom("")).toBeUndefined();
    expect(nameFrom("  \n ** \n")).toBeUndefined();
    expect(nameFrom("<think>I was told to name it")).toBeUndefined();
  });

  unit("shortens a long one at a word", () => {
    const named = nameFrom(`The ${"very ".repeat(20)}long name`);
    expect(named?.endsWith("…")).toBe(true);
    expect(named!.length).toBeLessThanOrEqual(61);
    expect(named).not.toMatch(/\s…$/);
  });
});

describeLayer(
  "hob-naming",
  shared,
  (it) => {
    describe("a conversation Hob started", () => {
      it.effect("is named after the answer, on the thread the answer began", () =>
        Effect.gen(function* () {
          const { owner } = yield* Fixture;
          yield* scripting(answers, model.requests().length, [textChunks("A bell under water.")]);
          const before = namer.requests().length;
          yield* scripting(names, before, [textChunks("The Drowned ", "Bell")]);

          const events = yield* as(owner.token, (client) =>
            collect(client.meHob.ask({ payload: { text: "Draft me a ghost story on a river." } })),
          );
          expect(events.at(-1)?.event).toBe("done");
          const threadId = begunIn(events);

          const listed = yield* settled(
            as(owner.token, (client) => client.meHob.threads()),
            threadId,
            (thread) => thread?.name !== null && thread?.name !== undefined,
          );
          expect(listed).toMatchObject({
            name: "The Drowned Bell",
            title: "Draft me a ghost story on a river.",
          });

          // The namer was asked the question and nothing else: no tools, no record.
          const asked = namer.requests()[before];
          expect(asked?.tools ?? []).toEqual([]);
          expect(JSON.stringify(asked?.messages)).toContain("Draft me a ghost story on a river.");
          expect(namer.requests()).toHaveLength(before + 1);

          // Continuing the thread asks no name, and the one it has stays.
          yield* scripting(answers, model.requests().length, [textChunks("Colder still.")]);
          yield* as(owner.token, (client) =>
            collect(client.meHob.ask({ payload: { threadId, text: "Make it colder." } })),
          );
          expect(namer.requests()).toHaveLength(before + 1);
          const again = yield* as(owner.token, (client) => client.meHob.threads());
          expect(again.find((thread) => thread.id === threadId)?.name).toBe("The Drowned Bell");
        }),
      );

      it.effect("names a campaign's and a Shared World's conversation through its own list", () =>
        Effect.gen(function* () {
          const { owner, table } = yield* Fixture;

          yield* scripting(answers, model.requests().length, [textChunks("Cazril.")]);
          yield* scripting(names, namer.requests().length, [textChunks("The Ferryman")]);
          const atTable = begunIn(
            yield* as(owner.token, (client) =>
              collect(
                client.hob.ask({
                  params: { campaignId: table.id },
                  payload: { text: "Who is the ferryman?" },
                }),
              ),
            ),
          );
          const campaignThread = yield* settled(
            as(owner.token, (client) => client.hob.threads({ params: { campaignId: table.id } })),
            atTable,
            (thread) => thread?.name === "The Ferryman",
          );
          expect(campaignThread?.campaignId).toBe(table.id);

          yield* scripting(answers, model.requests().length, [textChunks("Every road.")]);
          yield* scripting(names, namer.requests().length, [textChunks("Roads of the World")]);
          const inWorld = begunIn(
            yield* as(owner.token, (client) =>
              collect(
                client.sharedWorldHob.ask({
                  params: { worldId: table.contextId },
                  payload: { text: "What connects the roads?" },
                }),
              ),
            ),
          );
          const worldThread = yield* settled(
            as(owner.token, (client) =>
              client.sharedWorldHob.threads({ params: { worldId: table.contextId } }),
            ),
            inWorld,
            (thread) => thread?.name === "Roads of the World",
          );
          expect(worldThread?.worldId).toBe(table.contextId);
        }),
      );

      it.effect("is the asker's to read, and another account's lists never carry it", () =>
        Effect.gen(function* () {
          const { owner, stranger, table } = yield* Fixture;
          yield* scripting(answers, model.requests().length, [textChunks("Here.")]);
          yield* scripting(names, namer.requests().length, [textChunks("Sentinel Secret Name")]);
          const threadId = begunIn(
            yield* as(owner.token, (client) =>
              collect(client.meHob.ask({ payload: { text: "Draft me a rogue." } })),
            ),
          );
          yield* settled(
            as(owner.token, (client) => client.meHob.threads()),
            threadId,
            (thread) => thread?.name === "Sentinel Secret Name",
          );

          const theirs = yield* as(stranger.token, (client) => client.meHob.threads());
          expect(theirs.map((thread) => thread.id)).not.toContain(threadId);
          expect(JSON.stringify(theirs)).not.toContain("Sentinel Secret Name");
          expect(
            yield* refusal(stranger.token, (client) =>
              client.hob.threads({ params: { campaignId: table.id } }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(stranger.token, (client) =>
              client.sharedWorldHob.threads({ params: { worldId: table.contextId } }),
            ),
          ).toBe("NotFound");
        }),
      );
    });

    describe("a namer that cannot name", () => {
      it.effect("leaves the answer as it was and the name null, refused or silent", () =>
        Effect.gen(function* () {
          const { owner } = yield* Fixture;
          for (const round of [refused(500), textChunks("")]) {
            yield* scripting(answers, model.requests().length, [textChunks("Still answered.")]);
            const before = namer.requests().length;
            yield* scripting(names, before, [round]);

            const events = yield* as(owner.token, (client) =>
              collect(client.meHob.ask({ payload: { text: "Name nothing for me." } })),
            );
            expect(events.map((event) => event.event)).toEqual(["began", "delta", "done"]);
            const threadId = begunIn(events);

            // The namer was asked; give its job the moment it takes to end.
            yield* namerAsked(before + 1);
            yield* Effect.sleep(Duration.millis(100));
            const listed = (yield* as(owner.token, (client) => client.meHob.threads())).find(
              (thread) => thread.id === threadId,
            );
            expect(listed).toMatchObject({ name: null, title: "Name nothing for me." });
          }
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
