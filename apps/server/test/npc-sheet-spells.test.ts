import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type NpcId,
  type NpcSpellbook,
  type SheetBody,
  type SpellLibraryCreate,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **An NPC sheet's spell picker is a character's, against the NPC's rules.**
 *
 * The picker's read for an NPC's sheet (`NpcSheets.spells` and
 * `librarySpells`), over the real application and Postgres through the client
 * derived from the contract: a campaign NPC's sheet is offered what the
 * campaign uses — its creator's own Library spell among it — and a Library
 * original's the core rules alone, until a copy is seated in a campaign and
 * reads that campaign's on its next read. An NPC with no sheet has no picker;
 * a player at the table, a withdrawn player and a stranger are refused with
 * the campaign's `NotFound`; and another account's original is `NotFound`.
 */

const database = migratedDatabase("taverns_test_npc_sheet_spells");
const services = servicesOver(database);

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

/** The same call, answering the failure rather than dying on it. */
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
          resource:
            typeof error === "object" && error !== null && "resource" in error
              ? String(error.resource)
              : undefined,
        }),
      ),
    ),
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

/** The creator's own homebrew first-level Wizard spell, in their Library. */
const HOMEBREW = "Bog Light";

const homebrew: SpellLibraryCreate = {
  name: HOMEBREW,
  level: 1,
  school: { index: "evocation", name: "Evocation" },
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  classes: [{ index: "wizard", name: "Wizard" }],
};

/** A first-level Wizard's rules half: INT, and two first-level slots. */
const wizardBody: SheetBody = {
  abilities: [{ label: "INT", score: "16", modifier: "+3" }],
  traits: [],
  spellcasting: {
    ability: "INT",
    save: "13",
    attack: "+5",
    slots: [{ level: 1, used: 0, total: 2 }],
    known: [],
  },
};

const spellNames = (book: NpcSpellbook) => book.spells.map((row) => row.spell.name);

const campaignBook = (campaignId: CampaignId, npcId: NpcId) =>
  as(jo.token, (client) => client.npcs.sheetSpells({ params: { campaignId, npcId } }));

const libraryBook = (npcId: NpcId) =>
  as(jo.token, (client) => client.library.npcSheetSpells({ params: { npcId } }));

let jo: Person;
let ilse: Person;
let withdrawn: Person;
let stranger: Person;
let table: CampaignId;
let elsewhere: CampaignId;
/** A campaign NPC with a Wizard's sheet. */
let mirelle: NpcId;
/** A campaign NPC with no sheet. */
let grusk: NpcId;
/** A Library original with the same Wizard's sheet. */
let pell: NpcId;

beforeAll(async () => {
  await run(importSystemEquipment());
  await run(importSystemOptions());
  await run(importSystemSpells());
  jo = await person("Jo");
  ilse = await person("Ilse");
  withdrawn = await person("Wren");
  stranger = await person("Bo");
  await as(jo.token, (client) => client.library.createSpell({ payload: homebrew }));
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  elsewhere = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
    )
  ).id;
  const seatedIlse = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(aCharacterAt(table, seatedIlse, { name: "Tamsin" }, { seatVisibility: "shared" }));
  // Admitted through a real invitation, then withdrawn by the creator.
  await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
    }),
  );

  const anNpc = async (name: string) =>
    (
      await as(jo.token, (client) =>
        client.npcs.create({
          params: { campaignId: table },
          payload: { name, role: "a face at the ford", visibility: "shared" },
        }),
      )
    ).id;
  mirelle = await anNpc("Mirelle");
  grusk = await anNpc("Grusk");
  await as(jo.token, (client) =>
    client.npcs.putSheet({
      params: { campaignId: table, npcId: mirelle },
      payload: { level: 1, className: "Wizard", sheet: wizardBody },
    }),
  );

  pell = (
    await as(jo.token, (client) =>
      client.library.createNpc({ payload: { name: "Old Pell", role: "a Library original" } }),
    )
  ).id;
  await as(jo.token, (client) =>
    client.library.putNpcSheet({
      params: { npcId: pell },
      payload: { level: 1, className: "Wizard", sheet: wizardBody },
    }),
  );
}, 120_000);

describe("a campaign NPC's spell picker", () => {
  it("offers a character's picker against the campaign's rules, homebrew included", async () => {
    const book = await campaignBook(table, mirelle);
    expect(book).toMatchObject({
      npcId: mirelle,
      className: "Wizard",
      level: 1,
      mode: "spellbook",
      highestSlotLevel: 1,
    });
    expect(book.limits).toMatchObject({ cantripsKnown: 3, spellsKnown: 6, prepared: 4 });
    expect(spellNames(book)).toContain("Magic Missile");
    expect(spellNames(book)).toContain("Fire Bolt");
    expect(spellNames(book)).not.toContain("Fireball");
    // The creator's own Library spell is usable in their campaign, as it is to
    // a character seated there.
    expect(spellNames(book)).toContain(HOMEBREW);
  });

  it("follows the sheet's level", async () => {
    const before = await as(jo.token, (client) =>
      client.npcs.sheet({ params: { campaignId: table, npcId: mirelle } }),
    );
    await as(jo.token, (client) =>
      client.npcs.updateSheet({
        params: { campaignId: table, npcId: mirelle },
        payload: { expectedVersion: before!.version, level: 5 },
      }),
    );
    const book = await campaignBook(table, mirelle);
    expect(book).toMatchObject({ level: 5, highestSlotLevel: 3 });
    expect(spellNames(book)).toContain("Fireball");
  });

  it("has none for an NPC with no sheet", async () => {
    expect(
      await attempt(jo.token, (client) =>
        client.npcs.sheetSpells({ params: { campaignId: table, npcId: grusk } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc_sheet" });
  });
});

describe("a Library original's spell picker", () => {
  it("offers the core rules alone, and a copy reads its campaign's", async () => {
    const book = await libraryBook(pell);
    expect(book).toMatchObject({
      npcId: pell,
      className: "Wizard",
      mode: "spellbook",
      highestSlotLevel: 1,
    });
    expect(spellNames(book)).toContain("Magic Missile");
    // The owner's own Library spell is not the core rules, exactly as it is
    // not to an unseated character.
    expect(spellNames(book)).not.toContain(HOMEBREW);
    expect(book.spells.every((row) => row.spell.accountId === null)).toBe(true);

    // The copy rewrites nothing, and its next read is its campaign's.
    const copy = await as(jo.token, (client) =>
      client.npcs.copyFromSource({
        params: { campaignId: table, sourceNpcId: pell },
        payload: {},
      }),
    );
    expect(spellNames(await campaignBook(table, copy.id))).toContain(HOMEBREW);
  });

  it("has none for an original with no sheet", async () => {
    const bare = (
      await as(jo.token, (client) =>
        client.library.createNpc({ payload: { name: "Bare Nell", role: "a Library original" } }),
      )
    ).id;
    expect(
      await attempt(jo.token, (client) =>
        client.library.npcSheetSpells({ params: { npcId: bare } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc_sheet" });
  });
});

describe("nobody but the NPC's owner", () => {
  it("answers a player at the table, a withdrawn player and a stranger the campaign's NotFound", async () => {
    for (const who of [ilse, withdrawn, stranger]) {
      for (const npcId of [mirelle, grusk]) {
        expect(
          await attempt(who.token, (client) =>
            client.npcs.sheetSpells({ params: { campaignId: table, npcId } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound", resource: "campaign" });
      }
    }
  });

  it("refuses another campaign's NPC and a Library original in a campaign's path", async () => {
    const theirs = (
      await as(jo.token, (client) =>
        client.npcs.create({
          params: { campaignId: elsewhere },
          payload: { name: "Mother Sallow", role: "a hag", visibility: "dm" },
        }),
      )
    ).id;
    await as(jo.token, (client) =>
      client.npcs.putSheet({
        params: { campaignId: elsewhere, npcId: theirs },
        payload: { level: 1, className: "Wizard", sheet: wizardBody },
      }),
    );
    for (const npcId of [theirs, pell]) {
      expect(
        await attempt(jo.token, (client) =>
          client.npcs.sheetSpells({ params: { campaignId: table, npcId } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
    }
  });

  it("refuses another account's original and a campaign NPC in the Library's path", async () => {
    expect(
      await attempt(stranger.token, (client) =>
        client.library.npcSheetSpells({ params: { npcId: pell } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
    expect(
      await attempt(jo.token, (client) =>
        client.library.npcSheetSpells({ params: { npcId: mirelle } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
  });
});
