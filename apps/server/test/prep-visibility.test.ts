import { Actor, CurrentActor } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";

/**
 * The same properties `visibility.test.ts` establishes for `note`, for the two
 * tables the prep surface adds — plus the one thing neither of them shows,
 * which is that a table hanging off `session` rather than off `campaign`
 * inherits the containment instead of restating it.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Encounters.layer,
    Invites.layer,
    Notes.layer,
    PrepItems.layer,
    // Finishing a night now carries a fight still on the table, which
    // appends to the log and rings the doorbell — so `Sessions` is a live
    // repository too. `Layer` memoises by identity, so this is the same
    // `PubSub` the other live layers here take.
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_prep_visibility"))),
);
afterAll(() => runtime.dispose());

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
  const campaigns = yield* Campaigns;
  const encounters = yield* Encounters;
  const notes = yield* Notes;
  const prep = yield* PrepItems;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));

  // Neither of these mentions a visibility. What they come out as is decided by
  // the column default and nothing else, which is the point of the first block.
  const encounter = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      difficulty: "Medium",
      tags: ["Marsh", "Night"],
    }),
  );
  const sharedEncounter = yield* as(
    encounters.create(campaign.id, { name: "The ferryman's price", visibility: "shared" }),
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

  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const encounterElsewhere = yield* as(
    encounters.create(otherTable.id, { name: "Whatever is in the crate", visibility: "shared" }),
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

let fixture: Effect.Success<typeof makeFixture>;
let encounters: (typeof Encounters)["Service"];
let prep: (typeof PrepItems)["Service"];
let notes: (typeof Notes)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  encounters = await runtime.runPromise(Encounters);
  prep = await runtime.runPromise(PrepItems);
  notes = await runtime.runPromise(Notes);
}, 60_000);

describe("the new tables fail closed", () => {
  it("stores a row created with no explicit visibility as dm", () => {
    expect(fixture.encounter.visibility).toBe("dm");
    expect(fixture.item.visibility).toBe("dm");
  });

  it("defaults at the column, not only in the payload schema", async () => {
    // Inserted straight into the table, bypassing every TypeScript path. That
    // is the property a table added later inherits for free, and the reason the
    // default lives in the migration rather than in a create schema.
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
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
      }).pipe(Effect.orDie),
    );

    expect(rows.encounter).toEqual({ visibility: "dm", origin: "authored" });
    expect(rows.item).toEqual({ visibility: "dm", origin: "authored" });
  });
});

describe("a player actor, on encounters", () => {
  it("cannot read a dm-visibility encounter", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(encounters.findById(fixture.campaign.id, fixture.encounter.id)),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("encounter");
  });

  it("sees only the shared encounter when listing", async () => {
    const asDm = await runtime.runPromise(
      withActor(fixture.dm)(items(encounters.list(fixture.campaign.id, {}))),
    );
    const asPlayer = await runtime.runPromise(
      withActor(fixture.player)(items(encounters.list(fixture.campaign.id, {}))),
    );

    expect(asDm.map((e) => e.id)).toContain(fixture.encounter.id);
    expect(asPlayer.map((e) => e.id)).toEqual([fixture.sharedEncounter.id]);
  });

  it("cannot edit or delete even the shared encounter it can read", async () => {
    const updated = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          encounters.update(fixture.campaign.id, fixture.sharedEncounter.id, { name: "tampered" }),
        ),
      ),
    );
    const removed = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          encounters.remove(fixture.campaign.id, fixture.sharedEncounter.id),
        ),
      ),
    );

    expect(updated._tag).toBe("NotFound");
    expect(removed._tag).toBe("NotFound");

    const stillThere = await runtime.runPromise(
      withActor(fixture.dm)(encounters.findById(fixture.campaign.id, fixture.sharedEncounter.id)),
    );
    expect(stillThere.name).toBe("The ferryman's price");
  });

  it("cannot create one", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          encounters.create(fixture.campaign.id, { name: "from a player" }),
        ),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("campaign");
  });
});

describe("a player actor, on the prep checklist", () => {
  it("cannot read a dm-visibility item", async () => {
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.findById(fixture.campaign.id, fixture.session.id, fixture.item.id),
        ),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("prep_item");
  });

  it("cannot reach a shared item through a session that is not shared", async () => {
    // The nesting, and the reason `prep_item` has no `campaign_id` of its own.
    // The session is the master toggle one level down from the campaign: an
    // item marked `shared` under a `dm` session stays invisible, exactly as a
    // `shared` note inside an unshared campaign does.
    const promoted = await runtime.runPromise(
      withActor(fixture.dm)(
        prep.update(fixture.campaign.id, fixture.session.id, fixture.item.id, {
          visibility: "shared",
        }),
      ),
    );
    expect(promoted.visibility).toBe("shared");

    const found = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.findById(fixture.campaign.id, fixture.session.id, fixture.item.id),
        ),
      ),
    );
    const listed = await runtime.runPromise(
      Effect.flip(withActor(fixture.player)(prep.list(fixture.campaign.id, fixture.session.id))),
    );

    expect(found._tag).toBe("NotFound");
    // The *session* is what could not be had, so that is what the 404 names.
    expect(listed._tag).toBe("NotFound");
    expect(listed.resource).toBe("session");

    // …and the DM still sees it, so the assertions above are about visibility
    // and not about a missing row.
    const asDm = await runtime.runPromise(
      withActor(fixture.dm)(prep.list(fixture.campaign.id, fixture.session.id)),
    );
    expect(asDm.map((i) => i.id)).toContain(fixture.item.id);

    // Put it back, so the ordering of these tests does not matter.
    await runtime.runPromise(
      withActor(fixture.dm)(
        prep.update(fixture.campaign.id, fixture.session.id, fixture.item.id, {
          visibility: "dm",
        }),
      ),
    );
  });

  it("reads a shared item under a shared session, and still cannot write it", async () => {
    const listed = await runtime.runPromise(
      withActor(fixture.player)(prep.list(fixture.campaign.id, fixture.sharedSession.id)),
    );
    expect(listed.map((i) => i.id)).toEqual([fixture.sharedItem.id]);

    const updated = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.update(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id, {
            done: true,
          }),
        ),
      ),
    );
    const removed = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.remove(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id),
        ),
      ),
    );
    const created = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.create(fixture.campaign.id, fixture.sharedSession.id, { label: "from a player" }),
        ),
      ),
    );

    expect(updated._tag).toBe("NotFound");
    expect(removed._tag).toBe("NotFound");
    expect(created._tag).toBe("NotFound");
  });
});

describe("a campaign-scoped actor", () => {
  // One DM, two tables, both shared. Account ownership is not scope: a
  // credential minted for the first campaign must reach nothing in the second,
  // even though the same DM owns both.

  it("cannot read a shared encounter in the other campaign", async () => {
    const found = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          encounters.findById(fixture.otherTable.id, fixture.encounterElsewhere.id),
        ),
      ),
    );
    const listed = await runtime.runPromise(
      Effect.flip(withActor(fixture.player)(items(encounters.list(fixture.otherTable.id, {})))),
    );

    expect(found._tag).toBe("NotFound");
    expect(listed._tag).toBe("NotFound");

    // …and it really is there and really is shared.
    const asDm = await runtime.runPromise(
      withActor(fixture.dm)(items(encounters.list(fixture.otherTable.id, {}))),
    );
    expect(asDm.map((e) => e.id)).toEqual([fixture.encounterElsewhere.id]);
    expect(asDm[0]!.visibility).toBe("shared");
  });

  it("cannot reach the other campaign's checklist, by either path", async () => {
    // Both ways of naming it. Asking honestly, with the other campaign's id;
    // and lying about the campaign while giving the other campaign's session
    // id, which is the shape that would work if the predicate trusted the
    // session id it was handed instead of containing it.
    const honest = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(prep.list(fixture.otherTable.id, fixture.sessionElsewhere.id)),
      ),
    );
    const smuggled = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(prep.list(fixture.campaign.id, fixture.sessionElsewhere.id)),
      ),
    );
    const smuggledItem = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.player)(
          prep.findById(fixture.campaign.id, fixture.sessionElsewhere.id, fixture.itemElsewhere.id),
        ),
      ),
    );

    expect(honest._tag).toBe("NotFound");
    expect(smuggled._tag).toBe("NotFound");
    expect(smuggledItem._tag).toBe("NotFound");
  });

  it("narrows a dm-role actor too, so scope does not depend on the role", async () => {
    const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);

    const listed = await runtime.runPromise(
      Effect.flip(withActor(scopedDm)(items(encounters.list(fixture.otherTable.id, {})))),
    );
    const written = await runtime.runPromise(
      Effect.flip(
        withActor(scopedDm)(
          prep.create(fixture.otherTable.id, fixture.sessionElsewhere.id, {
            label: "out of scope",
          }),
        ),
      ),
    );

    expect(listed._tag).toBe("NotFound");
    expect(written._tag).toBe("NotFound");
  });
});

describe("another account", () => {
  it("reaches neither table", async () => {
    const outsider = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* anAccount("Someone else");
      }).pipe(Effect.orDie),
    );

    const encounter = await runtime.runPromise(
      Effect.flip(
        withActor(outsider)(encounters.findById(fixture.campaign.id, fixture.sharedEncounter.id)),
      ),
    );
    const item = await runtime.runPromise(
      Effect.flip(
        withActor(outsider)(
          prep.findById(fixture.campaign.id, fixture.sharedSession.id, fixture.sharedItem.id),
        ),
      ),
    );

    expect(encounter._tag).toBe("NotFound");
    expect(item._tag).toBe("NotFound");
  });
});

describe("a note attached to an encounter", () => {
  it("round-trips the attachment", async () => {
    const found = await runtime.runPromise(
      withActor(fixture.dm)(notes.findById(fixture.campaign.id, fixture.readAloud.id)),
    );

    expect(found.kind).toBe("read_aloud");
    expect(found.attachedTo).toEqual({ kind: "encounter", id: fixture.encounter.id });
  });

  it("refuses an encounter in another campaign", async () => {
    // The composite `note_encounter_fkey` makes this unrepresentable in the
    // database; the repository turns it into the 404 the rest of the surface
    // answers with, rather than letting a constraint violation become a 500.
    const error = await runtime.runPromise(
      Effect.flip(
        withActor(fixture.dm)(
          notes.create(fixture.campaign.id, {
            title: "smuggled",
            attachedTo: { kind: "encounter", id: fixture.encounterElsewhere.id },
          }),
        ),
      ),
    );

    expect(error._tag).toBe("NotFound");
    expect(error.resource).toBe("encounter");
  });

  it("survives its encounter being deleted, detached rather than gone", async () => {
    // The DM wrote that read-aloud. Deleting the encounter loses the encounter,
    // not the prose — `on delete set null (encounter_id)`.
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const doomed = yield* encounters.create(fixture.campaign.id, { name: "to be deleted" });
        const note = yield* notes.create(fixture.campaign.id, {
          title: "attached to a doomed encounter",
          attachedTo: { kind: "encounter", id: doomed.id },
        });
        yield* encounters.remove(fixture.campaign.id, doomed.id);
        return yield* notes.findById(fixture.campaign.id, note.id);
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(seen.title).toBe("attached to a doomed encounter");
    expect(seen.attachedTo).toBeNull();
  });

  it("detaches on an explicit null and is left alone when the field is absent", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const note = yield* notes.create(fixture.campaign.id, {
          title: "attachment patching",
          attachedTo: { kind: "encounter", id: fixture.encounter.id },
        });
        const renamed = yield* notes.update(fixture.campaign.id, note.id, { title: "renamed" });
        const detached = yield* notes.update(fixture.campaign.id, note.id, { attachedTo: null });
        return { renamed, detached };
      }).pipe(withActor(fixture.dm), Effect.orDie),
    );

    expect(seen.renamed.attachedTo).toEqual({ kind: "encounter", id: fixture.encounter.id });
    expect(seen.detached.attachedTo).toBeNull();
  });
});
