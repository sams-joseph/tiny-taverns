import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type HobEvent,
  type HobProposal,
  HobUnavailable,
  NotFound,
} from "@taverns/api";
import { ConfigProvider, Effect, Layer, ManagedRuntime, Ref, Stream } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { assistantFromConfig } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { handlersFor, HobToolkit, type ProposalSlot } from "../src/assistant/toolkit.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Notes } from "../src/repo/Notes.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { migratedDatabase } from "./support/database.js";
import { type ChatRequest, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

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
  Creatures.layer,
  HobThreads.layer,
  Notes.layer,
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

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
  const accounts = yield* Accounts;
  const campaigns = yield* Campaigns;
  const notes = yield* Notes;
  const beats = yield* Beats;
  const sessions = yield* Sessions;

  const issued = yield* accounts.issue("Jo");
  const dm = new Actor({ accountId: issued.accountId, role: "dm", campaignId: null });
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

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

  const strangerIssued = yield* accounts.issue("Someone else");
  const stranger = new Actor({
    accountId: strangerIssued.accountId,
    role: "dm",
    campaignId: null,
  });
  const strangerCampaign = yield* withActor(stranger)(
    campaigns.create({ name: "A different table", visibility: "shared" }),
  );

  return {
    dm,
    /** A credential minted for the Salt Road and nothing else. */
    scopedDm: new Actor({ accountId: issued.accountId, role: "dm", campaignId: campaign.id }),
    player: new Actor({ accountId: issued.accountId, role: "player", campaignId: campaign.id }),
    campaign,
    otherTable,
    strangerCampaign,
    night,
    crateNote,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

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
  },
): Promise<Asked> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: (options?.rounds as never) ?? [
      toolCallChunks("searchCampaign", { query: options?.query ?? "ferryman" }),
      textChunks("The ferryman ", "is called ", "Cazril."),
    ],
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(campaignId, { text: ASKED });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
    }).pipe(
      withActor(actor),
      Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

/** What a scripted model was shown, as one searchable string. */
const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);

const texts = (events: ReadonlyArray<HobEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "delta" ? [event.data.text] : []));

describe("answering", () => {
  it("streams the reply in pieces rather than in one finished paragraph", async () => {
    const { events } = await ask(fixture.dm, fixture.campaign.id);

    // Three deltas, not one — the panel is a conversation surface and the
    // designers chose it over a one-shot palette deliberately.
    expect(texts(events)).toEqual(["The ferryman ", "is called ", "Cazril."]);
    // The thread and the turn come first, before a word of the answer: the
    // client needs both before it needs any of it.
    expect(events[0]?.event).toBe("began");
    expect(events.at(-1)?.event).toBe("done");
  }, 60_000);

  it("calls a tool, and says so on the wire", async () => {
    const { events } = await ask(fixture.dm, fixture.campaign.id);
    const steps = events.flatMap((event) => (event.event === "tool" ? [event.data] : []));

    expect(steps.map((step) => `${step.name}:${step.phase}`)).toEqual([
      "searchCampaign:called",
      "searchCampaign:answered",
    ]);
    expect(steps[0]?.detail).toBe("ferryman");
    // Three hits: the note, the beat, and the other note that mentions him.
    expect(steps[1]?.detail).toMatch(/^\d+ results?$/);
  }, 60_000);

  it("sends the tool result back to the model, which streamText alone does not", async () => {
    // The package's `streamText` resolves tool calls and then stops — the
    // results are never returned to the model. `Hob`'s own round loop is what
    // supplies the second call, and without it every grounded question would
    // come back empty. Two requests is that loop, observed.
    const { requests } = await ask(fixture.dm, fixture.campaign.id);

    expect(requests).toHaveLength(2);
    expect(shownTo(requests.slice(1))).toContain("Cazril");
  }, 60_000);

  it("grounds the answer in rows a tool read, not in a context blob", async () => {
    const { requests } = await ask(fixture.dm, fixture.campaign.id);

    // The first request is the prompt Hob composed. It carries the question and
    // the campaign's name, and no campaign material whatsoever: "Cazril" is in
    // the record and must not appear until a tool has been called.
    const opening = shownTo(requests.slice(0, 1));
    expect(opening).toContain("The Salt Road");
    expect(opening).toContain(ASKED);
    expect(opening).not.toContain("Cazril");
    expect(opening).not.toContain("three teeth");
  }, 60_000);

  it("sends the configured max_tokens on every request", async () => {
    // The habit that makes the beta-102 capability trap impossible: a provider
    // package that does not recognise a model id caps output silently, and the
    // first symptom is an answer cut off mid-sentence. See `hobMaxTokens`.
    const { requests } = await ask(fixture.dm, fixture.campaign.id);

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.max_tokens).toBe(MAX_TOKENS);
  }, 60_000);

  it("offers the model every tool, and a campaign id in none of them", async () => {
    const { requests } = await ask(fixture.dm, fixture.campaign.id);
    const tools = requests[0]?.tools ?? [];

    expect(
      tools.map((tool) => (tool.function as { name: string } | undefined)?.name).sort(),
    ).toEqual([
      "getCreature",
      "listSessions",
      "proposeBeat",
      "proposeEncounter",
      "proposeNote",
      "searchCampaign",
      "sessionLog",
      "sessionRecap",
    ]);
    // The structural half of the boundary: the campaign is closed over from the
    // request path, so a model that hallucinated another campaign's id has
    // nowhere to put it. Not refused — unrepresentable.
    expect(JSON.stringify(tools).toLowerCase()).not.toContain("campaignid");
  }, 60_000);

  it("reports a model that answers with nothing but tool calls", async () => {
    const { events } = await ask(fixture.dm, fixture.campaign.id, {
      rounds: [
        toolCallChunks("searchCampaign", { query: "ferryman" }, "a"),
        toolCallChunks("searchCampaign", { query: "ferryman" }, "b"),
        toolCallChunks("searchCampaign", { query: "ferryman" }, "c"),
        toolCallChunks("searchCampaign", { query: "ferryman" }, "d"),
      ] as never,
    });

    expect(events.at(-1)).toMatchObject({ event: "failed" });
    expect(texts(events)).toEqual([]);
  }, 60_000);

  it("tells the model when a tool refused, rather than tearing the answer down", async () => {
    // `failureMode: "return"`. A model that guesses a session id gets a
    // `NotFound` it can read and apologise for; the DM keeps their stream.
    const { events, requests } = await ask(fixture.dm, fixture.campaign.id, {
      rounds: [
        toolCallChunks("sessionRecap", { sessionId: fixture.strangerCampaign.id }),
        textChunks("I could not find that night."),
      ] as never,
    });

    expect(events.at(-1)?.event).toBe("done");
    expect(texts(events)).toEqual(["I could not find that night."]);
    expect(shownTo(requests.slice(1))).toContain("NotFound");
  }, 60_000);
});

describe("the boundary — proven, not argued", () => {
  it("refuses a campaign the credential was not minted for, before any stream", async () => {
    // Same account, same DM, a campaign they really do own. The refusal is an
    // `Effect` failure and not an event inside a 200, so it is a 404 on the
    // wire — and the model is never called at all.
    const result = await runtime
      .runPromise(
        Effect.gen(function* () {
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
        ),
      )
      .then((value) => value);

    expect(result._tag).toBe("Failure");
    // `NotFound`, not `Forbidden`: "it exists but is not yours" is itself a
    // disclosure.
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);

  it("never shows a scoped credential's Hob another table's rows", async () => {
    // The leak that would look like a feature. Both campaigns have a ferryman;
    // only one of them may reach the model.
    const { requests } = await ask(fixture.scopedDm, fixture.campaign.id);
    const shown = shownTo(requests);

    expect(shown).toContain("Cazril");
    expect(shown).not.toContain("Sixpence");
    expect(shown).not.toContain("took the coin after all");
  }, 60_000);

  it("never shows a player the DM-only rows", async () => {
    // Driven through the toolkit rather than through `ask`, because asking is
    // now a *write* — it appends to a thread — and a player cannot start one
    // (the test below). The property under test is unchanged and is the one
    // that matters: a tool handler's read is the repository's read with this
    // actor, so the row's own visibility applies inside the tool exactly as it
    // does inside the HTTP handler, because it is the same `WHERE` clause.
    const hits = await runtime.runPromise(
      Effect.gen(function* () {
        const repositories = {
          search: yield* Search,
          sessions: yield* Sessions,
          recap: yield* Recap,
          creatures: yield* Creatures,
          events: yield* SessionEvents,
        };
        const slot: ProposalSlot = yield* Ref.make<HobProposal | undefined>(undefined);
        const handlers = handlersFor(repositories, fixture.campaign.id, fixture.player, slot);
        return yield* handlers.searchCampaign({ query: "crate" });
      }).pipe(Effect.orDie),
    );

    const shown = JSON.stringify(hits);
    expect(shown).not.toContain("three teeth");
    expect(shown).not.toContain(fixture.crateNote.id);
  }, 60_000);

  it("refuses a player outright, because asking writes to the record", async () => {
    // A conversation is a row in the campaign, so `HobThreads.start` needs
    // `campaignWritable` — the same predicate creating a note needs. Hob is the
    // DM's sidekick and there is no player surface; a player asking gets the
    // ordinary `NotFound`, not a conversation nobody could read back.
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(fixture.campaign.id, { text: ASKED });
        return yield* Stream.runCollect(stream);
      }).pipe(
        withActor(fixture.player),
        Effect.provide(
          Hob.layer({ model: "scripted-local" }).pipe(
            Layer.provide(
              scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] }).layer,
            ),
          ),
        ),
        Effect.result,
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);

  it("refuses a stranger's campaign", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
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
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);
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
    runtime.runPromise(
      Effect.flatMap(Hob, use).pipe(
        withActor(fixture.dm),
        Effect.provide(
          assistantFromConfig.pipe(
            Layer.provide([
              Campaigns.layer,
              Creatures.layer,
              HobThreads.layer,
              Recap.layer,
              Search.layer,
              SessionEvents.layer,
              Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
            ]),
          ),
        ),
        // Outermost, so it covers the layer's construction and not only the
        // effect that runs afterwards.
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
        Effect.result,
      ),
    );

  it("builds, and reports itself unavailable", async () => {
    const status = await hobThroughEnv({}, (hob) => hob.status(fixture.campaign.id));

    expect(status._tag).toBe("Success");
    // The campaign's name is still answered: the panel's context strip has to be
    // true whether or not a model is behind it.
    expect(status._tag === "Success" && status.success).toMatchObject({
      available: false,
      model: null,
      campaign: "The Salt Road",
    });
  }, 60_000);

  it("refuses a status read for a campaign it may not see", async () => {
    // "Is Hob switched on" must not be a cheaper question than any other.
    const status = await hobThroughEnv({}, (hob) => hob.status(fixture.strangerCampaign.id));

    expect(status._tag).toBe("Failure");
    expect(status._tag === "Failure" && status.failure).toBeInstanceOf(NotFound);
  }, 60_000);

  it("answers a question with a declared unavailability, not a crash", async () => {
    const result = await hobThroughEnv({}, (hob) => hob.ask(fixture.campaign.id, { text: ASKED }));

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(HobUnavailable);
  }, 60_000);

  it("still refuses a campaign it may not read, rather than leaking that it is off", async () => {
    // "The assistant is switched off" must not be a cheaper way to learn which
    // campaigns exist than asking it a question.
    const result = await hobThroughEnv({}, (hob) =>
      hob.ask(fixture.strangerCampaign.id, { text: ASKED }),
    );

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  }, 60_000);

  it("is off when only half of the configuration is present", async () => {
    // An endpoint with no model name would fail on the first question from
    // inside a stream, which is a far worse way to find out.
    const status = await hobThroughEnv({ HOB_API_URL: "http://127.0.0.1:8080/v1" }, (hob) =>
      hob.status(fixture.campaign.id),
    );

    expect(status._tag === "Success" && status.success.available).toBe(false);
  }, 60_000);

  it("is on when both halves are, and names the model", async () => {
    // The other half of the switch: without it, "unset means off" would also be
    // satisfied by a layer that is off unconditionally.
    const status = await hobThroughEnv(
      { HOB_API_URL: "http://127.0.0.1:8080/v1", HOB_MODEL: "qwen2.5-3b-instruct" },
      (hob) => hob.status(fixture.campaign.id),
    );

    expect(status._tag === "Success" && status.success).toMatchObject({
      available: true,
      model: "qwen2.5-3b-instruct",
    });
  }, 60_000);
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
    // Listing them here means a sixth capability is a visible edit rather than
    // a quiet one.
    expect(Object.keys(HobToolkit.tools).sort()).toEqual([
      "getCreature",
      "listSessions",
      "proposeBeat",
      "proposeEncounter",
      "proposeNote",
      "searchCampaign",
      "sessionLog",
      "sessionRecap",
    ]);
  });
});
