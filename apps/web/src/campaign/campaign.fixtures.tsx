import { CampaignId } from "@taverns/api";
import { render } from "@testing-library/react";
import { Schema } from "effect";
import { vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { CampaignScreen } from "./CampaignScreen";

/**
 * The campaign view's test wire: fixtures, a stub server, and one way in.
 *
 * **The bodies here are the JSON the server actually sends, not the decoded
 * classes.** Everything passes through `packages/api`'s schemas on the way in,
 * so a field the contract renames fails the test rather than rendering
 * `undefined` — which is the property these files exist for, and the reason a
 * fixture may not be a `Partial<>` of anything.
 *
 * Shared between the read tests and the authoring tests so that a field added
 * to a shape upstream is one edit, not two. Add new ones here.
 */

export const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
export const sessionId = "2b1f2a1e-0000-4000-8000-000000000501";
export const encounterId = "2b1f2a1e-0000-4000-8000-000000000601";
export const sketchId = "2b1f2a1e-0000-4000-8000-000000000602";
export const prepItemId = "2b1f2a1e-0000-4000-8000-000000000701";
export const noteId = "2b1f2a1e-0000-4000-8000-000000000801";
export const goblinId = "2b1f2a1e-0000-4000-8000-000000000a01";
export const hagId = "2b1f2a1e-0000-4000-8000-000000000a02";
export const rosterRowId = "2b1f2a1e-0000-4000-8000-000000000b01";
export const runId = "2b1f2a1e-0000-4000-8000-000000000c01";
export const combatantId = "2b1f2a1e-0000-4000-8000-000000000d01";
export const goblinCombatantId = "2b1f2a1e-0000-4000-8000-000000000d02";

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

export const campaign = {
  id: campaignId,
  name: "The Salt Road",
  partyName: "The Gilded Spoon",
  playerCount: 4,
  currentSessionId: sessionId,
  visibility: "dm",
  archivedAt: null,
  ...provenance,
  ...stamps,
};

export const session = {
  id: sessionId,
  campaignId,
  number: 12,
  title: null,
  startedAt: null,
  endedAt: null,
  // "On the table now" — a pointer at the live `encounter_run`, null until the
  // DM starts a fight. Required on the wire, so a fixture that omits it fails
  // decoding rather than rendering nothing, which is the property this file
  // exists for. No screen reads it yet; the runner will.
  activeEncounterRunId: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const encounter = {
  id: encounterId,
  campaignId,
  name: "Ambush in the reeds",
  difficulty: "Medium",
  tags: ["Marsh", "Night"],
  // `sum(encounter_creature.count)`, computed by the server per read — the
  // prototype's "6 creatures" (`data.js:10`). Required on the wire, so a
  // fixture that omits it fails decoding rather than rendering `undefined`.
  creatureCount: 6,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const sketch = {
  ...encounter,
  id: sketchId,
  name: "Whatever is in the crate",
  difficulty: null,
  tags: ["Boss"],
  creatureCount: 1,
};

export const readAloud = {
  id: noteId,
  campaignId,
  title: "Read aloud at the water",
  body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
  kind: "read_aloud",
  attachedTo: { kind: "encounter", id: encounterId },
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const character = {
  id: "2b1f2a1e-0000-4000-8000-000000000901",
  campaignId,
  // Null on every row the product can write — nothing mints a player
  // credential yet, and no payload accepts one.
  accountId: null,
  name: "Brannoc",
  playerName: "Ilse",
  level: 3,
  species: "Half-orc",
  className: "Paladin",
  // Derived by a generated column from the three above, never sent by a client
  // — so it is here as the server would send it and in neither payload.
  descriptor: "Level 3 Half-orc Paladin",
  ac: 18,
  hpMax: 52,
  // The live half (`0014`). A character carries where they are now, and null is
  // "nobody has said" rather than full or nothing — which is why this fixture
  // has a number and the row below it does not.
  hpCurrent: 44,
  tempHp: 0,
  conditions: [],
  sheetUrl: null,
  sheet: { notes: "Owes the ferryman a name.", abilities: [], traits: [] },
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export const prepItem = {
  id: prepItemId,
  sessionId,
  label: "Reread the reeds ambush",
  done: false,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const emptyStatBlock = { meta: "", ac: "", hp: "", speed: "", cr: "", abilities: [], traits: [] };

/**
 * The document half, as `data.js:23-33` writes it — the parenthetical in
 * `"17 (chain shirt, shield)"` being the whole reason it is not derived from
 * the `ac` column beside it.
 */
const goblinStatBlock = {
  meta: "Small humanoid (goblinoid), neutral evil",
  ac: "17 (chain shirt, shield)",
  hp: "21 (6d6)",
  speed: "30 ft.",
  cr: "1 (200 XP)",
  abilities: [
    { label: "STR", score: "10", modifier: "+0" },
    { label: "DEX", score: "14", modifier: "+2" },
  ],
  traits: [
    {
      name: "Nimble Escape",
      text: "The boss takes the Disengage or Hide action as a bonus action on each of its turns.",
    },
    {
      name: "Scimitar",
      text: "Melee weapon attack: +4 to hit, reach 5 ft., one target.",
      dice: "1d6+2",
    },
  ],
};

/** A global `system` row: `campaignId` null, which is what makes it global. */
export const goblin = {
  id: goblinId,
  campaignId: null,
  derivedFrom: null,
  name: "Goblin Boss",
  size: "Small",
  type: "Humanoid",
  cr: "1",
  crSort: 1,
  ac: 17,
  hp: 21,
  environments: ["Marsh"],
  legendary: false,
  statBlock: goblinStatBlock,
  visibility: "dm",
  origin: "system",
  assistantTurnId: null,
  ...stamps,
};

/** No document at all — the honest "nothing written yet" case. */
export const hag = {
  ...goblin,
  statBlock: emptyStatBlock,
  id: hagId,
  name: "Marsh Hag",
  cr: "5",
  crSort: 5,
  ac: 17,
  hp: 82,
};

/**
 * A fight on the table: the run, and the two combatants it seeded.
 *
 * Shared with the runner's own tests for the reason this file exists — a field
 * renamed upstream is one edit here rather than one per test file — and the
 * bodies are the JSON the server sends, so a rename fails decoding rather than
 * rendering `undefined`.
 */
export const liveRun = {
  id: runId,
  sessionId,
  encounterId,
  encounterName: "Ambush in the reeds",
  round: 1,
  activeCombatantId: combatantId,
  startedAt: "2026-08-04T19:00:00.000Z",
  endedAt: null,
  // A live fight has no reason yet, and `resolved` is what the column says
  // until one of the two endings writes it. A test that wants a fight waiting
  // for the next night sets `endedAt` *and* `endedReason: "carried"` — the
  // database refuses the second without the first.
  endedReason: "resolved",
  continuedFrom: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** A party member, seeded from `character`. */
export const brannoc = {
  id: combatantId,
  encounterRunId: runId,
  characterId: character.id,
  creatureId: null,
  displayName: "Brannoc",
  subtitle: "Half-orc paladin",
  playerName: "Ilse",
  initiative: 21,
  hpCurrent: 44,
  hpMax: 52,
  ac: 18,
  kind: "pc",
  conditions: [],
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** A monster, seeded from the roster — so it has a stat block to show. */
export const goblinBoss = {
  ...brannoc,
  id: goblinCombatantId,
  characterId: null,
  creatureId: goblinId,
  displayName: "Goblin Boss",
  subtitle: "Small humanoid",
  playerName: null,
  initiative: 19,
  hpCurrent: 21,
  hpMax: 21,
  ac: 17,
  kind: "npc",
  conditions: ["Hostile"],
};

/** A roster line: this creature, this many times. */
export const rosterRow = {
  id: rosterRowId,
  encounterId,
  creatureId: goblinId,
  count: 6,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export interface Call {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly authorization?: string;
  readonly body: string;
}

/** Everything a fully populated campaign answers, before a test re-aims it. */
export const fullCampaign = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    [`GET /campaigns/${campaignId}/encounters`, { status: 200, body: [encounter, sketch] }],
    [`GET /campaigns/${campaignId}/notes`, { status: 200, body: [readAloud] }],
    [`GET /campaigns/${campaignId}/characters`, { status: 200, body: [character] }],
    [`GET /campaigns/${campaignId}/creatures`, { status: 200, body: [goblin, hag] }],
    [
      `GET /campaigns/${campaignId}/encounters/${encounterId}/creatures`,
      { status: 200, body: [rosterRow] },
    ],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}`, { status: 200, body: session }],
    [
      `PATCH /campaigns/${campaignId}/sessions/${sessionId}`,
      { status: 200, body: { ...session, startedAt: stamps.updatedAt } },
    ],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}/prep`, { status: 200, body: [prepItem] }],
    // No fight on the table. A test that wants one re-aims this at `[liveRun]`,
    // which is what turns the top bar's "Start session" into "Back to the
    // fight" and lights the encounter card.
    [`GET /campaigns/${campaignId}/sessions/${sessionId}/runs`, { status: 200, body: [] }],
    [
      `PATCH /campaigns/${campaignId}/sessions/${sessionId}/prep/${prepItemId}`,
      { status: 200, body: { ...prepItem, done: true } },
    ],
  ]);

export interface StubServer {
  /** `"POST /campaigns/…"` → answer. Re-aim it per test. */
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  /** Every request rejects, the way an unreachable API does. */
  transportDown: boolean;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get.
 *
 * **Once per test file, at module scope.** `FetchHttpClient.Fetch` is a
 * `Context.Reference` and `Context` memoises a reference's default the first
 * time it is read, so a per-test `vi.stubGlobal` would keep serving the first
 * test's answers with nothing to notice. See `api/client.test.ts`.
 */
export const installStubServer = (): StubServer => {
  const server: StubServer = {
    routes: fullCampaign(),
    calls: [],
    transportDown: false,
    reset: () => {
      server.routes = fullCampaign();
      server.calls.length = 0;
      server.transportDown = false;
    },
  };

  vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
    if (server.transportDown) return Promise.reject(new TypeError("Failed to fetch"));

    const { pathname, search } = new URL(String(url));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    server.calls.push({
      method,
      pathname,
      search,
      authorization: headers?.["authorization"],
      body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
    });

    const answer = server.routes.get(`${method} ${pathname}`) ?? {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    };
    return Promise.resolve(
      new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return server;
};

/** A signed-in hosted session that mints a different token on every call. */
export const mintingSession = (): HostedSession & { readonly minted: () => number } => {
  let issued = 0;
  return {
    configured: true,
    signedIn: true,
    fetchToken: () => Promise.resolve(`session-token-${++issued}`),
    minted: () => issued,
  };
};

export const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  fetchToken: () => Promise.resolve(undefined),
};

/**
 * Annotated `void`, not left inferred: Testing Library's `RenderResult` names a
 * type inside `@testing-library/dom`, which pnpm's isolated layout puts out of
 * reach of an exported signature here — the same TS2742 the server hits with
 * `@clerk/shared`. Nothing needs the handle anyway; queries go through `screen`.
 */
export const renderScreen = (hosted: HostedSession = noSession): void => {
  render(
    <HostedSessionContext value={hosted}>
      <CampaignScreen campaignId={campaignId} route={{ screen: "campaign", campaignId }} />
    </HostedSessionContext>,
  );
};

/**
 * jsdom here ships **no** `localStorage` at all — neither `window.localStorage`
 * nor the bare global, since Node 26's own one is inert without
 * `--localstorage-file`. `auth/credential.ts` tolerates that (the machine token
 * simply reads empty), so exercising the fallback needs a real one installed.
 */
export const installMemoryStorage = (): void => {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
      key: (index: number) => [...entries.keys()][index] ?? null,
      get length() {
        return entries.size;
      },
    } satisfies Storage,
    configurable: true,
    writable: true,
  });
};

/** The JSON body of the first call matching a method and a path fragment. */
export const bodyOf = (server: StubServer, method: string, fragment: string): unknown => {
  const call = server.calls.find(
    (entry) => entry.method === method && entry.pathname.includes(fragment),
  );
  return call === undefined || call.body === "" ? undefined : JSON.parse(call.body);
};
