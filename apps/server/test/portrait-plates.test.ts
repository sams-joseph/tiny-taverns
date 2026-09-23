import {
  type Actor,
  type CharacterId,
  CurrentActor,
  type PlayerLiveTable,
  type Visibility,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { PortraitUrls } from "../src/portraits/PortraitUrls.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Party } from "../src/repo/Party.js";
import { PlayerTable } from "../src/repo/PlayerTable.js";
import { Recap } from "../src/repo/Recap.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aCharacterAt, aPlayerAt, anAccount, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A portrait on a plate other than the character's own is the character's
 * visibility, carried to that plate** — the runner's combatant rows and the
 * player table's order, each reaching the picture through the seat
 * (`seatedPortraitColumn`) rather than through `combatant.character_id`.
 *
 * The portraits are planted as ready rows: whether one is drawn is
 * `portraits.test.ts`'s question, and this file's is only who is handed a URL.
 */

const urls = PortraitUrls.layer(Redacted.make("plate-test-secret"));
const live = LiveEvents.layer;

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Groups.layer,
  Characters.layer,
  Combatants.layer.pipe(Layer.provide(live)),
  Party.layer.pipe(Layer.provide(live)),
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(live)),
  Encounters.layer,
  Invites.layer,
  PlayerTable.layer,
  Recap.layer,
  Sessions.layer.pipe(Layer.provide(live)),
).pipe(Layer.provide(urls), Layer.provideMerge(migratedDatabase("taverns_test_portrait_plates")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** A drawn portrait's row, as the worker leaves it; returns its id. */
const plantPortrait = (characterId: CharacterId, owner: Actor) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly id: string }>`
      insert into character_portrait ${sql.insert({
        character_id: characterId,
        account_id: owner.accountId,
        state: "ready",
        prompt: "a portrait",
        model: "scripted",
        storage_prefix: `portraits/${owner.accountId}/${characterId}/planted`,
        original_type: "image/png",
        content_sha256: Buffer.from([0]),
        width: 1,
        height: 1,
        original_bytes: 1,
        stored_bytes: 1,
        finished_at: new Date(),
      })}
      returning id
    `;
    return rows[0]!.id;
  });

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;
  const combatants = yield* Combatants;
  const sql = yield* SqlClient.SqlClient;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const pim = yield* aPlayerAt(campaign.id, "Pim");
  const wren = yield* aPlayerAt(campaign.id, "Wren");
  const loner = yield* aPlayerAt(campaign.id, "Loner");

  const { character: brannoc, seatId: brannocSeat } = yield* aCharacterAt(
    campaign.id,
    pim,
    { name: "Brannoc", race: "Half-orc", className: "Paladin", hpMax: 52 },
    { seatVisibility: "shared" },
  );
  // The planted hidden seat: its character is in the fight and its combatant
  // row is shared, but the seat is the creator's alone.
  const { character: nessa, seatId: nessaSeat } = yield* aCharacterAt(
    campaign.id,
    wren,
    { name: "Nessa", className: "Ranger", hpMax: 34 },
    { seatVisibility: "dm" },
  );
  // A character seated nowhere here, which a combatant row still points at.
  const unseated = yield* withActor(loner)(
    characters.createOwn(campaign.id, { name: "Between Tables", hpMax: 20 }),
  );

  const portraits = {
    brannoc: yield* plantPortrait(brannoc.id, pim),
    nessa: yield* plantPortrait(nessa.id, wren),
    unseated: yield* plantPortrait(unseated.id, loner),
  };

  const hag = yield* as(
    creatures.libraryCreate({
      name: "Marsh Hag",
      size: "Medium",
      type: "Fey",
      cr: "2",
      ac: 17,
      hp: 82,
    }),
  );
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "The ford", visibility: "shared" }),
  );
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: hag.id, count: 1 }));
  const session = yield* as(
    sessions.create(campaign.id, { number: 3, title: "The ford", visibility: "shared" }),
  );
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));
  const creator = yield* as(asDm(dm, campaign.id));
  const run = yield* as(
    runs.start(creator, session.id, { encounterId: encounter.id, visibility: "shared" }),
  );
  yield* sql`
    insert into combatant
      (encounter_run_id, character_id, display_name, kind, hp_current, hp_max, visibility)
    values (${run.id}, ${unseated.id}, 'Between Tables', 'pc', 20, 20, 'shared')
  `;
  for (const row of yield* as(combatants.list(creator, session.id, run.id))) {
    yield* as(combatants.update(creator, session.id, run.id, row.id, { visibility: "shared" }));
  }

  return {
    dm,
    creator,
    campaign,
    session,
    run,
    pim,
    wren,
    brannoc,
    brannocSeat,
    nessa,
    nessaSeat,
    unseated,
    portraits,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

const run = <A, E, R extends Layer.Success<typeof services>>(
  actor: Actor,
  effect: Effect.Effect<A, E, R | CurrentActor>,
) => runtime.runPromise(withActor(actor)(effect).pipe(Effect.orDie));

/** Every portrait id a value mentions, once each, from the signed paths it carries. */
const portraitIdsIn = (value: unknown): ReadonlyArray<string> => [
  ...new Set(
    Array.from(JSON.stringify(value).matchAll(/\/portraits\/([0-9a-f-]{36})\//g), (m) => m[1]!),
  ),
];

const idOf = (thumbUrl: string | undefined) => thumbUrl?.match(/^\/portraits\/([^/]+)\//)?.[1];

/** The character's portrait as the party read hands it to this reader. */
const partyPortrait = async (actor: Actor, characterId: CharacterId) => {
  const seats = await run(
    actor,
    Effect.flatMap(Party, (party) => party.list(fixture.campaign.id)),
  );
  return seats.find((seat) => seat.character?.id === characterId)?.character?.portrait;
};

const runner = () =>
  run(
    fixture.dm,
    Effect.flatMap(Combatants, (combatants) =>
      combatants.list(fixture.creator, fixture.session.id, fixture.run.id),
    ),
  );

const tableAs = (actor: Actor): Promise<PlayerLiveTable | null> =>
  run(
    actor,
    Effect.flatMap(PlayerTable, (table) => table.read(fixture.campaign.id)),
  );

const setSeat = (seat: typeof fixture.nessaSeat, visibility: Visibility) =>
  run(
    fixture.dm,
    Effect.flatMap(Party, (party) => party.update(fixture.campaign.id, seat, { visibility })),
  );

describe("the runner's rows", () => {
  it("carry a seated character's portrait, the same URLs the party read gives the creator", async () => {
    const rows = await runner();
    const brannoc = rows.find((row) => row.characterId === fixture.brannoc.id);
    const nessa = rows.find((row) => row.characterId === fixture.nessa.id);

    expect(brannoc?.portrait).toEqual(await partyPortrait(fixture.dm, fixture.brannoc.id));
    expect(idOf(brannoc?.portrait?.thumbUrl)).toBe(fixture.portraits.brannoc);
    // The creator reads every seat at their table, hidden or not.
    expect(idOf(nessa?.portrait?.thumbUrl)).toBe(fixture.portraits.nessa);
  });

  it("carry none for a monster, and none for a character with no seat here", async () => {
    const rows = await runner();
    expect(rows.find((row) => row.kind === "npc")?.portrait).toBeNull();
    expect(rows.find((row) => row.characterId === fixture.unseated.id)?.portrait).toBeNull();
    expect(portraitIdsIn(rows)).not.toContain(fixture.portraits.unseated);
  });

  it("carry it on a write's answer, so the row the client swaps in keeps its picture", async () => {
    const row = (await runner()).find((entry) => entry.characterId === fixture.brannoc.id)!;
    const damaged = await run(
      fixture.dm,
      Effect.flatMap(Combatants, (combatants) =>
        combatants.damage(fixture.creator, fixture.session.id, fixture.run.id, row.id, {
          amount: 0,
        }),
      ),
    );
    expect(damaged.portrait).toEqual(row.portrait);
  });

  it("carry it into the creator's recap of the night", async () => {
    const recap = await run(
      fixture.dm,
      Effect.flatMap(Recap, (recap) => recap.read(fixture.creator, fixture.session.id)),
    );
    const rows = recap.fights.flatMap((fight) => fight.combatants);
    expect(
      idOf(rows.find((row) => row.characterId === fixture.brannoc.id)?.portrait?.thumbUrl),
    ).toBe(fixture.portraits.brannoc);
    expect(portraitIdsIn(rows)).not.toContain(fixture.portraits.unseated);
  });
});

describe("the player table's order", () => {
  it("gives your own row your portrait", async () => {
    const answer = await tableAs(fixture.pim);
    const you = answer?.fight?.order.find((row) => row.kind === "you");
    expect(you?.characterId).toBe(fixture.brannoc.id);
    expect(you?.kind === "you" && you.portrait).toEqual(
      await partyPortrait(fixture.pim, fixture.brannoc.id),
    );
  });

  it("gives an ally on a shared seat the portrait the party read gives the same reader", async () => {
    const answer = await tableAs(fixture.wren);
    const ally = answer?.fight?.order.find(
      (row) => row.kind === "ally" && row.characterId === fixture.brannoc.id,
    );
    expect(ally?.kind === "ally" && ally.portrait).toEqual(
      await partyPortrait(fixture.wren, fixture.brannoc.id),
    );
    expect(idOf(ally?.kind === "ally" ? ally.portrait?.thumbUrl : undefined)).toBe(
      fixture.portraits.brannoc,
    );
  });

  it("leaks no URL for a hidden seat's character, nor for one seated nowhere here", async () => {
    const answer = await tableAs(fixture.pim);
    const ids = portraitIdsIn(answer);
    expect(ids).toEqual([fixture.portraits.brannoc]);
    expect(ids).not.toContain(fixture.portraits.nessa);
    expect(ids).not.toContain(fixture.portraits.unseated);
    expect(await partyPortrait(fixture.pim, fixture.nessa.id)).toBeUndefined();
  });

  it("follows the seat: shared, the ally's picture appears; hidden again, it goes", async () => {
    await setSeat(fixture.nessaSeat, "shared");
    try {
      const shared = await tableAs(fixture.pim);
      expect(portraitIdsIn(shared)).toContain(fixture.portraits.nessa);
    } finally {
      await setSeat(fixture.nessaSeat, "dm");
    }
    expect(portraitIdsIn(await tableAs(fixture.pim))).not.toContain(fixture.portraits.nessa);
  });
});

describe("a retired seat", () => {
  it("takes the picture off the runner's row, which stays as the fight's snapshot", async () => {
    await run(
      fixture.dm,
      Effect.flatMap(Party, (party) => party.leave(fixture.campaign.id, fixture.nessaSeat)),
    );
    const rows = await runner();
    const nessa = rows.find((row) => row.displayName === "Nessa");
    expect(nessa).toBeDefined();
    expect(nessa?.portrait).toBeNull();
    expect(portraitIdsIn(rows)).not.toContain(fixture.portraits.nessa);
  });
});
