import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { CharacterId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";
import {
  campaign,
  campaignId,
  campaignOptions,
  character,
  sessionId,
  type Answer,
  type Call,
} from "../campaign/campaign.fixtures";

/**
 * The character screens' test wire.
 *
 * The campaign and the base character come from `campaign/campaign.fixtures.tsx`
 * for the reason that file exists — a field renamed upstream is one edit and not
 * one per test file. What is new here is the **document**: thirteen optional
 * keys the drawn sheet added without a migration, written out as the JSON the
 * server sends, so a schema rename fails decoding rather than rendering nothing.
 *
 * Two characters at two different tables, which is the shape the task is about:
 * `GET /me/characters` is the one read on `character` with no campaign in its
 * path, so the fixture has to cross a campaign boundary or it proves nothing.
 */

export {
  campaign,
  campaignId,
  campaignOptions,
  longswordRow,
  sessionId,
} from "../campaign/campaign.fixtures";

export const brannocId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-000000000901");
export const sorrelId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-000000000902");
export const strangerId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-0000000009ff");

export const otherCampaignId = "2b1f2a1e-0000-4000-8000-00000000c0df";

/** A second table the same account sits at — the reason the roster names one. */
export const otherCampaign = {
  ...campaign,
  id: otherCampaignId,
  name: "The Hag's Bargain",
  partyName: null,
  currentSessionId: null,
  visibility: "shared",
};

/** The whole document, every key the drawn sheet reads. */
const fullSheet = {
  notes:
    "The temple on the salt road takes in what the road leaves behind.\n\nHe is not looking for the people who left him.",
  abilities: [
    { label: "STR", score: "18", modifier: "+4", save: "+7", proficient: true },
    { label: "DEX", score: "12", modifier: "+1", save: "+1", proficient: false },
    { label: "CON", score: "16", modifier: "+3" },
    { label: "INT", score: "9", modifier: "-1" },
    { label: "WIS", score: "13", modifier: "+1", save: "+4", proficient: true },
    { label: "CHA", score: "16", modifier: "+3", save: "+6", proficient: true },
  ],
  traits: [
    // No `note` of its own: the sheet draws the counter on `resources` beside
    // the name, *15/25 hp · long rest*, matched by name.
    { name: "Lay on Hands", text: "Touch a creature and restore hit points from the pool." },
    { name: "Extra Attack", text: "Attack twice when you take the Attack action." },
  ],
  identity: {
    subclass: "Oath of the Open Road",
    background: "Temple foundling",
    alignment: "Lawful neutral",
    speed: "30 ft.",
    initiative: "+1",
    proficiency: "+3",
    hitDice: "3/5 d10",
    xp: 6500,
    xpNext: 14000,
  },
  skills: [
    { name: "Athletics", ability: "STR", bonus: "+7", proficient: true },
    { name: "Arcana", ability: "INT", bonus: "-1", proficient: false },
  ],
  proficiencies: ["All armour", "Shields", "Orcish"],
  /**
   * The legacy Actions key, kept on the fixture beside `actions` below: the
   * screen reads `actions` first, so these are what a row written before the
   * corpus wrote the sheet draws — `legacySheet` is that row.
   */
  attacks: [
    { name: "Halberd", text: "Slashing", hit: "+7", dice: "1d10+4", note: "Reach 10 ft." },
    { name: "Divine Smite", text: "Radiant", hit: "—", dice: "2d8" },
  ],
  /** What the corpus writes now: a line with a cost, a source and a link back. */
  actions: [
    {
      id: "atk:halberd",
      name: "Halberd",
      cost: "action",
      hit: "+7",
      dice: "1d10+4",
      damageType: "Slashing",
      range: "Reach 10 ft.",
      text: "Martial Melee · Heavy · Two-Handed · Attack ×2",
      source: "weapon",
      equipmentId: "2b1f2a1e-0000-4000-8000-0000000e0001",
      derived: true,
    },
    {
      id: "feat:divine-smite",
      name: "Divine Smite",
      dice: "2d8",
      damageType: "Radiant",
      text: "When you hit with a melee weapon attack, expend a spell slot",
      source: "feature",
      resource: "slot:1",
      featureId: "2b1f2a1e-0000-4000-8000-0000000f0001",
      derived: true,
    },
    {
      id: "feat:lay-on-hands",
      name: "Lay on Hands",
      cost: "action",
      text: "Restore hit points from the pool, by touch",
      source: "feature",
      resource: "res:lay-on-hands",
      featureId: "2b1f2a1e-0000-4000-8000-0000000f0002",
      derived: true,
    },
  ],
  /** The counters — slots as `slot:N`, the pool, the hit dice — read-only on this build. */
  resources: [
    { id: "slot:1", name: "1st-level slots", used: 1, max: 4, recharge: "long", derived: true },
    { id: "slot:2", name: "2nd-level slots", used: 0, max: 2, recharge: "long", derived: true },
    {
      id: "hit-dice",
      name: "Hit dice",
      used: 2,
      max: 5,
      recharge: "long",
      unit: "d10",
      derived: true,
    },
    {
      id: "res:lay-on-hands",
      name: "Lay on Hands",
      used: 10,
      max: 25,
      recharge: "long",
      unit: "hp",
      featureId: "2b1f2a1e-0000-4000-8000-0000000f0002",
      derived: true,
    },
  ],
  spellcasting: {
    ability: "CHA",
    save: "14",
    attack: "+6",
    slots: [
      { level: 1, used: 1, total: 4 },
      { level: 2, used: 0, total: 2 },
    ],
    known: [
      { name: "Bless", level: 1, note: "Concentration · 1 min", prepared: true },
      { name: "Find Steed", level: 2, note: "Ritual · 10 min", prepared: false },
    ],
  },
  inventory: [
    { name: "Halberd", quantity: 1, weight: "6 lb", equipped: true },
    { name: "Ferryman's token, unspent", quantity: 1, weight: "—", note: "From session 11" },
  ],
  currency: { gp: 84, sp: 12, cp: 40 },
  deathSaves: { successes: 1, failures: 2 },
  levelUps: [
    { level: 5, session: 10, note: "Extra Attack. Took the oath at the ferry crossing." },
    { level: 4, session: 7, note: "+2 Charisma." },
  ],
  journal: [{ session: 11, text: "The ferryman took the coin and gave back a token." }],
  story: {
    personality: "Answers questions slower than people expect.",
    ideal: "A road is a promise between two towns.",
    bond: "The temple's road marker.",
    flaw: "He cannot let a debt stand.",
  },
};

/**
 * The same document as a row written before the corpus wrote the sheet holds
 * it: `attacks` and `spellcasting.slots` and no `actions` or `resources`. The
 * screen's fallback reads these, so a test over this sheet is what says an
 * old row still draws exactly as it did.
 */
export const legacySheet = (({ actions: _actions, resources: _resources, ...rest }) => rest)(
  fullSheet,
);

/** Assigned to the reader, with the whole document behind it. */
export const brannoc = {
  ...character,
  id: brannocId,
  accountId: "2b1f2a1e-0000-4000-8000-0000000000a2",
  name: "Brannoc Duskharrow",
  playerName: "Ilse",
  level: 5,
  descriptor: "Level 5 Half-orc Paladin",
  hpCurrent: 44,
  hpMax: 52,
  tempHp: 3,
  conditions: ["Blessed"],
  sheetUrl: "https://example.invalid/brannoc",
  sheet: fullSheet,
};

/**
 * The same account's other character, seated at another table, with **nothing
 * written on the sheet** — the state every freshly created row is in and
 * therefore the case the screen has to be right about.
 */
export const sorrel = {
  ...character,
  id: sorrelId,
  accountId: brannoc.accountId,
  name: "Sorrel Ash",
  playerName: "Ilse",
  level: 1,
  race: "Wood elf",
  className: "Druid",
  descriptor: "Level 1 Wood elf Druid",
  ac: null,
  hpMax: null,
  hpCurrent: null,
  tempHp: 0,
  conditions: [],
  sheetUrl: null,
  sheet: { notes: "", abilities: [], traits: [] },
};

/**
 * The seats — where each character sits, as `GET /me/characters` answers them.
 *
 * Under the continuity decision a character is account-owned and campaign-
 * scoped nowhere; the roster's campaign line and the sheet's live banner both
 * come off these refs, so the fixture crosses a campaign boundary exactly as
 * the old `campaignId` column did.
 */
export const brannocSeatRef = {
  campaignCharacterId: "2b1f2a1e-0000-4000-8000-000000000961",
  campaignId,
  joinedAt: "2026-07-02T10:00:00.000Z",
};

export const sorrelSeatRef = {
  campaignCharacterId: "2b1f2a1e-0000-4000-8000-000000000962",
  campaignId: otherCampaignId,
  joinedAt: "2026-07-09T10:00:00.000Z",
};

/** The rows `GET /me/characters` really sends: the character, with its seats. */
export const ownedBrannoc = { character: brannoc, seats: [brannocSeatRef] };
export const ownedSorrel = { character: sorrel, seats: [sorrelSeatRef] };

export const partySeatAnswer = (row: typeof brannoc, at: string = campaignId): Answer => ({
  status: 200,
  body: {
    seat: {
      id: "2b1f2a1e-0000-4000-8000-000000000963",
      campaignId: at,
      characterId: row.id,
      accountId: row.accountId,
      displayName: row.name,
      playerDisplayName: row.playerName,
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
      joinedAt: "2026-07-12T10:00:00.000Z",
      createdAt: "2026-07-12T10:00:00.000Z",
      updatedAt: "2026-07-12T10:00:00.000Z",
    },
    character: row,
  },
});

const membership = (of: unknown, joinedAt: string, relation = "player") => ({
  campaign: of,
  relation,
  joinedAt,
});

/**
 * Who is reading — `GET /me`, the one read in the round that is about the
 * account rather than about what it has.
 *
 * The name is the delivery's own, because the subtitle it draws is what this
 * endpoint exists to make buildable. The id is the account id every
 * `Character.accountId` and `CampaignMember.accountId` already carries, and is
 * here for the same reason it is on the wire: it is the join key, not a secret.
 */
export const account = {
  id: "2b1f2a1e-0000-4000-8000-0000000000a1",
  name: "Ilse Vantar",
};

export const liveRunId = "2b1f2a1e-0000-4000-8000-000000000c09";
export const yourCombatantId = "2b1f2a1e-0000-4000-8000-000000000d09";
export const hagCombatantId = "2b1f2a1e-0000-4000-8000-000000000d0a";

/**
 * `GET /campaigns/:c/table` — **the answer every fixture starts on.**
 *
 * `null` is the common case and is a success, so a screen that never mentions
 * the banner still exercises the request the sheet now makes. A route left
 * unstubbed would 404 and fail the whole screen, which is exactly what the
 * load's own doc says a `NotFound` here means.
 */
export const quiet = (of: string): [string, Answer] => [
  `GET /campaigns/${of}/table`,
  { status: 200, body: null },
];

/**
 * A night on, and a fight on the table — the JSON `PlayerLiveTable` decodes.
 *
 * Written out rather than built from a DM type, which is the point of the
 * endpoint: there is no armour class, no hit-point total and no band anywhere in
 * this shape, and a fixture that could carry one would mean the schema could.
 */
export const playing = (
  of: string,
  fight: {
    readonly upNext?: { readonly combatantId: string; readonly displayName: string } | null;
    readonly seats?: ReadonlyArray<{
      readonly characterId: string;
      readonly campaignCharacterId: string;
      readonly combatantId: string;
    }>;
    readonly order?: ReadonlyArray<Record<string, unknown>>;
    readonly round?: number;
  } | null = {},
): [string, Answer] => [
  `GET /campaigns/${of}/table`,
  {
    status: 200,
    body: {
      campaignId: of,
      sessionId,
      sessionNumber: 12,
      fight:
        fight === null
          ? null
          : {
              id: liveRunId,
              round: fight.round ?? 3,
              upNext:
                fight.upNext === undefined
                  ? { combatantId: yourCombatantId, displayName: "Brannoc Duskharrow" }
                  : fight.upNext,
              seats: fight.seats ?? [
                {
                  characterId: brannocId,
                  campaignCharacterId: brannocSeatRef.campaignCharacterId,
                  combatantId: yourCombatantId,
                },
              ],
              encounterId: null,
              order: fight.order ?? [
                {
                  kind: "you",
                  combatantId: yourCombatantId,
                  characterId: brannocId,
                  campaignCharacterId: brannocSeatRef.campaignCharacterId,
                  displayName: "Brannoc Duskharrow",
                  subtitle: "Level 5 Half-orc Paladin",
                  initiative: 16,
                  hpCurrent: 44,
                  hpMax: 52,
                  tempHp: 3,
                  conditions: ["Blessed"],
                },
              ],
            },
    },
  },
];

/**
 * Hob, configured and reachable, for one campaign.
 *
 * Every create-screen test gets this by default because the screen asks on
 * mount, and a route that 404s would make *"the composer is offered"* an
 * accident of which test ran. `available: false` is its own fixture
 * (`hobUnconfigured`), which is the case the honest empty state is for.
 */
export const hobRoutes = (at: string = campaignId): ReadonlyArray<[string, Answer]> => [
  [
    `GET /campaigns/${at}/hob`,
    { status: 200, body: { available: true, model: "scripted-local", campaign: campaign.name } },
  ],
  [`POST /campaigns/${at}/hob/ask`, drafted()],
];

/** Two characters, two tables. */
export const twoTables = (): Map<string, Answer> =>
  new Map<string, Answer>([
    ["GET /me", { status: 200, body: account }],
    ...hobRoutes(),
    ["GET /me/characters", { status: 200, body: [ownedBrannoc, ownedSorrel] }],
    // The two pickers' vocabulary — what *this table* offers, which since a
    // campaign can have its own classes is a read rather than a constant. It is
    // the campaign list rather than the Library one because a player cannot
    // read their DM's Library at all, and it arrives already narrowed to the
    // shared rows by `corpusRowReadable`. `campaignOptions` is the campaign
    // fixtures' — one answer to what this table offers, shared by the DM's
    // Rules screen and the player's create form.
    [`GET /campaigns/${campaignId}/options`, { status: 200, body: campaignOptions }],
    [`GET /campaigns/${otherCampaignId}/options`, { status: 200, body: campaignOptions }],
    // Neither table is playing: the quiet state, which is what most of these
    // tests are about and the one the banner draws nothing for.
    quiet(campaignId),
    quiet(otherCampaignId),
    [
      "GET /me/campaigns",
      {
        status: 200,
        body: [
          membership(campaign, "2026-07-02T10:00:00.000Z"),
          membership(otherCampaign, "2026-07-09T10:00:00.000Z"),
        ],
      },
    ],
  ]);

/** Nobody has given this account a character, but it does sit at a table. */
export const noCharacters = (): Map<string, Answer> => {
  const routes = twoTables();
  routes.set("GET /me/characters", { status: 200, body: [] });
  return routes;
};

/** Signed in, invited nowhere — the other silence. */
export const noTables = (): Map<string, Answer> => {
  const routes = noCharacters();
  routes.set("GET /me/campaigns", { status: 200, body: [] });
  return routes;
};

/**
 * One table, and it is one this account **runs** rather than plays at.
 *
 * It used to be the refusal case; the continuity decision of 2026-09-01
 * inverted it — a creator is a player too, so this membership now offers the
 * create control and the form exactly as a player one does, and the tests that
 * read it pin that inversion.
 */
export const onlyDmTables = (): Map<string, Answer> => {
  const routes = noCharacters();
  routes.set("GET /me/campaigns", {
    status: 200,
    body: [membership(campaign, "2026-07-02T10:00:00.000Z", "creator")],
  });
  return routes;
};

/** One player table, so the create control is a link rather than a picker. */
export const oneTable = (): Map<string, Answer> => {
  const routes = noCharacters();
  routes.set("GET /me/campaigns", {
    status: 200,
    body: [membership(campaign, "2026-07-02T10:00:00.000Z")],
  });
  return routes;
};

/**
 * A scripted Hob answer, as SSE — **the one route in this file that is not
 * JSON.**
 *
 * `hob.ask` streams, so a stubbed answer has to be a real `ReadableStream` with
 * real `event:`/`data:` framing or the derived client's decoder has nothing to
 * do. It is written out rather than assembled by a helper for the reason the
 * rest of this file is: what the wire says is the thing under test, and a
 * builder that got the framing subtly wrong would make every one of these tests
 * agree with it.
 *
 * The shape is the one `Hob.ask` really emits — `began` first, then whatever
 * happened, then exactly one of `done` or `failed`.
 */
export const sseFrames = (
  events: ReadonlyArray<{ readonly event: string; readonly data: unknown }>,
): string =>
  events.map((frame) => `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`).join("");

export const draftThreadId = "2b1f2a1e-0000-4000-8000-00000000a001";
export const draftTurnId = "2b1f2a1e-0000-4000-8000-00000000a002";

/** The draft the scripted model offers, as the proposal the server stores. */
export const characterProposal = {
  target: "character",
  name: "Sorrel Ash",
  race: "Wood elf",
  className: "Druid",
  sheet: {
    notes: "She left Ashfen with the herbal under her coat.",
    abilities: [
      { label: "STR", score: "8", modifier: "-1" },
      { label: "DEX", score: "13", modifier: "+1" },
      { label: "CON", score: "14", modifier: "+2" },
      { label: "INT", score: "12", modifier: "+1" },
      { label: "WIS", score: "15", modifier: "+2" },
      { label: "CHA", score: "10", modifier: "+0" },
    ],
    traits: [],
    identity: { subclass: "Circle of the Land (Marsh)", background: "Herbalist's apprentice" },
    skills: [
      { name: "Nature", proficient: true },
      { name: "Perception", proficient: true },
    ],
    spellcasting: {
      known: [
        {
          name: "Produce Flame",
          level: 0,
          spellId: "00000000-0000-4000-8000-00000000f1a0",
          note: "1 action · 30 feet",
        },
        {
          name: "Cure Wounds",
          level: 1,
          spellId: "00000000-0000-4000-8000-00000000f1a1",
          note: "1 action · Touch",
          prepared: true,
        },
      ],
    },
    inventory: [{ name: "Herbalism kit" }],
    story: { bond: "The herbal, half in a hand that is not hers." },
  },
  rationale: [
    "Wisdom is highest because druid casting keys off it, and you described someone who watches.",
  ],
};

/** Hob answered with a draft — the ordinary success. */
export const drafted = (proposal: unknown = characterProposal): Answer => ({
  status: 200,
  sse: sseFrames([
    { event: "began", data: { threadId: draftThreadId, turnId: draftTurnId } },
    { event: "tool", data: { name: "searchCampaign", phase: "called", detail: "marsh" } },
    { event: "delta", data: { text: "Here she is." } },
    { event: "proposal", data: { turnId: draftTurnId, proposal } },
    { event: "done", data: { reason: "stop" } },
  ]),
});

/**
 * Hob answered and offered nothing — **the measured common case**, not an edge
 * one: with all tools offered, the captain's own configured 4B chose the propose
 * tool one time in five.
 */
/**
 * The model answered and drafted nothing — **the common case**, at one propose
 * call in five on a 4B.
 *
 * It ends in `failed` rather than `done` and that is the server's own shape
 * rather than a convenience here: `Hob.ts` reports a draft ask that produced no
 * draft, because a plausible sentence and no sheet with nothing saying so is
 * the captain's own report. What the *screen* says about it is still its own
 * sentence — `draft.ts` keeps Hob's prose and lets `offeredNothing` speak — so
 * the pair is one explanation and not two, which is asserted where it is drawn.
 */
export const draftedNothing = (): Answer => ({
  status: 200,
  sse: sseFrames([
    { event: "began", data: { threadId: draftThreadId, turnId: draftTurnId } },
    { event: "delta", data: { text: "Tell me more about where she is from." } },
    {
      event: "failed",
      data: {
        message:
          "Hob answered in words and drafted no sheet — this model did not make a usable " +
          "drafting call, which smaller models often do not. Ask again, or fill the sheet " +
          "in yourself; you can change any of it afterwards.",
      },
    },
  ]),
});

export interface CharacterStubServer {
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  transportDown: boolean;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get — **once per test file, at
 * module scope**, for the `Context.Reference` reason `api/client.test.ts`
 * records.
 */
export const installCharacterServer = (): CharacterStubServer => {
  const server: CharacterStubServer = {
    routes: twoTables(),
    calls: [],
    transportDown: false,
    reset: () => {
      server.routes = twoTables();
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
      body: { _tag: "NotFound", resource: "character", id: brannocId },
    };
    if (answer.sse !== undefined) {
      const frames = answer.sse;
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode(frames));
              controller.close();
            },
          }),
          { status: answer.status, headers: { "content-type": "text/event-stream" } },
        ),
      );
    }
    return Promise.resolve(
      new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return server;
};

/** The JSON body of the last call matching a method and a path fragment. */
export const bodyOf = (server: CharacterStubServer, method: string, fragment: string): unknown => {
  const call = [...server.calls]
    .reverse()
    .find((entry) => entry.method === method && entry.pathname.includes(fragment));
  return call === undefined || call.body === "" ? undefined : JSON.parse(call.body);
};

/**
 * What the server answers a save with — the row as it now stands.
 *
 * The screen re-reads after every write rather than trusting this, because
 * `descriptor` is generated and comes back rewritten; the answer is here so the
 * mutation succeeds and the dialog closes.
 */
export const savedAs = (character: unknown): Answer => ({ status: 200, body: character });

export const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here. */
export const renderRoster = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt("/characters", (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/**
 * The create form, at a table this account is a player at.
 *
 * The campaign is the route's, because the choice happens before the route
 * exists — see `CharacterCreateScreen`, which is where campaign-first is
 * argued.
 */
export const renderCreate = async (
  at: string = campaignId,
  hosted: HostedSession = noSession,
): Promise<void> => {
  await renderAt(`/campaigns/${at}/characters/new`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

export const renderSheet = async (
  characterId = brannocId,
  hosted: HostedSession = noSession,
): Promise<void> => {
  await renderAt(`/characters/${characterId}`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};
