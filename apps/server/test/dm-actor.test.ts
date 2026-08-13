import { type CampaignId, CurrentActor, NotFound, type SessionId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { type DmActor, DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Memberships } from "../src/repo/Memberships.js";
import { Recap } from "../src/repo/Recap.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The DM gate: **the wide reads cannot be reached without a proof, and the
 * proof cannot be made without the membership check.**
 *
 * Five repositories now. The three live ones came first; `Recap.read` joined
 * them when the player projection landed, and `Memberships.list` arrived gated
 * on the day the endpoint did — which is the standing rule working — *when a
 * table's player projection diverges from its DM projection, its DM repository
 * takes a `DmActor` in the same change.*
 *
 * The fifth is the one where the player projection is *nothing*: a member list
 * is other people's account names and the shape of somebody's table. So unlike
 * `Recap` there is no narrow method beside the gated one, and unlike the live
 * three the thing being kept back is not a number but the roster itself.
 *
 * This lands before the invite that mints the first player actor, deliberately.
 * A boundary put in afterwards would leave one release in which player actors
 * exist and these methods accept one, which is the difference between a
 * boundary and a race.
 *
 * Four blocks, and the first two are the ones that make the property structural
 * rather than reviewed:
 *
 *   1. the compiler — a campaign id, an `Actor` and a forged object are all
 *      rejected where the proof is required, asserted with `@ts-expect-error`
 *      so this file fails to *build* if any of them starts to be accepted
 *   2. the single construction site, in the shape of `membership.test.ts`'s and
 *      `hob.test.ts`'s greps
 *   3. what the check actually refuses, against real Postgres
 *   4. the scope, counted rather than assumed
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Campaigns.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_dm_actor")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

/**
 * One DM with two tables, one player at the first, one stranger.
 *
 * Both campaigns are `shared` and so is the first one's night, so every refusal
 * below is about the projection rather than about a row that was never there.
 */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const encounters = yield* Encounters;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "Ambush in the reeds", visibility: "shared" }),
  );
  const session = yield* as(sessions.create(campaign.id, { number: 12, visibility: "shared" }));

  return {
    dm,
    player: yield* aPlayerAt(campaign.id, "Pim"),
    stranger: yield* anAccount("Bo"),
    campaign,
    otherTable,
    encounter,
    session,
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

describe("the compiler carries it", () => {
  /**
   * Never called. Every line in it is a call the type system must refuse, and
   * `@ts-expect-error` inverts each one — so `pnpm -F server typecheck` fails
   * if any of these ever starts to compile. That is the half of this property
   * a runtime assertion cannot reach: "there is no way to call it wrongly" is
   * a statement about programs that do not exist.
   */
  const refusedByTheCompiler = (
    combatants: (typeof Combatants)["Service"],
    runs: (typeof EncounterRuns)["Service"],
    events: (typeof SessionEvents)["Service"],
    memberships: (typeof Memberships)["Service"],
    campaignId: CampaignId,
    sessionId: SessionId,
    actor: (typeof CurrentActor)["Service"],
    proof: DmActor,
  ) => {
    // The campaign id in the path is a claim. It is what these methods used to
    // take, and it proves nothing about who is asking.
    // @ts-expect-error the proof is what the method takes, not the id
    runs.list(campaignId, sessionId);
    // @ts-expect-error the proof is what the method takes, not the id
    combatants.list(campaignId, sessionId, sessionId);
    // @ts-expect-error the proof is what the method takes, not the id
    events.list(campaignId, sessionId, {});
    // The roster takes the proof and *nothing else* — the campaign travels
    // inside it — so naming a campaign is not a call with a spare argument, it
    // is the wrong argument in the only position there is.
    // @ts-expect-error the proof is what the method takes, not the id
    memberships.list(campaignId);

    // The actor `Authorization` resolved is not a proof either: it carries no
    // role, and cannot — a person is the DM of one table and a player at
    // another on the same credential.
    // @ts-expect-error an Actor is half of the pair, and the wrong half alone
    runs.list(actor, sessionId);

    // And it cannot be forged: the brand is a module-private `unique symbol`,
    // so an object with the two visible fields is not one, and the assertion
    // that would paper over it is not legal either.
    // @ts-expect-error the brand is missing, and it is not writable from here
    runs.list({ actor, campaign: campaignId }, sessionId);
    // @ts-expect-error `Actor` and `DmActor` do not overlap, so this is not a cast
    runs.list(actor as DmActor, sessionId);

    // The one shape that does compile.
    return runs.list(proof, sessionId);
  };

  it("refuses every call that skips the check", () => {
    // The assertions are the six lines above, checked at build time. This one
    // only keeps the function referenced, so nothing drops it as dead code.
    expect(typeof refusedByTheCompiler).toBe("function");
  });

  it("takes the proof on every method of all three repositories, and on the wide recap", () => {
    // A method added to one of these and given a campaign id instead makes this
    // fail to compile, which is what stops the next one being the leak. The
    // keys are named rather than derived, so a new method is a visible edit
    // here as well — the same rule `adherence.test.ts` uses for components.
    const combatants: GatedOn<(typeof Combatants)["Service"]> = {
      list: true,
      create: true,
      update: true,
      damage: true,
      remove: true,
    };
    const runs: GatedOn<(typeof EncounterRuns)["Service"]> = {
      list: true,
      findById: true,
      start: true,
      resume: true,
      update: true,
      nextTurn: true,
      end: true,
    };
    const events: GatedOn<(typeof SessionEvents)["Service"]> = {
      list: true,
      listForRun: true,
      // The streaming spelling, which a grep for `CurrentActor>` does not see
      // because it always took its actor as an argument. Ungated it would have
      // left the other two decorative — the stream is the wide read.
      pollForRun: true,
    };

    // `Recap` is the fourth, and the only one that is gated in part: `read`
    // assembles whole `Combatant` values and takes the proof, `readAsPlayer`
    // answers the narrow `PlayerSessionRecap` and takes an ordinary actor. So
    // it cannot be a `GatedOn<…>` — a partial gate is exactly the shape that
    // needs saying out loud rather than deriving.
    const recap: {
      readonly read: ExactlyDmActor<Parameters<(typeof Recap)["Service"]["read"]>[0]>;
      readonly readAsPlayer: ExactlyDmActor<
        Parameters<(typeof Recap)["Service"]["readAsPlayer"]>[0]
      >;
    } = { read: true, readAsPlayer: false };

    // `Memberships` is the fifth, and the second that is gated in part — for a
    // different reason from `Recap`'s. `list` is *who is at this table* and
    // takes the proof; `mine` is *which tables am I at*, an `Effect` rather
    // than a function, and it is not gated because the campaigns a credential
    // already reaches are not a disclosure to the credential that reaches
    // them. Named rather than derived, so that an ungated third method here
    // would be a visible edit.
    const memberships: {
      readonly list: ExactlyDmActor<Parameters<(typeof Memberships)["Service"]["list"]>[0]>;
      readonly mine: false;
    } = { list: true, mine: false };

    expect([
      Object.keys(combatants).length,
      Object.keys(runs).length,
      Object.keys(events).length,
      Object.keys(recap).length,
      Object.keys(memberships).length,
    ]).toEqual([5, 7, 3, 2, 2]);
  });
});

/** `true` only where this method's first parameter is exactly a `DmActor`. */
type ExactlyDmActor<A> = [A] extends [DmActor] ? ([DmActor] extends [A] ? true : false) : false;

type GatedOn<S> = {
  [K in keyof S]-?: S[K] extends (...args: never) => unknown
    ? ExactlyDmActor<Parameters<S[K]>[0]>
    : false;
};

describe("the proof has one construction site", () => {
  const sourceDirectory = fileURLToPath(new URL("../src", import.meta.url));

  const sourceFiles = (directory: string): ReadonlyArray<string> =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    });

  /**
   * Comments stripped, so the rule can be described in the files it governs —
   * crude on purpose, exactly as `membership.test.ts`'s and `hob.test.ts`'s are.
   */
  const code = (path: string): string =>
    readFileSync(path, "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/\/\/.*$/gm, "");

  /**
   * Source files outside the migrations whose *code* matches. Migrations are
   * excluded for `membership.test.ts`'s reason: they **are** the schema, and a
   * migration is a historical record rather than a query anyone composes.
   */
  const mentioning = (pattern: RegExp): ReadonlyArray<string> =>
    sourceFiles(sourceDirectory)
      .map((path) => path.slice(sourceDirectory.length + 1))
      .filter((path) => !path.startsWith("migrations/"))
      .filter((path) => pattern.test(code(`${sourceDirectory}/${path}`)))
      .sort();

  it("is minted in exactly one file, and nowhere near a `campaign_member`", () => {
    // A second `as DmActor` anywhere would be a second answer to "is this
    // actor a DM here", and the day the two disagree is the day the one that
    // is wrong is the one nobody is looking at. `as unknown as` is named too,
    // because that is the spelling a private brand pushes someone towards.
    expect(mentioning(/as DmActor\b/)).toEqual(["repo/DmActor.ts"]);
    expect(mentioning(/as unknown as/)).toEqual([]);

    // And the check composes the shipped predicate rather than writing its
    // own: `membership.test.ts` still holds that only two modules in `src` may
    // name the table, and this is not one of them.
    expect(mentioning(/\bcampaign_member\b/)).toEqual([
      "repo/Memberships.ts",
      "repo/visibility.ts",
    ]);
  });
});

describe("what the check refuses", () => {
  const proofFor = (actor: (typeof CurrentActor)["Service"], campaignId: CampaignId) =>
    runtime.runPromise(asDm(actor, campaignId).pipe(Effect.result));

  it("gives the campaign's DM a proof that works", async () => {
    const proof = await proofFor(fixture.dm, fixture.campaign.id);
    expect(proof._tag).toBe("Success");

    const listed = await runtime.runPromise(
      Effect.flatMap(EncounterRuns, (runs) =>
        runs.list(proof._tag === "Success" ? proof.success : never(), fixture.session.id),
      ).pipe(Effect.orDie),
    );
    expect(listed).toEqual([]);
  }, 60_000);

  it("carries the campaign inside it, so there is no second id to disagree", async () => {
    // The reason the gated methods take the proof *in place of* a campaign id
    // rather than beside one: a proof obtained for the first table cannot be
    // spent on a read of the second, because there is nowhere to name the
    // second. A `DmActor` is a fact about a pair, exactly as `isDm` is.
    const proof = await runtime.runPromise(
      asDm(fixture.dm, fixture.campaign.id).pipe(Effect.orDie),
    );

    expect(Object.keys(proof).sort()).toEqual(["actor", "campaign"]);
    expect(proof.campaign).toBe(fixture.campaign.id);
    expect(proof.actor).toEqual(fixture.dm);
  }, 60_000);

  it("refuses a player of the campaign, with a NotFound and not a Forbidden", async () => {
    // The whole point of the step. "It exists but is not yours" is itself a
    // disclosure, so the refusal is the same 404 every other denial answers
    // with — and it names the campaign, because that is what could not be had.
    const refused = await proofFor(fixture.player, fixture.campaign.id);

    expect(refused._tag).toBe("Failure");
    expect(refused._tag === "Failure" && refused.failure).toBeInstanceOf(NotFound);
    expect(refused._tag === "Failure" && (refused.failure as NotFound).resource).toBe("campaign");
  }, 60_000);

  it("refuses a stranger, and a campaign that does not exist", async () => {
    const stranger = await proofFor(fixture.stranger, fixture.campaign.id);
    const nothing = await proofFor(fixture.dm, crypto.randomUUID() as CampaignId);

    expect(stranger._tag).toBe("Failure");
    expect(nothing._tag).toBe("Failure");
  }, 60_000);

  it("refuses a credential scoped to another table, though the account is its DM", async () => {
    // Two independent narrowings, and both apply to the proof: membership says
    // which campaigns the account touches at all, credential scope narrows that
    // further. Deliberately not keyed on the role — a scoped credential minted
    // later for something other than a player must not reach past its campaign
    // either.
    const scoped = scopedTo(fixture.dm, fixture.campaign.id);

    const elsewhere = await proofFor(scoped, fixture.otherTable.id);
    const own = await proofFor(scoped, fixture.campaign.id);

    expect(elsewhere._tag).toBe("Failure");
    expect(own._tag).toBe("Success");
  }, 60_000);

  it("still lets the SQL predicate do its own work underneath", async () => {
    // The proof is a precondition on the seam, not a replacement for it. A
    // session of another campaign named through a proof for this one is still
    // refused by `ensureNestedParentReadable`, exactly as before — so the
    // failure mode of a bug in the gate is today's behaviour rather than an
    // open door.
    const proof = await runtime.runPromise(
      asDm(fixture.dm, fixture.campaign.id).pipe(Effect.orDie),
    );
    const theirNight = await runtime.runPromise(
      Effect.flatMap(Sessions, (sessions) =>
        sessions.create(fixture.otherTable.id, { number: 1 }),
      ).pipe(Effect.provideService(CurrentActor, fixture.dm), Effect.orDie),
    );

    const smuggled = await runtime.runPromise(
      Effect.flatMap(EncounterRuns, (runs) => runs.list(proof, theirNight.id)).pipe(Effect.flip),
    );
    expect(smuggled).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the scope, counted", () => {
  const repoDirectory = fileURLToPath(new URL("../src/repo", import.meta.url));

  const code = (name: string): string =>
    readFileSync(`${repoDirectory}/${name}`, "utf8")
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/\/\/.*$/gm, "");

  const files = (): ReadonlyArray<string> =>
    readdirSync(repoDirectory).filter((name) => name.endsWith(".ts"));

  it("gates seventeen methods and leaves the other sixty alone", () => {
    // The plan costed this at 14 of 69 by grepping `CurrentActor>` across
    // `src/repo`. Two corrections, both measured here rather than argued:
    //
    // - that grep counted 69 occurrences but only 67 declarations; one was
    //   prose in a doc comment and one was an inner helper repeating its own
    //   service method's signature;
    // - `SessionEvents.pollForRun` is a 68th actor-scoped method the grep
    //   cannot see, because it takes its actor as an argument. It is the live
    //   stream, so it is gated too — hence fifteen, not fourteen.
    //
    // The sixteenth is `Recap.read`, which the doc comment on `DmActor.ts` used
    // to name as "the next candidate" and leave alone. It was not a candidate,
    // it was a live disclosure: it assembles whole `Combatant` values, and a
    // player of a `shared` campaign could read a monster's exact hit points and
    // armour class out of it. The gate closed the wide read and
    // `Recap.readAsPlayer` is what a player gets instead.
    //
    // What is left alone is left alone on purpose: every one of those returns a
    // `shared` row a player is entitled to see in full, so a player calling
    // `GET …/notes` and receiving the ordinary `Note` discloses nothing.
    const gated = files().reduce(
      (total, name) => total + (code(name).match(/\bdm: DmActor\b/g) ?? []).length,
      0,
    );
    const ungated = files().reduce(
      (total, name) => total + (code(name).match(/CurrentActor>/g) ?? []).length,
      0,
    );

    // The seventeenth is `Memberships.list`, and it is the one that cost
    // nothing to get right: it was gated in the change that declared the
    // endpoint, so there is no release in which `GET /campaigns/:c/members`
    // answered a player. That is the "gate first, project later" lesson
    // `Recap.read` paid for, applied on the day rather than afterwards — and
    // here there is no later projection to defer, because the narrow version of
    // a member list is no member list.
    expect(gated).toBe(17);
    // 60 remaining service methods, plus `DmActors.of` itself — which requires
    // `CurrentActor` like any other read and is what turns one into a proof —
    // plus the inner helper in `Proposals.ts` that restates its own service
    // method's signature. That duplicate is one of the two the plan's 69
    // counted as methods.
    //
    // It was 55 before the invite: `Invites` adds four (`list`, `create`,
    // `revoke`, `redeem` — `preview` is the one read in the product that
    // requires no actor at all, deliberately, because it answers before its
    // reader has an account) and `Memberships.mine` adds the fifth. None is
    // gated, and none should be: an invitation is a DM's own resource behind
    // `campaignWritable`, and `mine` returns the campaigns this credential
    // already reaches.
    //
    // `Memberships.list` did not move it either, which is the arithmetic to
    // notice a second time: it takes the proof and requires no `CurrentActor`,
    // so it lands in `gated` above and nowhere here. A gated method is not an
    // ungated one that grew a check.
    //
    // The sixty-first is `Characters.damage` (`0014`), and it is ungated
    // deliberately: a character is the row a player is *most* entitled to see
    // in full, so gating the party would decide the player fight view's shape
    // by accident. What the live columns do change is the question, and it is
    // worth stating where the answer will have to be given: a `shared`
    // character now carries exact current hit points, so step 8's projection
    // has a real decision to make about somebody else's character. It has none
    // to make about their own.
    //
    // The count did not move when `Recap` was split, which is the arithmetic
    // worth noticing: `read` gave one up to the gate and `readAsPlayer` took
    // one back. A narrowed projection is an ordinary actor-scoped read — it is
    // the *type* that keeps it narrow, not the proof.
    //
    // The sixty-second is `Characters.assign`, which says whose character a row
    // is. Ungated for the reason the rest of `Characters` is, and one more: it
    // is a **write**, and `rowWritable` already requires `isDm` — a proof on
    // top would be a second answer to a question the predicate underneath
    // answers first, which is the shape `DmActor.ts` warns against. The gate is
    // for reads whose *player projection diverges*, and assignment has no
    // player projection at all.
    //
    // The sixty-third is `Characters.mine` — `GET /me/characters`. It is the
    // mirror of `Memberships.mine` and ungated for the mirror-image reason: the
    // characters an account already owns, in campaigns its credential already
    // reaches, are not a disclosure to that credential. It is also the only read
    // in the product that is *narrower* than what the actor may see, because
    // `ownRowReadable` conjoins ownership onto the same predicate
    // `characters.list` composes — so it cannot answer a row the gate would have
    // been protecting, one campaign at a time.
    //
    // The sixty-fourth is `Characters.updateOwn` — `PATCH /me/characters/:id`,
    // and the first write in the product a non-DM may make. It is the one entry
    // here that is ungated because the gate would answer the *wrong question*
    // rather than a redundant one: a `DmActor` is a proof that this account is
    // the campaign's DM, and the whole point of this method is that its caller
    // is not. What bounds it is `ownRowWritable` — ownership conjoined with the
    // same campaign gate the reads use, so it can never reach a row
    // `ownedRowReadable` refuses — and `CharacterOwnUpdate`, which has no field
    // for a live column. Two boundaries, neither of them a proof, and
    // `player-write.test.ts` pins both.
    expect(ungated).toBe(64);
  });
});

/** Unreachable — only here so a `Result` can be narrowed without a non-null. */
const never = (): never => {
  throw new Error("unreachable");
};
