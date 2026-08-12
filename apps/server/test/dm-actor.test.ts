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
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The DM gate: **the three live repositories cannot be reached without a proof,
 * and the proof cannot be made without the membership check.**
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

  it("takes the proof on every method of all three repositories", () => {
    // A method added to one of these and given a campaign id instead makes this
    // fail to compile, which is what stops the fifteenth being the leak. The
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

    expect([
      Object.keys(combatants).length,
      Object.keys(runs).length,
      Object.keys(events).length,
    ]).toEqual([5, 7, 3]);
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

  it("gates fifteen methods and leaves the other fifty-three alone", () => {
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

    expect(gated).toBe(15);
    // 53 remaining service methods, plus `DmActors.of` itself — which requires
    // `CurrentActor` like any other read and is what turns one into a proof —
    // plus the inner helper in `Proposals.ts` that restates its own service
    // method's signature. That duplicate is one of the two the plan's 69
    // counted as methods.
    expect(ungated).toBe(55);
  });
});

/** Unreachable — only here so a `Result` can be narrowed without a non-null. */
const never = (): never => {
  throw new Error("unreachable");
};
