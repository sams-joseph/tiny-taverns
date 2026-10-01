import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type CharacterOwnUpdate,
  Conflict,
  CurrentActor,
  emptyCharacterSheet,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import {
  aCharacterAt,
  accountWide,
  admittedTo,
  anAccount,
  aPlayerAt,
  createCampaign,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * The `Characters` service itself — the **owner's** side of the shared,
 * account-owned character (the captain's continuity decision of 2026-09-01).
 *
 * The campaign side is `repo/Party.ts` and its file is `party.test.ts`; the
 * roster, the seat PATCH, retiring and the cross-campaign hit point live
 * there. What this file owns is the four methods on `Characters` and the two
 * rules that changed shape underneath them:
 *
 * - **the reach is ownership and nothing else.** `ownCharacter` compares
 *   `account_id` to the actor's own account — no campaign, no membership, no
 *   master toggle, no credential scope. A character is campaign-scoped
 *   nowhere, so there is nothing for any of those to be about; the one place
 *   a campaign still appears is `createOwn`'s gate, because creation uses that
 *   campaign's vocabulary context.
 * - **concurrency is explicit.** Every write bumps `version`; a caller that
 *   read the sheet may send `expectedVersion` back and is refused with a
 *   `Conflict` when the row moved on — which, with one character shared
 *   across campaigns, is how two tables editing one sheet notice each other.
 *
 * The old campaign-scoped facts this file used to pin — a DM types the party,
 * `visibility` on the row, `account_id` as inert provenance — are not merely
 * gone, several are deliberately **inverted**, and each inversion is pinned
 * below with its reason rather than silently dropped.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Characters.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Invites.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_characters")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Jo runs the Salt Road (shared) with Pim and Kofi at it; Fen runs Sixpence
 * (shared, Pim admitted there too — one person, two tables, which is the
 * world the continuity decision is about) and the Marsh (never shared, Pim
 * admitted — the master-toggle case).
 *
 * The Salt Road's vocabulary knows Elf → High Elf, so the subrace validation
 * has a pair that resolves and a pair that does not.
 */
const makeFixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const jo = yield* anAccount("Jo");
  const fen = yield* anAccount("Fen");
  const asJo = withActor(jo);
  const asFen = withActor(fen);

  const saltRoad = yield* asJo(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const sixpence = yield* asFen(
    createCampaign({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const marsh = yield* asFen(createCampaign({ name: "The Marsh" }));

  const pim = yield* aPlayerAt(saltRoad.id, "Pim");
  const kofi = yield* aPlayerAt(saltRoad.id, "Kofi");
  yield* admittedTo(sixpence.id, pim, "Pim again");
  yield* admittedTo(marsh.id, pim, "Pim in the marsh");

  // Pim's own Library race: since the instancing decision of 2026-09-02 the
  // vocabulary a player is validated against is `usableInCampaign` — the
  // bundle, their own Library and the group's shares — never a campaign row.
  yield* sql`
    insert into character_option (account_id, kind, name, body, visibility)
    values (
      ${pim.accountId},
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
  `.pipe(Effect.orDie);

  return { jo, fen, pim, kofi, saltRoad, sixpence, marsh };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "characters.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const mine = (actor: Actor) =>
  Effect.flatMap(Characters, (characters) => withActor(actor)(characters.mine));

describeLayer("characters", shared, (it) => {
  describe("mine: what an account owns, wherever it sits", () => {
    it.effect("is empty for an account that owns nothing, rather than a failure", () =>
      Effect.gen(function* () {
        // There is no campaign in the path for a `NotFound` to be about.
        const nobody = yield* anAccount("Nobody");
        expect(yield* mine(nobody)).toEqual([]);
      }),
    );

    it.effect("answers each character with its live seats", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { character, seatId } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Seated Once",
        });
        const owned = (yield* mine(fixture.pim)).find((row) => row.character.id === character.id);
        expect(owned).toBeDefined();
        expect(owned!.seats).toHaveLength(1);
        expect(owned!.seats[0]!.campaignCharacterId).toBe(seatId);
        expect(owned!.seats[0]!.campaignId).toBe(fixture.saltRoad.id);
      }),
    );

    it.effect("drops a retired seat from the seats while the character stays", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const party = yield* Party;
        const { character, seatId } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Left the Table",
        });
        yield* withActor(fixture.pim)(party.leave(fixture.saltRoad.id, seatId));

        const owned = (yield* mine(fixture.pim)).find((row) => row.character.id === character.id);
        expect(owned).toBeDefined();
        expect(owned!.seats).toEqual([]);
      }),
    );

    it.effect("is not narrowed by a campaign-scoped credential, deliberately", () =>
      Effect.gen(function* () {
        // `ownCharacter` applies no scope clause, and that mirrors
        // `libraryRowReadable`'s written reasoning: scope says which *campaign* a
        // credential reaches, and a character is in none — the seat refs beside it
        // are join keys the account already holds, not campaign content. The old
        // per-table narrowing was a fact about a campaign-scoped read that no
        // longer exists.
        const fixture = yield* Fixture;
        const here = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, { name: "Here" });
        // The helper explicitly joins at Sixpence, and that write needs a
        // credential that reaches Sixpence — so the second character is written
        // with the account-wide credential. The read under test is then made with
        // the narrow one.
        const there = yield* aCharacterAt(fixture.sixpence.id, accountWide(fixture.pim), {
          name: "There",
        });

        // `fixture.pim` is already the Salt Road-scoped credential `aPlayerAt`
        // mints, so this read *is* the scoped one.
        const ids = (yield* mine(fixture.pim)).map((row) => row.character.id);
        expect(ids).toContain(here.character.id);
        expect(ids).toContain(there.character.id);
      }),
    );
  });

  describe("createOwn: campaign context, and the gate", () => {
    it.effect("refuses a campaign this account is not a member of", () =>
      Effect.gen(function* () {
        // Fen is a stranger to the Salt Road. `NotFound`, not `Forbidden`: "it
        // exists but is not yours" is itself a disclosure.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const refused = yield* withActor(fixture.fen)(
          characters.createOwn(fixture.saltRoad.id, { name: "A ringer" }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
        expect((refused as NotFound).resource).toBe("campaign");
      }),
    );

    it.effect("refuses a player at a campaign its creator has not shared", () =>
      Effect.gen(function* () {
        // The master toggle still gates the context: a player cannot use a table's
        // vocabulary/Hob prompt before that table is shared, so an unshared table
        // reads as nothing to a player — the same answer everything else there
        // gives them.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const refused = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.marsh.id, { name: "Mott" }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("writes only the character row, owned by the credential", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const character = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.saltRoad.id, {
            name: "Brannoc",
            playerName: "Pim",
            level: 3,
            race: "Half-orc",
            className: "Paladin",
            ac: 18,
            hpMax: 52,
          }),
        );

        // The owner comes from `CurrentActor`; the payload has nowhere to name an
        // account, which is the boundary's stronger form.
        expect(character.accountId).toBe(fixture.pim.accountId);
        expect(character.descriptor).toBe("Level 3 Half-orc Paladin");
        // Null means nobody has said — not zero, not full.
        expect(character.hpCurrent).toBeNull();
        expect(character.version).toBe(1);
        expect(character.origin).toBe("authored");

        // The campaign was context only. Seating is the explicit `party.join` act,
        // so creation creates no campaign row to disclose.
        const sql = yield* SqlClient.SqlClient;
        const seats = yield* sql<{ readonly count: string }>`
          select count(*)::text as count from campaign_character
          where campaign_id = ${fixture.saltRoad.id} and character_id = ${character.id}
        `;
        expect(Number(seats[0]!.count)).toBe(0);
      }),
    );

    it.effect("reads back the empty document when no sheet was written", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Bare",
        });
        expect(character.sheet).toEqual(emptyCharacterSheet);
        expect(character.sheetUrl).toBeNull();
      }),
    );

    it.effect("refuses a subrace the campaign's race does not contain, and one with no race", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const orphaned = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.saltRoad.id, {
            name: "Wrong Child",
            race: "Elf",
            subrace: "Hill Dwarf",
          }),
        ).pipe(Effect.flip);
        expect(orphaned).toBeInstanceOf(Conflict);

        const raceless = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.saltRoad.id, { name: "No Root", subrace: "High Elf" }),
        ).pipe(Effect.flip);
        expect(raceless).toBeInstanceOf(Conflict);

        // A race the vocabulary has never heard of still stands alone — free text
        // has been legal since the columns arrived, and a subrace the race really
        // contains resolves.
        const freeText = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.saltRoad.id, { name: "Homebrew", race: "Saltborn" }),
        );
        expect(freeText.race).toBe("Saltborn");
        const resolved = yield* withActor(fixture.pim)(
          characters.createOwn(fixture.saltRoad.id, {
            name: "Known Pair",
            race: "Elf",
            subrace: "High Elf",
          }),
        );
        expect(resolved.descriptor).toBe("High Elf");
      }),
    );
  });

  describe("updateOwn: the owner's write, campaign-free", () => {
    it.effect("moves the durable columns and the descriptor follows, with no second write", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Riser",
          level: 3,
          race: "Half-orc",
          className: "Paladin",
        });
        const levelled = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 4 }),
        );
        expect(levelled.descriptor).toBe("Level 4 Half-orc Paladin");

        const cleared = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: null }),
        );
        expect(cleared.descriptor).toBe("Half-orc Paladin");
      }),
    );

    it.effect("refuses everybody but the owner — the campaign's creator included", () =>
      Effect.gen(function* () {
        // The creator runs the table the character sits at and still cannot edit
        // the sheet: the durable half belongs to the person, and what a campaign
        // may move is the live trio, through the seat (`party.test.ts`).
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Pim's Alone",
        });

        const asKofi = yield* withActor(fixture.kofi)(
          characters.updateOwn(character.id, { level: 9 }),
        ).pipe(Effect.flip);
        const asCreator = yield* withActor(fixture.jo)(
          characters.updateOwn(character.id, { level: 9 }),
        ).pipe(Effect.flip);
        expect(asKofi).toBeInstanceOf(NotFound);
        expect(asCreator).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("keeps working while the campaign is unshared, and after every seat is retired", () =>
      Effect.gen(function* () {
        // **Deliberately inverted.** The old rule — unsharing the campaign took a
        // player's write away and sharing gave it back — was a fact about a
        // campaign-scoped row. Under the continuity decision of 2026-09-01 the
        // character is the account's, top-level, and a table's toggle says who at
        // *that table* may see the seat — it has no purchase on whether the owner
        // may edit their own sheet between games, or after leaving every table.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const party = yield* Party;
        const { character, seatId } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Constant",
        });

        yield* withActor(fixture.jo)(
          Effect.flatMap(Campaigns, (campaigns) =>
            campaigns.update(fixture.saltRoad.id, { visibility: "dm" }),
          ),
        );
        const whileUnshared = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 2 }),
        );
        expect(whileUnshared.level).toBe(2);
        yield* withActor(fixture.jo)(
          Effect.flatMap(Campaigns, (campaigns) =>
            campaigns.update(fixture.saltRoad.id, { visibility: "shared" }),
          ),
        );

        yield* withActor(fixture.pim)(party.leave(fixture.saltRoad.id, seatId));
        const afterLeaving = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 3 }),
        );
        expect(afterLeaving.level).toBe(3);
      }),
    );

    it.effect("bumps the version on every write", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Counter",
        });
        expect(character.version).toBe(1);
        const second = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 2 }),
        );
        expect(second.version).toBe(2);
        const third = yield* withActor(fixture.pim)(characters.updateOwn(character.id, { ac: 15 }));
        expect(third.version).toBe(3);
      }),
    );

    it.effect("refuses a stale expectedVersion with a Conflict naming both numbers", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Contested",
        });

        // Sending the version back is the opt-in; matching, the write lands.
        const current = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { expectedVersion: 1, level: 2 }),
        );
        expect(current.version).toBe(2);

        // A second writer holding the same stale read is refused — which, with
        // one character shared across campaigns, is how two tables editing one
        // sheet notice each other instead of silently overwriting.
        const stale = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { expectedVersion: 1, level: 9 }),
        ).pipe(Effect.flip);
        expect(stale).toBeInstanceOf(Conflict);
        expect((stale as Conflict).message).toContain("version 2");
        expect((stale as Conflict).message).toContain("you read 1");

        // The refused write moved nothing.
        const after = (yield* mine(fixture.pim)).find((row) => row.character.id === character.id);
        expect(after?.character.level).toBe(2);
        expect(after?.character.version).toBe(2);
      }),
    );

    it.effect("stays last-writer-wins when expectedVersion is omitted", () =>
      Effect.gen(function* () {
        // The old behaviour, opted into rather than silently the only option: a
        // client that never read the counter is not broken by its existence.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Old Habits",
        });
        const first = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 2 }),
        );
        const second = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { level: 5 }),
        );
        expect(first.version).toBe(2);
        expect(second.version).toBe(3);
        expect(second.level).toBe(5);
      }),
    );

    it.effect("validates a race change against every table the character sits at", () =>
      Effect.gen(function* () {
        // Seated at the Salt Road and at Sixpence; only the Salt Road's
        // vocabulary knows Elf → High Elf. One resolving table is enough — one
        // character crossing campaigns cannot be bound to one table's vocabulary,
        // which is the continuity decision's own consequence — and a pair no
        // seated table knows is a `Conflict`.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Crosser",
        });
        const owner = accountWide(fixture.pim);
        yield* withActor(owner)(
          Effect.flatMap(Party, (p) => p.join(fixture.sixpence.id, { characterId: character.id })),
        );

        const resolved = yield* withActor(owner)(
          characters.updateOwn(character.id, { race: "Elf", subrace: "High Elf" }),
        );
        expect(resolved.subrace).toBe("High Elf");

        const refused = yield* withActor(owner)(
          characters.updateOwn(character.id, { race: "Elf", subrace: "Hill Dwarf" }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(Conflict);
      }),
    );

    it.effect("checks against the core rules once no live seat remains", () =>
      Effect.gen(function* () {
        // With no readable campaign the sheet reads the core rules
        // (`characterVocabulary`), which have no Sixpence Elf.
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const party = yield* Party;
        const { character, seatId } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Wanderer",
        });
        yield* withActor(fixture.pim)(party.leave(fixture.saltRoad.id, seatId));

        const refused = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { race: "Elf", subrace: "Sixpence Elf" }),
        ).pipe(Effect.flip);
        expect(refused).toBeInstanceOf(Conflict);
        // A race label with no subrace is still free text.
        const written = yield* withActor(fixture.pim)(
          characters.updateOwn(character.id, { race: "Sixpence Elf" }),
        );
        expect(written.race).toBe("Sixpence Elf");
      }),
    );

    it("has no field for a live value, the owner, the toggle, or the counter itself", () => {
      // The structural half of the boundary, `PlayerSessionRecap`'s rule met on
      // the write side: a payload that *can* carry `hpCurrent` is one that
      // eventually will. One object literal per refused key, because an
      // excess-property check reports only the first offender and stops.
      // @ts-expect-error — a hit point moves by delta, through the seat
      const hpCurrent: CharacterOwnUpdate = { hpCurrent: 1 };
      // @ts-expect-error — the live trio is the table's
      const tempHp: CharacterOwnUpdate = { tempHp: 1 };
      // @ts-expect-error — the live trio is the table's
      const conditions: CharacterOwnUpdate = { conditions: [] };
      // @ts-expect-error — disclosure is the seat's column now, per campaign
      const visibility: CharacterOwnUpdate = { visibility: "shared" };
      // @ts-expect-error — the owner is the credential's, never the payload's
      const accountId: CharacterOwnUpdate = { accountId: "someone" };
      // @ts-expect-error — the counter is bumped by the server; the payload carries expectedVersion
      const version: CharacterOwnUpdate = { version: 4 };
      expect([hpCurrent, tempHp, conditions, visibility, accountId, version]).toHaveLength(6);
    });

    it.effect("cannot write the descriptor, by anything, at any level", () =>
      Effect.gen(function* () {
        // No `descriptor` field on the payload is the first refusal; the column
        // being `generated always` is the second, and it holds against raw SQL.
        const fixture = yield* Fixture;
        const { character } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Labelled",
        });
        const sql = yield* SqlClient.SqlClient;
        const refused =
          yield* sql`update character set descriptor = 'Something else' where id = ${character.id}`.pipe(
            Effect.result,
          );
        expect(refused._tag).toBe("Failure");
      }),
    );
  });

  describe("removeOwn", () => {
    it.effect("is the owner's, retires the seat, and a second delete is a NotFound", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const characters = yield* Characters;
        const { character, seatId } = yield* aCharacterAt(fixture.saltRoad.id, fixture.pim, {
          name: "Short-lived",
        });

        const asKofi = yield* withActor(fixture.kofi)(characters.removeOwn(character.id)).pipe(
          Effect.flip,
        );
        expect(asKofi).toBeInstanceOf(NotFound);

        yield* withActor(fixture.pim)(characters.removeOwn(character.id));
        expect((yield* mine(fixture.pim)).map((row) => row.character.id)).not.toContain(
          character.id,
        );
        // The seat retired with it — the deep pin is `party.test.ts`'s; this is
        // the light half, so a regression here fails close to its subject.
        const sql = yield* SqlClient.SqlClient;
        const seats = yield* sql<{ readonly left_at: Date | null }>`
          select left_at from campaign_character where id = ${seatId}
        `;
        expect(seats[0]?.left_at).not.toBeNull();

        const again = yield* withActor(fixture.pim)(characters.removeOwn(character.id)).pipe(
          Effect.flip,
        );
        expect(again).toBeInstanceOf(NotFound);
      }),
    );
  });
});
