import {
  type Actor,
  type AssistantTurnId,
  type CampaignId,
  CurrentActor,
  type NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { type DmActor, DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Notes } from "../src/repo/Notes.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * Membership: the base case every predicate in the product composes, and the
 * two things that keep it from quietly coming undone.
 *
 * `campaignInScope` used to mean "the actor's account owns this campaign". It
 * now means "the actor's account holds a live `campaign_member` row", and
 * nothing else in `repo/visibility.ts` changed shape — which is exactly why
 * this file exists. The seam is a grep away from being reopened by a future
 * query that reaches for `campaign.account_id` because it is still there, and
 * the negative space (a stranger reads *nothing*, from every table) is the part
 * a suite full of positive assertions cannot see.
 *
 * Four blocks:
 *
 *   1. the two greps, in the shape of `seam.test.ts` and `hob.test.ts`
 *   2. a campaign cannot exist without a DM — the composite key, driven
 *   3. a stranger reads nothing, from all fourteen content tables
 *   4. what an account is before anybody invites it
 *
 * The fourth block used to be "no player actor can be minted yet". The invite
 * landed, so it is not that any more; `invites.test.ts` is where the player it
 * mints is measured, and what is left here is the complement — an account
 * nobody has invited still reaches only what it created.
 */

const sourceDirectory = fileURLToPath(new URL("../src", import.meta.url));

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const relative = (path: string): string => path.slice(sourceDirectory.length + 1);

/**
 * A source file with its comments removed, so the rules below can be described
 * in the files they govern. Crude on purpose, exactly as `hob.test.ts`'s is:
 * it does not know about a `//` inside a string literal, and there is no
 * construct here that would produce a false negative.
 */
const code = (path: string): string =>
  readFileSync(`${sourceDirectory}/${path}`, "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\/\/.*$/gm, "");

/**
 * The source files outside the migrations whose *code* matches.
 *
 * Migrations are excluded because they **are** the schema: `0011_membership.ts`
 * necessarily writes both names, and a migration is a historical record rather
 * than a query anyone composes.
 */
const mentioning = (pattern: RegExp): ReadonlyArray<string> =>
  sourceFiles(sourceDirectory)
    .map(relative)
    .filter((path) => !path.startsWith("migrations/"))
    .filter((path) => pattern.test(code(path)))
    .sort();

describe("the reach seam, enforced rather than asserted", () => {
  it("leaves campaign.account_id as ownership, reached by no predicate", () => {
    // The whole cost of this change would be undone by one future predicate
    // written the obvious old way, and nothing about a passing test suite would
    // notice: ownership and membership agree for every row the product can
    // currently produce, and stop agreeing the moment step 4 mints the first
    // player. So the rule is a grep, and it fails on the edit that would break
    // it.
    //
    // `campaign.account_id` is the *spelling* a reach path would have —
    // `repo/visibility.ts` had exactly this and does not any more. Nothing in
    // `src` may qualify the column that way again.
    expect(mentioning(/\bcampaign\.account_id\b/)).toEqual([]);

    // The column name itself is legal on other tables, and the list is how a
    // new one gets looked at. `repo/Memberships.ts` and `repo/visibility.ts`
    // are `campaign_member`'s own column; `repo/Campaigns.ts` is the only
    // writer of the campaign's — whose account this is, the cascade parent and
    // the billing owner and no longer a way in.
    //
    // `repo/Characters.ts` is `character.account_id`, added by
    // `0012_character_sheet.ts`: whose character it is. It is selected and
    // mapped and **named by no predicate**, which is the property this file
    // exists to keep. The write predicate it is a hook for belongs with the
    // step that mints a player actor, and there is no player actor yet.
    expect(mentioning(/\baccount_id\b/)).toEqual([
      "repo/Campaigns.ts",
      "repo/Characters.ts",
      "repo/Memberships.ts",
      "repo/visibility.ts",
    ]);
  });

  it("confines campaign_member to the one module that reads it and the one that writes it", () => {
    // Two modules, one question each. A third would be a second answer to
    // "who reaches this campaign", and the day the two disagree is the day the
    // one that is wrong is the one nobody is looking at.
    expect(mentioning(/\bcampaign_member\b/)).toEqual([
      "repo/Memberships.ts",
      "repo/visibility.ts",
    ]);
  });

  it("mints exactly two memberships, and neither takes a role", () => {
    // The old rule here was that **nothing** in `src` writes a `player`
    // membership, which was the honest state of the product until the invite
    // landed: `addOwner` took no role, so a player membership was not something
    // a caller might forget to refuse — it was not expressible. That is spent,
    // and what replaces it has to be at least as structural, because the thing
    // it now keeps out is worse than a player: a DM.
    expect(mentioning(/insert into campaign_member/)).toEqual(["repo/Memberships.ts"]);

    // Two writers, and each spells its role as a **SQL literal** rather than
    // taking one. So "an invitation cannot become a DM membership" is a fact
    // about which statements exist rather than a check somebody performs — and
    // a third role literal, or one interpolated from a variable, fails here.
    const memberships = code("repo/Memberships.ts");
    expect(memberships.match(/, '(dm|player)'\)/g)).toEqual([", 'dm')", ", 'player')"]);

    // …and no membership writer accepts a role. `MemberRole` still names both
    // values — the column carries both from the first migration so that co-DMs
    // stay additive — and it appears in this file as the *column type of a row a
    // read maps*, which is `readonly role: MemberRole;`. A parameter is the same
    // words followed by a comma or a closing bracket, and there is none.
    expect(memberships).not.toMatch(/\brole: MemberRole[,)]/);

    // The invite repository, which is what mints the first player the product
    // has ever had, does not mention a role at all: it calls `admitPlayer`,
    // which has only one.
    expect(code("repo/Invites.ts")).not.toMatch(/\brole\b/);
  });
});

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
    Campaigns.layer,
    Characters.layer,
    Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
    Creatures.layer,
    DmActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    HobThreads.layer,
    Notes.layer,
    PrepItems.layer,
    SessionEvents.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_membership"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** The DM proof, for whichever actor the enclosing `withActor` provided. */
const dmOf = (campaignId: CampaignId): Effect.Effect<DmActor, NotFound, CurrentActor | DmActors> =>
  Effect.flatMap(DmActors, (dmActors) => dmActors.of(campaignId));

/**
 * One campaign with a row in every content table, and one stranger who is a DM
 * of their own campaign somewhere else.
 *
 * Every row is left at the column default for `visibility` — `dm` — because the
 * question here is reach and not sharing: a stranger must not have the shared
 * ones either, and `visibility.test.ts` is where that half lives.
 */
const makeFixture = Effect.gen(function* () {
  const beats = yield* Beats;
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const combatants = yield* Combatants;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const hob = yield* HobThreads;
  const notes = yield* Notes;
  const prep = yield* PrepItems;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Ada");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road" }));
  const session = yield* as(sessions.create(campaign.id, { number: 12 }));
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));

  yield* as(characters.create(campaign.id, { name: "Brannoc", playerName: "Ilse" }));
  yield* as(notes.create(campaign.id, { title: "The crate" }));
  yield* as(
    beats.create(campaign.id, session.id, { body: "The ferryman would not say his name." }),
  );
  yield* as(prep.create(campaign.id, session.id, { label: "Reread the ford" }));

  const creature = yield* as(
    creatures.create(campaign.id, {
      name: "Bullywug Croaker",
      type: "humanoid",
      cr: "1/4",
      ac: 15,
      hp: 11,
    }),
  );
  const encounter = yield* as(encounters.create(campaign.id, { name: "Ambush in the reeds" }));
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: creature.id, count: 6 }));

  const asDm = yield* as(dmOf(campaign.id));
  const run = yield* as(runs.start(asDm, session.id, { encounterId: encounter.id }));
  yield* as(combatants.create(asDm, session.id, run.id, { displayName: "Croaker 1" }));

  const thread = yield* as(hob.start(campaign.id, "Who is the ferryman?"));
  yield* as(
    hob.append(campaign.id, thread.id, {
      id: randomUUID() as AssistantTurnId,
      who: "user",
      text: "Who is the ferryman?",
    }),
  );

  return {
    dm,
    /** A DM of their own table, and a stranger to this one. */
    stranger: yield* anAccount("Bo"),
    campaign,
    session,
    encounter,
    run,
    thread,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

/**
 * The shipped read for each content table, keyed by the table it reads.
 *
 * Table-driven on purpose. The suite proves the positive cases richly and the
 * negative ones case by case, which is what makes the *fifteenth* table the
 * dangerous one: it would be read by a new repository, tested for what it
 * returns, and never asked what it returns to somebody who should have nothing.
 * The first assertion below fails if a table is added without an entry here.
 */
const READS: Record<
  string,
  (
    f: Effect.Success<typeof makeFixture>,
  ) => Effect.Effect<
    ReadonlyArray<unknown>,
    { readonly _tag: string },
    | Beats
    | Campaigns
    | Characters
    | Combatants
    | Creatures
    | CurrentActor
    | DmActors
    | EncounterCreatures
    | EncounterRuns
    | Encounters
    | HobThreads
    | Notes
    | PrepItems
    | SessionEvents
    | Sessions
  >
> = {
  campaign: () => Effect.flatMap(Campaigns, (r) => r.list),
  session: (f) => Effect.flatMap(Sessions, (r) => r.list(f.campaign.id)),
  character: (f) => Effect.flatMap(Characters, (r) => r.list(f.campaign.id)),
  note: (f) => Effect.flatMap(Notes, (r) => r.list(f.campaign.id)),
  beat: (f) => Effect.flatMap(Beats, (r) => r.list(f.campaign.id, f.session.id)),
  prep_item: (f) => Effect.flatMap(PrepItems, (r) => r.list(f.campaign.id, f.session.id)),
  creature: (f) => Effect.flatMap(Creatures, (r) => r.list(f.campaign.id, {})),
  encounter: (f) => Effect.flatMap(Encounters, (r) => r.list(f.campaign.id)),
  encounter_creature: (f) =>
    Effect.flatMap(EncounterCreatures, (r) => r.list(f.campaign.id, f.encounter.id)),
  // The three DM-gated tables. The proof is obtained the same way `src` obtains
  // it — from the ambient actor — so a stranger fails at the gate rather than
  // at the read, which is the `NotFound` branch this file already allows for.
  encounter_run: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(EncounterRuns, (r) => r.list(dm, f.session.id)),
    ),
  combatant: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(Combatants, (r) => r.list(dm, f.session.id, f.run.id)),
    ),
  session_event: (f) =>
    Effect.flatMap(dmOf(f.campaign.id), (dm) =>
      Effect.flatMap(SessionEvents, (r) => r.list(dm, f.session.id, {})),
    ),
  assistant_thread: (f) => Effect.flatMap(HobThreads, (r) => r.list(f.campaign.id)),
  assistant_turn: (f) => Effect.flatMap(HobThreads, (r) => r.turns(f.campaign.id, f.thread.id)),
};

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("a campaign cannot exist without a DM", () => {
  /**
   * What buys back the one thing membership genuinely weakens.
   *
   * A player's write refusal used to be a literal — `campaignWritable` compiled
   * to the constant `false`. It is now a row, so the question "can that row go
   * missing" has to have a structural answer rather than a careful one.
   * `campaign_owner_is_dm_member` is that answer, and these are its edges.
   */
  const attempt = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    // `Effect.exit`, not `Effect.result`: a deferred constraint fails at COMMIT,
    // and `sql.withTransaction` wraps the commit in `Effect.orDie` — so the
    // refusal arrives as a defect. See the note in `schema.test.ts`.
    runtime.runPromise(Effect.exit(effect));

  const sqlOf = <A>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown, never>) =>
    Effect.flatMap(SqlClient.SqlClient, f);

  it("refuses a campaign written with no member row", async () => {
    const refused = await attempt(
      sqlOf(
        (sql) =>
          sql`insert into campaign ${sql.insert({ account_id: fixture.dm.accountId, name: "No DM" })}`,
      ),
    );

    expect(refused._tag).toBe("Failure");
  });

  it("accepts a campaign and its owner's membership in one transaction", async () => {
    // Which is what `Campaigns.create` does, and the reason the key is
    // deferred rather than immediate: two statements, and neither order is
    // legal if the check fires at once.
    const accepted = await attempt(
      sqlOf((sql) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{ readonly id: string }>`
              insert into campaign ${sql.insert({
                account_id: fixture.dm.accountId,
                name: "With a DM",
              })}
              returning id
            `;
            yield* sql`
              insert into campaign_member ${sql.insert({
                campaign_id: rows[0]!.id,
                account_id: fixture.dm.accountId,
                role: "dm",
              })}
            `;
          }),
        ),
      ),
    );

    expect(accepted._tag).toBe("Success");
  });

  it("refuses demoting, revoking or deleting the owner's own membership", async () => {
    // All three on the *referenced* side of the key, so all three are refused
    // on the spot rather than at some later commit — which is the behaviour you
    // want from a statement typed into `psql` at two in the morning.
    const demoted = await attempt(
      sqlOf(
        (sql) =>
          sql`update campaign_member set role = 'player' where campaign_id = ${fixture.campaign.id}`,
      ),
    );
    const revoked = await attempt(
      sqlOf(
        (sql) =>
          sql`update campaign_member set revoked_at = now() where campaign_id = ${fixture.campaign.id}`,
      ),
    );
    const deleted = await attempt(
      sqlOf(
        (sql) =>
          sql`delete from campaign_member where campaign_id = ${fixture.campaign.id} and account_id = ${fixture.dm.accountId}`,
      ),
    );

    expect(demoted._tag).toBe("Failure");
    expect(revoked._tag).toBe("Failure");
    expect(deleted._tag).toBe("Failure");

    // …and the DM can still write, so the refusals above kept something real.
    const still = await runtime.runPromise(
      withActor(fixture.dm)(
        Effect.flatMap(Campaigns, (r) => r.update(fixture.campaign.id, { partyName: "Gilded" })),
      ),
    );
    expect(still.partyName).toBe("Gilded");
  });

  it("lets a player member leave, and deletes the campaign with its members", async () => {
    // The other direction, so the key is not simply refusing everything. A
    // player leaving is an ordinary act; the owner leaving is not.
    const gone = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const campaign = yield* withActor(fixture.dm)(
          Effect.flatMap(Campaigns, (r) => r.create({ name: "A table to leave" })),
        );
        const guest = yield* anAccount("Pim");
        yield* sql`
          insert into campaign_member ${sql.insert({
            campaign_id: campaign.id,
            account_id: guest.accountId,
            role: "player",
          })}
        `;
        const left = yield* sql`
          delete from campaign_member where account_id = ${guest.accountId}
        `.pipe(Effect.exit);
        const removed = yield* sql`delete from campaign where id = ${campaign.id}`.pipe(
          Effect.exit,
        );
        const remaining = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from campaign_member
          where campaign_id = ${campaign.id}
        `;
        return { left: left._tag, removed: removed._tag, remaining: remaining[0]!.count };
      }).pipe(Effect.orDie),
    );

    expect(gone).toEqual({ left: "Success", removed: "Success", remaining: 0 });
  });
});

describe("a stranger reads nothing", () => {
  it("has a shipped read named for every content table", async () => {
    // The guard on the guard, and the thing that makes the fifteenth table
    // fail loudly rather than silently go unchecked.
    const tables = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{ readonly table_name: string }>`
          select table_name from information_schema.tables
          where table_schema = 'public'
            and table_name not in (
              'account', 'campaign_member', 'campaign_invite', 'effect_sql_migrations'
            )
          order by table_name
        `;
        return rows.map((row) => row.table_name);
      }).pipe(Effect.orDie),
    );

    expect(Object.keys(READS).sort()).toEqual(tables);
  });

  for (const [table, read] of Object.entries(READS)) {
    it(`gives ${table} to its DM and nothing at all to a stranger`, async () => {
      const mine = await runtime.runPromise(
        withActor(fixture.dm)(read(fixture)).pipe(Effect.result),
      );
      const theirs = await runtime.runPromise(
        withActor(fixture.stranger)(read(fixture)).pipe(Effect.result),
      );

      // The fixture really has something to miss — otherwise "nothing" is
      // trivially true and this file proves less than it appears to.
      expect(mine._tag, `the DM's own read of ${table} failed`).toBe("Success");
      expect(
        mine._tag === "Success" ? mine.success.length : 0,
        `${table} has no row for a stranger to miss`,
      ).toBeGreaterThan(0);

      // Either a `NotFound` — a read that names an unreachable parent says so
      // rather than returning an empty list that reads as "there is nothing
      // here" — or no rows. Never a `Forbidden`: "it exists but is not yours"
      // is itself a disclosure.
      if (theirs._tag === "Success") {
        expect(theirs.success, `${table} leaked rows to a stranger`).toEqual([]);
      } else {
        expect(theirs.failure._tag, `${table} refused a stranger with the wrong error`).toBe(
          "NotFound",
        );
      }
    });
  }
});

describe("what an account is before anybody invites it", () => {
  it("gives a machine token an actor with no role on it at all", async () => {
    // The retrofit's load-bearing property, restated as an assertion because it
    // is otherwise only visible as the absence of a compile error. A role on
    // the credential could not be right: a person is the DM of one table and a
    // player at another on the same one.
    const actor = await runtime.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const issued = yield* accounts.issue("Jo");
        return yield* accounts.actorForToken(issued.token);
      }).pipe(Effect.orDie),
    );

    expect(actor._tag).toBe("Some");
    expect(actor._tag === "Some" ? Object.keys(actor.value).sort() : []).toEqual([
      "accountId",
      "campaignId",
    ]);
  });

  it("makes every campaign an uninvited account reaches one it is the DM of", async () => {
    // The other membership writer now exists — `Invites.redeem` — but it is the
    // *only* other one, and it runs when a person accepts an invitation. So an
    // account nobody has invited is still a DM of everything it reaches, which
    // is what keeps a campaign's own creation from quietly acquiring players.
    // `invites.test.ts` is where the redeemed half is pinned.
    const rows = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly role: string; readonly count: number }>`
          select campaign_member.role, count(*)::int as count
          from campaign_member
          join account on account.id = campaign_member.account_id
          where account.name in ('Ada', 'Bo', 'Jo')
          group by campaign_member.role
        `;
      }).pipe(Effect.orDie),
    );

    expect(rows.map((row) => row.role)).toEqual(["dm"]);
  });
});
