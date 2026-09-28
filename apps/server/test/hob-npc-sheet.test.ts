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
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { NpcAgent } from "../src/assistant/NpcAgent.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Options } from "../src/repo/Options.js";
import { importSystemOptions } from "../src/ruleset/import.js";
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
 * **The creator's Hob drafts an NPC's sheet, and only the creator keeps it.**
 *
 * Over the real application and Postgres, with the model scripted: the
 * creator's toolkit offers `proposeNpcSheet` and no other does; a draft is
 * composed by `startingSheetBody` at the level asked, writes nothing, and is
 * drawn as a card; the creator's accept writes it through their own PUT,
 * stamped `origin = 'assistant'` with the turn, while a player at the table and
 * a stranger are refused the accept; an NPC that has a sheet is refused unless
 * the DM asked to replace it, and a replacement kept after a hand edit is
 * refused; `getNpc` hands the sheet back to the creator's Hob; and the NPC's
 * own model is shown none of it.
 */

/** The model's script, appended to per question (`hob-draft.test.ts`'s idiom). */
const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-npc-sheet", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_hob_npc_sheet");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-npc-sheet" }).pipe(Layer.provide(model.layer)),
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
/** Drafted for, kept, replaced. */
let grusk: NpcId;
/** Never given a sheet. */
let hollis: NpcId;

beforeAll(async () => {
  // The bundle, as a deployment has it: `proposeNpcSheet` resolves its labels
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
  const anNpc = async (name: string) =>
    (
      await as(jo.token, (client) =>
        client.npcs.create({
          params: { campaignId: table },
          payload: { name, role: "a face at the ford", visibility: "shared" },
        }),
      )
    ).id;
  grusk = await anNpc("Grusk");
  hollis = await anNpc("Hollis");
}, 120_000);

const RATIONALE = "A ferry guard who has seen real fighting.";

/** The call a well-behaved model makes, with everything filled in. */
const aSheetDraft = (npcId: NpcId, over: Record<string, unknown> = {}) =>
  toolCallChunks(
    "proposeNpcSheet",
    {
      npcId,
      className: "Fighter",
      level: 5,
      race: "Dwarf",
      subrace: "Hill Dwarf",
      subclass: null,
      background: "Acolyte",
      cr: "3",
      abilityOrder: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
      replace: null,
      rationale: [RATIONALE],
      ...over,
    },
    "call_sheet",
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
          text: options.text ?? "Give Grusk a sheet: a level 5 dwarf fighter.",
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

const sheetProposalIn = (events: ReadonlyArray<HobEvent>) => {
  const proposal = proposedIn(events);
  if (proposal?.target !== "npcSheet") throw new Error("no NPC sheet was offered");
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

const sheetOf = (npcId: NpcId) =>
  as(jo.token, (client) => client.npcs.sheet({ params: { campaignId: table, npcId } }));

/**
 * What the handler composes, composed here from the same pieces: the
 * campaign's own options, the standard array down the ranking the draft sent,
 * and `startingSheetBody`. Equal to the proposal is what "one composer" means.
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

describe("the creator's Hob drafts an NPC's sheet", () => {
  let threadId: AssistantThreadId;
  let turnId: AssistantTurnId;

  it("offers it on the creator's toolkit alone, composed by startingSheetBody, and writes nothing", async () => {
    const { events, requests } = await ask(jo.token, [
      aSheetDraft(grusk),
      textChunks("Grusk has a sheet waiting."),
    ]);
    ({ threadId, turnId } = begunIn(events));

    // The creator's toolkit has the draft and the read that returns it.
    expect(toolNames(requests[0])).toEqual(expect.arrayContaining(["proposeNpcSheet", "getNpc"]));

    const proposal = sheetProposalIn(events);
    const { body, seed } = await composedByHand();
    expect(proposal).toEqual({
      target: "npcSheet",
      npcId: grusk,
      npcName: "Grusk",
      level: 5,
      race: "Dwarf",
      subrace: "Hill Dwarf",
      className: "Fighter",
      ac: seed.ac,
      hpMax: seed.hpMax,
      cr: "3",
      sheet: body,
      replaces: null,
      rationale: [RATIONALE],
    });
    // Composed at the level asked, not a level-1 draft: a Fighter's fifth.
    expect(proposal.sheet.traits.map((trait) => trait.name)).toEqual(
      expect.arrayContaining(["Second Wind", "Action Surge (1 use)", "Extra Attack"]),
    );
    // Level 5 at the fixed 2014 value on the Hill Dwarf's moved CON 16:
    // 10 + 3, then four levels of 6 + 3, and the subrace's one a level.
    expect(proposal.hpMax).toBe(54);

    // A proposal is not a row.
    expect(await sheetOf(grusk)).toBeNull();
  }, 60_000);

  it("reads its own offer back on the next question, with the NPC it is for", async () => {
    const { requests } = await ask(jo.token, [textChunks("A paladin, then?")], {
      text: "What did you give him?",
      threadId,
    });
    const shown = JSON.stringify(requests[0]?.messages);
    expect(shown).toContain("[You offered the DM a sheet for Grusk");
    expect(shown).toContain(`npcId ${grusk}`);
    expect(shown).toContain("level 5 Hill Dwarf Fighter");
    expect(shown).toContain("cr 3");
  }, 60_000);

  it("is refused to a player at the table and to a stranger, and writes nothing", async () => {
    expect(await acceptRefusal(ilse.token, threadId, turnId)).toBe("NotFound");
    expect(await acceptRefusal(stranger.token, threadId, turnId)).toBe("NotFound");
    expect(await sheetOf(grusk)).toBeNull();
  }, 60_000);

  it("is kept by the creator through their own PUT, stamped with the turn it came from", async () => {
    const accepted = await accept(jo.token, threadId, turnId);
    if (accepted.accepted !== "npcSheet") throw new Error("expected an NPC sheet");
    const stored = await sheetOf(grusk);
    expect(stored).toEqual(accepted.sheet);
    expect(stored).toMatchObject({
      npcId: grusk,
      level: 5,
      race: "Dwarf",
      subrace: "Hill Dwarf",
      className: "Fighter",
      descriptor: "Level 5 Hill Dwarf Fighter",
      hpMax: 54,
      cr: "3",
      version: 1,
      origin: "assistant",
      assistantTurnId: turnId,
    });
    // A second tap is one row and one refusal.
    expect(await acceptRefusal(jo.token, threadId, turnId)).toBe("Conflict");
  }, 60_000);

  it("hands the sheet back through getNpc, to the creator's Hob only", async () => {
    const { requests } = await ask(jo.token, [
      toolCallChunks("getNpc", { npcId: grusk }, "call_npc"),
      textChunks("He is a fighter."),
    ]);
    const read = JSON.stringify(requests.slice(1));
    expect(read).toContain("Level 5 Hill Dwarf Fighter");
    expect(read).toContain("Extra Attack");

    const { requests: none } = await ask(
      jo.token,
      [toolCallChunks("getNpc", { npcId: hollis }, "call_npc"), textChunks("Nothing yet.")],
      { text: "Does Hollis have stats?" },
    );
    expect(JSON.stringify(none.slice(1))).toContain('\\"sheet\\":null');

    // A player's toolkit has neither the read nor the draft.
    const { requests: player } = await ask(ilse.token, [textChunks("Tell me who you are.")], {
      text: "Build me a character.",
      intent: "character",
    });
    expect(toolNames(player[0])).not.toContain("proposeNpcSheet");
    expect(toolNames(player[0])).not.toContain("getNpc");
    expect(toolNames(player[0])).toContain("proposeCharacter");
  }, 60_000);

  it("never shows the NPC's own model the sheet Hob drafted", async () => {
    const npcModel = scriptedModel({
      model: "scripted-local",
      maxTokens: 512,
      rounds: [textChunks("The river is listening.")],
    });
    const events = await runtime.runPromise(
      Effect.gen(function* () {
        const agent = yield* NpcAgent;
        const stream = yield* agent.rehearse(table, grusk, { text: "What do you fight with?" });
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
    expect(shown).toContain("Grusk");
    for (const marker of [
      "Fighter",
      "Paladin",
      "Hill Dwarf",
      "Extra Attack",
      "Action Surge",
      RATIONALE,
    ]) {
      expect(shown, marker).not.toContain(marker);
    }
  }, 60_000);
});

describe("an NPC that already has a sheet", () => {
  it("is refused a new draft unless the DM asked to replace it", async () => {
    const { events, requests } = await ask(jo.token, [
      aSheetDraft(grusk, { className: "Paladin" }),
      textChunks("He already has one."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    const refused = JSON.stringify(requests[1]?.messages);
    expect(refused).toContain("Grusk already has a sheet (Level 5 Hill Dwarf Fighter)");
    expect(refused).toContain("set replace to true");
  }, 60_000);

  it("offers a replacement that names what it replaces, and refuses the keep after a hand edit", async () => {
    const offered = await ask(
      jo.token,
      [aSheetDraft(grusk, { className: "Paladin", replace: true }), textChunks("A paladin.")],
      { text: "Replace Grusk's sheet with a level 5 paladin." },
    );
    const proposal = sheetProposalIn(offered.events);
    expect(proposal.replaces).toEqual({ version: 1, descriptor: "Level 5 Hill Dwarf Fighter" });
    expect(proposal.className).toBe("Paladin");

    // The DM edits the sheet by hand after the offer. A PATCH keeps the
    // sheet's origin: it is still the kept draft, edited.
    const edited = await as(jo.token, (client) =>
      client.npcs.updateSheet({ params: { campaignId: table, npcId: grusk }, payload: { ac: 18 } }),
    );
    expect(edited).toMatchObject({ version: 2, ac: 18, origin: "assistant" });

    const { threadId, turnId } = begunIn(offered.events);
    expect(await acceptRefusal(jo.token, threadId, turnId)).toBe("Conflict");
    expect(await sheetOf(grusk)).toMatchObject({ version: 2, ac: 18, className: "Fighter" });
  }, 60_000);

  it("replaces it when kept against the version it read, and a hand-written PUT is authored again", async () => {
    const offered = await ask(
      jo.token,
      [aSheetDraft(grusk, { className: "Paladin", replace: true }), textChunks("A paladin.")],
      { text: "Replace Grusk's sheet with a level 5 paladin." },
    );
    const proposal = sheetProposalIn(offered.events);
    expect(proposal.replaces?.version).toBe(2);

    const { threadId, turnId } = begunIn(offered.events);
    await accept(jo.token, threadId, turnId);
    const kept = await sheetOf(grusk);
    expect(kept).toMatchObject({
      version: 3,
      className: "Paladin",
      descriptor: "Level 5 Hill Dwarf Paladin",
      origin: "assistant",
      assistantTurnId: turnId,
    });

    const written = await as(jo.token, (client) =>
      client.npcs.putSheet({
        params: { campaignId: table, npcId: grusk },
        payload: { expectedVersion: 3, level: 2, className: "Rogue", sheet: kept!.sheet },
      }),
    );
    expect(written).toMatchObject({ version: 4, origin: "authored", assistantTurnId: null });
  }, 60_000);
});

describe("a draft Hob cannot compose", () => {
  it("refuses a class the campaign does not have, naming the ones it does", async () => {
    const { events, requests } = await ask(jo.token, [
      aSheetDraft(hollis, { className: "Bloodsworn" }),
      textChunks("I could not."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    const refused = JSON.stringify(requests[1]?.messages);
    expect(refused).toContain('\\\\\\"Bloodsworn\\\\\\" is not a class in this campaign');
    expect(refused).toContain('\\\\\\"Fighter\\\\\\"');
    expect(await sheetOf(hollis)).toBeNull();
  }, 60_000);

  it("refuses an NPC of another campaign as the NotFound it is", async () => {
    const elsewhere = (
      await as(jo.token, (client) =>
        client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
      )
    ).id;
    const outsider = (
      await as(jo.token, (client) =>
        client.npcs.create({
          params: { campaignId: elsewhere },
          payload: { name: "Mother Rook", role: "the hag" },
        }),
      )
    ).id;
    const { events, requests } = await ask(jo.token, [
      aSheetDraft(outsider),
      textChunks("I could not find her."),
    ]);
    expect(proposedIn(events)).toBeUndefined();
    expect(JSON.stringify(requests[1]?.messages)).toContain("NotFound");
    expect(
      await as(jo.token, (client) =>
        client.npcs.sheet({ params: { campaignId: elsewhere, npcId: outsider } }),
      ),
    ).toBeNull();
  }, 60_000);
});
