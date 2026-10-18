import { describe, expect } from "@effect/vitest";
import { type Actor, CurrentActor, type LocationCreate } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Locations } from "../src/repo/Locations.js";
import { PartyTravel } from "../src/repo/PartyTravel.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Invites.layer,
  Locations.layer,
  LiveEvents.layer,
  PartyTravel.layer.pipe(Layer.provide(LiveEvents.layer)),
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_party_travel")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** Jo runs The Salt Road, with Pell playing; Fen runs a table of his own. */
const makeFixture = Effect.gen(function* () {
  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const pell = yield* aPlayerAt(saltRoad.id, "Pell");
  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Elsewhere", visibility: "shared" }),
  );
  return { jo, pell, fen, saltRoad, elsewhere };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "party-travel.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const aPlace = (actor: Actor, payload: LocationCreate) =>
  Effect.flatMap(Locations, (locations) => withActor(actor)(locations.create(payload))).pipe(
    Effect.orDie,
  );

describeLayer("party-travel", shared, (it) => {
  describe("moving the party", () => {
    it.effect("is the creator's, reveals the place, and the newest move is where it stands", () =>
      Effect.gen(function* () {
        const { jo, pell, saltRoad } = yield* Fixture;
        const travel = yield* PartyTravel;
        const locations = yield* Locations;
        const creator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const town = yield* aPlace(jo, { kind: "town", name: "Gullport" });
        const marsh = yield* aPlace(jo, { kind: "wilderness", name: "Blackwater Marsh" });
        yield* locations.place(creator, town.id);
        yield* locations.place(creator, marsh.id);

        yield* travel.move(creator, town.id);
        const second = yield* travel.move(creator, marsh.id);
        expect(second).toMatchObject({ locationName: "Blackwater Marsh", origin: "authored" });

        const log = yield* travel.list(creator);
        expect(log.map((move) => move.locationName).slice(0, 2)).toEqual([
          "Blackwater Marsh",
          "Gullport",
        ]);

        // The party stood in both, so the table knows both.
        const told = yield* withActor(pell)(travel.forPlayer(saltRoad.id));
        expect(told[0]).toMatchObject({ locationId: marsh.id, locationName: "Blackwater Marsh" });
        const shown = (yield* withActor(pell)(locations.forPlayer(saltRoad.id))).map((p) => p.id);
        expect(shown).toEqual(expect.arrayContaining([town.id, marsh.id]));

        // Taking the newest back puts the party where it was before.
        yield* travel.remove(creator, second.id);
        expect((yield* travel.list(creator))[0]?.locationName).toBe("Gullport");
      }),
    );

    it.effect("refuses a player, a stranger, and a place the table's world does not have", () =>
      Effect.gen(function* () {
        const { jo, pell, fen, saltRoad, elsewhere } = yield* Fixture;
        const travel = yield* PartyTravel;
        const creator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const fenCreator = yield* asDm(fen, elsewhere.id).pipe(Effect.orDie);
        const unplaced = yield* aPlace(jo, { kind: "landmark", name: "Unplaced Spire" });

        const proof = yield* asDm(pell, saltRoad.id).pipe(Effect.flip);
        const notHere = yield* travel.move(creator, unplaced.id).pipe(Effect.flip);
        const strangerReads = yield* withActor(fen)(travel.forPlayer(saltRoad.id)).pipe(
          Effect.flip,
        );
        expect([proof._tag, notHere._tag, strangerReads._tag]).toEqual([
          "NotFound",
          "NotFound",
          "NotFound",
        ]);

        // Another table's creator cannot take a move of this table's back.
        const town = yield* aPlace(jo, { kind: "town", name: "Saltmere" });
        yield* Effect.flatMap(Locations, (l) => l.place(creator, town.id));
        const move = yield* travel.move(creator, town.id);
        const theirs = yield* travel.remove(fenCreator, move.id).pipe(Effect.flip);
        expect(theirs._tag).toBe("NotFound");
      }),
    );

    it.effect("is told to an open night, and keeps its name when the place is deleted", () =>
      Effect.gen(function* () {
        const { jo, pell, saltRoad } = yield* Fixture;
        const travel = yield* PartyTravel;
        const sql = yield* SqlClient.SqlClient;
        const creator = yield* asDm(jo, saltRoad.id).pipe(Effect.orDie);
        const night = yield* withActor(jo)(
          Effect.flatMap(Sessions, (sessions) => sessions.create(saltRoad.id, { number: 1 })),
        ).pipe(Effect.orDie);
        yield* withActor(jo)(
          Effect.flatMap(Campaigns, (campaigns) =>
            campaigns.update(saltRoad.id, { currentSessionId: night.id }),
          ),
        ).pipe(Effect.orDie);
        const cove = yield* aPlace(jo, { kind: "landmark", name: "Smugglers' Cove" });
        yield* Effect.flatMap(Locations, (l) => l.place(creator, cove.id));

        const move = yield* travel.move(creator, cove.id);
        expect(move.sessionId).toBe(night.id);
        const events = yield* sql<{ readonly kind: string; readonly visibility: string }>`
          select kind, visibility from session_event where session_id = ${night.id}
            and kind = 'party-moved'
        `;
        expect(events).toEqual([{ kind: "party-moved", visibility: "shared" }]);

        yield* withActor(jo)(Effect.flatMap(Locations, (l) => l.remove(cove.id)));
        const kept = (yield* withActor(pell)(travel.forPlayer(saltRoad.id))).find(
          (row) => row.id === move.id,
        );
        expect(kept).toMatchObject({ locationId: null, locationName: "Smugglers' Cove" });
      }),
    );
  });
});
