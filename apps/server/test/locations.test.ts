import { describe, expect } from "@effect/vitest";
import { type Actor, CurrentActor, type LocationCreate } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Locations } from "../src/repo/Locations.js";
import { aGroupMemberAt, anAccount, aPlayerAt, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Invites.layer,
  Locations.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_locations")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * Jo owns a Shared World with a table of hers in it (The Salt Road); Wren is a
 * world member running her own table there (The Hag's Bargain); Fen runs a
 * table in a world of his own. Pell plays at the Salt Road, Ash at the Hag's.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const worldId = saltRoad.contextId;

  const wren = yield* aGroupMemberAt(saltRoad.id, "Wren");
  const hag = yield* withActor(wren)(
    campaigns.create(worldId, { name: "The Hag's Bargain", visibility: "shared" }),
  ).pipe(Effect.orDie);

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Elsewhere", visibility: "shared" }),
  );

  const pell = yield* aPlayerAt(saltRoad.id, "Pell");
  const ash = yield* aPlayerAt(hag.id, "Ash");

  return { jo, wren, fen, pell, ash, worldId, saltRoad, hag, elsewhere };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "locations.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

/** A place of the actor's own, through the shipped create. */
const aPlace = (actor: Actor, payload: LocationCreate) =>
  Effect.flatMap(Locations, (locations) => withActor(actor)(locations.create(payload))).pipe(
    Effect.orDie,
  );

describeLayer("locations", shared, (it) => {
  describe("the Library shelf is the owner's alone", () => {
    it.effect("answers the owner and is NotFound to anybody else", () =>
      Effect.gen(function* () {
        const { jo, wren } = yield* Fixture;
        const locations = yield* Locations;
        const harbour = yield* aPlace(jo, {
          kind: "city",
          name: "  Saltmere  ",
          description: "A harbour city.",
          notes: "OWNER-SECRET the harbourmaster smuggles.",
          appearance: " ",
        });

        expect(harbour.name).toBe("Saltmere");
        expect(harbour.appearance).toBeNull();
        expect(harbour.origin).toBe("authored");
        expect((yield* withActor(jo)(locations.library)).map((l) => l.id)).toContain(harbour.id);
        expect((yield* withActor(wren)(locations.library)).map((l) => l.id)).not.toContain(
          harbour.id,
        );

        const read = yield* withActor(wren)(locations.findById(harbour.id)).pipe(Effect.flip);
        const edit = yield* withActor(wren)(
          locations.update(harbour.id, { name: "Mine now" }),
        ).pipe(Effect.flip);
        const erase = yield* withActor(wren)(locations.remove(harbour.id)).pipe(Effect.flip);
        expect([read._tag, edit._tag, erase._tag]).toEqual(["NotFound", "NotFound", "NotFound"]);
        expect((yield* withActor(jo)(locations.findById(harbour.id))).name).toBe("Saltmere");
      }),
    );

    it.effect("nests a place only under the owner's own, and the schema refuses otherwise", () =>
      Effect.gen(function* () {
        const { jo, wren } = yield* Fixture;
        const locations = yield* Locations;
        const sql = yield* SqlClient.SqlClient;
        const joRegion = yield* aPlace(jo, { kind: "region", name: "The Fens" });

        const refused = yield* withActor(wren)(
          locations.create({ kind: "village", name: "Squat", parentId: joRegion.id }),
        ).pipe(Effect.flip);
        expect(refused._tag).toBe("NotFound");

        const wrenVillage = yield* aPlace(wren, { kind: "village", name: "Reedholm" });
        const moved = yield* withActor(wren)(
          locations.update(wrenVillage.id, { parentId: joRegion.id }),
        ).pipe(Effect.flip);
        expect(moved._tag).toBe("NotFound");

        // Round the API, the same-owner key refuses it.
        const raw = yield* sql`
          update location set parent_id = ${joRegion.id} where id = ${wrenVillage.id}
        `.pipe(Effect.exit);
        expect(raw._tag).toBe("Failure");
      }),
    );

    it.effect("refuses a parent inside the place's own subtree", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const locations = yield* Locations;
        const realm = yield* aPlace(jo, { kind: "realm", name: "Varn" });
        const city = yield* aPlace(jo, { kind: "city", name: "Varnhold", parentId: realm.id });
        const district = yield* aPlace(jo, {
          kind: "district",
          name: "The Stacks",
          parentId: city.id,
        });

        const loop = yield* withActor(jo)(
          locations.update(realm.id, { parentId: district.id }),
        ).pipe(Effect.flip);
        const self = yield* withActor(jo)(locations.update(city.id, { parentId: city.id })).pipe(
          Effect.flip,
        );
        expect([loop._tag, self._tag]).toEqual(["Conflict", "Conflict"]);

        const top = yield* withActor(jo)(locations.update(district.id, { parentId: null }));
        expect(top.parentId).toBeNull();
      }),
    );

    it.effect("deletes the whole subtree with every placement and reveal", () =>
      Effect.gen(function* () {
        const { jo, saltRoad } = yield* Fixture;
        const locations = yield* Locations;
        const sql = yield* SqlClient.SqlClient;
        const creator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const keep = yield* aPlace(jo, { kind: "region", name: "Doomed Coast" });
        const tower = yield* aPlace(jo, { kind: "building", name: "Tower", parentId: keep.id });
        yield* locations.place(creator, keep.id);
        yield* locations.place(creator, tower.id);
        yield* locations.reveal(creator, tower.id);

        const appearances = yield* withActor(jo)(locations.appearances(keep.id));
        expect(appearances.map((a) => a.campaigns.map((c) => c.name))).toEqual([
          ["The Hag's Bargain", "The Salt Road"],
        ]);

        yield* withActor(jo)(locations.remove(keep.id));
        const left = yield* sql<{
          readonly places: number;
          readonly placed: number;
          readonly shown: number;
        }>`
          select
            (select count(*)::int from location where id in (${keep.id}, ${tower.id})) as places,
            (select count(*)::int from context_location
             where location_id in (${keep.id}, ${tower.id})) as placed,
            (select count(*)::int from campaign_location_reveal
             where location_id in (${keep.id}, ${tower.id})) as shown
        `;
        expect(left[0]).toEqual({ places: 0, placed: 0, shown: 0 });
      }),
    );
  });

  describe("a placement shares a place with the world", () => {
    it.effect("lets every creator in the world read it, and only its owner place or edit it", () =>
      Effect.gen(function* () {
        const { jo, wren, fen, worldId, saltRoad, hag, elsewhere } = yield* Fixture;
        const locations = yield* Locations;
        const joCreator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const wrenCreator = yield* asDm(wren, hag.id).pipe(Effect.orDie);
        const fenCreator = yield* asDm(fen, elsewhere.id).pipe(Effect.orDie);
        const port = yield* aPlace(jo, {
          kind: "town",
          name: "Gullport",
          notes: "PLACED-SECRET",
        });
        const inn = yield* aPlace(jo, {
          kind: "building",
          name: "The Drowned Lamb",
          parentId: port.id,
        });

        // Wren cannot put Jo's place into the world for her.
        const wrenPlaces = yield* locations.place(wrenCreator, port.id).pipe(Effect.flip);
        expect(wrenPlaces._tag).toBe("NotFound");
        expect((yield* locations.atCampaign(wrenCreator)).map((l) => l.id)).not.toContain(port.id);

        yield* locations.place(joCreator, port.id);

        const atHag = yield* locations.atCampaign(wrenCreator);
        const seenPort = atHag.find((l) => l.id === port.id);
        const seenInn = atHag.find((l) => l.id === inn.id);
        expect(seenPort).toMatchObject({
          mine: false,
          placed: true,
          ownerName: "Jo",
          revealed: false,
        });
        expect(seenInn).toMatchObject({ parentId: port.id, placed: false });
        expect(JSON.stringify(atHag)).not.toContain("PLACED-SECRET");

        const atlas = yield* withActor(wren)(locations.inWorld(worldId));
        expect(atlas.map((l) => l.id)).toEqual(expect.arrayContaining([port.id, inn.id]));

        // Placed is not editable by anybody but its owner.
        const edit = yield* withActor(wren)(locations.update(port.id, { name: "Wrenport" })).pipe(
          Effect.flip,
        );
        const unplace = yield* locations.unplace(wrenCreator, port.id).pipe(Effect.flip);
        expect([edit._tag, unplace._tag]).toEqual(["NotFound", "NotFound"]);

        // Outside the world, nothing.
        expect((yield* locations.atCampaign(fenCreator)).map((l) => l.id)).not.toContain(port.id);
        const fenAtlas = yield* withActor(fen)(locations.inWorld(worldId)).pipe(Effect.flip);
        const fenReveal = yield* locations.reveal(fenCreator, port.id).pipe(Effect.flip);
        expect([fenAtlas._tag, fenReveal._tag]).toEqual(["NotFound", "NotFound"]);
      }),
    );

    it.effect("is NotFound on the world's atlas for a hidden context", () =>
      Effect.gen(function* () {
        const { fen } = yield* Fixture;
        const locations = yield* Locations;
        const solo = yield* withActor(fen)(
          Effect.flatMap(Campaigns, (c) => c.createStandalone({ name: "Fen Alone" })),
        );
        const hidden = yield* withActor(fen)(locations.inWorld(solo.contextId)).pipe(Effect.flip);
        expect(hidden._tag).toBe("NotFound");
      }),
    );
  });

  describe("a reveal shows a place to one table's players", () => {
    it.effect("tells a player only what their table revealed, and nothing of the rest", () =>
      Effect.gen(function* () {
        const { jo, pell, ash, saltRoad, hag } = yield* Fixture;
        const locations = yield* Locations;
        const joCreator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const marsh = yield* aPlace(jo, {
          kind: "wilderness",
          name: "Blackwater Marsh",
          notes: "PLAYER-SECRET",
          appearance: "APPEARANCE-LINE",
        });
        const shrine = yield* aPlace(jo, {
          kind: "landmark",
          name: "Sunken Shrine",
          parentId: marsh.id,
        });
        yield* locations.place(joCreator, marsh.id);

        expect(
          (yield* withActor(pell)(locations.forPlayer(saltRoad.id))).map((l) => l.id),
        ).not.toContain(shrine.id);

        // The child alone: its unrevealed parent's id does not reach the player.
        yield* locations.reveal(joCreator, shrine.id);
        const childOnly = yield* withActor(pell)(locations.forPlayer(saltRoad.id));
        expect(childOnly.find((l) => l.id === shrine.id)).toMatchObject({ parentId: null });
        expect(childOnly.map((l) => l.id)).not.toContain(marsh.id);

        yield* locations.reveal(joCreator, marsh.id);
        const both = yield* withActor(pell)(locations.forPlayer(saltRoad.id));
        expect(both.find((l) => l.id === shrine.id)).toMatchObject({ parentId: marsh.id });
        expect(JSON.stringify(both)).not.toContain("PLAYER-SECRET");
        expect(JSON.stringify(both)).not.toContain("APPEARANCE-LINE");

        // Another table in the same world has revealed nothing.
        expect((yield* withActor(ash)(locations.forPlayer(hag.id))).map((l) => l.id)).not.toContain(
          marsh.id,
        );

        // A player holds no creator proof, so cannot reveal or read the creator's list.
        const proof = yield* asDm(pell, saltRoad.id).pipe(Effect.flip);
        expect(proof._tag).toBe("NotFound");

        yield* locations.unreveal(joCreator, shrine.id);
        expect(
          (yield* withActor(pell)(locations.forPlayer(saltRoad.id))).map((l) => l.id),
        ).not.toContain(shrine.id);
      }),
    );

    it.effect("is withdrawn with the placement that carried it", () =>
      Effect.gen(function* () {
        const { jo, pell, saltRoad } = yield* Fixture;
        const locations = yield* Locations;
        const sql = yield* SqlClient.SqlClient;
        const joCreator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const cove = yield* aPlace(jo, { kind: "landmark", name: "Smugglers' Cove" });
        yield* locations.place(joCreator, cove.id);
        yield* locations.reveal(joCreator, cove.id);

        yield* locations.unplace(joCreator, cove.id);
        expect(
          (yield* withActor(pell)(locations.forPlayer(saltRoad.id))).map((l) => l.id),
        ).not.toContain(cove.id);
        const left = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from campaign_location_reveal where location_id = ${cove.id}
        `;
        expect(left[0]!.count).toBe(0);
        const again = yield* locations.reveal(joCreator, cove.id).pipe(Effect.flip);
        expect(again._tag).toBe("NotFound");
      }),
    );
  });

  describe("a table leaving its world", () => {
    it.effect("takes its creator's own places along and drops the reveals of everyone else's", () =>
      Effect.gen(function* () {
        const { jo, wren, ash, saltRoad, hag } = yield* Fixture;
        const locations = yield* Locations;
        const campaigns = yield* Campaigns;
        const joCreator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const wrenCreator = yield* asDm(wren, hag.id).pipe(Effect.orDie);
        const joLighthouse = yield* aPlace(jo, { kind: "landmark", name: "Grey Lighthouse" });
        const wrenHut = yield* aPlace(wren, { kind: "building", name: "The Hag's Hut" });
        yield* locations.place(joCreator, joLighthouse.id);
        yield* locations.place(wrenCreator, wrenHut.id);
        yield* locations.reveal(wrenCreator, joLighthouse.id);
        yield* locations.reveal(wrenCreator, wrenHut.id);

        yield* campaigns.disconnectSharedWorld(wrenCreator);
        const after = yield* asDm(wren, hag.id).pipe(Effect.orDie);

        const shown = (yield* withActor(ash)(locations.forPlayer(hag.id))).map((l) => l.id);
        expect(shown).toContain(wrenHut.id);
        expect(shown).not.toContain(joLighthouse.id);
        const atTable = (yield* locations.atCampaign(after)).map((l) => l.id);
        expect(atTable).toContain(wrenHut.id);
        expect(atTable).not.toContain(joLighthouse.id);
        // The world keeps Wren's place while she is still a member.
        expect((yield* locations.atCampaign(joCreator)).map((l) => l.id)).toContain(wrenHut.id);
      }),
    );
  });
});
