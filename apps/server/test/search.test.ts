import {
  Actor,
  type CampaignId,
  CurrentActor,
  NotFound,
  type SearchFilterValues,
  type SearchHit,
  type SearchSource,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { Notes } from "../src/repo/Notes.js";
import { Search } from "../src/repo/Search.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Campaign search: the retrieval index the assistant will consume.
 *
 * Four claims, and the first is the one that matters most:
 *
 * - **a search cannot cross a campaign boundary**, by ownership *or* by
 *   credential scope. A search that leaks is the worst version of that bug
 *   because the extra rows look like a feature rather than a fault, so this is
 *   proven with a scoped actor and a real query rather than reasoned about.
 * - **a generated column cannot go stale** — including when the row is edited
 *   behind every line of TypeScript, which is the property that made per-table
 *   generated columns the choice over a denormalised copy.
 * - **two matchers**, because full text alone does not find a half-typed word
 *   and `ILIKE` alone does not find a creature trait that is in no column.
 * - **`session_event` is not in the corpus**, deliberately, and nothing here
 *   quietly grows a fifth arm.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Characters.layer,
  Creatures.layer,
  Notes.layer,
  Search.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_search")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** The words a DM actually searches for are the ones they invented. */
const FERRYMAN = "The ferryman is called Cazril. He will not take coin, only a name.";
const CRATE = "They left the crate unopened and buried it under the reeds.";

/**
 * One DM with two tables, and a second DM with one.
 *
 * Both of the first DM's campaigns are `shared`, so "cannot reach" below is
 * about credential scope rather than about an empty campaign — the scope hole
 * the auth work closed was invisible for as long as it was precisely because no
 * test minted a scoped actor.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const notes = yield* Notes;
  const beats = yield* Beats;
  const sessions = yield* Sessions;
  const creatures = yield* Creatures;
  const characters = yield* Characters;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );

  // The DM's prep prose. One shared with the table, one not.
  const ferrymanNote = yield* as(
    notes.create(campaign.id, {
      title: "The ferryman's price",
      body: "He asks for a name, not for coin. Nobody has asked him why.",
      kind: "read_aloud",
      visibility: "shared",
    }),
  );
  const crateNote = yield* as(
    notes.create(campaign.id, {
      title: "What is in the crate",
      body: "A ledger, three teeth, and the reason the marsh is quiet.",
      kind: "note",
    }),
  );

  // The same words, in the *other* table. Same account, same DM — so anything
  // that comes back through campaign A is a leak and not a coincidence.
  yield* as(
    notes.create(otherTable.id, {
      title: "The ferryman at Sixpence",
      body: "A different ferryman entirely, and a different crate.",
      kind: "note",
      visibility: "shared",
    }),
  );

  const night = yield* as(sessions.create(campaign.id, { number: 12, visibility: "shared" }));
  const nightElsewhere = yield* as(sessions.create(otherTable.id, { number: 3 }));

  const ferrymanBeat = yield* as(
    beats.create(campaign.id, night.id, { body: FERRYMAN, visibility: "shared" }),
  );
  const crateBeat = yield* as(beats.create(campaign.id, night.id, { body: CRATE }));
  yield* as(
    beats.create(otherTable.id, nightElsewhere.id, {
      body: "The ferryman of Sixpence took the coin after all.",
      visibility: "shared",
    }),
  );

  const shade = yield* as(
    creatures.create(campaign.id, {
      name: "Ferryman's Shade",
      size: "Medium",
      type: "Undead",
      cr: "5",
      ac: 15,
      hp: 82,
      environments: ["River"],
      statBlock: {
        meta: "Medium undead, neutral evil",
        ac: "15 (natural armour)",
        hp: "82 (11d8 + 33)",
        speed: "30 ft.",
        cr: "5 (1,800 XP)",
        abilities: [],
        traits: [{ name: "Nimble Escape", text: "It disengages as a bonus action." }],
      },
      visibility: "shared",
    }),
  );

  // The party. `0012_character_sheet.ts` gave a character a document, which is
  // what makes the people the campaign is about findable at all — before it,
  // this was the one part of the record with no arm over it.
  const brannoc = yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      level: 3,
      species: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
      sheet: {
        notes: "Owes the ferryman a name and has not decided which one.",
        abilities: [],
        traits: [{ name: "Lay on Hands", text: "A pool of fifteen hit points." }],
      },
      visibility: "shared",
    }),
  );
  const pell = yield* as(
    characters.create(campaign.id, {
      name: "Sister Pell",
      playerName: "Dara",
      species: "Human",
      className: "Cleric",
      sheet: { notes: "Knows what is in the crate and will not say.", abilities: [], traits: [] },
    }),
  );
  // Written in a hurry: two columns and no sheet at all, which is the case the
  // snippet fallback exists for.
  const wren = yield* as(
    characters.create(campaign.id, {
      name: "Wren",
      playerName: "Kofi",
      species: "Tiefling",
      className: "Bard",
      visibility: "shared",
    }),
  );
  // The same word again, at the other table, so a character that comes back
  // through campaign A is a leak rather than a coincidence.
  yield* as(
    characters.create(otherTable.id, {
      name: "Sixpence Brannoc",
      species: "Half-orc",
      className: "Paladin",
      sheet: { notes: "A different ferryman entirely.", abilities: [], traits: [] },
      visibility: "shared",
    }),
  );

  const outsider = yield* anAccount("Someone else");
  const outsiderCampaign = yield* withActor(outsider)(
    campaigns.create({ name: "A different table", visibility: "shared" }),
  );

  /** A credential minted for one table: `campaignId` set, not null. */
  const scopedDm = scopedTo(dm, campaign.id);
  const player = yield* aPlayerAt(campaign.id, "Pim");

  return {
    dm,
    scopedDm,
    player,
    outsider,
    outsiderCampaign,
    campaign,
    otherTable,
    night,
    ferrymanNote,
    crateNote,
    ferrymanBeat,
    crateBeat,
    shade,
    brannoc,
    pell,
    wren,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;
let search: (typeof Search)["Service"];
let notes: (typeof Notes)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  search = await runtime.runPromise(Search);
  notes = await runtime.runPromise(Notes);
}, 60_000);

/** The result, failure included, for the cases where the refusal is the point. */
const run = (actor: Actor, campaignId: CampaignId, filter: SearchFilterValues) =>
  runtime.runPromise(withActor(actor)(search.search(campaignId, filter)).pipe(Effect.result));

const found = (
  actor: Actor,
  campaignId: CampaignId,
  q: string,
  source?: SearchSource,
): Promise<ReadonlyArray<SearchHit>> =>
  runtime.runPromise(withActor(actor)(search.search(campaignId, { q, source })));

/** What a hit points at, in a form a `toEqual` can read. */
const keys = (hits: ReadonlyArray<SearchHit>): ReadonlyArray<string> =>
  hits.map((hit) => `${hit.source}:${hit.id}`);

describe("the corpus", () => {
  it("finds the DM's own words across notes, beats, the bestiary and the party at once", async () => {
    const hits = await found(fixture.dm, fixture.campaign.id, "ferryman");

    expect(new Set(hits.map((hit) => hit.source))).toEqual(
      new Set(["note", "beat", "creature", "character"]),
    );
    expect(keys(hits)).toContain(`note:${fixture.ferrymanNote.id}`);
    expect(keys(hits)).toContain(`beat:${fixture.ferrymanBeat.id}`);
    expect(keys(hits)).toContain(`creature:${fixture.shade.id}`);
    expect(keys(hits)).toContain(`character:${fixture.brannoc.id}`);
  });

  it("returns an excerpt with no markup in it", async () => {
    const hits = await found(fixture.dm, fixture.campaign.id, "Cazril");
    const beat = hits.find((hit) => hit.source === "beat");

    expect(beat?.snippet).toContain("Cazril");
    // Postgres would wrap the match in `<b>` given half a chance, and a JSON
    // string carrying HTML is a rendering contract nobody agreed to.
    expect(beat?.snippet).not.toContain("<");
    expect(beat?.snippet).not.toContain("StopSel");
  });

  it("carries the night a beat belongs to, and only on a beat", async () => {
    const hits = await found(fixture.dm, fixture.campaign.id, "crate");
    const beat = hits.find((hit) => hit.source === "beat");
    const note = hits.find((hit) => hit.source === "note");

    expect(beat).toMatchObject({ source: "beat", sessionId: fixture.night.id });
    // The union is what keeps this off the members that have no session — a
    // nullable field here would be one the API does not have, rendered anyway.
    expect(note).not.toHaveProperty("sessionId");
    expect(beat).not.toHaveProperty("title");
  });

  it("narrows to one arm when asked, and to all four when not", async () => {
    const everything = await found(fixture.dm, fixture.campaign.id, "ferryman");
    const onlyBeats = await found(fixture.dm, fixture.campaign.id, "ferryman", "beat");

    expect(onlyBeats.every((hit) => hit.source === "beat")).toBe(true);
    expect(onlyBeats.length).toBeGreaterThan(0);
    expect(onlyBeats.length).toBeLessThan(everything.length);
  });

  it("has no arm over the session log", async () => {
    // The captain's decision, pinned rather than described: `session_event` is
    // not indexed, so a query phrased at the log's own vocabulary finds
    // nothing. Combat is reached by name, by recap, or by reading the log.
    const hits = await found(fixture.dm, fixture.campaign.id, "beat-added");
    expect(hits).toEqual([]);
  });
});

describe("two matchers, because one is not enough", () => {
  it("finds a word the DM is still halfway through typing", async () => {
    // `ILIKE`, not full text: "ferry" is not a lexeme of "ferryman".
    const hits = await found(fixture.dm, fixture.campaign.id, "ferry");
    expect(keys(hits)).toContain(`beat:${fixture.ferrymanBeat.id}`);
  });

  it("finds a creature by a trait that is in no column", async () => {
    // Full text, not `ILIKE`: "nimble escape" is inside the `jsonb` document.
    const hits = await found(fixture.dm, fixture.campaign.id, "nimble escape");
    expect(keys(hits)).toEqual([`creature:${fixture.shade.id}`]);
  });

  it("finds a character by a feature that is only on their sheet", async () => {
    // The same property one table over: "lay on hands" is in the document and
    // in no column, which is the whole reason the sheet is indexed rather than
    // merely stored.
    const hits = await found(fixture.dm, fixture.campaign.id, "lay on hands");
    expect(keys(hits)).toEqual([`character:${fixture.brannoc.id}`]);
  });

  it("finds a character by the player running them", async () => {
    // "Who is Dara running" is a question a DM asks out loud, so `player_name`
    // is a matcher and is indexed at weight B beside the species and the class.
    const hits = await found(fixture.dm, fixture.campaign.id, "Dara");
    expect(keys(hits)).toEqual([`character:${fixture.pell.id}`]);
  });

  it("gives a character with an unwritten sheet its derived line as the excerpt", async () => {
    // `ts_headline` over an empty document is an empty string, and an empty
    // snippet renders as nothing at all on the screen. The fallback is the
    // generated descriptor — the same substitution the creature arm makes to
    // its meta line, and for the same reason.
    const hits = await found(fixture.dm, fixture.campaign.id, "Brannoc");
    const character = hits.find((hit) => hit.source === "character");

    expect(character?.snippet).toContain("ferryman");

    // Wren was written in a hurry and has no sheet, so the excerpt is the line
    // the three columns derive — not an empty string, which renders as nothing.
    const bare = await found(fixture.dm, fixture.campaign.id, "Wren");
    expect(bare.find((hit) => hit.source === "character")?.snippet).toBe("Tiefling Bard");
  });

  it("survives whatever is in the search box", async () => {
    // `to_tsquery` raises a syntax error on this and turns a search field into
    // a 500. `websearch_to_tsquery` does not, and that is why it is used.
    for (const q of ["&", "ferryman & ", "100%", "a_b", "\\", '"unclosed']) {
      const result = await run(fixture.dm, fixture.campaign.id, { q });
      expect(result._tag, `search for ${JSON.stringify(q)} failed`).toBe("Success");
    }
  });

  it("does not read a wildcard out of the DM's search box", async () => {
    // Unescaped, `%` in an `ILIKE` matches everything. Escaped, it matches the
    // rows that contain a literal percent sign — of which there are none.
    const hits = await found(fixture.dm, fixture.campaign.id, "%");
    expect(hits).toEqual([]);
  });
});

describe("scoping — proven, not reasoned about", () => {
  it("refuses another account's campaign outright", async () => {
    const result = await run(fixture.dm, fixture.outsiderCampaign.id, { q: "ferryman" });

    expect(result._tag).toBe("Failure");
    // `NotFound`, not `Forbidden`: saying "it exists but is not yours" is
    // itself a disclosure.
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  });

  it("refuses a campaign the credential was not minted for", async () => {
    // Same account, same DM, a campaign they really do own — and still a 404,
    // because `Actor.campaignId` is the reach of the credential and not a
    // question about the role. Without `campaignInScope` this is the query that
    // returns another table's record.
    const result = await run(fixture.scopedDm, fixture.otherTable.id, { q: "ferryman" });

    expect(result._tag).toBe("Failure");
    expect(result._tag === "Failure" && result.failure).toBeInstanceOf(NotFound);
  });

  it("returns nothing of another campaign's from inside the one it may read", async () => {
    // The leak that would look like a feature: the other table's note and beat
    // contain the same word, and neither may appear here.
    const hits = await found(fixture.scopedDm, fixture.campaign.id, "ferryman");

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.snippet).not.toContain("Sixpence");
      expect(hit.source === "character" && hit.title).not.toBe("Sixpence Brannoc");
      if (hit.source === "beat") expect(hit.sessionId).toBe(fixture.night.id);
    }
  });

  it("gives a campaign-scoped player only the shared rows, in both tables", async () => {
    const here = await found(fixture.player, fixture.campaign.id, "ferryman");
    const crate = await found(fixture.player, fixture.campaign.id, "crate");
    const elsewhere = await run(fixture.player, fixture.otherTable.id, { q: "ferryman" });

    // The shared note, the shared beat and the shared creature — and not the
    // DM-only ones, which is the row's own `visibility` applying inside every
    // arm of the union.
    expect(keys(here)).toContain(`note:${fixture.ferrymanNote.id}`);
    expect(keys(here)).toContain(`beat:${fixture.ferrymanBeat.id}`);
    expect(keys(crate)).not.toContain(`note:${fixture.crateNote.id}`);
    expect(keys(crate)).not.toContain(`beat:${fixture.crateBeat.id}`);

    // The party arm obeys the same rule with no clause of its own: `Brannoc` is
    // `shared` and Sister Pell is not, so a player finds one of them and the
    // crate line on the other's sheet is not a way to reach her.
    expect(keys(here)).toContain(`character:${fixture.brannoc.id}`);
    expect(keys(crate)).not.toContain(`character:${fixture.pell.id}`);

    // And the other table is a 404, not a shorter list.
    expect(elsewhere._tag).toBe("Failure");
  });
});

describe("a generated column cannot go stale", () => {
  it("reflects an edit made through the repository with no reindex step", async () => {
    const before = await found(fixture.dm, fixture.campaign.id, "lamplighter");
    expect(before).toEqual([]);

    await runtime.runPromise(
      withActor(fixture.dm)(
        notes.update(fixture.campaign.id, fixture.crateNote.id, {
          body: "A ledger, three teeth, and a lamplighter's badge.",
        }),
      ),
    );

    const after = await found(fixture.dm, fixture.campaign.id, "lamplighter");
    expect(keys(after)).toEqual([`note:${fixture.crateNote.id}`]);
  });

  it("reflects an edit made behind every line of TypeScript", async () => {
    // This is the whole argument for a generated column over a denormalised
    // `search_document` table: there is no write path to forget, because there
    // is no second copy. `psql` is a write path too.
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          update note set body = 'The tollhouse keeper remembers the ferryman.'
          where note.id = ${fixture.crateNote.id}
        `;
      }).pipe(Effect.orDie),
    );

    const hits = await found(fixture.dm, fixture.campaign.id, "tollhouse");
    expect(keys(hits)).toEqual([`note:${fixture.crateNote.id}`]);

    // And the words that are gone are gone from the index too.
    expect(await found(fixture.dm, fixture.campaign.id, "lamplighter")).toEqual([]);
  });

  it("indexes a row inserted with no repository involved at all", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          insert into beat (session_id, body)
          values (${fixture.night.id}, 'The reeve knew about the weir all along.')
        `;
      }).pipe(Effect.orDie),
    );

    const hits = await found(fixture.dm, fixture.campaign.id, "weir");
    expect(hits.map((hit) => hit.source)).toEqual(["beat"]);
  });
});

describe("ranking", () => {
  it("puts a title match above a body match, and orders the whole union at once", async () => {
    const hits = await found(fixture.dm, fixture.campaign.id, "ferryman");
    const ranks = hits.map((hit) => hit.rank);

    // One ordering over one result set, applied by the database — not three
    // lists concatenated.
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    // Weight A (a note title, a creature name) beats weight B (a body), which
    // is what makes `ts_rank` comparable across arms rather than three scales
    // that only look like one number.
    expect(hits[0]?.source === "note" || hits[0]?.source === "creature").toBe(true);
  });

  it("ranks an ILIKE-only hit at zero rather than pretending to score it", async () => {
    const hits = await found(fixture.dm, fixture.campaign.id, "ferry");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.rank === 0)).toBe(true);
  });

  it("honours a limit", async () => {
    const hits = await runtime.runPromise(
      withActor(fixture.dm)(search.search(fixture.campaign.id, { q: "ferryman", limit: 1 })),
    );
    expect(hits).toHaveLength(1);
  });
});
