import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type EncounterRunId,
  type PlayerSessionRecap,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { NEUTRAL_FIGHT_NAME } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Recap } from "../src/repo/Recap.js";
import { aCharacterAt, admittedTo, aGroupMemberAt } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
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
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A raw GET: the status and the bytes, which is what a leak would be in. */
const wire = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

type Label = "SHARED-READY" | "SHARED-DRAFT" | "UNSHARED-READY" | "UNSHARED-DRAFT";

const COMBINATIONS: ReadonlyArray<readonly [Label, "dm" | "shared", boolean]> = [
  ["SHARED-READY", "shared", true],
  ["SHARED-DRAFT", "shared", false],
  ["UNSHARED-READY", "dm", true],
  ["UNSHARED-DRAFT", "dm", false],
];

const nameOf = (label: Label) => `ENC-${label}`;

let dm: Person;
let pip: Person;
let table: CampaignId;
let night: SessionId;
const ids = {} as Record<Label, EncounterId>;

/** Every sentinel a player may not read, name and id, found in `body`. */
const leaked = (body: string, readable: ReadonlyArray<Label>) =>
  COMBINATIONS.map(([label]) => label)
    .filter((label) => !readable.includes(label))
    .flatMap((label) => [nameOf(label), ids[label]])
    .filter((sentinel) => body.includes(sentinel));

const setReady = (label: Label, ready: boolean) =>
  as(dm.token, (client) =>
    client.encounters.update({
      params: { campaignId: table, encounterId: ids[label] },
      payload: { ready },
    }),
  );

const listedBy = async (who: Person) =>
  (
    await as(who.token, (client) =>
      client.encounters.list({ params: { campaignId: table }, query: {} }),
    )
  ).items
    .map((encounter) => encounter.name)
    .sort();

beforeAll(async () => {
  dm = await person("Dee");
  pip = await person("Pip");
  table = (
    await as(dm.token, (client) =>
      client.campaigns.create({ payload: { name: "The Drowned Chapel", visibility: "shared" } }),
    )
  ).id;
  const seated = await run(admittedTo(table, pip.actor, "Pip"));
  await run(
    aCharacterAt(
      table,
      seated,
      { name: "Pip's rogue", level: 3, hpMax: 21 },
      { seatVisibility: "shared" },
    ),
  );
  const hag = await as(dm.token, (client) =>
    client.library.create({
      payload: { name: "Marsh Hag", size: "Medium", type: "Fey", cr: "2", ac: 17, hp: 82 },
    }),
  );
  for (const [label, visibility, ready] of COMBINATIONS) {
    const payload: EncounterCreate = {
      name: nameOf(label),
      visibility,
      ready,
      creatures: [{ creatureId: hag.id, count: 2 }],
    };
    const made = await as(dm.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload }),
    );
    ids[label] = made.id;
    // Every roster line shared, so the roster's refusal below is the
    // encounter's and not the line's own switch.
    const roster = await as(dm.token, (client) =>
      client.encounterCreatures.list({ params: { campaignId: table, encounterId: made.id } }),
    );
    for (const line of roster) {
      await as(dm.token, (client) =>
        client.encounterCreatures.update({
          params: { campaignId: table, encounterId: made.id, encounterCreatureId: line.id },
          payload: { visibility: "shared" },
        }),
      );
    }
  }
  night = (
    await as(dm.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 1, title: "Night one", visibility: "shared" },
      }),
    )
  ).id;
  await as(dm.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: night },
    }),
  );
  await as(dm.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: night },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );
}, 60_000);

describe("a player's reads of an encounter", () => {
  it("lists only the encounter that is both Shared and Ready; the creator lists all four", async () => {
    expect(await listedBy(pip)).toEqual([nameOf("SHARED-READY")]);
    expect(await listedBy(dm)).toEqual(COMBINATIONS.map(([label]) => nameOf(label)).sort());

    const raw = await wire(pip.token, `/campaigns/${table}/encounters`);
    expect(raw.status).toBe(200);
    expect(leaked(raw.body, ["SHARED-READY"])).toEqual([]);
  });

  it("refuses a Shared draft by id, and its roster, exactly as an unshared one", async () => {
    for (const label of ["SHARED-DRAFT", "UNSHARED-READY", "UNSHARED-DRAFT"] as const) {
      expect(
        await attempt(pip.token, (client) =>
          client.encounters.findById({ params: { campaignId: table, encounterId: ids[label] } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(pip.token, (client) =>
          client.encounterCreatures.list({
            params: { campaignId: table, encounterId: ids[label] },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }

    const shown = await as(pip.token, (client) =>
      client.encounters.findById({
        params: { campaignId: table, encounterId: ids["SHARED-READY"] },
      }),
    );
    expect(shown.name).toBe(nameOf("SHARED-READY"));
    expect(shown).not.toHaveProperty("ready");
    const roster = await as(pip.token, (client) =>
      client.encounterCreatures.list({
        params: { campaignId: table, encounterId: ids["SHARED-READY"] },
      }),
    );
    expect(roster.map((line) => line.count)).toEqual([2]);

    // The creator's reads of a draft are unchanged.
    const draft = await as(dm.token, (client) =>
      client.encounters.findById({
        params: { campaignId: table, encounterId: ids["SHARED-DRAFT"] },
      }),
    );
    expect(draft.creatureCount).toBe(2);
  });

  it("shows a Shared draft once it is marked Ready, and hides it again on the way back", async () => {
    await setReady("SHARED-DRAFT", true);
    expect(await listedBy(pip)).toEqual([nameOf("SHARED-DRAFT"), nameOf("SHARED-READY")].sort());

    await setReady("SHARED-DRAFT", false);
    expect(await listedBy(pip)).toEqual([nameOf("SHARED-READY")]);
    expect(
      await attempt(pip.token, (client) =>
        client.encounters.findById({
          params: { campaignId: table, encounterId: ids["SHARED-DRAFT"] },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });

  it("gives a Shared World member who is not at the table no encounter at all", async () => {
    const wren = await run(aGroupMemberAt(table, "Wren"));
    const exit = await runtime.runPromise(
      Effect.exit(
        Effect.flatMap(Encounters, (encounters) =>
          Effect.provideService(
            encounters.findById(table, ids["SHARED-READY"]),
            CurrentActor,
            wren,
          ),
        ),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("a shared fight, to a player", () => {
  const runs = {} as Record<Label, EncounterRunId>;

  /** Put `label` on the table with the Share switch on, and read the player's table. */
  const onTheTable = async (label: Label) => {
    const started = await as(dm.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: night },
        payload: { encounterId: ids[label], visibility: "shared" },
      }),
    );
    runs[label] = started.id;
    const raw = await wire(pip.token, `/campaigns/${table}/table`);
    await as(dm.token, (client) =>
      client.runs.end({
        params: { campaignId: table, sessionId: night, runId: started.id },
        payload: {},
      }),
    );
    return raw;
  };

  beforeAll(async () => {
    for (const [label] of COMBINATIONS) {
      const raw = await onTheTable(label);
      expect(raw.status).toBe(200);
      const fight = (JSON.parse(raw.body) as { fight: { encounterId: string | null } }).fight;
      expect(fight.encounterId).toBe(label === "SHARED-READY" ? ids[label] : null);
      expect(leaked(raw.body, ["SHARED-READY"])).toEqual([]);
    }
  }, 60_000);

  it("names only the fight whose encounter the player may read, in the recap", async () => {
    const raw = await wire(pip.token, `/campaigns/${table}/sessions/${night}/recap/player`);
    expect(raw.status).toBe(200);
    expect(leaked(raw.body, ["SHARED-READY"])).toEqual([]);

    const recap = JSON.parse(raw.body) as typeof PlayerSessionRecap.Encoded;
    expect(
      recap.fights.map((fight) => [fight.run.id, fight.run.encounterName, fight.run.encounterId]),
    ).toEqual(
      COMBINATIONS.map(([label]) =>
        label === "SHARED-READY"
          ? [runs[label], nameOf(label), ids[label]]
          : [runs[label], NEUTRAL_FIGHT_NAME, null],
      ),
    );
  });

  it("tells the creator every fight by its own name, in both recaps", async () => {
    const recap = await as(dm.token, (client) =>
      client.recap.read({ params: { campaignId: table, sessionId: night } }),
    );
    expect(recap.fights.map((fight) => fight.run.encounterName)).toEqual(
      COMBINATIONS.map(([label]) => nameOf(label)),
    );
    // "What will my players see" is the player projection read by the creator,
    // and the creator may read every encounter.
    const preview = await run(
      Effect.flatMap(Recap, (recaps) =>
        Effect.provideService(recaps.readAsPlayer(table, night), CurrentActor, dm.actor),
      ),
    );
    expect(preview.fights.map((fight) => fight.run.encounterId)).toEqual(
      COMBINATIONS.map(([label]) => ids[label]),
    );
  });

  it("gives the last playing only on the encounter the player may read", async () => {
    const page = await as(pip.token, (client) =>
      client.encounters.list({ params: { campaignId: table }, query: {} }),
    );
    expect(page.items.map((encounter) => encounter.lastPlayed?.runId ?? null)).toEqual([
      runs["SHARED-READY"],
    ]);
  });

  it("tells a Shared World no name the table's own players are not told", async () => {
    const world = await as(dm.token, (client) =>
      client.campaigns.promoteSharedWorld({
        params: { campaignId: table },
        payload: { name: "The Drowned Coast" },
      }),
    );
    const wren = await run(aGroupMemberAt(table, "Wren"));
    const story = await run(
      Effect.flatMap(GroupHistory, (history) =>
        Effect.provideService(history.nightStory(world.id, table, night), CurrentActor, wren),
      ),
    );
    const told = COMBINATIONS.map(([label]) =>
      label === "SHARED-READY" ? nameOf(label) : NEUTRAL_FIGHT_NAME,
    );
    expect(story.fights.map((fight) => fight.name)).toEqual(told);
    expect(leaked(JSON.stringify(story), ["SHARED-READY"])).toEqual([]);

    // The Chronicle's copy is the same read, whoever makes it.
    const entry = await as(dm.token, (client) =>
      client.sharedWorldHistory.fromRecap({
        params: { worldId: world.id },
        payload: { campaignId: table, sessionId: night },
      }),
    );
    expect(leaked(JSON.stringify(entry), ["SHARED-READY"])).toEqual([]);
    expect(entry.body).toContain(nameOf("SHARED-READY"));
  });

  it("stops naming a fight once its encounter is back to a draft or deleted", async () => {
    await setReady("SHARED-READY", false);
    const drafted = await wire(pip.token, `/campaigns/${table}/sessions/${night}/recap/player`);
    expect(leaked(drafted.body, [])).toEqual([]);
    await setReady("SHARED-READY", true);

    await as(dm.token, (client) =>
      client.encounters.remove({
        params: { campaignId: table, encounterId: ids["SHARED-READY"] },
      }),
    );
    const recap = await as(pip.token, (client) =>
      client.recap.readAsPlayer({ params: { campaignId: table, sessionId: night } }),
    );
    expect(recap.fights.map((fight) => fight.run.encounterName)).toEqual(
      COMBINATIONS.map(() => NEUTRAL_FIGHT_NAME),
    );
    // The creator keeps the name the fight had that night.
    const dmRecap = await as(dm.token, (client) =>
      client.recap.read({ params: { campaignId: table, sessionId: night } }),
    );
    expect(dmRecap.fights[0]!.run.encounterName).toBe(nameOf("SHARED-READY"));
    expect(dmRecap.fights[0]!.run.encounterId).toBeNull();
  });
});
