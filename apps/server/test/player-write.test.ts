import {
  type Actor,
  type Character,
  type CharacterId,
  Conflict,
  CharacterOwnUpdate,
  CurrentActor,
  type NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  accountWide,
  aPlayerAt,
  anAccount,
  asDm,
  createCampaign,
  scopedTo,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **The owner's PATCH over the shared sheet** — `PATCH /me/characters/:id`
 * under the continuity decision of 2026-09-01, and the negative space around
 * it.
 *
 * A character is one account-owned row of playable state now, shared across
 * every campaign that seats it, so the write this file pins is bounded by two
 * different kinds of thing:
 *
 * - **which rows** — `ownCharacter`: yours, and nothing else. The old
 *   campaign clauses are *gone from the predicate on purpose*: the campaign
 *   was never the owner of the sheet, and three of the old refusals are
 *   therefore **inverted** below (unshared table, revoked membership,
 *   mis-scoped credential) with the reasoning spelled out at each;
 * - **which columns** — `CharacterOwnUpdate`, which still has no field for
 *   `hpCurrent`, `tempHp` or `conditions` (the live trio moves through a
 *   seat: `party.damage` and the seat PATCH), none for an owner, and none for
 *   a disclosure toggle (the seat's `visibility` is the campaign's fact).
 *
 * New here: **the version counter.** Every write bumps `character.version`;
 * `expectedVersion` opts into optimistic concurrency and a stale one is a
 * `Conflict` — the decision's explicit answer to two tables editing one
 * sheet, instead of an accidental last-writer-wins.
 *
 * In order —
 *
 *   1. the grant: the owner edits the shared sheet, campaign-free
 *   2. the version: the concurrency the shared sheet made necessary
 *   3. the columns: the live half is not expressible
 *   4. the rows: what still refuses, and what deliberately no longer does
 *   5. the campaign's own surface: the seat, not the sheet
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    Characters.layer,
    Party.layer.pipe(Layer.provide(LiveEvents.layer)),
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    CampaignCreatorActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    Invites.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_player_write"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One shared table whose two players each wrote their own character down —
 * the only way a character is made now — plus a stranger's table. Something
 * to fight, so a live fight below is a real one rather than an empty run.
 */
const makeFixture = Effect.gen(function* () {
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const party = yield* Party;
  const roster = yield* EncounterCreatures;

  const jo = yield* anAccount("Jo");
  const asJo = withActor(jo);
  const table = yield* asJo(createCampaign({ name: "The Salt Road", visibility: "shared" }));

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const brannoc = yield* withActor(pim)(
    characters.createOwn(table.id, {
      name: "Brannoc",
      playerName: "Pim",
      level: 3,
      race: "Half-orc",
      className: "Paladin",
      ac: 16,
      hpMax: 32,
    }),
  );
  yield* withActor(pim)(party.join(table.id, { characterId: brannoc.id }));
  const sorrel = yield* withActor(marta)(characters.createOwn(table.id, { name: "Sorrel" }));
  yield* withActor(marta)(party.join(table.id, { characterId: sorrel.id }));

  const goblin = yield* asJo(
    creatures.libraryCreate({
      name: "Goblin Archer",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
    }),
  );
  const encounter = yield* asJo(encounters.create(table.id, { name: "Ambush in the reeds" }));
  yield* asJo(roster.create(table.id, encounter.id, { creatureId: goblin.id, count: 2 }));

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  return {
    jo,
    joAsDm: yield* asJo(asDm(jo, table.id)),
    pim,
    marta,
    fen,
    table,
    elsewhere,
    brannoc,
    sorrel,
    encounter,
  };
});

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];
let party: (typeof Party)["Service"];
let sql: SqlClient.SqlClient;

/** The owner's own PATCH, as a `Result` so a refusal is a value. */
const editOwn = (actor: Actor, id: CharacterId, patch: CharacterOwnUpdate) =>
  runtime.runPromise(
    withActor(actor)(characters.updateOwn(id, patch)).pipe(Effect.result, Effect.orDie),
  );

/** The row as its owner reads it back — the honest state after a refusal. */
const asOwned = async (owner: Actor, id: CharacterId): Promise<Character> => {
  const mine = await runtime.runPromise(withActor(owner)(characters.mine).pipe(Effect.orDie));
  const found = mine.find((row) => row.character.id === id);
  expect(found).toBeDefined();
  return found!.character;
};

/** A fresh character of the given owner's at the fixture table, plus its explicit seat. */
const aFresh = async (owner: Actor, name: string, hpMax = 30) => {
  const made = await runtime.runPromise(
    withActor(owner)(characters.createOwn(fixture.table.id, { name, hpMax })).pipe(Effect.orDie),
  );
  const joined = await runtime.runPromise(
    withActor(owner)(party.join(fixture.table.id, { characterId: made.id })).pipe(Effect.orDie),
  );
  return { made, seatId: joined.seat.id };
};

/** What a refusal actually said, for the record rather than only its tag. */
const refusal = (result: { readonly _tag: string; readonly failure?: unknown }) =>
  result._tag === "Failure"
    ? {
        _tag: (result.failure as NotFound)._tag,
        resource: (result.failure as NotFound).resource,
      }
    : { _tag: "Success", resource: "—" };

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
  characters = await runtime.runPromise(Characters);
  party = await runtime.runPromise(Party);
  sql = await runtime.runPromise(SqlClient.SqlClient);
}, 60_000);

describe("the grant: the owner edits the shared sheet", () => {
  it("writes every durable column, and the descriptor follows the ones it derives from", async () => {
    const result = await editOwn(fixture.pim, fixture.brannoc.id, {
      name: "Brannoc Duskharrow",
      playerName: "Pim",
      level: 5,
      race: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
      sheetUrl: "https://example.invalid/brannoc",
      sheet: {
        notes: "Owes the ferryman a name.",
        abilities: [{ label: "STR", score: "18", modifier: "+4", save: "+7", proficient: true }],
        traits: [{ name: "Lay on Hands", text: "A pool of 25." }],
        journal: [{ session: 11, text: "The ferryman took the coin." }],
      },
    });

    expect(result._tag).toBe("Success");
    const after = await asOwned(fixture.pim, fixture.brannoc.id);
    expect(after.name).toBe("Brannoc Duskharrow");
    expect(after.level).toBe(5);
    expect(after.ac).toBe(18);
    expect(after.hpMax).toBe(52);
    expect(after.sheetUrl).toBe("https://example.invalid/brannoc");
    expect(after.sheet.journal).toEqual([{ session: 11, text: "The ferryman took the coin." }]);
    // Derived, not sent — `descriptor` is a generated column and appears in no
    // payload. Levelling up is the write the whole decision is about.
    expect(after.descriptor).toBe("Level 5 Half-orc Paladin");
  });

  it("leaves the owner and provenance where they were, and carries no disclosure toggle", async () => {
    const after = await asOwned(fixture.pim, fixture.brannoc.id);
    expect(after.accountId).toBe(fixture.pim.accountId);
    expect(after.origin).toBe("authored");
    // Who at a table may see them is the SEAT's fact, not the sheet's — there
    // is no `visibility` on the shared character at all.
    expect("visibility" in after).toBe(false);
  });

  it("works while the table is unshared — inverted from the campaign-scoped model", async () => {
    // **The continuity decision's sharpest consequence.** The old predicate
    // composed the campaign's master toggle, so unsharing the table took the
    // owner's own sheet away; the shared character is campaign-scoped
    // nowhere, so the campaign has no say left. What unsharing still governs
    // is everything read *through the table* — the roster, search, the
    // fight — not the owner's own property.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const quiet = yield* asJo(createCampaign({ name: "Not yet", visibility: "shared" }));
        const ilse = yield* aPlayerAt(quiet.id, "Ilse");
        const made = yield* withActor(ilse)(characters.createOwn(quiet.id, { name: "Ilse's own" }));

        yield* asJo(campaigns.update(quiet.id, { visibility: "dm" }));
        const closed = yield* withActor(ilse)(characters.updateOwn(made.id, { level: 4 })).pipe(
          Effect.result,
        );

        return { closed: closed._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.closed).toBe("Success");
  }, 60_000);

  it("survives the membership being revoked — the sheet was never the table's", async () => {
    // **Inverted, deliberately.** Revocation retires the SEAT (measured in
    // `player-create.test.ts` and `party.test.ts`); the character and the
    // owner's write over it outlive the table.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(createCampaign({ name: "The Weir", visibility: "shared" }));
        const kofi = yield* aPlayerAt(scratch.id, "Kofi");
        const made = yield* withActor(kofi)(
          characters.createOwn(scratch.id, { name: "Kofi's own" }),
        );
        yield* withActor(kofi)(party.join(scratch.id, { characterId: made.id }));

        const creator = yield* asDm(fixture.jo, scratch.id);
        const issued = yield* invites.listForCampaign(creator);
        yield* invites.revokeForCampaign(creator, issued[0]!.id);

        const after = yield* withActor(accountWide(kofi))(
          characters.updateOwn(made.id, { level: 3 }),
        ).pipe(Effect.result);
        return { after: after._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.after).toBe("Success");
  }, 60_000);

  it("survives a credential minted for another table — ownership carries no scope", async () => {
    // **Inverted, deliberately, and the one inversion that needs its argument
    // written down.** `ownCharacter` applies no credential-scope clause, for
    // `libraryRowReadable`'s documented reason: `Actor.scope` says which
    // *campaign or group* a credential reaches, and a top-level character is
    // in none for it to be about. Whoever mints the first scoped credential
    // over HTTP inherits this knowingly rather than by audit. What scope
    // still narrows is every campaign-side read and the create's gate.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    const result = await editOwn(misScoped, fixture.brannoc.id, { playerName: "Pim D." });
    expect(result._tag).toBe("Success");
  });
});

describe("the version: two tables, one sheet, no silent overwrite", () => {
  it("bumps on every write, and the answer carries it", async () => {
    const { made } = await aFresh(fixture.pim, "Counted");
    expect(made.version).toBe(1);

    const first = await editOwn(fixture.pim, made.id, { level: 2 });
    expect(first._tag === "Success" && first.success.version).toBe(2);
    const second = await editOwn(fixture.pim, made.id, { level: 3 });
    expect(second._tag === "Success" && second.success.version).toBe(3);
  });

  it("refuses a stale expectedVersion with a Conflict, and writes nothing", async () => {
    const { made } = await aFresh(fixture.pim, "Contended");

    // Two readers open the sheet at version 1. The first writes…
    const winner = await editOwn(fixture.pim, made.id, { level: 2, expectedVersion: 1 });
    expect(winner._tag).toBe("Success");

    // …and the second, still holding version 1, is told rather than silently
    // undone. This is the shape two campaigns editing one shared sheet takes.
    const loser = await editOwn(fixture.pim, made.id, { level: 9, expectedVersion: 1 });
    expect(loser._tag).toBe("Failure");
    expect(loser._tag === "Failure" && loser.failure).toBeInstanceOf(Conflict);

    const after = await asOwned(fixture.pim, made.id);
    expect(after.level).toBe(2);
    expect(after.version).toBe(2);
  });

  it("accepts the current expectedVersion, which is the opt-in working", async () => {
    const { made } = await aFresh(fixture.pim, "Careful");
    const result = await editOwn(fixture.pim, made.id, { level: 2, expectedVersion: 1 });
    expect(result._tag).toBe("Success");
    expect(result._tag === "Success" && result.success.version).toBe(2);
  });

  it("stays last-writer-wins when omitted — the old behaviour, opted into", async () => {
    const { made } = await aFresh(fixture.pim, "Careless");
    await editOwn(fixture.pim, made.id, { level: 2 });
    const second = await editOwn(fixture.pim, made.id, { level: 7 });
    expect(second._tag).toBe("Success");
    expect((await asOwned(fixture.pim, made.id)).level).toBe(7);
  });
});

describe("the columns: the live half is not expressible", () => {
  it("refuses a subrace that no seated campaign's vocabulary contains", async () => {
    // Subraces are not a fourth option kind. A shared character crossing
    // campaigns cannot be bound to one table's vocabulary, so the pair has to
    // resolve through SOME campaign the character is seated at — here there is
    // exactly one, and the Elf its vocabulary offers has no Hill Dwarf. The
    // vocabulary is `usableInCampaign` since the instancing decision of
    // 2026-09-02, so the race is the reader's own Library original rather than
    // a campaign copy — exactly what the create form would have offered Pim.
    await runtime.runPromise(
      sql`
        insert into character_option (account_id, kind, name, body, visibility)
        values (
          ${fixture.pim.accountId},
          'race',
          'Elf',
          ${JSON.stringify({
            speed: 30,
            size: "Medium",
            abilityBonuses: [{ ability: "DEX", amount: 2 }],
            hpPerLevel: 0,
            traits: [],
            subraces: [{ name: "High Elf", abilityBonuses: [{ ability: "INT", amount: 1 }] }],
          })}::jsonb,
          'shared'
        )
      `.pipe(Effect.orDie),
    );

    const result = await editOwn(fixture.pim, fixture.brannoc.id, {
      race: "Elf",
      subrace: "Hill Dwarf",
    });

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(Conflict);
    expect((await asOwned(fixture.pim, fixture.brannoc.id)).race).toBe("Half-orc");

    // The contained pair goes through.
    const contained = await editOwn(fixture.pim, fixture.brannoc.id, {
      race: "Elf",
      subrace: "High Elf",
    });
    expect(contained._tag).toBe("Success");
    // Put the fixture back for the tests below.
    await editOwn(fixture.pim, fixture.brannoc.id, { race: "Half-orc", subrace: null });
  });

  it("falls back to free text when the character is seated nowhere", async () => {
    // No live seats means no vocabulary to resolve against — the same rule an
    // unmatched race label has always had, met from the seatless side.
    const { made, seatId } = await aFresh(fixture.pim, "Wanderer");
    await runtime.runPromise(
      withActor(fixture.pim)(party.leave(fixture.table.id, seatId)).pipe(Effect.orDie),
    );
    const result = await editOwn(fixture.pim, made.id, {
      race: "Utter Homebrew",
      subrace: "Even More So",
    });
    expect(result._tag).toBe("Success");
  });

  it("has no field for a live value, an owner, or a disclosure toggle", () => {
    // The structural half of the boundary, `PlayerSessionRecap`'s rule met on
    // the write side: a payload that *can* carry `hpCurrent` is one that
    // eventually will, so the refusal is the schema's shape rather than a
    // check. The live trio's writers are the seat's now — `party.damage` for
    // the delta and the seat PATCH for `conditions` — and `tempHp` currently
    // has no writer anywhere, which is a product gap and not this schema's.
    expect(Object.keys(CharacterOwnUpdate.fields).sort()).toEqual([
      "ac",
      "className",
      "expectedVersion",
      "hpMax",
      "level",
      "name",
      "playerName",
      "race",
      "sheet",
      "sheetUrl",
      "subrace",
    ]);
  });

  it("drops a live value a caller writes anyway, before it reaches the network", () => {
    // The derived client encodes through this schema, so a payload naming
    // `hpCurrent` does not reach the server at all — and if one did, the
    // server decodes through the same schema. Both directions, both silent.
    const sent = { name: "Brannoc", hpCurrent: 1, tempHp: 9, conditions: ["Poisoned"] };
    expect(Schema.encodeUnknownSync(CharacterOwnUpdate)(sent as never)).toEqual({
      name: "Brannoc",
    });
    expect(Schema.decodeUnknownSync(CharacterOwnUpdate)(sent)).toEqual({ name: "Brannoc" });
  });

  it("moves no live column of the character it does write", async () => {
    // The table hurts them and marks them — through the seat, which is the
    // only campaign-side surface left — then the owner edits the sheet. What
    // the table set is what is still there.
    const { made, seatId } = await aFresh(fixture.pim, "Marked", 30);
    await runtime.runPromise(
      withActor(fixture.jo)(
        Effect.gen(function* () {
          yield* party.damage(fixture.table.id, seatId, { amount: 20 });
          yield* party.update(fixture.table.id, seatId, { conditions: ["Concentrating"] });
        }),
      ).pipe(Effect.orDie),
    );
    const before = await asOwned(fixture.pim, made.id);
    expect(before.hpCurrent).toBe(10);
    expect(before.conditions).toEqual(["Concentrating"]);

    await editOwn(fixture.pim, made.id, { name: "Marked and renamed", level: 5 });

    const after = await asOwned(fixture.pim, made.id);
    expect(after.hpCurrent).toBe(10);
    expect(after.conditions).toEqual(["Concentrating"]);
  }, 60_000);

  it("touches nothing in a fight that is on the table", async () => {
    // *"Never anything inside a live fight"* in its strongest available form:
    // not a refusal at fight time, but one statement against one row, because
    // nothing a combatant holds is expressible in the payload. A combatant
    // snapshots `display_name`, `subtitle`, `player_name`, `ac` and `hp_max`
    // at seed time and never reads them back.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const runs = yield* EncounterRuns;
        const combatants = yield* Combatants;
        const sessions = yield* Sessions;
        const asJo = withActor(fixture.jo);

        const night = yield* asJo(sessions.create(fixture.table.id, { number: 401 }));
        const run = yield* asJo(
          runs.start(fixture.joAsDm, night.id, { encounterId: fixture.encounter.id }),
        );
        const seat = () =>
          Effect.map(asJo(combatants.list(fixture.joAsDm, night.id, run.id)), (list) =>
            list.find((entry) => entry.characterId === fixture.brannoc.id)!,
          );
        const before = yield* seat();

        const edited = yield* withActor(fixture.pim)(
          characters.updateOwn(fixture.brannoc.id, {
            name: "Brannoc the Unwelcome",
            ac: 20,
            hpMax: 61,
          }),
        ).pipe(Effect.result);

        const after = yield* seat();
        yield* asJo(runs.end(fixture.joAsDm, night.id, run.id));
        return { edited: edited._tag, before, after };
      }).pipe(Effect.orDie),
    );

    expect(measured.edited).toBe("Success");
    // The fight's copy is the fight's, and the seed's snapshot is what a
    // mid-fight rename must not be able to move.
    expect(measured.after).toEqual(measured.before);
  }, 60_000);
});

describe("the rows: what still refuses", () => {
  it("refuses another owner's character, and writes nothing", async () => {
    // Marta's Sorrel is a real row at a table Pim really sits at. The refusal
    // is `NotFound` naming the character, because "it exists but is not
    // yours" is itself a disclosure.
    const result = await editOwn(fixture.pim, fixture.sorrel.id, { name: "Not Sorrel" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asOwned(fixture.marta, fixture.sorrel.id)).name).toBe("Sorrel");
  });

  it("refuses the campaign's creator on a sheet that is not theirs", async () => {
    // Table authority is not ownership. The creator has no wider PATCH any
    // more — the old DM character update went with the campaign-scoped row —
    // so their whole surface over Brannoc is the SEAT: visibility, the
    // display line, conditions and the delta, pinned in the section below.
    const result = await editOwn(fixture.jo, fixture.brannoc.id, { name: "Renamed by the DM" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asOwned(fixture.pim, fixture.brannoc.id)).name).toBe("Brannoc the Unwelcome");
  });

  it("refuses a character that does not exist, with the same sentence", async () => {
    // The seam gives one answer, so a caller cannot probe for ids.
    const invented = "2b1f2a1e-0000-4000-8000-00000000c0de" as CharacterId;
    expect(refusal(await editOwn(fixture.pim, invented, { level: 2 }))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
  });

  it("keeps the write exactly as narrow as ownership, measured over the roster", async () => {
    // The old file measured "the write is no wider than the read" across the
    // campaign's characters; the surviving form of that property is that the
    // table can SHOW you a sheet you still cannot write. The creator shares
    // Sorrel's seat, Pim sees the character on the roster in full — hit
    // points and all, which is what sharing a seat means — and the PATCH
    // still refuses.
    const martasSeat = (
      await runtime.runPromise(withActor(fixture.marta)(characters.mine).pipe(Effect.orDie))
    ).find((row) => row.character.id === fixture.sorrel.id)!.seats[0]!;
    await runtime.runPromise(
      withActor(fixture.jo)(
        party.update(fixture.table.id, martasSeat.campaignCharacterId, { visibility: "shared" }),
      ).pipe(Effect.orDie),
    );

    const roster = await runtime.runPromise(
      withActor(fixture.pim)(party.list(fixture.table.id)).pipe(Effect.orDie),
    );
    expect(roster.some((row) => row.character?.id === fixture.sorrel.id)).toBe(true);

    const result = await editOwn(fixture.pim, fixture.sorrel.id, { level: 9 });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
  }, 60_000);
});

describe("the campaign's own surface: the seat, not the sheet", () => {
  it("gives the creator the live trio through the seat, and the owner cannot follow", async () => {
    const { made, seatId } = await aFresh(fixture.pim, "Table's Business", 24);

    // The creator's delta lands on the shared character…
    const after = await runtime.runPromise(
      withActor(fixture.jo)(party.damage(fixture.table.id, seatId, { amount: 6 })).pipe(
        Effect.orDie,
      ),
    );
    expect(after.hpCurrent).toBe(18);

    // …and the owner has no delta and no seat PATCH: the same acts are the
    // ordinary refusal for them, which is the old "a player cannot write a
    // live value" boundary carried onto the row the campaign owns.
    const damage = await runtime.runPromise(
      withActor(fixture.pim)(party.damage(fixture.table.id, seatId, { amount: 6 })).pipe(
        Effect.result,
        Effect.orDie,
      ),
    );
    expect(refusal(damage)).toEqual({ _tag: "NotFound", resource: "campaign_character" });
    const mark = await runtime.runPromise(
      withActor(fixture.pim)(
        party.update(fixture.table.id, seatId, { conditions: ["Prone"] }),
      ).pipe(Effect.result, Effect.orDie),
    );
    expect(refusal(mark)).toEqual({ _tag: "NotFound", resource: "campaign_character" });

    expect((await asOwned(fixture.pim, made.id)).hpCurrent).toBe(18);
  }, 60_000);
});
