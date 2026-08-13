import {
  Actor,
  type Campaign,
  type Character,
  type CharacterId,
  CharacterOwnUpdate,
  CharacterUpdate,
  CurrentActor,
  type NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **The first player write in the product's history**, and the negative space
 * around it.
 *
 * `PATCH /me/characters/:characterId` is the one hole in the write half of
 * `repo/visibility.ts`, opened deliberately by the captain's decision
 * (`player-edits-own-character`) and bounded by two different kinds of thing:
 *
 * - **which rows** — `ownRowWritable`: yours, inside a campaign you hold a live
 *   membership of, through a credential that reaches it, while the DM has
 *   shared it;
 * - **which columns** — `CharacterOwnUpdate`, which has no field for
 *   `hpCurrent`, `tempHp`, `conditions`, `visibility` or `accountId`.
 *
 * A predicate cannot bound a column list and a schema cannot bound a row set, so
 * both halves are pinned separately below and neither is allowed to stand in for
 * the other. In order —
 *
 *   1. the grant: a player edits their own character's durable half
 *   2. the columns: the live half is not expressible, in a fight or out of one
 *   3. the rows: every refusal, each shown failing with the answer it gives
 *   4. what did not change: the DM's writes, and the player's other refusals
 *
 * `character-ownership.test.ts` is the read half of the same column and stays
 * true throughout; the two files together are what ownership does and does not
 * grant.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    DmActors.layer,
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
 * One shared table with two players who each hold a character, one row the DM
 * shared and assigned to nobody, and a second table run by a stranger.
 *
 * Every character is `visibility: "dm"` unless a test needs otherwise — the
 * fail-closed default `CharacterDialog` sends, which is the state a player's own
 * screen actually has to work in.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;

  const jo = yield* anAccount("Jo");
  const asJo = withActor(jo);
  const table = yield* asJo(campaigns.create({ name: "The Salt Road", visibility: "shared" }));

  const pim = yield* aPlayerAt(table.id, "Pim");
  const marta = yield* aPlayerAt(table.id, "Marta");

  const brannoc = yield* asJo(
    characters.create(table.id, {
      name: "Brannoc",
      playerName: "Pim",
      level: 3,
      species: "Half-orc",
      className: "Paladin",
      ac: 16,
      hpMax: 32,
      visibility: "dm",
    }),
  );
  const sorrel = yield* asJo(
    characters.create(table.id, { name: "Sorrel", playerName: "Marta", visibility: "dm" }),
  );
  /**
   * Shared with the table and belonging to nobody — the DM typed it up early.
   *
   * It is the row that separates the two halves of the boundary: a player may
   * *read* it (the DM shared it) and may not *write* it (it is not theirs), so
   * "the write is narrower than the read" is measured against a real row rather
   * than asserted.
   */
  const pell = yield* asJo(
    characters.create(table.id, { name: "Sister Pell", hpMax: 20, visibility: "shared" }),
  );

  yield* asJo(characters.assign(table.id, brannoc.id, { accountId: pim.accountId }));
  yield* asJo(characters.assign(table.id, sorrel.id, { accountId: marta.accountId }));

  /** Something to fight, so a live fight is a real one rather than an empty run. */
  const goblin = yield* asJo(
    creatures.create(table.id, {
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
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const sixpence = yield* withActor(fen)(
    characters.create(elsewhere.id, { name: "Sixpence", visibility: "shared" }),
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
    pell,
    sixpence,
    encounter,
  };
});

let fixture: Effect.Success<typeof makeFixture>;
let characters: (typeof Characters)["Service"];
let sql: SqlClient.SqlClient;

/** The player's own PATCH, as a `Result` so a refusal is a value. */
const editOwn = (actor: Actor, id: CharacterId, patch: CharacterOwnUpdate) =>
  runtime.runPromise(
    withActor(actor)(characters.updateOwn(id, patch)).pipe(Effect.result, Effect.orDie),
  );

/** The DM's PATCH, likewise. */
const editAsDm = (
  actor: Actor,
  campaignId: Campaign["id"],
  id: CharacterId,
  patch: CharacterUpdate,
) =>
  runtime.runPromise(
    withActor(actor)(characters.update(campaignId, id, patch)).pipe(Effect.result, Effect.orDie),
  );

/** The row as the DM sees it — the honest state, whatever a refusal claimed. */
const asWritten = (id: CharacterId): Promise<Character> =>
  runtime.runPromise(
    withActor(fixture.jo)(characters.findById(fixture.table.id, id)).pipe(Effect.orDie),
  );

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
  sql = await runtime.runPromise(SqlClient.SqlClient);
}, 60_000);

describe("the grant: a player edits their own character's durable half", () => {
  it("writes every durable column, and the descriptor follows the three it derives from", async () => {
    const result = await editOwn(fixture.pim, fixture.brannoc.id, {
      name: "Brannoc Duskharrow",
      playerName: "Pim",
      level: 5,
      species: "Half-orc",
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
    const after = await asWritten(fixture.brannoc.id);
    expect(after.name).toBe("Brannoc Duskharrow");
    expect(after.level).toBe(5);
    expect(after.ac).toBe(18);
    expect(after.hpMax).toBe(52);
    expect(after.sheetUrl).toBe("https://example.invalid/brannoc");
    expect(after.sheet.journal).toEqual([{ session: 11, text: "The ferryman took the coin." }]);
    // Derived, not sent — `descriptor` is a generated column and appears in no
    // payload. Levelling up is the write the whole decision is about, and this
    // is the line that follows it.
    expect(after.descriptor).toBe("Level 5 Half-orc Paladin");
  });

  it("leaves the row's visibility, owner and provenance exactly where the DM left them", async () => {
    const after = await asWritten(fixture.brannoc.id);
    expect(after.visibility).toBe("dm");
    expect(after.accountId).toBe(fixture.pim.accountId);
    expect(after.origin).toBe("authored");
  });

  it("works on a row the DM has never shared, which is the ordinary case", async () => {
    // `visibility: "dm"` throughout the fixture. Ownership relaxes the row-level
    // toggle for the read and the write alike; what it does not relax is
    // anything above it, which §3 is about.
    expect((await asWritten(fixture.brannoc.id)).visibility).toBe("dm");
    expect((await editOwn(fixture.pim, fixture.brannoc.id, { level: 5 }))._tag).toBe("Success");
  });

  it("answers the whole row, so a screen needs no second read", async () => {
    const result = await editOwn(fixture.pim, fixture.brannoc.id, { level: 5 });
    expect(result._tag === "Success" && result.success.id).toBe(fixture.brannoc.id);
    expect(result._tag === "Success" && result.success.campaignId).toBe(fixture.table.id);
  });
});

describe("the columns: the live half is not expressible", () => {
  it("has no field for a live value, for the owner, or for the disclosure toggle", () => {
    // The structural half of the boundary. `PlayerSessionRecap`'s rule, met on
    // the write side: a payload that *can* carry `hpCurrent` is one that
    // eventually will, so the answer is a second schema rather than a check.
    expect(Object.keys(CharacterOwnUpdate.fields).sort()).toEqual([
      "ac",
      "className",
      "hpMax",
      "level",
      "name",
      "playerName",
      "sheet",
      "sheetUrl",
      "species",
    ]);

    // And the DM's is the wider one, so the difference is the thing that
    // matters rather than two lists that happen to differ.
    const dmOnly = Object.keys(CharacterUpdate.fields).filter(
      (field) => !(field in CharacterOwnUpdate.fields),
    );
    expect(dmOnly.sort()).toEqual(["conditions", "tempHp", "visibility"]);
  });

  it("drops a live value a caller writes anyway, before it reaches the network", () => {
    // The derived client encodes through this schema, so a payload naming
    // `hpCurrent` does not reach the server at all — and if one did, the
    // server decodes through the same schema. Both directions, both silent,
    // both leaving nothing for the repository to have to refuse.
    const sent = { name: "Brannoc", hpCurrent: 1, tempHp: 9, conditions: ["Poisoned"] };
    expect(Schema.encodeUnknownSync(CharacterOwnUpdate)(sent as never)).toEqual({
      name: "Brannoc",
    });
    expect(Schema.decodeUnknownSync(CharacterOwnUpdate)(sent)).toEqual({ name: "Brannoc" });
  });

  it("moves no live column of the character it does write", async () => {
    // The DM hurts them and marks them, then the player edits their sheet. What
    // the DM set is what is still there.
    await runtime.runPromise(
      withActor(fixture.jo)(
        Effect.gen(function* () {
          yield* characters.damage(fixture.table.id, fixture.brannoc.id, { amount: 20 });
          yield* characters.update(fixture.table.id, fixture.brannoc.id, {
            tempHp: 7,
            conditions: ["Concentrating"],
          });
        }),
      ).pipe(Effect.orDie),
    );
    const before = await asWritten(fixture.brannoc.id);
    expect({ hpCurrent: before.hpCurrent, tempHp: before.tempHp }).toEqual({
      hpCurrent: 32,
      tempHp: 7,
    });

    await editOwn(fixture.pim, fixture.brannoc.id, { name: "Brannoc Duskharrow", level: 5 });

    const after = await asWritten(fixture.brannoc.id);
    expect(after.hpCurrent).toBe(32);
    expect(after.tempHp).toBe(7);
    expect(after.conditions).toEqual(["Concentrating"]);
  }, 60_000);

  it("touches nothing in a fight that is on the table", async () => {
    // *"Never anything inside a live fight"* in its strongest available form:
    // not a refusal at fight time, but one statement against one row, because
    // nothing a combatant holds is expressible in the payload. `conditions` is
    // the only field the DM's PATCH writes through, and a combatant snapshots
    // `display_name`, `subtitle`, `player_name`, `ac` and `hp_max` at seed time
    // and never reads them back.
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

describe("the rows: every refusal, and the answer it gives", () => {
  it("refuses another player's character, and writes nothing", async () => {
    // Marta's Sorrel is a real row in a campaign Pim really is a member of. The
    // refusal is `NotFound` naming the character, because "it exists but is not
    // yours" is itself a disclosure.
    const result = await editOwn(fixture.pim, fixture.sorrel.id, { name: "Not Sorrel" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asWritten(fixture.sorrel.id)).name).toBe("Sorrel");
  });

  it("refuses a character nobody has been assigned, even a shared one", async () => {
    // `account_id = <me>` never matches null, so an unassigned row is not
    // writable by anybody but the DM — and `Sister Pell` is `shared`, which is
    // what isolates ownership from the row's own toggle.
    expect((await asWritten(fixture.pell.id)).accountId).toBeNull();
    const result = await editOwn(fixture.pim, fixture.pell.id, { name: "Claimed" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asWritten(fixture.pell.id)).name).toBe("Sister Pell");
  });

  it("refuses a character in a campaign the account is not a member of", async () => {
    // Written with raw SQL because the product refuses to produce it — the DM's
    // `assign` will not name a stranger — which is the point: this is the
    // predicate answering, with no endpoint in front of it. Pim has never been
    // at Fen's table, and the row is `shared` there.
    await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (client) =>
          client`update character set account_id = ${fixture.pim.accountId}
                 where id = ${fixture.sixpence.id}`,
      ).pipe(Effect.orDie),
    );

    const result = await editOwn(fixture.pim, fixture.sixpence.id, { name: "Smuggled" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });

    const [row] = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (client) =>
          client<{
            readonly name: string;
          }>`select name from character where id = ${fixture.sixpence.id}`,
      ).pipe(Effect.orDie),
    );
    expect(row!.name).toBe("Sixpence");
  });

  it("stops the moment the membership that carried it is revoked", async () => {
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const invites = yield* Invites;
        const asJo = withActor(fixture.jo);

        const scratch = yield* asJo(campaigns.create({ name: "The Weir", visibility: "shared" }));
        const kofi = yield* aPlayerAt(scratch.id, "Kofi");
        const character = yield* asJo(characters.create(scratch.id, { name: "Kofi's own" }));
        yield* asJo(characters.assign(scratch.id, character.id, { accountId: kofi.accountId }));

        const before = yield* withActor(kofi)(
          characters.updateOwn(character.id, { level: 2 }),
        ).pipe(Effect.result);

        // The shipped path: withdrawing the invitation revokes the membership
        // it granted, in one transaction.
        const issued = yield* asJo(invites.list(scratch.id));
        yield* asJo(invites.revoke(scratch.id, issued[0]!.id));

        const after = yield* withActor(kofi)(characters.updateOwn(character.id, { level: 3 })).pipe(
          Effect.result,
        );
        const row = yield* asJo(characters.findById(scratch.id, character.id));
        return { before: before._tag, after: refusal(after), level: row.level };
      }).pipe(Effect.orDie),
    );

    expect(measured.before).toBe("Success");
    expect(measured.after).toEqual({ _tag: "NotFound", resource: "character" });
    // The write that was refused really did not happen.
    expect(measured.level).toBe(2);
  }, 60_000);

  it("does not survive a credential minted for another table", async () => {
    // Membership and credential scope narrow independently, and a write with no
    // campaign in its path is exactly where a missing scope clause would not
    // show up. Pim's own account, scoped to Fen's campaign, cannot write Pim's
    // own character at the table Pim is really a member of.
    const misScoped = scopedTo(fixture.pim, fixture.elsewhere.id);
    const result = await editOwn(misScoped, fixture.brannoc.id, { name: "Out of scope" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asWritten(fixture.brannoc.id)).name).toBe("Brannoc the Unwelcome");
  });

  it("does not lift the campaign's master toggle", async () => {
    // The one narrowing that is easiest to lose, because it is two levels above
    // the row: a campaign the DM has not shared stays closed to its players, and
    // a character inside it is not the exception even to the account that owns
    // it.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const asJo = withActor(fixture.jo);

        const quiet = yield* asJo(campaigns.create({ name: "Not yet", visibility: "dm" }));
        const ilse = yield* aPlayerAt(quiet.id, "Ilse");
        const character = yield* asJo(
          characters.create(quiet.id, { name: "Ilse's own", visibility: "shared" }),
        );
        yield* asJo(characters.assign(quiet.id, character.id, { accountId: ilse.accountId }));

        const closed = yield* withActor(ilse)(
          characters.updateOwn(character.id, { level: 4 }),
        ).pipe(Effect.result);
        yield* asJo(campaigns.update(quiet.id, { visibility: "shared" }));
        const opened = yield* withActor(ilse)(
          characters.updateOwn(character.id, { level: 4 }),
        ).pipe(Effect.result);

        return { closed: refusal(closed), opened: opened._tag };
      }).pipe(Effect.orDie),
    );

    expect(measured.closed).toEqual({ _tag: "NotFound", resource: "character" });
    expect(measured.opened).toBe("Success");
  }, 60_000);

  it("refuses a character that does not exist, with the same sentence", async () => {
    // The seam gives one answer, so a caller cannot probe for ids.
    const invented = "2b1f2a1e-0000-4000-8000-00000000c0de" as CharacterId;
    expect(refusal(await editOwn(fixture.pim, invented, { level: 2 }))).toEqual({
      _tag: "NotFound",
      resource: "character",
    });
  });

  it("is not a wider DM write: the DM cannot use it on a row that is not theirs", async () => {
    // `ownRowWritable` is ownership, not the DM test with something added — so
    // it refuses the campaign's own DM on a character assigned to somebody
    // else. That is the shape working rather than a limitation: the DM has
    // `characters.update`, which is the wider write and is unchanged.
    const result = await editOwn(fixture.jo, fixture.brannoc.id, { name: "Renamed by the DM" });
    expect(refusal(result)).toEqual({ _tag: "NotFound", resource: "character" });
    expect((await asWritten(fixture.brannoc.id)).name).toBe("Brannoc the Unwelcome");
  });
});

describe("what did not change", () => {
  it("leaves the DM's own PATCH writing the whole row, live half included", async () => {
    const result = await editAsDm(fixture.jo, fixture.table.id, fixture.brannoc.id, {
      name: "Brannoc Duskharrow",
      tempHp: 3,
      conditions: ["Poisoned"],
      visibility: "shared",
    });
    expect(result._tag).toBe("Success");

    const after = await asWritten(fixture.brannoc.id);
    expect(after.tempHp).toBe(3);
    expect(after.conditions).toEqual(["Poisoned"]);
    expect(after.visibility).toBe("shared");

    // Put it back, so the file's other reads see the fixture as written.
    await editAsDm(fixture.jo, fixture.table.id, fixture.brannoc.id, { visibility: "dm" });
  });

  it("leaves every other player refusal exactly where it was", async () => {
    // The decision opened one hole, and this is the list of what it did not.
    // `characters.update` is still the DM's — a player editing their own sheet
    // reaches `updateOwn` or nothing.
    const refused = await runtime.runPromise(
      Effect.gen(function* () {
        const as = withActor(fixture.pim);
        const id = fixture.brannoc.id;
        return {
          update: (yield* as(characters.update(fixture.table.id, id, { level: 9 })).pipe(
            Effect.result,
          ))._tag,
          damage: (yield* as(characters.damage(fixture.table.id, id, { amount: 5 })).pipe(
            Effect.result,
          ))._tag,
          assign: (yield* as(
            characters.assign(fixture.table.id, id, { accountId: fixture.marta.accountId }),
          ).pipe(Effect.result))._tag,
          create: (yield* as(characters.create(fixture.table.id, { name: "Mine now" })).pipe(
            Effect.result,
          ))._tag,
          remove: (yield* as(characters.remove(fixture.table.id, id)).pipe(Effect.result))._tag,
        };
      }).pipe(Effect.orDie),
    );

    expect(refused).toEqual({
      update: "Failure",
      damage: "Failure",
      assign: "Failure",
      create: "Failure",
      remove: "Failure",
    });
  });

  it("keeps the write no wider than the read, row for row", async () => {
    // The property the conjoined shape buys: a player cannot write a row they
    // could not read. Measured rather than argued — every character in this
    // campaign, both answers, no row writable that is not readable.
    const measured = await runtime.runPromise(
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly id: CharacterId }>`
          select id from character where campaign_id = ${fixture.table.id} order by created_at
        `;
        const as = withActor(fixture.pim);
        return yield* Effect.forEach(rows, ({ id }) =>
          Effect.gen(function* () {
            const readable = yield* as(characters.findById(fixture.table.id, id)).pipe(
              Effect.result,
            );
            const writable = yield* as(characters.updateOwn(id, {})).pipe(Effect.result);
            return { readable: readable._tag, writable: writable._tag };
          }),
        );
      }).pipe(Effect.orDie),
    );

    expect(measured.length).toBeGreaterThan(1);
    for (const row of measured) {
      if (row.writable === "Success") expect(row.readable).toBe("Success");
    }
    // …and it is genuinely narrower, not merely not-wider: `Sister Pell` is
    // shared and readable and belongs to nobody.
    expect(measured.filter((row) => row.readable === "Success").length).toBeGreaterThan(
      measured.filter((row) => row.writable === "Success").length,
    );
  }, 60_000);
});
