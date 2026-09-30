import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type EncounterRunId,
  NEUTRAL_RUN_NAMES,
  type PlayerSessionRecap,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Exit, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import { Encounters } from "../src/repo/Encounters.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Recap } from "../src/repo/Recap.js";
import { aCharacterAt, admittedTo, aGroupMemberAt, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A player reads an encounter only when it is Shared *and* Ready, and a
 * shared fight names only an encounter the player may read.**
 *
 * The captain's decision of 2026-09-25. Draft and Shared are two switches, and
 * a player used to read a Shared draft exactly as a Shared ready one; and a
 * fight shared from an unshared draft put that draft's name on the player's
 * Overview and Chronicle. Over the real application and Postgres, through the
 * client derived from the contract, with actors minted the shipped way: the
 * creator, a player admitted through a real invitation with a shared seat, and
 * a Shared World member who is not at the table, who is told a night's fights
 * by no name the table's players are not.
 *
 * Every encounter's name is a planted sentinel, so "the player never sees it"
 * is a search of the bytes on the wire rather than of a decoded field.
 */

const database = migratedDatabase("taverns_test_encounter_drafts");
const services = servicesOver(database);
const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
      }),
    ),
  );

/** A raw GET: the status and the bytes, which is what a leak would be in. */
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

type Label = "SHARED-READY" | "SHARED-DRAFT" | "UNSHARED-READY" | "UNSHARED-DRAFT";

const COMBINATIONS: ReadonlyArray<readonly [Label, "dm" | "shared", boolean]> = [
  ["SHARED-READY", "shared", true],
  ["SHARED-DRAFT", "shared", false],
  ["UNSHARED-READY", "dm", true],
  ["UNSHARED-DRAFT", "dm", false],
];

const nameOf = (label: Label) => `ENC-${label}`;

const makeFixture = Effect.gen(function* () {
  const dm = yield* aPerson("Dee");
  const pip = yield* aPerson("Pip");
  const table: CampaignId = (yield* as(dm.token, (client) =>
    client.campaigns.create({ payload: { name: "The Drowned Chapel", visibility: "shared" } }),
  )).id;
  const seated = yield* admittedTo(table, pip.actor, "Pip");
  yield* aCharacterAt(
    table,
    seated,
    { name: "Pip's rogue", level: 3, hpMax: 21 },
    { seatVisibility: "shared" },
  );
  const hag = yield* as(dm.token, (client) =>
    client.library.create({
      payload: { name: "Marsh Hag", size: "Medium", type: "Fey", cr: "2", ac: 17, hp: 82 },
    }),
  );
  const ids = {} as Record<Label, EncounterId>;
  for (const [label, visibility, ready] of COMBINATIONS) {
    const payload: EncounterCreate = {
      name: nameOf(label),
      visibility,
      ready,
      creatures: [{ creatureId: hag.id, count: 2 }],
    };
    const made = yield* as(dm.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload }),
    );
    ids[label] = made.id;
    // Every roster line shared, so a missing roster below is the
    // encounter's refusal and not the line's own switch.
    const roster = yield* as(dm.token, (client) =>
      client.encounterCreatures.list({ params: { campaignId: table, encounterId: made.id } }),
    );
    for (const line of roster) {
      yield* as(dm.token, (client) =>
        client.encounterCreatures.update({
          params: { campaignId: table, encounterId: made.id, encounterCreatureId: line.id },
          payload: { visibility: "shared" },
        }),
      );
    }
  }
  const night: SessionId = (yield* as(dm.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, title: "Night one", visibility: "shared" },
    }),
  )).id;
  yield* as(dm.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );
  yield* as(dm.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: night },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );
  return { dm, pip, table, night, ids };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "encounter-drafts.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** Every sentinel a player may not read, name and id, found in `body`. */
const leaked = (ids: Record<Label, EncounterId>, body: string, readable: ReadonlyArray<Label>) =>
  COMBINATIONS.map(([label]) => label)
    .filter((label) => !readable.includes(label))
    .flatMap((label) => [nameOf(label), ids[label]])
    .filter((sentinel) => body.includes(sentinel));

const setReady = (label: Label, ready: boolean) =>
  Effect.gen(function* () {
    const { dm, table, ids } = yield* Fixture;
    return yield* as(dm.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: ids[label] },
        payload: { ready },
      }),
    );
  });

/** What a player is told is there: the player path, `playerEncounters`. */
const playerListing = Effect.gen(function* () {
  const { pip, table } = yield* Fixture;
  return (yield* as(pip.token, (client) =>
    client.playerEncounters.list({ params: { campaignId: table } }),
  ))
    .map((encounter) => encounter.name)
    .sort();
});

const creatorListing = Effect.gen(function* () {
  const { dm, table } = yield* Fixture;
  return (yield* as(dm.token, (client) =>
    client.encounters.list({ params: { campaignId: table }, query: {} }),
  )).items
    .map((encounter) => encounter.name)
    .sort();
});

/** Put `label` on the table with the Share switch on, and read the player's table. */
const onTheTable = (label: Label) =>
  Effect.gen(function* () {
    const { dm, pip, table, night, ids } = yield* Fixture;
    const started = yield* as(dm.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: night },
        payload: { encounterId: ids[label], visibility: "shared" },
      }),
    );
    const raw = yield* wire(pip.token, `/campaigns/${table}/table`);
    yield* as(dm.token, (client) =>
      client.runs.end({
        params: { campaignId: table, sessionId: night, runId: started.id },
        payload: {},
      }),
    );
    return { runId: started.id, raw };
  });

/** Every combination put on the table once, with the Share switch on. */
const makeFights = Effect.gen(function* () {
  const { ids } = yield* Fixture;
  const runs = {} as Record<Label, EncounterRunId>;
  for (const [label] of COMBINATIONS) {
    const { runId, raw } = yield* onTheTable(label);
    runs[label] = runId;
    expect(raw.status).toBe(200);
    const fight = (JSON.parse(raw.body) as { fight: { encounterId: string | null } }).fight;
    expect(fight.encounterId).toBe(label === "SHARED-READY" ? ids[label] : null);
    expect(leaked(ids, raw.body, ["SHARED-READY"])).toEqual([]);
  }
  return runs;
});

class Fights extends Context.Service<Fights, Record<Label, EncounterRunId>>()(
  "encounter-drafts.test/Fights",
) {}

describeLayer("encounter-drafts", shared, (it) => {
  describe("a player's reads of an encounter", () => {
    it.effect(
      "lists only the encounter that is both Shared and Ready; the creator lists all four",
      () =>
        Effect.gen(function* () {
          const { pip, table, ids } = yield* Fixture;
          expect(yield* playerListing).toEqual([nameOf("SHARED-READY")]);
          expect(yield* creatorListing).toEqual(
            COMBINATIONS.map(([label]) => nameOf(label)).sort(),
          );

          const raw = yield* wire(pip.token, `/campaigns/${table}/player-encounters`);
          expect(raw.status).toBe(200);
          expect(leaked(ids, raw.body, ["SHARED-READY"])).toEqual([]);
        }),
    );

    it.effect("refuses a Shared draft by id, with its roster, exactly as an unshared one", () =>
      Effect.gen(function* () {
        const { dm, pip, table, ids } = yield* Fixture;
        for (const label of ["SHARED-DRAFT", "UNSHARED-READY", "UNSHARED-DRAFT"] as const) {
          expect(
            yield* attempt(pip.token, (client) =>
              client.playerEncounters.find({
                params: { campaignId: table, encounterId: ids[label] },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          const raw = yield* wire(pip.token, `/campaigns/${table}/player-encounters/${ids[label]}`);
          // The refusal names the id the player sent and nothing else of it.
          expect(raw.status).toBe(404);
          expect(raw.body).not.toContain(nameOf(label));
        }

        const shown = yield* as(pip.token, (client) =>
          client.playerEncounters.find({
            params: { campaignId: table, encounterId: ids["SHARED-READY"] },
          }),
        );
        expect(shown.name).toBe(nameOf("SHARED-READY"));
        expect(shown).not.toHaveProperty("ready");
        expect(shown.creatures).toEqual([{ name: "Marsh Hag", count: 2 }]);

        // The creator's reads of a draft are unchanged.
        const draft = yield* as(dm.token, (client) =>
          client.encounters.findById({
            params: { campaignId: table, encounterId: ids["SHARED-DRAFT"] },
          }),
        );
        expect(draft.creatureCount).toBe(2);
      }),
    );

    it.effect(
      "shows a Shared draft once it is marked Ready, and hides it again on the way back",
      () =>
        Effect.gen(function* () {
          const { pip, table, ids } = yield* Fixture;
          yield* setReady("SHARED-DRAFT", true);
          const both = yield* playerListing;
          yield* setReady("SHARED-DRAFT", false);
          expect(both).toEqual([nameOf("SHARED-DRAFT"), nameOf("SHARED-READY")].sort());

          expect(yield* playerListing).toEqual([nameOf("SHARED-READY")]);
          expect(
            yield* attempt(pip.token, (client) =>
              client.playerEncounters.find({
                params: { campaignId: table, encounterId: ids["SHARED-DRAFT"] },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }),
    );

    it.effect("gives a Shared World member who is not at the table no encounter at all", () =>
      Effect.gen(function* () {
        const { table, ids } = yield* Fixture;
        const wren = yield* aGroupMemberAt(table, "Wren");
        const encounters = yield* Encounters;
        const exit = yield* Effect.exit(
          Effect.provideService(
            encounters.findAsPlayer(table, ids["SHARED-READY"]),
            CurrentActor,
            wren,
          ),
        );
        expect(Exit.isFailure(exit)).toBe(true);
      }),
    );
  });

  it.layer(Layer.effect(Fights)(makeFights))("a shared fight, to a player", (it) => {
    it.effect("names only the fight whose encounter the player may read, in the recap", () =>
      Effect.gen(function* () {
        const { pip, table, night, ids } = yield* Fixture;
        const runs = yield* Fights;
        const raw = yield* wire(pip.token, `/campaigns/${table}/sessions/${night}/recap/player`);
        expect(raw.status).toBe(200);
        expect(leaked(ids, raw.body, ["SHARED-READY"])).toEqual([]);

        const recap = JSON.parse(raw.body) as typeof PlayerSessionRecap.Encoded;
        expect(
          recap.fights.map((fight) => [
            fight.run.id,
            fight.run.encounterName,
            fight.run.encounterId,
          ]),
        ).toEqual(
          COMBINATIONS.map(([label]) =>
            label === "SHARED-READY"
              ? [runs[label], nameOf(label), ids[label]]
              : [runs[label], NEUTRAL_RUN_NAMES.combat, null],
          ),
        );
      }),
    );

    it.effect("tells the creator every fight by its own name, in both recaps", () =>
      Effect.gen(function* () {
        const { dm, table, night, ids } = yield* Fixture;
        const recap = yield* as(dm.token, (client) =>
          client.recap.read({ params: { campaignId: table, sessionId: night } }),
        );
        expect(recap.fights.map((fight) => fight.run.encounterName)).toEqual(
          COMBINATIONS.map(([label]) => nameOf(label)),
        );
        // "What will my players see" is the player projection read by the creator,
        // and the creator may read every encounter.
        const recaps = yield* Recap;
        const preview = yield* Effect.provideService(
          recaps.readAsPlayer(table, night),
          CurrentActor,
          dm.actor,
        ).pipe(Effect.orDie);
        expect(preview.fights.map((fight) => fight.run.encounterId)).toEqual(
          COMBINATIONS.map(([label]) => ids[label]),
        );
      }),
    );

    it.effect("gives the last playing only on the encounter the player may read", () =>
      Effect.gen(function* () {
        const { pip, table } = yield* Fixture;
        const runs = yield* Fights;
        const told = yield* as(pip.token, (client) =>
          client.playerEncounters.list({ params: { campaignId: table } }),
        );
        expect(told.map((encounter) => encounter.lastPlayed?.runId ?? null)).toEqual([
          runs["SHARED-READY"],
        ]);
      }),
    );

    it.effect("tells a Shared World no name the table's own players are not told", () =>
      Effect.gen(function* () {
        const { dm, table, night, ids } = yield* Fixture;
        const world = yield* as(dm.token, (client) =>
          client.campaigns.promoteSharedWorld({
            params: { campaignId: table },
            payload: { name: "The Drowned Coast" },
          }),
        );
        const wren = yield* aGroupMemberAt(table, "Wren");
        const history = yield* GroupHistory;
        const story = yield* Effect.provideService(
          history.nightStory(world.id, table, night),
          CurrentActor,
          wren,
        ).pipe(Effect.orDie);
        const told = COMBINATIONS.map(([label]) =>
          label === "SHARED-READY" ? nameOf(label) : NEUTRAL_RUN_NAMES.combat,
        );
        expect(story.fights.map((fight) => fight.name)).toEqual(told);
        expect(leaked(ids, JSON.stringify(story), ["SHARED-READY"])).toEqual([]);

        // The Chronicle's copy is the same read, whoever makes it.
        const entry = yield* as(dm.token, (client) =>
          client.sharedWorldHistory.fromRecap({
            params: { worldId: world.id },
            payload: { campaignId: table, sessionId: night },
          }),
        );
        expect(leaked(ids, JSON.stringify(entry), ["SHARED-READY"])).toEqual([]);
        expect(entry.body).toContain(nameOf("SHARED-READY"));
      }),
    );

    it.effect("stops naming a fight once its encounter is back to a draft or deleted", () =>
      Effect.gen(function* () {
        const { dm, pip, table, night, ids } = yield* Fixture;
        yield* setReady("SHARED-READY", false);
        const drafted = yield* wire(
          pip.token,
          `/campaigns/${table}/sessions/${night}/recap/player`,
        );
        expect(leaked(ids, drafted.body, [])).toEqual([]);
        yield* setReady("SHARED-READY", true);

        yield* as(dm.token, (client) =>
          client.encounters.remove({
            params: { campaignId: table, encounterId: ids["SHARED-READY"] },
          }),
        );
        const recap = yield* as(pip.token, (client) =>
          client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night } }),
        );
        expect(recap.fights.map((fight) => fight.run.encounterName)).toEqual(
          COMBINATIONS.map(() => NEUTRAL_RUN_NAMES.combat),
        );
        // The creator keeps the name the fight had that night.
        const dmRecap = yield* as(dm.token, (client) =>
          client.recap.read({ params: { campaignId: table, sessionId: night } }),
        );
        expect(dmRecap.fights[0]!.run.encounterName).toBe(nameOf("SHARED-READY"));
        expect(dmRecap.fights[0]!.run.encounterId).toBeNull();
      }),
    );
  });
});
