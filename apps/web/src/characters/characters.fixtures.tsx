import { renderAt } from "../test/renderRoute";
import { CharacterId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { campaign, character, type Answer, type Call } from "../campaign/campaign.fixtures";

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

export { campaign, campaignId } from "../campaign/campaign.fixtures";

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
    {
      name: "Lay on Hands",
      text: "Touch a creature and restore hit points from the pool.",
      note: "25 hp pool · 15 remaining",
    },
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
  attacks: [
    { name: "Halberd", text: "Slashing", hit: "+7", dice: "1d10+4", note: "Reach 10 ft." },
    { name: "Divine Smite", text: "Radiant", hit: "—", dice: "2d8" },
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
 * The same account's other character, at another table, with **nothing written
 * on the sheet** — which is every character `CharacterDialog` has ever made and
 * therefore the case the screen has to be right about.
 */
export const sorrel = {
  ...character,
  id: sorrelId,
  campaignId: otherCampaignId,
  accountId: brannoc.accountId,
  name: "Sorrel Ash",
  playerName: "Ilse",
  level: 1,
  species: "Wood elf",
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

const membership = (of: unknown, joinedAt: string) => ({ campaign: of, role: "player", joinedAt });

/** Two characters, two tables. */
export const twoTables = (): Map<string, Answer> =>
  new Map<string, Answer>([
    ["GET /me/characters", { status: 200, body: [brannoc, sorrel] }],
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
    return Promise.resolve(
      new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return server;
};

export const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here. */
export const renderRoster = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt("/play/characters", (screen) => (
    <HostedSessionContext value={hosted}>{screen}</HostedSessionContext>
  ));
};

export const renderSheet = async (
  characterId = brannocId,
  hosted: HostedSession = noSession,
): Promise<void> => {
  await renderAt(`/play/characters/${characterId}`, (screen) => (
    <HostedSessionContext value={hosted}>{screen}</HostedSessionContext>
  ));
};
