import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type AssistantThreadId,
  type CampaignId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type HobEvent,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { Creatures } from "../src/repo/Creatures.js";
import { admittedTo, aGroupMemberAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * **An encounter's kind is on the encounter; its DM prep — tactics, treasure,
 * and a skill challenge's or a hazard's numbers — is the creator's alone.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract: the form's create and update write the prep, the creator's prep
 * reads answer it, a player reading the shared encounter sees its kind and
 * nothing else, and Hob's accepted proposal writes the same fields through the
 * same create. Hob's model is scripted (`support/model.ts`).
 */

/** Hob's script, pushed round by round before each ask. */
const rounds: Array<Round> = [];
const chat = scriptedModel({ model: "scripted-local", maxTokens: 512, rounds });

const database = migratedDatabase("taverns_test_encounter_prep");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(chat.layer)),
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
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catch((error: unknown) =>
        Effect.succeed({
          ok: false as const,
          tag:
            typeof error === "object" && error !== null && "_tag" in error
              ? String(error._tag)
              : "unknown",
        }),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A request the derived client would refuse to encode, sent as it stands. */
const raw = (method: "post" | "patch", token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const request =
        method === "post" ? HttpClientRequest.post(path) : HttpClientRequest.patch(path);
      const response = yield* HttpClient.execute(
        request.pipe(HttpClientRequest.bearerToken(token), HttpClientRequest.bodyJsonUnsafe(body)),
      );
      return response.status;
    }).pipe(Effect.orDie),
  );

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

const encounterAt = (who: Person, campaignId: CampaignId, payload: EncounterCreate) =>
  as(who.token, (client) => client.encounters.create({ params: { campaignId }, payload }));

const prepOf = (who: Person, campaignId: CampaignId, encounterId: EncounterId) =>
  as(who.token, (client) => client.encounterPrep.find({ params: { campaignId, encounterId } }));

const WELL: EncounterCreate = {
  name: "The dry well",
  kind: "challenge",
  tactics: [
    "  Success: they find the buried cache.  ",
    "Each failure costs one day's water for the caravan.",
  ],
  treasure: "  A waterskin that never empties  ",
  challenge: {
    kind: "challenge",
    dc: 14,
    successes: 3,
    failures: 2,
    skills: ["Athletics", "Survival"],
  },
};

const STORM = {
  kind: "hazard",
  save: { ability: "CON", dc: 13 },
  onFail: "1 level of exhaustion",
  duration: "1d4 hours",
  skills: ["Survival", "Animal Handling"],
} as const;

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
}, 60_000);

describe("writing an encounter's kind and prep", () => {
  it("writes them on create and reads them back through the creator's prep reads", async () => {
    const well = await encounterAt(jo, table, WELL);
    expect(well.kind).toBe("challenge");

    const prep = await prepOf(jo, table, well.id);
    expect(prep.encounterId).toBe(well.id);
    // Trimmed on the way in, as the setting line and a description are.
    expect(prep.tactics).toEqual([
      "Success: they find the buried cache.",
      "Each failure costs one day's water for the caravan.",
    ]);
    expect(prep.treasure).toBe("A waterskin that never empties");
    expect(prep.challenge).toEqual(WELL.challenge);

    const listed = await as(jo.token, (client) =>
      client.encounterPrep.list({ params: { campaignId: table } }),
    );
    expect(listed.find((entry) => entry.encounterId === well.id)).toEqual(prep);
  });

  it("makes an encounter with neither a fight with empty prep", async () => {
    const plain = await encounterAt(jo, table, { name: "Wolves at the caravan" });
    expect(plain.kind).toBe("combat");
    const prep = await prepOf(jo, table, plain.id);
    expect(prep).toMatchObject({ tactics: [], treasure: null, challenge: null });

    // Every encounter the creator holds has one, in the order they were made.
    const listed = await as(jo.token, (client) =>
      client.encounterPrep.list({ params: { campaignId: table } }),
    );
    const encounters = await as(jo.token, (client) =>
      client.encounters.list({ params: { campaignId: table }, query: {} }),
    );
    expect(listed.map((entry) => entry.encounterId)).toEqual(
      encounters.items.map((entry) => entry.id),
    );
  });

  it("replaces the tactics, clears the treasure, and leaves what a patch does not name", async () => {
    const well = await encounterAt(jo, table, { ...WELL, name: "The second well" });
    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { tactics: ["Only the one line now."], treasure: null },
      }),
    );
    expect(await prepOf(jo, table, well.id)).toMatchObject({
      tactics: ["Only the one line now."],
      treasure: null,
      challenge: WELL.challenge,
    });

    // Sending the kind it already has keeps its challenge.
    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { kind: "challenge", name: "The second well, renamed" },
      }),
    );
    expect((await prepOf(jo, table, well.id)).challenge).toEqual(WELL.challenge);

    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { tactics: [] },
      }),
    );
    expect((await prepOf(jo, table, well.id)).tactics).toEqual([]);
  });

  it("clears a challenge the new kind does not take, and writes one sent with its kind", async () => {
    const well = await encounterAt(jo, table, { ...WELL, name: "The third well" });

    const social = await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { kind: "social" },
      }),
    );
    expect(social.kind).toBe("social");
    const cleared = await prepOf(jo, table, well.id);
    expect(cleared.challenge).toBeNull();
    // Only the challenge belonged to the old kind; the rest of the prep stays.
    expect(cleared.tactics).toHaveLength(2);

    const hazard = await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { kind: "hazard", challenge: STORM },
      }),
    );
    expect(hazard.kind).toBe("hazard");
    expect((await prepOf(jo, table, well.id)).challenge).toEqual(STORM);

    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: well.id },
        payload: { challenge: null },
      }),
    );
    expect((await prepOf(jo, table, well.id)).challenge).toBeNull();
  });
});

describe("a challenge's shape follows the kind", () => {
  const post = (body: unknown) => raw("post", jo.token, `/campaigns/${table}/encounters`, body);

  it("refuses a challenge sent without its kind, or with another", async () => {
    expect(await post({ name: "No kind", challenge: WELL.challenge })).toBe(400);
    expect(await post({ name: "Wrong kind", kind: "hazard", challenge: WELL.challenge })).toBe(400);
    expect(await post({ name: "A fight", kind: "combat", challenge: STORM })).toBe(400);
  });

  it("refuses a challenge missing what its kind needs, and a kind nobody named", async () => {
    const { save: _save, ...unsaved } = STORM;
    expect(await post({ name: "No save", kind: "hazard", challenge: unsaved })).toBe(400);
    const { dc: _dc, ...undc } = WELL.challenge as { readonly dc: number };
    expect(await post({ name: "No DC", kind: "challenge", challenge: undc })).toBe(400);
    expect(
      await post({
        name: "Too hard",
        kind: "challenge",
        challenge: { ...WELL.challenge, dc: 31 },
      }),
    ).toBe(400);
    expect(await post({ name: "A puzzle", kind: "puzzle" })).toBe(400);
  });

  it("refuses blank or too many tactics and a blank treasure", async () => {
    expect(await post({ name: "Blank", tactics: ["   "] })).toBe(400);
    expect(await post({ name: "Many", tactics: Array.from({ length: 13 }, () => "A line") })).toBe(
      400,
    );
    expect(await post({ name: "Long", tactics: ["x".repeat(301)] })).toBe(400);
    expect(await post({ name: "Nothing", treasure: "  " })).toBe(400);
  });

  it("refuses a patch whose challenge does not name its kind", async () => {
    const well = await encounterAt(jo, table, { ...WELL, name: "The fourth well" });
    const path = `/campaigns/${table}/encounters/${well.id}`;
    expect(await raw("patch", jo.token, path, { challenge: WELL.challenge })).toBe(400);
    expect(await raw("patch", jo.token, path, { kind: "hazard", challenge: WELL.challenge })).toBe(
      400,
    );
    expect((await prepOf(jo, table, well.id)).challenge).toEqual(WELL.challenge);
  });
});

describe("the prep is the creator's alone", () => {
  let shown: EncounterId;
  let player: Actor;
  let bystander: Actor;

  beforeAll(async () => {
    shown = (
      await encounterAt(jo, table, {
        ...WELL,
        name: "Shown to the table",
        tactics: ["TACTIC-THE-CARAVAN-MASTER-LIES"],
        treasure: "TREASURE-UNDER-THE-FLOORBOARD",
        visibility: "shared",
      })
    ).id;
    player = await run(admittedTo(table, ilse.actor, "Ilse"));
    bystander = await run(aGroupMemberAt(table, "Wren"));
  }, 60_000);

  it("shows a player the shared encounter's kind, and nothing of its prep", async () => {
    const found = await as(ilse.token, (client) =>
      client.encounters.findById({ params: { campaignId: table, encounterId: shown } }),
    );
    const listed = await as(ilse.token, (client) =>
      client.encounters.list({ params: { campaignId: table }, query: {} }),
    );
    expect(found.kind).toBe("challenge");
    expect(listed.items.map((entry) => entry.id)).toContain(shown);
    for (const read of [found, listed]) {
      const text = JSON.stringify(read);
      expect(text).not.toContain("TACTIC-THE-CARAVAN-MASTER-LIES");
      expect(text).not.toContain("TREASURE-UNDER-THE-FLOORBOARD");
      expect(text).not.toContain("successes");
    }
  });

  it("answers a player, a Shared World member and a stranger NotFound on both prep reads", async () => {
    for (const who of [ilse, stranger]) {
      expect(
        await attempt(who.token, (client) =>
          client.encounterPrep.find({ params: { campaignId: table, encounterId: shown } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(who.token, (client) =>
          client.encounterPrep.list({ params: { campaignId: table } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    // The proof the prep reads require: the player and the member cannot get one.
    for (const actor of [player, bystander]) {
      const proof = await runtime.runPromise(Effect.result(asDm(actor, table)));
      expect(proof._tag).toBe("Failure");
    }
  });

  it("refuses a player's write of the prep as it refuses any encounter write", async () => {
    expect(
      await attempt(ilse.token, (client) =>
        client.encounters.update({
          params: { campaignId: table, encounterId: shown },
          payload: { treasure: "Mine now", kind: "combat" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    const prep = await prepOf(jo, table, shown);
    expect(prep.treasure).toBe("TREASURE-UNDER-THE-FLOORBOARD");
    expect(prep.challenge).toEqual(WELL.challenge);
  });
});

describe("Hob's accepted encounter", () => {
  const REPLY = textChunks("There you are.");

  /** Ask once; a tool call is followed by the round that answers its result. */
  const offer = async (text: string, round: Round, threadId?: AssistantThreadId) => {
    rounds.push(...(round === REPLY ? [round] : [round, REPLY]));
    const events = await run(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(table, { text, threadId });
        return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
      }).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    const proposed = events.find((event) => event.event === "proposal");
    return {
      began: began.data,
      proposal: proposed?.event === "proposal" ? proposed.data.proposal : undefined,
    };
  };

  it("carries the kind, tactics, treasure and challenge Hob offered into the record", async () => {
    const { began, proposal } = await offer(
      "A hazard for the salt flats.",
      toolCallChunks("proposeEncounter", {
        name: "Salt-flat sandstorm",
        kind: "hazard",
        tactics: ["Visibility drops to 10 ft; the caravan can split.", "  "],
        treasure: "A lost merchant's strongbox, half buried",
        saveAbility: "CON",
        dc: 13,
        onFail: "1 level of exhaustion",
        duration: "1d4 hours",
        skills: ["Survival", "Animal Handling"],
      }),
    );
    expect(proposal).toMatchObject({
      target: "encounter",
      kind: "hazard",
      tactics: ["Visibility drops to 10 ft; the caravan can split."],
      treasure: "A lost merchant's strongbox, half buried",
      challenge: STORM,
      roster: [],
    });

    const accepted = await as(jo.token, (client) =>
      client.hob.accept({
        params: { campaignId: table, threadId: began.threadId, turnId: began.turnId },
        payload: {},
      }),
    );
    if (accepted.accepted !== "encounter") throw new Error("accepted something else");
    expect(accepted.encounter.kind).toBe("hazard");
    expect(accepted.encounter.origin).toBe("assistant");
    expect(await prepOf(jo, table, accepted.encounter.id)).toMatchObject({
      tactics: ["Visibility drops to 10 ft; the caravan can split."],
      treasure: "A lost merchant's strongbox, half buried",
      challenge: STORM,
    });

    // A follow-up in the same thread shows the model what it offered, prep and
    // all, so a redraft keeps what the DM was happy with.
    const before = chat.requests().length;
    await offer("Make it longer.", REPLY, began.threadId);
    const shown = JSON.stringify(chat.requests().slice(before));
    expect(shown).toContain("a hazard encounter called");
    expect(shown).toContain("saveAbility CON, dc 13");
    expect(shown).toContain("tactics: Visibility drops to 10 ft");
    expect(shown).toContain("treasure: A lost merchant's strongbox");
  });

  it("is a fight with no prep when Hob names none, as every proposal before this was", async () => {
    const croaker = await run(
      Effect.flatMap(Creatures, (creatures) =>
        creatures.libraryCreate({
          name: "Bullywug Croaker",
          type: "humanoid",
          cr: "1/4",
          ac: 15,
          hp: 11,
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    const { began, proposal } = await offer(
      "A fight in the reeds.",
      toolCallChunks("proposeEncounter", {
        name: "Song in the reeds",
        creatures: [{ creatureId: croaker.id, count: 3 }],
      }),
    );
    expect(proposal).toMatchObject({ target: "encounter", kind: "combat" });
    expect(proposal).not.toHaveProperty("tactics");
    expect(proposal).not.toHaveProperty("challenge");
    const accepted = await as(jo.token, (client) =>
      client.hob.accept({
        params: { campaignId: table, threadId: began.threadId, turnId: began.turnId },
        payload: {},
      }),
    );
    if (accepted.accepted !== "encounter") throw new Error("accepted something else");
    expect(accepted.encounter.kind).toBe("combat");
    expect(await prepOf(jo, table, accepted.encounter.id)).toMatchObject({
      tactics: [],
      treasure: null,
      challenge: null,
    });
  });

  it("refuses, in words Hob can act on, a fight with nobody in it and numbers for the wrong kind", async () => {
    for (const call of [
      { name: "Empty fight" },
      { name: "Chatty", kind: "social", dc: 12 },
      { name: "Half a challenge", kind: "challenge", dc: 12 },
    ]) {
      const { proposal } = await offer("Something.", toolCallChunks("proposeEncounter", call));
      expect(proposal).toBeUndefined();
    }
    // What the model was told, the round after its call.
    const said = JSON.stringify(chat.requests().slice(-6));
    expect(said).toContain("a fight needs at least one creature");
    expect(said).toContain("a social encounter has no challenge");
    expect(said).toContain("a challenge takes dc, successes and failures");
  });
});
