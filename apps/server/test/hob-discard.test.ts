import { describe, expect } from "@effect/vitest";
import {
  type AssistantThreadId,
  type AssistantTurnId,
  type HobEvent,
  type HobTurn,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
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
 * A Hob card's *Discard*, and the pointer a keep leaves for *Open it* — in each
 * of the three conversations that show cards: a campaign's creator panel, a
 * Shared World's, and an account's own.
 *
 * Over the real application, so the reach, the lock and the refusals are the
 * shipped ones; only the model is scripted. The claims:
 *
 * - **a discard is a person's no, and writes nothing else** — the turn keeps
 *   its proposal and gains `discardedAt`, no row is made, a second discard is
 *   the same discard, and Hob's next prompt reads the offer as discarded;
 * - **a discarded offer cannot be kept, and a kept one cannot be discarded**
 *   — each is a `Conflict`, and a turn that offered nothing is `NotFound`;
 * - **only who could keep it can discard it** — a player seated at the table,
 *   a stranger, and another account each get the ordinary `NotFound`, and the
 *   offer is still an offer afterwards;
 * - **a keep records what it made** — the turn read back carries `kept`, the
 *   kind and the ids *Open it* needs, and nothing else does.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-discard", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_discard");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-discard" }).pipe(Layer.provide(model.layer)),
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

/** The same call, answering the failure's tag rather than dying on it. */
const outcome = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const count = (table: "note" | "campaign" | "group_history_entry") =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql<{ readonly count: string }>`select count(*)::text as count from ${sql(table)}`,
  ).pipe(
    Effect.orDie,
    Effect.map((rows) => Number(rows[0]?.count ?? "0")),
  );

/** The rounds of one question: the offer, then one line. */
const offering = (name: string, params: Record<string, unknown>): ReadonlyArray<Round> => [
  toolCallChunks(name, params),
  textChunks("There."),
];

interface Offered {
  readonly threadId: AssistantThreadId;
  readonly turnId: AssistantTurnId;
  /** What the model was sent for this question. */
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Streams one question through `ask` with `rounds` scripted, and names the turn it offered on. */
const asked = <E, E2>(
  token: string,
  ask: (client: Client) => Effect.Effect<Stream.Stream<HobEvent, E>, E2>,
  rounds: ReadonlyArray<Round>,
): Effect.Effect<Offered, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = Array.from(
      yield* as(token, (client) => Effect.flatMap(ask(client), Stream.runCollect)),
    );
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    return { ...began.data, requests: model.requests().slice(before) };
  });

const turnOf = (turns: ReadonlyArray<HobTurn>, turnId: AssistantTurnId) => {
  const turn = turns.find((each) => each.id === turnId);
  if (turn === undefined) throw new Error("no such turn");
  return turn;
};

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment();
  yield* importSystemOptions();
  yield* importSystemSpells();
  const dm = yield* aPerson("Wren");
  const player = yield* aPerson("Jo");
  const stranger = yield* aPerson("Fen");
  const table = yield* as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "The ferry", visibility: "shared" } }),
  );
  yield* admittedTo(table.id, player.actor, "Jo");
  const world = yield* as(dm.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Drowned Coast" } }),
  );
  return { dm, player, stranger, table, world };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-discard.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer(
  "hob-discard",
  shared,
  (it) => {
    describe("a campaign's creator panel", () => {
      const ask = (
        token: string,
        text: string,
        rounds: ReadonlyArray<Round>,
        threadId?: AssistantThreadId,
      ) =>
        Effect.flatMap(Fixture, ({ table }) =>
          asked(
            token,
            (client) =>
              client.hob.ask({
                params: { campaignId: table.id },
                payload: threadId === undefined ? { text } : { threadId, text },
              }),
            rounds,
          ),
        );
      const turns = (threadId: AssistantThreadId) =>
        Effect.flatMap(Fixture, ({ dm, table }) =>
          as(dm.token, (client) =>
            client.hob.turns({ params: { campaignId: table.id, threadId } }),
          ),
        );
      const discard = (token: string, offered: Offered) =>
        Effect.flatMap(Fixture, ({ table }) =>
          outcome(token, (client) =>
            client.hob.discard({
              params: { campaignId: table.id, threadId: offered.threadId, turnId: offered.turnId },
              payload: {},
            }),
          ),
        );
      const accept = (token: string, offered: Offered) =>
        Effect.flatMap(Fixture, ({ table }) =>
          outcome(token, (client) =>
            client.hob.accept({
              params: { campaignId: table.id, threadId: offered.threadId, turnId: offered.turnId },
              payload: {},
            }),
          ),
        );

      it.effect("discards an offer, which then cannot be kept, and tells Hob so", () =>
        Effect.gen(function* () {
          const { dm, player, stranger } = yield* Fixture;
          const notes = yield* count("note");
          const offered = yield* ask(
            dm.token,
            "Write me a note about the lantern-keeper.",
            offering("proposeNote", { title: "The lantern-keeper", body: "She trims the wicks." }),
          );

          // Refused to everyone who could not keep it, and still an offer after.
          expect(yield* discard(player.token, offered)).toBe("NotFound");
          expect(yield* discard(stranger.token, offered)).toBe("NotFound");
          expect(turnOf(yield* turns(offered.threadId), offered.turnId).discardedAt).toBeNull();

          expect(yield* discard(dm.token, offered)).toBe("succeeded");
          const turn = turnOf(yield* turns(offered.threadId), offered.turnId);
          expect(turn.discardedAt).not.toBeNull();
          // The record keeps what was offered.
          expect(turn.proposal?.target).toBe("note");
          expect(turn.acceptedAt).toBeNull();
          expect(turn.kept).toBeNull();

          // Twice is one discard; a discarded offer is no longer one to keep.
          expect(yield* discard(dm.token, offered)).toBe("succeeded");
          expect(yield* accept(dm.token, offered)).toBe("Conflict");
          expect(yield* count("note")).toBe(notes);

          // Hob reads it back as turned down, which is what *Try again* relies on.
          const next = yield* ask(
            dm.token,
            "Try again: another take on “The lantern-keeper”.",
            [textChunks("Another, then.")],
            offered.threadId,
          );
          const prompt = JSON.stringify(next.requests[0]?.messages);
          expect(prompt).toContain('note called \\"The lantern-keeper\\" — discarded');
        }),
      );

      it.effect(
        "keeps an offer with a pointer to what it made, and then refuses to discard it",
        () =>
          Effect.gen(function* () {
            const { dm, table } = yield* Fixture;
            const offered = yield* ask(
              dm.token,
              "Write me a note about the ferryman.",
              offering("proposeNote", {
                title: "The ferryman",
                body: "He counts the coins twice.",
              }),
            );
            const kept = yield* as(dm.token, (client) =>
              client.hob.accept({
                params: {
                  campaignId: table.id,
                  threadId: offered.threadId,
                  turnId: offered.turnId,
                },
                payload: {},
              }),
            );
            if (kept.accepted !== "note") throw new Error("wrong accept arm");

            const turn = turnOf(yield* turns(offered.threadId), offered.turnId);
            expect(turn.kept).toEqual({ accepted: "note", id: kept.note.id });
            expect(turn.discardedAt).toBeNull();
            expect(yield* discard(dm.token, offered)).toBe("Conflict");
          }),
      );

      it.effect("finds nothing to discard on a turn that offered nothing", () =>
        Effect.gen(function* () {
          const { dm } = yield* Fixture;
          const offered = yield* ask(dm.token, "Just talk to me.", [textChunks("Hello.")]);
          expect(yield* discard(dm.token, offered)).toBe("NotFound");
        }),
      );
    });

    describe("a Shared World's panel", () => {
      const ask = (token: string, rounds: ReadonlyArray<Round>) =>
        Effect.flatMap(Fixture, ({ world }) =>
          asked(
            token,
            (client) =>
              client.sharedWorldHob.ask({
                params: { worldId: world.id },
                payload: { text: "Write that down for the world." },
              }),
            rounds,
          ),
        );
      const entry = offering("proposeSharedWorldEntry", {
        title: "The lantern",
        body: "Both tables now know the hag holds the lantern.",
      });
      const params = (offered: Offered) =>
        Effect.map(Fixture, ({ world }) => ({
          worldId: world.id,
          threadId: offered.threadId,
          turnId: offered.turnId,
        }));

      it.effect("discards an entry for its members alone, and it is then no offer", () =>
        Effect.gen(function* () {
          const { dm, stranger, world } = yield* Fixture;
          const entries = yield* count("group_history_entry");
          const offered = yield* ask(dm.token, entry);
          const at = yield* params(offered);
          expect(
            yield* outcome(stranger.token, (client) =>
              client.sharedWorldHob.discard({ params: at, payload: {} }),
            ),
          ).toBe("NotFound");
          expect(
            yield* outcome(dm.token, (client) =>
              client.sharedWorldHob.discard({ params: at, payload: {} }),
            ),
          ).toBe("succeeded");
          const turns = yield* as(dm.token, (client) =>
            client.sharedWorldHob.turns({
              params: { worldId: world.id, threadId: offered.threadId },
            }),
          );
          expect(turnOf(turns, offered.turnId).discardedAt).not.toBeNull();
          expect(
            yield* outcome(dm.token, (client) =>
              client.sharedWorldHob.accept({ params: at, payload: {} }),
            ),
          ).toBe("Conflict");
          expect(yield* count("group_history_entry")).toBe(entries);
        }),
      );

      it.effect("keeps an entry with a pointer to it", () =>
        Effect.gen(function* () {
          const { dm, world } = yield* Fixture;
          const offered = yield* ask(dm.token, entry);
          const at = yield* params(offered);
          const kept = yield* as(dm.token, (client) =>
            client.sharedWorldHob.accept({ params: at, payload: {} }),
          );
          if (kept.accepted !== "sharedWorldHistory") throw new Error("wrong accept arm");
          const turns = yield* as(dm.token, (client) =>
            client.sharedWorldHob.turns({
              params: { worldId: world.id, threadId: offered.threadId },
            }),
          );
          expect(turnOf(turns, offered.turnId).kept).toEqual({
            accepted: "sharedWorldHistory",
            id: kept.entry.id,
            worldId: world.id,
          });
        }),
      );
    });

    describe("an account's own panel", () => {
      const ask = (token: string) =>
        asked(
          token,
          (client) => client.meHob.ask({ payload: { text: "Draft me a campaign." } }),
          offering("proposeCampaign", {
            name: "The Drowned Bell",
            partyName: "The Lantern Crew",
            description: "A river town where the bell rings under the water.",
            sharedWorld: null,
          }),
        );
      const params = (offered: Offered) => ({ threadId: offered.threadId, turnId: offered.turnId });

      it.effect("discards a draft for its asker alone", () =>
        Effect.gen(function* () {
          const { dm, stranger } = yield* Fixture;
          const campaigns = yield* count("campaign");
          const offered = yield* ask(dm.token);
          expect(
            yield* outcome(stranger.token, (client) =>
              client.meHob.discard({ params: params(offered), payload: {} }),
            ),
          ).toBe("NotFound");
          expect(
            yield* outcome(dm.token, (client) =>
              client.meHob.discard({ params: params(offered), payload: {} }),
            ),
          ).toBe("succeeded");
          const turns = yield* as(dm.token, (client) =>
            client.meHob.turns({ params: { threadId: offered.threadId } }),
          );
          expect(turnOf(turns, offered.turnId).discardedAt).not.toBeNull();
          expect(
            yield* outcome(dm.token, (client) =>
              client.meHob.accept({ params: params(offered), payload: {} }),
            ),
          ).toBe("Conflict");
          expect(yield* count("campaign")).toBe(campaigns);
        }),
      );

      it.effect("keeps a draft with a pointer to the campaign it made", () =>
        Effect.gen(function* () {
          const { dm } = yield* Fixture;
          const offered = yield* ask(dm.token);
          const kept = yield* as(dm.token, (client) =>
            client.meHob.accept({ params: params(offered), payload: {} }),
          );
          if (kept.accepted !== "campaign") throw new Error("wrong accept arm");
          const turns = yield* as(dm.token, (client) =>
            client.meHob.turns({ params: { threadId: offered.threadId } }),
          );
          expect(turnOf(turns, offered.turnId).kept).toEqual({
            accepted: "campaign",
            id: kept.campaign.id,
          });
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
