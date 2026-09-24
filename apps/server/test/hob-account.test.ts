import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type AssistantThreadId,
  type HobEvent,
  type SharedWorld,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import {
  type ChatRequest,
  type Round,
  scriptedModel,
  textChunks,
  toolCallChunks,
} from "./support/model.js";

/**
 * **The account's own Hob panel** — `/me/hob` with no `intent`, the Hob on
 * every screen outside a campaign or Shared World — and the campaign it drafts.
 *
 * Over the real application, so the reach, the toolkit, the accept and the
 * cover trigger are the shipped ones; only the model and the image endpoint
 * are scripted. Four claims:
 *
 * - **the toolkit fits the place** — character drafting and campaign drafting,
 *   no campaign content, and only the asker's own Shared Worlds to choose from;
 *   the create screen's composer (`intent: "character"`) has no campaign tool;
 * - **keeping a campaign makes exactly one**, created by the asker through the
 *   ordinary create, stamped `origin = 'assistant'` with the turn, with its
 *   one cover drawn;
 * - **only the owner keeps it** — another account gets `NotFound` and nothing
 *   is made, and a second keep is a `Conflict`;
 * - **the world is validated both times** — a world the asker is not in is
 *   refused to the model, and one archived before the keep refuses the keep.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-account", maxTokens: 512, rounds: script });
const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "account-covers" });

const database = migratedDatabase("taverns_test_hob_account");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-account" }).pipe(Layer.provide(model.layer)),
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("hob-account-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 20, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(ImageRecords.layer),
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
const refusal = <A, E extends { readonly _tag: string }>(
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

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

const settled = () => runtime.runPromise(Effect.flatMap(HobImages, (drawing) => drawing.idle));

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

const ASKED = "Draft me a campaign: a ghost story on a river, slow and cold.";

/** A campaign a well-behaved model offers. */
const aCampaign = (over: Record<string, unknown> = {}) =>
  toolCallChunks("proposeCampaign", {
    name: "The Drowned Bell",
    partyName: "The Lantern Crew",
    description: "A river town where the church bell rings under the water every night.",
    sharedWorld: null,
    ...over,
  });

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask the account's panel (`/me/hob/ask`, no `intent`) with these rounds scripted. */
const ask = async (
  token: string,
  options: {
    readonly text?: string;
    readonly threadId?: AssistantThreadId;
    readonly intent?: "character";
    readonly rounds?: ReadonlyArray<Round>;
  } = {},
): Promise<Asked> => {
  const before = model.requests().length;
  script.length = before;
  script.push(...(options.rounds ?? [aCampaign(), textChunks("Here is your table.")]));
  const events = await as(token, (client) =>
    Effect.flatMap(
      client.meHob.ask({
        payload: {
          text: options.text ?? ASKED,
          ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
          ...(options.intent === undefined ? {} : { intent: options.intent }),
        },
      }),
      (stream) => Stream.runCollect(stream),
    ),
  );
  return { events: Array.from(events), requests: model.requests().slice(before) };
};

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

const campaignCount = () =>
  sql((sql) => sql<{ readonly count: string }>`select count(*)::text as count from campaign`).then(
    (rows) => Number(rows[0]?.count ?? "0"),
  );

let owner: Person;
let stranger: Person;
let coast: SharedWorld;
let theirs: SharedWorld;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  await run(importSystemSpells());
  owner = await person("Wren");
  stranger = await person("Tamsin");
  coast = await as(owner.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Drowned Coast" } }),
  );
  // Somebody else's world, with a campaign whose words must never reach the
  // owner's model: its name is not a world the owner can start a table in.
  theirs = await as(stranger.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "Tamsin's Marches" } }),
  );
  await as(stranger.token, (client) =>
    campaignVia(client, { name: "STRANGER_SENTINEL table", visibility: "shared" }),
  );
  // The owner's own standalone table: its hidden context is not a Shared World.
  await as(owner.token, (client) =>
    client.campaigns.create({ payload: { name: "OWNER_SENTINEL table" } }),
  );
}, 120_000);

describe("the panel's toolkit fits where it is", () => {
  it("offers character and campaign drafting and nothing that reads a campaign", async () => {
    const { requests } = await ask(owner.token);
    expect(toolNames(requests[0])).toEqual([
      "listStartingSpells",
      "proposeCampaign",
      "proposeCharacter",
    ]);
    const shown = JSON.stringify(requests[0]?.tools);
    expect(shown.toLowerCase()).not.toContain("campaignid");
    for (const absent of ["searchCampaign", "proposeNote", "proposeEncounter", "proposeBeat"]) {
      expect(shown).not.toContain(absent);
    }
    // No campaign's record reaches the model from here.
    expect(JSON.stringify(requests)).not.toContain("OWNER_SENTINEL");
    expect(JSON.stringify(requests)).not.toContain("STRANGER_SENTINEL");
  }, 60_000);

  it("names the asker's own Shared Worlds, and no one else's", async () => {
    const { requests } = await ask(owner.token);
    const shown = JSON.stringify(requests[0]?.tools);
    expect(shown).toContain("The Drowned Coast");
    expect(shown).not.toContain("Tamsin's Marches");
    // Somebody in no Shared World is told so rather than shown an empty choice.
    const lonely = await person("Lonely");
    const theirRequests = await ask(lonely.token);
    const theirShown = JSON.stringify(theirRequests.requests[0]?.tools);
    expect(theirShown).toContain("no Shared World");
    expect(theirShown).not.toContain("The Drowned Coast");
  }, 60_000);

  it("keeps the create screen's composer to character drafting", async () => {
    const { requests } = await ask(owner.token, {
      intent: "character",
      rounds: [textChunks("Tell me about them.")],
    });
    expect(toolNames(requests[0])).toEqual(["listStartingSpells", "proposeCharacter"]);
  }, 60_000);
});

describe("drafting a campaign", () => {
  it("offers a card and writes nothing until it is kept", async () => {
    const count = await campaignCount();
    const { events } = await ask(owner.token);
    const proposed = proposedIn(events);
    expect(proposed?.proposal).toEqual({
      target: "campaign",
      name: "The Drowned Bell",
      partyName: "The Lantern Crew",
      description: "A river town where the church bell rings under the water every night.",
      world: null,
    });
    expect(events.at(-1)?.event).toBe("done");
    expect(await campaignCount()).toBe(count);
  }, 60_000);

  it("resolves a Shared World by name to the one the asker is in", async () => {
    const { events } = await ask(owner.token, {
      rounds: [aCampaign({ sharedWorld: "The Drowned Coast" }), textChunks("On the coast.")],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "campaign") throw new Error("no campaign proposal");
    expect(proposed.proposal.world).toEqual({ id: coast.id, name: "The Drowned Coast" });
  }, 60_000);

  it("refuses a world the asker is not in, to the model, and offers nothing", async () => {
    // Within the enum the grammar itself refuses it, and the correction names
    // the one world there is.
    const { events, requests } = await ask(owner.token, {
      rounds: [aCampaign({ sharedWorld: "Tamsin's Marches" }), textChunks("I could not.")],
    });
    expect(proposedIn(events)).toBeUndefined();
    const corrected = JSON.stringify(requests[1]?.messages);
    expect(corrected).toContain("could not be read");
    expect(corrected).toContain("The Drowned Coast");
  }, 60_000);

  it("refuses any world to somebody in none, in the handler, and offers nothing", async () => {
    const lonely = await person("Alone");
    const { events, requests } = await ask(lonely.token, {
      rounds: [aCampaign({ sharedWorld: "Tamsin's Marches" }), textChunks("Standalone, then.")],
    });
    expect(proposedIn(events)).toBeUndefined();
    expect(JSON.stringify(requests[1]?.messages)).toContain(
      "they are in no Shared World, so leave sharedWorld out",
    );
    // "none" is absence, not a world called that.
    const plain = await ask(lonely.token, {
      rounds: [aCampaign({ sharedWorld: "None" }), textChunks("Standalone.")],
    });
    const proposed = proposedIn(plain.events);
    expect(proposed?.proposal.target === "campaign" && proposed.proposal.world).toBeNull();
  }, 60_000);

  it("continues the same thread on a redraft, and shows the model its offer", async () => {
    const first = await ask(owner.token);
    const { threadId } = begunIn(first.events);
    const second = await ask(owner.token, {
      threadId,
      text: "Make it darker.",
      rounds: [aCampaign({ name: "The Black Bell" }), textChunks("Darker.")],
    });
    expect(begunIn(second.events).threadId).toBe(threadId);
    expect(JSON.stringify(second.requests[0]?.messages)).toContain(
      'You offered a campaign called \\"The Drowned Bell\\"',
    );
    const proposed = proposedIn(second.events);
    expect(proposed?.proposal.target === "campaign" && proposed.proposal.name).toBe(
      "The Black Bell",
    );
  }, 60_000);
});

describe("a prose answer", () => {
  it("is reported when a campaign was asked for, and quiet in ordinary chat", async () => {
    const asked = await ask(owner.token, { rounds: [textChunks("A cold river, a bell.")] });
    const last = asked.events.at(-1);
    expect(last?.event).toBe("failed");
    expect(last?.event === "failed" && last.data.message).toContain("drafted nothing you can keep");

    const chat = await ask(owner.token, {
      text: "What can you do from here?",
      rounds: [textChunks("I can draft a campaign or a character.")],
    });
    expect(chat.events.at(-1)?.event).toBe("done");
  }, 60_000);
});

describe("keeping it", () => {
  it("makes one campaign the asker runs, stamped with the turn, and draws its cover once", async () => {
    const { events } = await ask(owner.token);
    const { threadId, turnId } = begunIn(events);
    const count = await campaignCount();
    const drawnBefore = images.requests().length;

    const accepted = await as(owner.token, (client) =>
      client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
    );
    if (accepted.accepted !== "campaign") throw new Error("not a campaign");
    expect(accepted.campaign).toMatchObject({
      name: "The Drowned Bell",
      partyName: "The Lantern Crew",
      description: "A river town where the church bell rings under the water every night.",
      creatorAccountId: owner.actor.accountId,
      origin: "assistant",
      assistantTurnId: turnId,
      imagePending: true,
    });
    expect(await campaignCount()).toBe(count + 1);
    await settled();
    expect(images.requests().length - drawnBefore).toBe(1);

    // Standalone: the asker's own table, which the list shows as theirs.
    const mine = await as(owner.token, (client) => client.me.campaigns());
    const row = mine.find((entry) => entry.campaign.id === accepted.campaign.id);
    expect(row?.relation).toBe("creator");
    expect(row?.sharedWorld).toBeNull();
    const turns = await as(owner.token, (client) => client.meHob.turns({ params: { threadId } }));
    expect(turns.find((turn) => turn.id === turnId)?.acceptedAt).not.toBeNull();
  }, 60_000);

  it("makes it inside the Shared World it named", async () => {
    const { events } = await ask(owner.token, {
      rounds: [aCampaign({ sharedWorld: "The Drowned Coast" }), textChunks("On the coast.")],
    });
    const { threadId, turnId } = begunIn(events);
    const accepted = await as(owner.token, (client) =>
      client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
    );
    if (accepted.accepted !== "campaign") throw new Error("not a campaign");
    expect(accepted.campaign.contextId).toBe(coast.id);
    const directory = await as(owner.token, (client) =>
      client.sharedWorlds.campaigns({ params: { worldId: coast.id } }),
    );
    expect(JSON.stringify(directory)).toContain(accepted.campaign.id);
  }, 60_000);

  it("is one campaign however many times it is kept", async () => {
    const { events } = await ask(owner.token);
    const { threadId, turnId } = begunIn(events);
    await as(owner.token, (client) =>
      client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
    );
    const count = await campaignCount();
    expect(
      await refusal(owner.token, (client) =>
        client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
      ),
    ).toBe("Conflict");
    expect(await campaignCount()).toBe(count);
  }, 60_000);

  it("is NotFound to another account, which makes nothing", async () => {
    const { events } = await ask(owner.token);
    const { threadId, turnId } = begunIn(events);
    const count = await campaignCount();
    expect(
      await refusal(stranger.token, (client) =>
        client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
      ),
    ).toBe("NotFound");
    expect(
      await refusal(stranger.token, (client) => client.meHob.turns({ params: { threadId } })),
    ).toBe("NotFound");
    const before = model.requests().length;
    expect(
      await refusal(stranger.token, (client) =>
        client.meHob.ask({ payload: { threadId, text: "Make it mine." } }),
      ),
    ).toBe("NotFound");
    expect(model.requests().length).toBe(before);
    expect(await campaignCount()).toBe(count);
    // Still the owner's to keep.
    const accepted = await as(owner.token, (client) =>
      client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
    );
    expect(accepted.accepted).toBe("campaign");
  }, 60_000);

  it("refuses a keep into a world archived since, and makes nothing", async () => {
    const brief = await as(owner.token, (client) =>
      client.sharedWorlds.create({ payload: { name: "The Brief Isles" } }),
    );
    const { events } = await ask(owner.token, {
      rounds: [aCampaign({ sharedWorld: "The Brief Isles" }), textChunks("On the isles.")],
    });
    const { threadId, turnId } = begunIn(events);
    await as(owner.token, (client) =>
      client.sharedWorlds.archive({ params: { worldId: brief.id } }),
    );
    const count = await campaignCount();
    expect(
      await refusal(owner.token, (client) =>
        client.meHob.accept({ params: { threadId, turnId }, payload: {} }),
      ),
    ).toBe("NotFound");
    expect(await campaignCount()).toBe(count);
    // And the turn is still unkept: nothing half-happened.
    const turns = await as(owner.token, (client) => client.meHob.turns({ params: { threadId } }));
    expect(turns.find((turn) => turn.id === turnId)?.acceptedAt).toBeNull();
  }, 60_000);

  it("never reaches a campaign's or a Shared World's accept", async () => {
    const { events } = await ask(owner.token);
    const { threadId, turnId } = begunIn(events);
    expect(
      await refusal(owner.token, (client) =>
        client.sharedWorldHob.accept({
          params: { worldId: coast.id, threadId, turnId },
          payload: {},
        }),
      ),
    ).toBe("NotFound");
    expect(theirs.id).not.toBe(coast.id);
  }, 60_000);
});
