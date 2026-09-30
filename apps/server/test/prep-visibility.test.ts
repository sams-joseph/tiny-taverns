import { describe, expect } from "@effect/vitest";
import { Actor, CurrentActor } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";
import { describeLayer } from "./support/suite.js";

/**
 * The same properties `visibility.test.ts` establishes for `note`, for the two
 * tables the prep surface adds — plus the one thing neither of them shows,
 * which is that a table hanging off `session` rather than off `campaign`
 * inherits the containment instead of restating it.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  CampaignCreatorActors.layer,
  Groups.layer,
  Encounters.layer,
  Invites.layer,
  Notes.layer,
  PrepItems.layer,
  // Finishing a night now carries a fight still on the table, which
  // appends to the log and rings the doorbell — so `Sessions` is a live
  // repository too. `Layer` memoises by identity, so this is the same
  // `PubSub` the other live layers here take.
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_prep_visibility")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM, two tables. `campaign` is shared with its players; `otherTable` is a
 * separate campaign the same DM also shares. A credential minted for the first
 * must reach nothing in the second.
 */
const makeFixture = Effect.gen(function* () {
  const encounters = yield* Encounters;
  const notes = yield* Notes;
  const prep = yield* PrepItems;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));

  // Neither of these mentions a visibility. What they come out as is decided by
  // the column default and nothing else, which is the point of the first block.
  const encounter = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      tags: ["Marsh", "Night"],
    }),
  );
  const sharedEncounter = yield* as(
    encounters.create(campaign.id, {
      name: "The ferryman's price",
      visibility: "shared",
      ready: true,
    }),
  );

  const session = yield* as(sessions.create(campaign.id, { number: 12, title: "The ford" }));
  const sharedSession = yield* as(
    sessions.create(campaign.id, { number: 13, visibility: "shared" }),
  );
  const item = yield* as(prep.create(campaign.id, session.id, { label: "Print the harbour map" }));
  // A `shared` prep item under a `shared` session: the only combination a
  // player could ever see, and the one the "cannot reach" assertions need in
  // order to be about visibility rather than about an empty table.
  const sharedItem = yield* as(
    prep.create(campaign.id, sharedSession.id, {
      label: "Reread the reeds ambush",
      visibility: "shared",
    }),
  );

  const readAloud = yield* as(
    notes.create(campaign.id, {
      title: "Read aloud at the water",
      body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
      kind: "read_aloud",
      attachedTo: { kind: "encounter", id: encounter.id },
      visibility: "shared",
    }),
  );

  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));
  const encounterElsewhere = yield* as(
    encounters.create(otherTable.id, {
      name: "Whatever is in the crate",
      visibility: "shared",
      ready: true,
    }),
  );
  const sessionElsewhere = yield* as(
    sessions.create(otherTable.id, { number: 1, visibility: "shared" }),
  );
  const itemElsewhere = yield* as(
    prep.create(otherTable.id, sessionElsewhere.id, {
      label: "Pick a name for the ferryman",
      visibility: "shared",
    }),
  );

  const player = yield* aPlayerAt(campaign.id, "Pim");

  return {
    dm,
    player,
    campaign,
    encounter,
    sharedEncounter,
    session,
    sharedSession,
    item,
    sharedItem,
    readAloud,
    otherTable,
    encounterElsewhere,
    sessionElsewhere,
    itemElsewhere,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "prep-visibility.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

describeLayer("prep-visibility", shared, (it) => {
  describe("the new tables fail closed", () => {
    it.effect("stores a row created with no explicit visibility as dm", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        expect(fixture.encounter.visibility).toBe("dm");
        expect(fixture.item.visibility).toBe("dm");
      }),
    );

    it.effect("defaults at the column, not only in the payload schema", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        // Inserted straight into the table, bypassing every TypeScript path. That
        // is the property a table added later inherits for free, and the reason the
        // default lives in the migration rather than in a create schema.
        const rows = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const encounter = yield* sql<{ readonly visibility: string; readonly origin: string }>`
            insert into encounter (campaign_id, name)
            values (${fixture.campaign.id}, 'inserted behind the repository')
            returning visibility, origin
          `;
          const item = yield* sql<{ readonly visibility: string; readonly origin: string }>`
            insert into prep_item (session_id, label)
            values (${fixture.session.id}, 'inserted behind the repository')
            returning visibility, origin
          `;
          return { encounter: encounter[0], item: item[0] };
        }).pipe(Effect.orDie);

        expect(rows.encounter).toEqual({ visibility: "dm", origin: "authored" });
        expect(rows.item).toEqual({ visibility: "dm", origin: "authored" });
      }),
    );
  });

  describe("a player actor, on encounters", () => {
    it.effect("cannot read a dm-visibility encounter", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const error = yield* Effect.flip(
          withActor(fixture.player)(
            encounters.findAsPlayer(fixture.campaign.id, fixture.encounter.id),
          ),
        );

        expect(error._tag).toBe("NotFound");
        expect(error.resource).toBe("encounter");
      }),
    );

    it.effect("sees only the shared encounter when listing", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const asCreator = yield* Effect.flatMap(asDm(fixture.dm, fixture.campaign.id), (dm) =>
          items(encounters.list(dm, {})),
        );
        const asPlayer = yield* withActor(fixture.player)(
          encounters.listAsPlayer(fixture.campaign.id),
        );

        expect(asCreator.map((e) => e.id)).toContain(fixture.encounter.id);
        expect(asPlayer.map((e) => e.id)).toEqual([fixture.sharedEncounter.id]);
      }),
    );

    it.effect("cannot edit or delete even the shared encounter it can read", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const updated = yield* Effect.flip(
          withActor(fixture.player)(
            encounters.update(fixture.campaign.id, fixture.sharedEncounter.id, {
              name: "tampered",
            }),
          ),
        );
        const removed = yield* Effect.flip(
          withActor(fixture.player)(
            encounters.remove(fixture.campaign.id, fixture.sharedEncounter.id),
          ),
        );

        expect(updated._tag).toBe("NotFound");
        expect(removed._tag).toBe("NotFound");

        const stillThere = yield* Effect.flatMap(asDm(fixture.dm, fixture.campaign.id), (dm) =>
          encounters.findById(dm, fixture.sharedEncounter.id),
        );
        expect(stillThere.name).toBe("The ferryman's price");
      }),
    );

    it.effect("cannot create one", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const error = yield* Effect.flip(
          withActor(fixture.player)(
            encounters.create(fixture.campaign.id, { name: "from a player" }),
          ),
        );

        expect(error).toMatchObject({ _tag: "NotFound", resource: "campaign" });
      }),
    );
  });

  describe("a player actor, on the prep checklist", () => {
    it.effect("cannot read a dm-visibility item", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const prep = yield* PrepItems;
        const error = yield* Effect.flip(
          withActor(fixture.player)(
            prep.findById(fixture.campaign.id, fixture.session.id, fixture.item.id),
          ),
        );

        expect(error._tag).toBe("NotFound");
        expect(error.resource).toBe("prep_item");
      }),
    );

    it.effect("cannot reach a shared item through a session that is not shared", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const prep = yield* PrepItems;
        // The nesting, and the reason `prep_item` has no `campaign_id` of its own.
        // The session is the master toggle one level down from the campaign: an
        // item marked `shared` under a `dm` session stays invisible, exactly as a
        // `shared` note inside an unshared campaign does.
        const promoted = yield* withActor(fixture.dm)(
          prep.update(fixture.campaign.id, fixture.session.id, fixture.item.id, {
            visibility: "shared",
          }),
        );
        expect(promoted.visibility).toBe("shared");

        const found = yield* Effect.flip(
          withActor(fixture.player)(
            prep.findById(fixture.campaign.id, fixture.session.id, fixture.item.id),
          ),
        );
        const listed = yield* Effect.flip(
          withActor(fixture.player)(prep.list(fixture.campaign.id, fixture.session.id)),
        );

        expect(found._tag).toBe("NotFound");
        // The *session* is what could not be had, so that is what the 404 names.
        expect(listed._tag).toBe("NotFound");
        expect(listed.resource).toBe("session");

        // …and the DM still sees it, so the assertions above are about visibility
        // and not about a missing row.
        const asDm = yield* withActor(fixture.dm)(
          prep.list(fixture.campaign.id, fixture.session.id),
        );
        expect(asDm.map((i) => i.id)).toContain(fixture.item.id);

        // Put it back, so the ordering of these tests does not matter.
        yield* withActor(fixture.dm)(
          prep.update(fixture.campaign.id, fixture.session.id, fixture.item.id, {
            visibility: "dm",
          }),
        );
      }),
    );

    it.effect("reads a shared item under a shared session, and still cannot write it", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const prep = yield* PrepItems;
        const listed = yield* withActor(fixture.player)(
          prep.list(fixture.campaign.id, fixture.sharedSession.id),
        );
        expect(listed.map((i) => i.id)).toEqual([fixture.sharedItem.id]);

        const updated = yield* Effect.flip(
          withActor(fixture.player)(
            prep.update(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id, {
              done: true,
            }),
          ),
        );
        const removed = yield* Effect.flip(
          withActor(fixture.player)(
            prep.remove(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id),
          ),
        );
        const created = yield* Effect.flip(
          withActor(fixture.player)(
            prep.create(fixture.campaign.id, fixture.sharedSession.id, { label: "from a player" }),
          ),
        );

        expect(updated._tag).toBe("NotFound");
        expect(removed._tag).toBe("NotFound");
        expect(created._tag).toBe("NotFound");
      }),
    );
  });

  describe("a campaign-scoped actor", () => {
    // One DM, two tables, both shared. Account ownership is not scope: a
    // credential minted for the first campaign must reach nothing in the second,
    // even though the same DM owns both.

    it.effect("cannot read a shared encounter in the other campaign", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const found = yield* Effect.flip(
          withActor(fixture.player)(
            encounters.findAsPlayer(fixture.otherTable.id, fixture.encounterElsewhere.id),
          ),
        );
        const listed = yield* Effect.flip(
          withActor(fixture.player)(encounters.listAsPlayer(fixture.otherTable.id)),
        );

        expect(found._tag).toBe("NotFound");
        expect(listed._tag).toBe("NotFound");

        // …and it really is there and really is shared.
        const asCreator = yield* Effect.flatMap(asDm(fixture.dm, fixture.otherTable.id), (dm) =>
          items(encounters.list(dm, {})),
        );
        expect(asCreator.map((e) => e.id)).toEqual([fixture.encounterElsewhere.id]);
        expect(asCreator[0]!.visibility).toBe("shared");
      }),
    );

    it.effect("cannot reach the other campaign's checklist, by either path", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const prep = yield* PrepItems;
        // Both ways of naming it. Asking honestly, with the other campaign's id;
        // and lying about the campaign while giving the other campaign's session
        // id, which is the shape that would work if the predicate trusted the
        // session id it was handed instead of containing it.
        const honest = yield* Effect.flip(
          withActor(fixture.player)(prep.list(fixture.otherTable.id, fixture.sessionElsewhere.id)),
        );
        const smuggled = yield* Effect.flip(
          withActor(fixture.player)(prep.list(fixture.campaign.id, fixture.sessionElsewhere.id)),
        );
        const smuggledItem = yield* Effect.flip(
          withActor(fixture.player)(
            prep.findById(
              fixture.campaign.id,
              fixture.sessionElsewhere.id,
              fixture.itemElsewhere.id,
            ),
          ),
        );

        expect(honest._tag).toBe("NotFound");
        expect(smuggled._tag).toBe("NotFound");
        expect(smuggledItem._tag).toBe("NotFound");
      }),
    );

    it.effect("narrows a dm-role actor too, so scope does not depend on the role", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const prep = yield* PrepItems;
        const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);

        const listed = yield* Effect.flip(
          withActor(scopedDm)(encounters.listAsPlayer(fixture.otherTable.id)),
        );
        const written = yield* Effect.flip(
          withActor(scopedDm)(
            prep.create(fixture.otherTable.id, fixture.sessionElsewhere.id, {
              label: "out of scope",
            }),
          ),
        );

        expect(listed._tag).toBe("NotFound");
        expect(written._tag).toBe("NotFound");
      }),
    );
  });

  describe("another account", () => {
    it.effect("reaches neither table", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const prep = yield* PrepItems;
        const outsider = yield* Effect.gen(function* () {
          return yield* anAccount("Someone else");
        }).pipe(Effect.orDie);

        const encounter = yield* Effect.flip(
          withActor(outsider)(
            encounters.findAsPlayer(fixture.campaign.id, fixture.sharedEncounter.id),
          ),
        );
        const item = yield* Effect.flip(
          withActor(outsider)(
            prep.findById(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id),
          ),
        );

        expect(encounter._tag).toBe("NotFound");
        expect(item._tag).toBe("NotFound");
      }),
    );
  });

  describe("a note attached to an encounter", () => {
    it.effect("round-trips the attachment", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        const found = yield* withActor(fixture.dm)(
          Effect.flatMap(asDm(fixture.dm, fixture.campaign.id), (dm) =>
            notes.findById(dm, fixture.readAloud.id),
          ),
        );

        expect(found.kind).toBe("read_aloud");
        expect(found.attachedTo).toEqual({ kind: "encounter", id: fixture.encounter.id });
      }),
    );

    it.effect("refuses an encounter in another campaign", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        // The composite `note_encounter_fkey` makes this unrepresentable in the
        // database; the repository turns it into the 404 the rest of the surface
        // answers with, rather than letting a constraint violation become a 500.
        const error = yield* Effect.flip(
          withActor(fixture.dm)(
            notes.create(fixture.campaign.id, {
              title: "smuggled",
              attachedTo: { kind: "encounter", id: fixture.encounterElsewhere.id },
            }),
          ),
        );

        expect(error._tag).toBe("NotFound");
        expect(error.resource).toBe("encounter");
      }),
    );

    it.effect("survives its encounter being deleted, detached rather than gone", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const encounters = yield* Encounters;
        const notes = yield* Notes;
        // The DM wrote that read-aloud. Deleting the encounter loses the encounter,
        // not the prose — `on delete set null (encounter_id)`.
        const seen = yield* Effect.gen(function* () {
          const doomed = yield* encounters.create(fixture.campaign.id, { name: "to be deleted" });
          const note = yield* notes.create(fixture.campaign.id, {
            title: "attached to a doomed encounter",
            attachedTo: { kind: "encounter", id: doomed.id },
          });
          yield* encounters.remove(fixture.campaign.id, doomed.id);
          const dm = yield* asDm(fixture.dm, fixture.campaign.id);
          return yield* notes.findById(dm, note.id);
        }).pipe(withActor(fixture.dm), Effect.orDie);

        expect(seen.title).toBe("attached to a doomed encounter");
        expect(seen.attachedTo).toBeNull();
      }),
    );

    it.effect("detaches on an explicit null and is left alone when the field is absent", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const notes = yield* Notes;
        const seen = yield* Effect.gen(function* () {
          const note = yield* notes.create(fixture.campaign.id, {
            title: "attachment patching",
            attachedTo: { kind: "encounter", id: fixture.encounter.id },
          });
          const renamed = yield* notes.update(fixture.campaign.id, note.id, { title: "renamed" });
          const detached = yield* notes.update(fixture.campaign.id, note.id, { attachedTo: null });
          return { renamed, detached };
        }).pipe(withActor(fixture.dm), Effect.orDie);

        expect(seen.renamed.attachedTo).toEqual({ kind: "encounter", id: fixture.encounter.id });
        expect(seen.detached.attachedTo).toBeNull();
      }),
    );
  });
});
