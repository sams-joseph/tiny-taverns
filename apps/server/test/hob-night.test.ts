import { describe, expect } from "@effect/vitest";
import {
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  type HobEvent,
  type HobProposal,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
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
 * **The creator's Hob plans the next night and starts acts, and only the
 * creator keeps them.**
 *
 * Over the real application and Postgres, with the model scripted so no
 * request leaves the process: the creator's toolkit offers `proposeNight` and
 * `proposeAct` and a player's does not; an offer writes nothing; the
 * creator's accept makes the night through the create a person's night takes,
 * numbered one past the highest the campaign has *then*, with its checklist
 * and the act it starts, every row stamped `origin = 'assistant'` with the
 * turn, kept to the DM, and not pointed at by the campaign, so nothing goes
 * live; *Start the night*'s two writes then open that planned night; a player
 * at the table and a stranger are refused the accept and write nothing; and
 * an act at a night that has one, or at a night the campaign does not have,
 * is refused in words the model can act on.
 */

/** The model's script, appended to per question (`hob-draft.test.ts`'s idiom). */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-night", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_night");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-night" }).pipe(Layer.provide(model.layer)),
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
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table: CampaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  // One night already played and finished, and shared with the table.
  const first = yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, title: "The ford", visibility: "shared" },
    }),
  );
  const now = yield* DateTime.now;
  yield* as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: first.id },
      payload: { startedAt: now, endedAt: now },
    }),
  );
  return { jo, ilse, stranger, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-night.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const PREP = ["Reread the ferryman's note", "Print the salt road map", "Name the toll-keeper"];
const ACT = "Act II · The heist";

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask the campaign's Hob as somebody, with these rounds scripted. */
const ask = (
  token: string,
  rounds: ReadonlyArray<Round>,
  options: {
    readonly text?: string;
    readonly threadId?: AssistantThreadId;
    readonly intent?: "character";
  } = {},
): Effect.Effect<Asked, never, Fixture | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const { table } = yield* Fixture;
    const before = model.requests().length;
    script.length = before;
    script.push(...rounds);
    const events = yield* as(token, (client) =>
      Effect.flatMap(
        client.hob.ask({
          params: { campaignId: table },
          payload: {
            text: options.text ?? "Plan next session, and make it the start of the heist act.",
            ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
            ...(options.intent === undefined ? {} : { intent: options.intent }),
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

const proposedIn = (events: ReadonlyArray<HobEvent>): HobProposal | undefined => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data.proposal : undefined;
};

const toolNames = (request: ChatRequest | undefined): ReadonlyArray<string> =>
  (request?.tools ?? [])
    .map((tool) => (tool as { readonly function?: { readonly name?: string } }).function?.name)
    .filter((name): name is string => name !== undefined);

/** Accept over the wire, exactly as the panel does: ids alone, no body. */
const accept = (token: string, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  Effect.flatMap(Fixture, ({ table }) =>
    as(token, (client) =>
      client.hob.accept({ params: { campaignId: table, threadId, turnId }, payload: {} }),
    ),
  );

const acceptRefusal = (token: string, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  Effect.flatMap(Fixture, ({ table }) =>
    refusal(token, (client) =>
      client.hob.accept({ params: { campaignId: table, threadId, turnId }, payload: {} }),
    ),
  );

const nights = (token?: string) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(token ?? jo.token, (client) => client.sessions.list({ params: { campaignId: table } })),
  );

const acts = (token?: string) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(token ?? jo.token, (client) => client.acts.list({ params: { campaignId: table } })),
  );

const campaign = () =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) => client.campaigns.findById({ params: { campaignId: table } })),
  );

describeLayer(
  "hob-night",
  shared,
  (it) => {
    describe("the creator's Hob plans the next night", () => {
      let threadId: AssistantThreadId;
      let turnId: AssistantTurnId;

      it.effect(
        "offers it on the creator's toolkit, numbered by the server, and writes nothing",
        () =>
          Effect.gen(function* () {
            const { jo } = yield* Fixture;
            const before = yield* nights();
            const { events, requests } = yield* ask(jo.token, [
              toolCallChunks(
                "proposeNight",
                { title: "  The toll bridge ", prep: [...PREP, " ", PREP[0]], actTitle: ACT },
                "call_night",
              ),
              textChunks("Session 2 is planned."),
            ]);
            ({ threadId, turnId } = begunIn(events));

            expect(toolNames(requests[0])).toEqual(
              expect.arrayContaining(["proposeNight", "proposeAct"]),
            );
            // Trimmed, with the blank and the repeat taken out.
            expect(proposedIn(events)).toEqual({
              target: "night",
              title: "The toll bridge",
              prep: PREP,
              actTitle: ACT,
            });
            // The model is told the number the night would take today.
            const told = JSON.stringify(requests[1]?.messages);
            expect(told).toContain("Offered the DM session 2,");
            expect(told).toContain("with 3 prep lines");
            expect(yield* nights()).toEqual(before);
            expect(yield* acts()).toEqual([]);
          }),
      );

      it.effect("reads its own offer back on the next question", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { requests } = yield* ask(jo.token, [textChunks("Three lines.")], {
            text: "What did you put on the checklist?",
            threadId,
          });
          const shown = JSON.stringify(requests[0]?.messages);
          expect(shown).toContain("[You offered the DM a planned session");
          expect(shown).toContain(`prep: ${PREP.join(" / ")}`);
        }),
      );

      it.effect("is refused to a player at the table and to a stranger, and writes nothing", () =>
        Effect.gen(function* () {
          const { ilse, stranger } = yield* Fixture;
          const before = yield* nights();
          expect(yield* acceptRefusal(ilse.token, threadId, turnId)).toBe("NotFound");
          expect(yield* acceptRefusal(stranger.token, threadId, turnId)).toBe("NotFound");
          expect(yield* nights()).toEqual(before);
          expect(yield* acts()).toEqual([]);
        }),
      );

      it.effect(
        "is kept by the creator, numbered at the keep, planned rather than open, and stamped with the turn",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            // A night made by hand since the offer: the kept one is numbered past it.
            yield* as(jo.token, (client) =>
              client.sessions.create({ params: { campaignId: table }, payload: { number: 2 } }),
            );

            const accepted = yield* accept(jo.token, threadId, turnId);
            if (accepted.accepted !== "night") throw new Error("expected a night");
            expect(accepted.session).toMatchObject({
              campaignId: table,
              number: 3,
              title: "The toll bridge",
              startedAt: null,
              endedAt: null,
              visibility: "dm",
              origin: "assistant",
              assistantTurnId: turnId,
            });
            expect(accepted.prep.map((item) => item.label)).toEqual(PREP);
            for (const item of accepted.prep) {
              expect(item).toMatchObject({
                sessionId: accepted.session.id,
                done: false,
                visibility: "dm",
                origin: "assistant",
                assistantTurnId: turnId,
              });
            }
            expect(accepted.act).toMatchObject({
              title: ACT,
              firstSessionNumber: 3,
              visibility: "dm",
              origin: "assistant",
              assistantTurnId: turnId,
            });

            // Through the ordinary reads: the night, its checklist, the act.
            expect((yield* nights()).map((night) => night.number)).toEqual([3, 2, 1]);
            const checklist = yield* as(jo.token, (client) =>
              client.prep.list({ params: { campaignId: table, sessionId: accepted.session.id } }),
            );
            expect(checklist.map((item) => item.label)).toEqual(PREP);
            expect((yield* acts()).map((act) => act.id)).toEqual([accepted.act?.id]);

            // Planned, not open: the campaign points at no night, so nothing is live.
            expect((yield* campaign()).currentSessionId).toBeNull();

            // A second tap is one night and one refusal.
            expect(yield* acceptRefusal(jo.token, threadId, turnId)).toBe("Conflict");
            expect(
              (yield* nights()).filter((night) => night.title === "The toll bridge"),
            ).toHaveLength(1);
          }),
      );

      it.effect("gives a player at the table nothing of it", () =>
        Effect.gen(function* () {
          const { ilse } = yield* Fixture;
          expect((yield* nights(ilse.token)).map((night) => night.number)).toEqual([1]);
          expect(yield* acts(ilse.token)).toEqual([]);
        }),
      );

      it.effect("tells the model which nights are planned already when it plans another", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const before = yield* nights();
          const { requests } = yield* ask(jo.token, [
            toolCallChunks(
              "proposeNight",
              { title: "The ferry", prep: null, actTitle: null },
              "call_more",
            ),
            textChunks("Session 4 is planned."),
          ]);
          const told = JSON.stringify(requests[1]?.messages);
          expect(told).toContain("Offered the DM session 4,");
          expect(told).toContain("Sessions 2, 3 are already planned and not started");
          expect(yield* nights()).toEqual(before);
        }),
      );

      it.effect("is opened by Start the night's own writes, checklist and all", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const planned = (yield* nights()).find((night) => night.number === 3)!;
          const now = yield* DateTime.now;
          // `session/start.ts` for a planned night: point the campaign at it, stamp it.
          yield* as(jo.token, (client) =>
            client.campaigns.update({
              params: { campaignId: table },
              payload: { currentSessionId: planned.id },
            }),
          );
          const opened = yield* as(jo.token, (client) =>
            client.sessions.update({
              params: { campaignId: table, sessionId: planned.id },
              payload: { startedAt: now },
            }),
          );
          expect(opened.startedAt).not.toBeNull();
          expect((yield* campaign()).currentSessionId).toBe(planned.id);
          const checklist = yield* as(jo.token, (client) =>
            client.prep.list({ params: { campaignId: table, sessionId: planned.id } }),
          );
          expect(checklist.map((item) => item.label)).toEqual(PREP);
        }),
      );

      it.effect("refuses a night with neither a title nor a prep line", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const before = yield* nights();
          const { events, requests } = yield* ask(jo.token, [
            toolCallChunks(
              "proposeNight",
              { title: null, prep: [" "], actTitle: null },
              "call_empty",
            ),
            textChunks("Nothing to plan."),
          ]);
          expect(proposedIn(events)).toBeUndefined();
          expect(JSON.stringify(requests[1]?.messages)).toContain(
            "a planned session needs a title or at least one prep line",
          );
          expect(yield* nights()).toEqual(before);
        }),
      );
    });

    describe("the creator's Hob starts an act", () => {
      it.effect(
        "offers one at a night the campaign has, and the creator keeps it with the turn",
        () =>
          Effect.gen(function* () {
            const { jo, ilse, stranger, table } = yield* Fixture;
            const { events, requests } = yield* ask(
              jo.token,
              [
                toolCallChunks(
                  "proposeAct",
                  { title: "Act I · The ford", sessionNumber: 1 },
                  "call_act",
                ),
                textChunks("Act I starts at the ford."),
              ],
              { text: "Add an act for the ford, starting at session 1." },
            );
            expect(proposedIn(events)).toEqual({
              target: "act",
              title: "Act I · The ford",
              firstSessionNumber: 1,
            });
            expect(JSON.stringify(requests[1]?.messages)).toContain("starting at session 1");
            expect((yield* acts()).map((act) => act.firstSessionNumber)).toEqual([3]);

            const { threadId, turnId } = begunIn(events);
            expect(yield* acceptRefusal(ilse.token, threadId, turnId)).toBe("NotFound");
            expect(yield* acceptRefusal(stranger.token, threadId, turnId)).toBe("NotFound");
            expect((yield* acts()).map((act) => act.firstSessionNumber)).toEqual([3]);

            const accepted = yield* accept(jo.token, threadId, turnId);
            if (accepted.accepted !== "act") throw new Error("expected an act");
            expect(accepted.act).toMatchObject({
              campaignId: table,
              title: "Act I · The ford",
              firstSessionNumber: 1,
              visibility: "dm",
              origin: "assistant",
              assistantTurnId: turnId,
            });
            expect((yield* acts()).map((act) => act.firstSessionNumber)).toEqual([1, 3]);
            expect(yield* acceptRefusal(jo.token, threadId, turnId)).toBe("Conflict");
          }),
      );

      it.effect("starts at the newest night when none is named", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { events } = yield* ask(
            jo.token,
            [
              toolCallChunks(
                "proposeAct",
                { title: "Act III", sessionNumber: null },
                "call_newest",
              ),
              textChunks("Act III."),
            ],
            { text: "Add an act." },
          );
          // Session 3 is the newest, and starts an act already.
          expect(proposedIn(events)).toBeUndefined();
          const again = yield* ask(
            jo.token,
            [
              toolCallChunks("proposeAct", { title: "Act III", sessionNumber: 2 }, "call_two"),
              textChunks("Act III."),
            ],
            { text: "Add an act at session 2." },
          );
          expect(proposedIn(again.events)).toEqual({
            target: "act",
            title: "Act III",
            firstSessionNumber: 2,
          });
        }),
      );

      it.effect(
        "refuses a night that already starts an act, and one the campaign does not have",
        () =>
          Effect.gen(function* () {
            const { jo } = yield* Fixture;
            const taken = yield* ask(
              jo.token,
              [
                toolCallChunks("proposeAct", { title: "Another", sessionNumber: 3 }, "call_taken"),
                textChunks("Taken."),
              ],
              { text: "Add an act at session 3." },
            );
            expect(proposedIn(taken.events)).toBeUndefined();
            expect(JSON.stringify(taken.requests[1]?.messages)).toContain(
              `session 3 already starts the act \\\\\\"${ACT}\\\\\\"`,
            );

            const missing = yield* ask(
              jo.token,
              [
                toolCallChunks(
                  "proposeAct",
                  { title: "Another", sessionNumber: 99 },
                  "call_missing",
                ),
                textChunks("No such night."),
              ],
              { text: "Add an act at session 99." },
            );
            expect(proposedIn(missing.events)).toBeUndefined();
            expect(JSON.stringify(missing.requests[1]?.messages)).toContain(
              "there is no session 99 — pick one of 3, 2, 1",
            );
            expect((yield* acts()).map((act) => act.firstSessionNumber)).toEqual([1, 3]);
          }),
      );
    });

    describe("a player's Hob", () => {
      it.effect("is not shown either planning tool", () =>
        Effect.gen(function* () {
          const { ilse } = yield* Fixture;
          const { requests } = yield* ask(ilse.token, [textChunks("Tell me who you are.")], {
            text: "Build me a character.",
            intent: "character",
          });
          expect(toolNames(requests[0])).not.toContain("proposeNight");
          expect(toolNames(requests[0])).not.toContain("proposeAct");
          expect(toolNames(requests[0])).toContain("proposeCharacter");
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
