import { NodeHttpServer } from "@effect/platform-node";
import {
  type Ability,
  ABILITY_KEYS,
  Actor,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  CurrentActor,
  type HobEvent,
  type HobProposal,
  modifierFor,
  type NpcEvent,
  type NpcId,
  optionNamed,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { NpcAgent } from "../src/assistant/NpcAgent.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { admittedTo } from "./support/actors.js";
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
 * **The creator's Hob drafts a new NPC for the Cast, and only the creator
 * keeps it.**
 *
 * Over the real application and Postgres, with the model and the image
 * endpoint scripted, so no request leaves the process: the creator's toolkit
 * offers `proposeNpc` and no other does; a draft writes nothing and draws
 * nothing; its optional sheet is composed by `startingSheetBody`, exactly as
 * `proposeNpcSheet`'s; the creator's accept creates the NPC through the cast's
 * own create, stamped `origin = 'assistant'` with the turn, writes its prep and
 * its sheet, and starts its portrait once after the commit, while a player at
 * the table and a stranger are refused the accept and start nothing; a name the
 * cast already has is refused; and the NPC's own model is shown the persona
 * and never the sheet.
 */

/** The model's script, appended to per question (`hob-draft.test.ts`'s idiom). */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-npc", maxTokens: 512, rounds: script });
const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "npc-portraits" });

const database = migratedDatabase("taverns_test_hob_npc");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-npc" }).pipe(Layer.provide(model.layer)),
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("hob-npc-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 20, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
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

/** Wait for every drawing job to finish. */
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

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;
/** Already in the cast before Hob drafts anybody. */
let grusk: NpcId;

beforeAll(async () => {
  // The bundle, as a deployment has it: a drafted sheet resolves its labels
  // against the campaign's options, and a Fighter's features come from here.
  await run(importSystemEquipment());
  await run(importSystemOptions());
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
  grusk = (
    await as(jo.token, (client) =>
      client.npcs.create({ params: { campaignId: table }, payload: { name: "Grusk" } }),
    )
  ).id;
}, 120_000);

const SECRET = "She forged the toll seal herself.";
const MANNER = "Clipped, never looks up from the anvil.";

/** The call a well-behaved model makes, with everything filled in. */
const anNpcDraft = (over: Record<string, unknown> = {}) =>
  toolCallChunks(
    "proposeNpc",
    {
      name: "Mara Vell",
      role: "the blacksmith at the ford",
      summary: "Shoes the ferry horses and hears every rumour first.",
      appearance: "Broad shoulders, a scorched leather apron, grey braid.",
      manner: MANNER,
      wants: "To buy the ferry out from under the toll-keeper.",
      secret: SECRET,
      attitude: "indifferent",
      status: "alive",
      whereabouts: "The forge beside the ford",
      sheet: {
        className: "Fighter",
        level: 5,
        race: "Dwarf",
        subrace: "Hill Dwarf",
        subclass: null,
        background: "Acolyte",
        cr: "3",
        abilityOrder: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
      },
      ...over,
    },
    "call_npc_draft",
  );

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask the campaign's Hob as somebody, with these rounds scripted. */
const ask = async (
  token: string,
  rounds: ReadonlyArray<Round>,
  options: {
    readonly text?: string;
    readonly threadId?: AssistantThreadId;
    readonly intent?: "character";
  } = {},
): Promise<Asked> => {
  const before = model.requests().length;
  script.length = before;
  script.push(...rounds);
  const events = await as(token, (client) =>
    Effect.flatMap(
      client.hob.ask({
        params: { campaignId: table },
        payload: {
          text: options.text ?? "Add a blacksmith to the cast, with stats: a level 5 dwarf.",
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

const proposedIn = (events: ReadonlyArray<HobEvent>): HobProposal | undefined => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data.proposal : undefined;
};

const npcProposalIn = (events: ReadonlyArray<HobEvent>) => {
  const proposal = proposedIn(events);
  if (proposal?.target !== "npc") throw new Error("no NPC was offered");
  return proposal;
};

const toolNames = (request: ChatRequest | undefined): ReadonlyArray<string> =>
  (request?.tools ?? [])
    .map((tool) => (tool as { readonly function?: { readonly name?: string } }).function?.name)
    .filter((name): name is string => name !== undefined);

/** Accept over the wire, exactly as the panel does: ids alone, no body. */
const accept = (token: string, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  as(token, (client) =>
    client.hob.accept({ params: { campaignId: table, threadId, turnId }, payload: {} }),
  );

const acceptRefusal = (token: string, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  refusal(token, (client) =>
    client.hob.accept({ params: { campaignId: table, threadId, turnId }, payload: {} }),
  );

const cast = () =>
  as(jo.token, (client) => client.npcs.list({ params: { campaignId: table }, query: {} }));

/**
 * What the handler composes, composed here from the same pieces: the
 * campaign's own options, the standard array down the ranking the draft sent,
 * and `startingSheetBody`. Equal to the proposal's sheet is what "one
 * composer" means — the same check `hob-npc-sheet.test.ts` makes of
 * `proposeNpcSheet`.
 */
const composedByHand = async () => {
  const options = await run(
    Effect.provideService(
      Effect.flatMap(Options, (repo) => repo.list(table, {})),
      CurrentActor,
      jo.actor,
    ),
  );
  const ranked = ["STR", "CON", "DEX", "WIS", "CHA", "INT"];
  const array = [15, 14, 13, 12, 10, 8];
  const abilities: ReadonlyArray<Ability> = ABILITY_KEYS.map((label) => {
    const score = array[ranked.indexOf(label)]!;
    return { label, score: String(score), modifier: modifierFor(score) };
  });
  const background = optionNamed(options, "background", "Acolyte");
  return startingSheetBody({
    classOption: asClassOption(optionNamed(options, "class", "Fighter")),
    raceOption: asRaceOption(optionNamed(options, "race", "Dwarf")),
    subrace: "Hill Dwarf",
    backgroundOption: asBackgroundOption(background),
    background: background?.name,
    level: 5,
    abilities,
    raceBonusChoices: [],
  });
};

describe("the creator's Hob drafts a new NPC", () => {
  let threadId: AssistantThreadId;
  let turnId: AssistantTurnId;
  let mara: NpcId;

  it("offers it on the creator's toolkit alone, with a sheet composed by startingSheetBody, and writes nothing", async () => {
    const castBefore = await cast();
    const drawnBefore = images.requests().length;
    const { events, requests } = await ask(jo.token, [
      anNpcDraft(),
      textChunks("Mara Vell is waiting at the forge."),
    ]);
    ({ threadId, turnId } = begunIn(events));

    expect(toolNames(requests[0])).toEqual(
      expect.arrayContaining(["proposeNpc", "proposeNpcSheet"]),
    );

    const proposal = npcProposalIn(events);
    const { body, seed } = await composedByHand();
    expect(proposal).toEqual({
      target: "npc",
      name: "Mara Vell",
      role: "the blacksmith at the ford",
      persona: {
        identity: {
          summary: "Shoes the ferry horses and hears every rumour first.",
          appearance: "Broad shoulders, a scorched leather apron, grey braid.",
        },
        voice: { manner: MANNER },
        intent: { wants: "To buy the ferry out from under the toll-keeper." },
      },
      privateMaterial: { secrets: SECRET },
      prep: { attitude: "indifferent", status: "alive", whereabouts: "The forge beside the ford" },
      sheet: {
        level: 5,
        race: "Dwarf",
        subrace: "Hill Dwarf",
        className: "Fighter",
        ac: seed.ac,
        hpMax: seed.hpMax,
        cr: "3",
        sheet: body,
      },
    });

    // A proposal is not a row, and nothing was drawn for it.
    expect(await cast()).toEqual(castBefore);
    expect(images.requests().length).toBe(drawnBefore);
  }, 60_000);

  it("reads its own offer back on the next question", async () => {
    const { requests } = await ask(jo.token, [textChunks("Older, then?")], {
      text: "What did you give her?",
      threadId,
    });
    const shown = JSON.stringify(requests[0]?.messages);
    expect(shown).toContain('[You offered the DM an NPC called \\"Mara Vell\\" for the Cast');
    expect(shown).toContain("role the blacksmith at the ford");
    expect(shown).toContain("sheet level 5 Hill Dwarf Fighter");
  }, 60_000);

  it("is refused to a player at the table and to a stranger, and writes and draws nothing", async () => {
    const castBefore = await cast();
    const drawnBefore = images.requests().length;
    expect(await acceptRefusal(ilse.token, threadId, turnId)).toBe("NotFound");
    expect(await acceptRefusal(stranger.token, threadId, turnId)).toBe("NotFound");
    await settled();
    expect(await cast()).toEqual(castBefore);
    expect(images.requests().length).toBe(drawnBefore);
  }, 60_000);

  it("is kept by the creator through the cast's own create, stamped with the turn, and drawn once", async () => {
    const drawnBefore = images.requests().length;
    const accepted = await accept(jo.token, threadId, turnId);
    if (accepted.accepted !== "npc") throw new Error("expected an NPC");
    mara = accepted.npc.id;
    expect(accepted.npc).toMatchObject({
      campaignId: table,
      name: "Mara Vell",
      role: "the blacksmith at the ford",
      privateMaterial: { secrets: SECRET },
      // Hidden from the table until the DM shares it, as every kept row is.
      visibility: "dm",
      origin: "assistant",
      assistantTurnId: turnId,
      imagePending: true,
    });
    expect((await cast()).map((npc) => npc.id)).toContain(mara);

    // Its prep, through the creator's own PATCH.
    const preps = await as(jo.token, (client) =>
      client.npcs.prepList({ params: { campaignId: table }, query: {} }),
    );
    expect(preps.find((prep) => prep.npcId === mara)).toMatchObject({
      attitude: "indifferent",
      status: "alive",
      whereabouts: "The forge beside the ford",
      metSessionId: null,
    });

    // Its sheet, through the creator's own PUT, stamped with the same turn.
    const sheet = await as(jo.token, (client) =>
      client.npcs.sheet({ params: { campaignId: table, npcId: mara } }),
    );
    expect(sheet).toMatchObject({
      descriptor: "Level 5 Hill Dwarf Fighter",
      cr: "3",
      version: 1,
      origin: "assistant",
      assistantTurnId: turnId,
    });

    // The portrait and its banner, started after the commit: one draw each.
    await settled();
    expect(images.requests().length - drawnBefore).toBe(2);
    const drawn = await as(jo.token, (client) =>
      client.npcs.findById({ params: { campaignId: table, npcId: mara } }),
    );
    expect(drawn.imagePending).toBe(false);
    expect(drawn.image).not.toBeNull();

    // A second tap is one row and one refusal, and draws nothing more.
    expect(await acceptRefusal(jo.token, threadId, turnId)).toBe("Conflict");
    await settled();
    expect(images.requests().length - drawnBefore).toBe(2);
    expect((await cast()).filter((npc) => npc.name === "Mara Vell")).toHaveLength(1);
  }, 60_000);

  it("gives a player at the table nothing of it until the DM shares it", async () => {
    const seen = await as(ilse.token, (client) =>
      client.npcs.playerList({ params: { campaignId: table } }),
    );
    expect(seen.map((npc) => npc.id)).not.toContain(mara);
  }, 60_000);

  it("shows the NPC's own model the persona and the secret, and never the sheet", async () => {
    const npcModel = scriptedModel({
      model: "scripted-local",
      maxTokens: 512,
      rounds: [textChunks("Mind the sparks.")],
    });
    const events = await runtime.runPromise(
      Effect.gen(function* () {
        const agent = yield* NpcAgent;
        const stream = yield* agent.rehearse(table, mara, { text: "What do you fight with?" });
        return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<NpcEvent>;
      }).pipe(
        Effect.provideService(CurrentActor, jo.actor),
        Effect.provide(
          NpcAgent.layer({ model: "scripted-local" }).pipe(Layer.provide(npcModel.layer)),
        ),
        Effect.orDie,
      ),
    );
    expect(events.some((event) => event.event === "done")).toBe(true);
    const shown = JSON.stringify(npcModel.requests());
    expect(shown).toContain("Mara Vell");
    expect(shown).toContain(MANNER);
    // The creator is the audience of a rehearsal, so the secret is theirs.
    expect(shown).toContain(SECRET);
    for (const marker of ["Fighter", "Hill Dwarf", "Extra Attack", "Action Surge"]) {
      expect(shown, marker).not.toContain(marker);
    }
  }, 60_000);
});

describe("an NPC drafted without stats", () => {
  it("joins the cast with no sheet and no prep", async () => {
    const offered = await ask(
      jo.token,
      [
        anNpcDraft({
          name: "Pell",
          role: "the ferry's boy",
          summary: null,
          appearance: null,
          manner: null,
          wants: null,
          secret: null,
          attitude: null,
          status: null,
          whereabouts: null,
          sheet: null,
        }),
        textChunks("Pell is ready."),
      ],
      { text: "Make an NPC: the ferry's boy." },
    );
    const proposal = npcProposalIn(offered.events);
    expect(proposal).toMatchObject({
      name: "Pell",
      role: "the ferry's boy",
      persona: {},
      privateMaterial: {},
      prep: { attitude: null, status: null, whereabouts: null },
      sheet: null,
    });

    const { threadId, turnId } = begunIn(offered.events);
    const accepted = await accept(jo.token, threadId, turnId);
    if (accepted.accepted !== "npc") throw new Error("expected an NPC");
    const pell = accepted.npc.id;
    expect(
      await as(jo.token, (client) =>
        client.npcs.sheet({ params: { campaignId: table, npcId: pell } }),
      ),
    ).toBeNull();
    const preps = await as(jo.token, (client) =>
      client.npcs.prepList({ params: { campaignId: table }, query: {} }),
    );
    expect(preps.find((prep) => prep.npcId === pell)).toMatchObject({
      attitude: null,
      status: null,
      whereabouts: null,
    });
    await settled();
  }, 60_000);
});

describe("a draft Hob cannot offer", () => {
  it("refuses a name the cast already has, and points at the NPC it has", async () => {
    const { events, requests } = await ask(jo.token, [
      anNpcDraft({ name: "grusk ", sheet: null }),
      textChunks("Grusk is already here."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    const refused = JSON.stringify(requests[1]?.messages);
    expect(refused).toContain(`Grusk is already in the Cast (npcId ${grusk})`);
    expect(refused).toContain("proposeNpcSheet");
  }, 60_000);

  it("refuses a class the campaign does not have, through the sheet's own composer", async () => {
    const before = await cast();
    const { events, requests } = await ask(jo.token, [
      anNpcDraft({
        name: "Oszkar",
        sheet: {
          className: "Bloodsworn",
          level: 3,
          abilityOrder: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
        },
      }),
      textChunks("I could not."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    const refused = JSON.stringify(requests[1]?.messages);
    expect(refused).toContain('\\\\\\"Bloodsworn\\\\\\" is not a class in this campaign');
    expect(await cast()).toEqual(before);
  }, 60_000);

  it("is not a tool a player's Hob is shown", async () => {
    const { requests } = await ask(ilse.token, [textChunks("Tell me who you are.")], {
      text: "Build me a character.",
      intent: "character",
    });
    expect(toolNames(requests[0])).not.toContain("proposeNpc");
    expect(toolNames(requests[0])).toContain("proposeCharacter");
  }, 60_000);
});
