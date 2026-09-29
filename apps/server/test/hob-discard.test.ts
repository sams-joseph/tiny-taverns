import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  type Campaign,
  type HobEvent,
  type HobTurn,
  type SharedWorld,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import {
  type ChatRequest,
  type Round,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";

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

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same call, answering the failure's tag rather than dying on it. */
const outcome = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) =>
      call(client).pipe(
        Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
      ),
    ).pipe(Effect.orDie),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const count = (table: "note" | "campaign" | "group_history_entry") =>
  runtime
    .runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly count: string }>`select count(*)::text as count from ${sql(table)}`,
      ).pipe(Effect.orDie),
    )
    .then((rows) => Number(rows[0]?.count ?? "0"));

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

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
const asked = async <E, E2>(
  token: string,
  ask: (client: Client) => Effect.Effect<Stream.Stream<HobEvent, E>, E2>,
  rounds: ReadonlyArray<Round>,
): Promise<Offered> => {
  const before = model.requests().length;
  script.length = before;
  script.push(...rounds);
  const events = Array.from(
    await as(token, (client) => Effect.flatMap(ask(client), Stream.runCollect)),
  );
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return { ...began.data, requests: model.requests().slice(before) };
};

const turnOf = (turns: ReadonlyArray<HobTurn>, turnId: AssistantTurnId) => {
  const turn = turns.find((each) => each.id === turnId);
  if (turn === undefined) throw new Error("no such turn");
  return turn;
};

let dm: Person;
let player: Person;
let stranger: Person;
let table: Campaign;
let world: SharedWorld;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  await run(importSystemSpells());
  dm = await person("Wren");
  player = await person("Jo");
  stranger = await person("Fen");
  table = await as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "The ferry", visibility: "shared" } }),
  );
  await run(admittedTo(table.id, player.actor, "Jo"));
  world = await as(dm.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Drowned Coast" } }),
  );
}, 120_000);

describe("a campaign's creator panel", () => {
  const ask = (
    token: string,
    text: string,
    rounds: ReadonlyArray<Round>,
    threadId?: AssistantThreadId,
  ) =>
    asked(
      token,
      (client) =>
        client.hob.ask({
          params: { campaignId: table.id },
          payload: threadId === undefined ? { text } : { threadId, text },
        }),
      rounds,
    );
  const turns = (threadId: AssistantThreadId) =>
    as(dm.token, (client) => client.hob.turns({ params: { campaignId: table.id, threadId } }));
  const discard = (token: string, offered: Offered) =>
    outcome(token, (client) =>
      client.hob.discard({
        params: { campaignId: table.id, threadId: offered.threadId, turnId: offered.turnId },
        payload: {},
      }),
    );
  const accept = (token: string, offered: Offered) =>
    outcome(token, (client) =>
      client.hob.accept({
        params: { campaignId: table.id, threadId: offered.threadId, turnId: offered.turnId },
        payload: {},
      }),
    );

  it("discards an offer, which then cannot be kept, and tells Hob so", async () => {
    const notes = await count("note");
    const offered = await ask(
      dm.token,
      "Write me a note about the lantern-keeper.",
      offering("proposeNote", { title: "The lantern-keeper", body: "She trims the wicks." }),
    );

    // Refused to everyone who could not keep it, and still an offer after.
    expect(await discard(player.token, offered)).toBe("NotFound");
    expect(await discard(stranger.token, offered)).toBe("NotFound");
    expect(turnOf(await turns(offered.threadId), offered.turnId).discardedAt).toBeNull();

    expect(await discard(dm.token, offered)).toBe("succeeded");
    const turn = turnOf(await turns(offered.threadId), offered.turnId);
    expect(turn.discardedAt).not.toBeNull();
    // The record keeps what was offered.
    expect(turn.proposal?.target).toBe("note");
    expect(turn.acceptedAt).toBeNull();
    expect(turn.kept).toBeNull();

    // Twice is one discard; a discarded offer is no longer one to keep.
    expect(await discard(dm.token, offered)).toBe("succeeded");
    expect(await accept(dm.token, offered)).toBe("Conflict");
    expect(await count("note")).toBe(notes);

    // Hob reads it back as turned down, which is what *Try again* relies on.
    const next = await ask(
      dm.token,
      "Try again: another take on “The lantern-keeper”.",
      [textChunks("Another, then.")],
      offered.threadId,
    );
    const prompt = JSON.stringify(next.requests[0]?.messages);
    expect(prompt).toContain('note called \\"The lantern-keeper\\" — discarded');
  }, 60_000);

  it("keeps an offer with a pointer to what it made, and then refuses to discard it", async () => {
    const offered = await ask(
      dm.token,
      "Write me a note about the ferryman.",
      offering("proposeNote", { title: "The ferryman", body: "He counts the coins twice." }),
    );
    const kept = await as(dm.token, (client) =>
      client.hob.accept({
        params: { campaignId: table.id, threadId: offered.threadId, turnId: offered.turnId },
        payload: {},
      }),
    );
    if (kept.accepted !== "note") throw new Error("wrong accept arm");

    const turn = turnOf(await turns(offered.threadId), offered.turnId);
    expect(turn.kept).toEqual({ accepted: "note", id: kept.note.id });
    expect(turn.discardedAt).toBeNull();
    expect(await discard(dm.token, offered)).toBe("Conflict");
  }, 60_000);

  it("finds nothing to discard on a turn that offered nothing", async () => {
    const offered = await ask(dm.token, "Just talk to me.", [textChunks("Hello.")]);
    expect(await discard(dm.token, offered)).toBe("NotFound");
  }, 60_000);
});

describe("a Shared World's panel", () => {
  const ask = (token: string, rounds: ReadonlyArray<Round>) =>
    asked(
      token,
      (client) =>
        client.sharedWorldHob.ask({
          params: { worldId: world.id },
          payload: { text: "Write that down for the world." },
        }),
      rounds,
    );
  const entry = offering("proposeSharedWorldEntry", {
    title: "The lantern",
    body: "Both tables now know the hag holds the lantern.",
  });
  const params = (offered: Offered) => ({
    worldId: world.id,
    threadId: offered.threadId,
    turnId: offered.turnId,
  });

  it("discards an entry for its members alone, and it is then no offer", async () => {
    const entries = await count("group_history_entry");
    const offered = await ask(dm.token, entry);
    expect(
      await outcome(stranger.token, (client) =>
        client.sharedWorldHob.discard({ params: params(offered), payload: {} }),
      ),
    ).toBe("NotFound");
    expect(
      await outcome(dm.token, (client) =>
        client.sharedWorldHob.discard({ params: params(offered), payload: {} }),
      ),
    ).toBe("succeeded");
    const turns = await as(dm.token, (client) =>
      client.sharedWorldHob.turns({ params: { worldId: world.id, threadId: offered.threadId } }),
    );
    expect(turnOf(turns, offered.turnId).discardedAt).not.toBeNull();
    expect(
      await outcome(dm.token, (client) =>
        client.sharedWorldHob.accept({ params: params(offered), payload: {} }),
      ),
    ).toBe("Conflict");
    expect(await count("group_history_entry")).toBe(entries);
  }, 60_000);

  it("keeps an entry with a pointer to it", async () => {
    const offered = await ask(dm.token, entry);
    const kept = await as(dm.token, (client) =>
      client.sharedWorldHob.accept({ params: params(offered), payload: {} }),
    );
    if (kept.accepted !== "sharedWorldHistory") throw new Error("wrong accept arm");
    const turns = await as(dm.token, (client) =>
      client.sharedWorldHob.turns({ params: { worldId: world.id, threadId: offered.threadId } }),
    );
    expect(turnOf(turns, offered.turnId).kept).toEqual({
      accepted: "sharedWorldHistory",
      id: kept.entry.id,
      worldId: world.id,
    });
  }, 60_000);
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

  it("discards a draft for its asker alone", async () => {
    const campaigns = await count("campaign");
    const offered = await ask(dm.token);
    expect(
      await outcome(stranger.token, (client) =>
        client.meHob.discard({ params: params(offered), payload: {} }),
      ),
    ).toBe("NotFound");
    expect(
      await outcome(dm.token, (client) =>
        client.meHob.discard({ params: params(offered), payload: {} }),
      ),
    ).toBe("succeeded");
    const turns = await as(dm.token, (client) =>
      client.meHob.turns({ params: { threadId: offered.threadId } }),
    );
    expect(turnOf(turns, offered.turnId).discardedAt).not.toBeNull();
    expect(
      await outcome(dm.token, (client) =>
        client.meHob.accept({ params: params(offered), payload: {} }),
      ),
    ).toBe("Conflict");
    expect(await count("campaign")).toBe(campaigns);
  }, 60_000);

  it("keeps a draft with a pointer to the campaign it made", async () => {
    const offered = await ask(dm.token);
    const kept = await as(dm.token, (client) =>
      client.meHob.accept({ params: params(offered), payload: {} }),
    );
    if (kept.accepted !== "campaign") throw new Error("wrong accept arm");
    const turns = await as(dm.token, (client) =>
      client.meHob.turns({ params: { threadId: offered.threadId } }),
    );
    expect(turnOf(turns, offered.turnId).kept).toEqual({
      accepted: "campaign",
      id: kept.campaign.id,
    });
  }, 60_000);
});
