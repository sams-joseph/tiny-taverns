import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  account,
  brannoc,
  brannocId,
  brannocSeatRef,
  campaign,
  campaignId,
  hagCombatantId,
  installCharacterServer,
  liveRunId,
  playing,
  renderSheet,
  sharedBoard,
  tableOrder,
  sessionId,
  yourCombatantId,
} from "../characters/characters.fixtures";
import { apiUrl } from "../api/client";
import { drawnMapPicture, drawnPortrait, page } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { HostedSessionScope } from "../auth/AuthProvider";
import { TEST_SESSION } from "../test/session";

const server = installCharacterServer();

const tableRollsPath = `GET /campaigns/${campaignId}/table/sessions/${sessionId}/characters/${brannocId}/rolls`;
const tableEventsPath = `GET /campaigns/${campaignId}/table/sessions/${sessionId}/events`;
const sharedNpcId = "2b1f2a1e-0000-4000-8000-00000000d0c1";
const sharedNpcThreadId = "2b1f2a1e-0000-4000-8000-00000000e0c1";
const sharedNpcTurnsPath = `GET /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/turns`;

const sharedNpc = {
  id: sharedNpcId,
  campaignId,
  name: "Cazril",
  role: "the ferryman",
  persona: { identity: { summary: "Takes names, not coin." } },
  image: null,
  imagePending: false,
};

const sharedProposal = {
  id: "2b1f2a1e-0000-4000-8000-00000000f601",
  campaignId,
  npcId: sharedNpcId,
  threadId: sharedNpcThreadId,
  npcTurnId: "2b1f2a1e-0000-4000-8000-00000000e101",
  proposedByAccountId: null,
  kind: "memory",
  content: { kind: "memory", body: "The party promised Cazril a true name." },
  state: "pending",
  decidedByAccountId: null,
  decidedAt: null,
  rejectionReason: null,
  acceptedMemoryId: null,
  acceptedNoteId: null,
  acceptedBeatId: null,
  visibility: "dm",
  origin: "assistant",
  assistantTurnId: null,
  createdAt: "2026-08-04T19:05:00.000Z",
  updatedAt: "2026-08-04T19:05:00.000Z",
};

const sharedNpcLine = {
  id: "2b1f2a1e-0000-4000-8000-00000000e101",
  threadId: sharedNpcThreadId,
  who: "user",
  speakerName: "Pim",
  text: "Cazril, the reeds are moving.",
  templateVersion: null,
  promptTokens: null,
  createdAt: "2026-08-04T19:05:00.000Z",
};

const roll = {
  id: "2b1f2a1e-0000-4000-8000-00000000aa01",
  campaignId,
  sessionId,
  encounterRunId: liveRunId,
  accountId: account.id,
  accountName: account.name,
  characterId: brannocId,
  characterName: brannoc.name,
  label: "Halberd",
  notation: "1d20+7",
  dice: [12],
  kept: [12],
  modifier: 7,
  total: 19,
  mode: "normal",
  critical: null,
  requestId: null,
  visibility: "shared",
  origin: "authored",
  assistantTurnId: null,
  createdAt: "2026-08-04T19:04:00.000Z",
  updatedAt: "2026-08-04T19:04:00.000Z",
};

const renderTable = async () => {
  await renderAt(`/campaigns/${campaignId}/table`, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));
};

beforeEach(() => {
  server.reset();
  server.routes.set(`GET /campaigns/${campaignId}`, { status: 200, body: campaign });
  server.routes.set(tableRollsPath, { status: 200, body: [roll] });
  // The contentless doorbell endpoint may be opened by the screen. A 404 stops
  // the stream and keeps these tests deterministic; the table data still comes
  // from the narrow read above.
  server.routes.set(tableEventsPath, {
    status: 404,
    body: { _tag: "NotFound", resource: "session" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlayerTableScreen", () => {
  it("draws the player projection without NPC armour class or exact hit points", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: [
          {
            kind: "you",
            combatantId: yourCombatantId,
            characterId: brannocId,
            campaignCharacterId: brannocSeatRef.campaignCharacterId,
            displayName: "Brannoc Duskharrow",
            subtitle: "Level 5 Half-orc Paladin",
            initiative: 16,
            initiativeBonus: 1,
            initiativeSetBy: "dm",
            hpCurrent: 44,
            hpMax: 52,
            tempHp: 3,
            conditions: ["Blessed"],
            portrait: null,
          },
          {
            kind: "ally",
            combatantId: "2b1f2a1e-0000-4000-8000-000000000d0b",
            characterId: "2b1f2a1e-0000-4000-8000-000000000902",
            displayName: "Nessa",
            subtitle: "Level 4 Ranger",
            playerName: "Wren",
            initiative: 14,
            conditions: [],
            portrait: null,
          },
          {
            kind: "npc",
            combatantId: hagCombatantId,
            displayName: "Marsh Hag",
            subtitle: "Medium Fey",
            initiative: 12,
            hpBand: "bloodied",
            conditions: ["Frightened"],
          },
        ],
      }),
    );

    await renderTable();

    await screen.findByText("Initiative");
    expect(screen.getByText("Brannoc Duskharrow")).toBeTruthy();
    expect(screen.getByText("44/52 hp · 3 temp")).toBeTruthy();
    expect(screen.getByText("Nessa")).toBeTruthy();
    expect(screen.getByText("Marsh Hag")).toBeTruthy();
    expect(screen.getByText("Medium Fey · Bloodied")).toBeTruthy();
    expect(screen.queryByText(/82/)).toBeNull();
    expect(screen.queryByText(/AC 17|17 AC/i)).toBeNull();
  });

  it("shows no map until the DM shares one, and asks for no board of its own", async () => {
    server.routes.set(...playing(campaignId, {}));
    await renderTable();
    await screen.findByText("Initiative");
    expect(document.querySelector("[data-slot=battle-map]")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Map/ })).toBeNull();
    expect(
      server.calls.some(
        (call) => call.pathname.endsWith("/board") || call.pathname.endsWith("/map"),
      ),
    ).toBe(false);
  });

  it("draws the board the DM shared: the picture, the grid and who stands on it", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder, board: sharedBoard }));
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const picture = document.querySelector<HTMLImageElement>("[data-slot=battle-map] img");
    expect(picture?.getAttribute("src")).toBe(apiUrl(drawnMapPicture.fullUrl));
    // The table sends no setting line, so the picture says what it is generically.
    expect(picture?.getAttribute("alt")).toBe("The place, as Hob drew it");
    expect(document.querySelectorAll("[data-line=column]")).toHaveLength(25);
    expect(map.getByText("24 × 16 squares · 5 ft each · 120 × 80 ft")).toBeInTheDocument();

    // A token for each row the table put down, on its square; Nessa is in the
    // order but not on the board, so she has none.
    const you = map.getByRole("img", { name: "Brannoc Duskharrow (you), column 6, row 5" });
    expect(you.style.left).toMatch(/^20\.8333/);
    expect(you.style.top).toBe("25%");
    expect(you).toHaveTextContent("BD");
    expect(map.getByRole("img", { name: "Marsh Hag, column 12, row 7" })).toHaveTextContent("MH");
    expect(map.queryByRole("img", { name: /^Nessa/ })).toBeNull();

    // Read-only: nothing on the map to press, and nothing more to fetch.
    expect(map.queryAllByRole("button")).toEqual([]);
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(server.calls.some((call) => call.pathname.endsWith("/board"))).toBe(false);
  });

  it("fades a token that is down, and rings whoever is up", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.map((row) => (row.kind === "npc" ? { ...row, hpBand: "down" } : row)),
        upNext: { combatantId: hagCombatantId, displayName: "Marsh Hag" },
        board: sharedBoard,
      }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const hag = map.getByRole("img", { name: /^Marsh Hag/ });
    expect(hag.className).toMatch(/opacity-45/);
    expect(map.getByRole("img", { name: /^Brannoc/ }).className).not.toMatch(/opacity-/);
    // The turn's ring is the one extra circle on the hag's face.
    expect(hag.querySelectorAll("circle")).toHaveLength(2);
  });

  it("draws no token for a row the table did not send, whatever the board says", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.filter((row) => row.kind !== "npc"),
        board: sharedBoard,
      }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const tokens = [...document.querySelectorAll("[data-slot=token]")];
    expect(tokens.map((token) => token.getAttribute("aria-label"))).toEqual([
      "Brannoc Duskharrow (you), column 6, row 5",
    ]);
    expect(map.queryByRole("img", { name: /^Marsh Hag/ })).toBeNull();
  });

  it("lays an ally's portrait on its row, and draws none where there is none", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: [
          {
            kind: "you",
            combatantId: yourCombatantId,
            characterId: brannocId,
            campaignCharacterId: brannocSeatRef.campaignCharacterId,
            displayName: "Brannoc Duskharrow",
            subtitle: null,
            initiative: 16,
            initiativeBonus: 1,
            initiativeSetBy: "dm",
            hpCurrent: 44,
            hpMax: 52,
            tempHp: 0,
            conditions: [],
            portrait: null,
          },
          {
            kind: "ally",
            combatantId: "2b1f2a1e-0000-4000-8000-000000000d0b",
            characterId: "2b1f2a1e-0000-4000-8000-000000000902",
            displayName: "Nessa",
            subtitle: null,
            playerName: "Wren",
            initiative: 14,
            conditions: [],
            portrait: drawnPortrait,
          },
        ],
      }),
    );

    await renderTable();
    await screen.findByText("Nessa");

    const rowOf = (name: string) => screen.getByText(name).closest(".min-h-row")!;
    expect(rowOf("Nessa").querySelector("img")?.getAttribute("src")).toBe(
      apiUrl(drawnPortrait.thumbUrl),
    );
    expect(rowOf("Brannoc Duskharrow").querySelector("img")).toBeNull();
  });

  it("persists a browser-submitted roll and shows only this character's log", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    server.routes.set(...playing(campaignId, {}));
    server.routes.set(`POST /campaigns/${campaignId}/rolls`, {
      status: 200,
      body: { ...roll, dice: [11], kept: [11], total: 18, requestId: "sent-from-browser" },
    });

    await renderTable();

    await screen.findByText("Your rolls");
    expect(screen.getAllByText("Halberd").length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Halberd/ }));

    await waitFor(() => {
      const call = server.calls.find(
        (entry) => entry.method === "POST" && entry.pathname === `/campaigns/${campaignId}/rolls`,
      );
      expect(call).toBeDefined();
      const body = JSON.parse(call!.body) as Record<string, unknown>;
      expect(body.characterId).toBe(brannocId);
      expect(body.label).toBe("Halberd");
      expect(body.notation).toBe("1d10+4");
      expect(body.dice).toEqual([6]);
      expect(body.total).toBe(10);
    });
  });

  it("keeps a seated player's rolls through a scene that has no initiative order", async () => {
    // A conversation, a skill challenge or a hazard answers no order and
    // nobody up; the seat is what says this player is in it.
    server.routes.set(...playing(campaignId, { mode: "challenge", order: [], upNext: null }));
    server.routes.set(`POST /campaigns/${campaignId}/rolls`, {
      status: 200,
      body: { ...roll, requestId: "sent-in-a-scene" },
    });

    await renderTable();

    await screen.findByText("Your rolls");
    expect(screen.queryByText("Your turn")).toBeNull();
    // The scene's kind in place of the order it does not have, and nothing
    // of it — no round, no initiative, no DC.
    expect(screen.getByText("A skill challenge")).toBeInTheDocument();
    expect(screen.getByText("Session 12 · a skill challenge")).toBeInTheDocument();
    expect(screen.queryByText("Initiative")).toBeNull();
    expect(screen.queryByText(/round \d|DC/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Halberd/ }));
    await waitFor(() => {
      const call = server.calls.find(
        (entry) => entry.method === "POST" && entry.pathname === `/campaigns/${campaignId}/rolls`,
      );
      expect(JSON.parse(call!.body)).toMatchObject({ characterId: brannocId });
    });
  });

  it.each([
    ["social", "A conversation", /Roll when the DM calls for a check/],
    ["hazard", "A hazard", /Roll your saving throw when the DM calls for one/],
  ] as const)("names a %s scene by its kind alone", async (mode, name, asked) => {
    server.routes.set(...playing(campaignId, { mode, order: [], upNext: null }));

    await renderTable();

    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByText(asked)).toBeInTheDocument();
    expect(screen.queryByText("Initiative")).toBeNull();
  });

  it("re-reads the narrow table when a contentless stream tick arrives", async () => {
    server.routes.set(...playing(campaignId, {}));
    server.routes.set(tableEventsPath, {
      status: 200,
      sse: 'id: 9\nevent: tick\ndata: {"tick":"session"}\n\n',
    });

    await renderTable();

    await waitFor(() => {
      const reads = server.calls.filter(
        (entry) => entry.method === "GET" && entry.pathname === `/campaigns/${campaignId}/table`,
      );
      expect(reads.length).toBeGreaterThan(1);
    });
  });

  it("refreshes the shared NPC transcript when another participant speaks", async () => {
    server.routes.set(...playing(campaignId, {}));
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${sessionId}`, {
      status: 200,
      body: [sharedNpc],
    });
    server.routes.set(
      `GET /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/status`,
      {
        status: 200,
        body: { available: true, npc: "Cazril" },
      },
    );
    server.routes.set(sharedNpcTurnsPath, {
      status: 200,
      body: () => {
        const calls = server.calls.filter(
          (entry) => entry.method === "GET" && entry.pathname === sharedNpcTurnsPath.slice(4),
        );
        return calls.length < 2 ? [] : [sharedNpcLine];
      },
    });
    server.routes.set(tableEventsPath, {
      status: 200,
      sse: 'id: 9\nevent: tick\ndata: {"tick":"session"}\n\n',
    });

    await renderTable();

    await screen.findByText("Open at the table");
    expect(screen.getByText(/shared live-session conversation/)).toBeTruthy();
    await screen.findByText("Cazril, the reeds are moving.");
    expect(screen.getByText("Pim")).toBeTruthy();
    await waitFor(() => {
      const reads = server.calls.filter(
        (entry) => entry.method === "GET" && entry.pathname === sharedNpcTurnsPath.slice(4),
      );
      expect(reads.length).toBeGreaterThan(1);
    });
  });

  it("does not disclose session NPC proposal review controls to players", async () => {
    server.routes.set(...playing(campaignId, {}));
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${sessionId}`, {
      status: 200,
      body: [sharedNpc],
    });
    server.routes.set(
      `GET /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/status`,
      { status: 200, body: { available: true, npc: "Cazril" } },
    );
    server.routes.set(sharedNpcTurnsPath, { status: 200, body: [] });
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/talk`,
      {
        status: 200,
        sse:
          `event: began\ndata: ${JSON.stringify({ threadId: sharedNpcThreadId, turnId: sharedProposal.npcTurnId })}\n\n` +
          `event: proposal\ndata: ${JSON.stringify({ proposal: sharedProposal })}\n\n` +
          'event: done\ndata: {"reason":"stop"}\n\n',
      },
    );

    await renderTable();
    const chat = await screen.findByRole("region", { name: "Talk to Cazril" });
    await userEvent.type(
      within(chat).getByRole("textbox", { name: "Say something to Cazril" }),
      "We will pay in names.{enter}",
    );

    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === "POST" && call.pathname.endsWith("/talk")),
      ).toBe(true),
    );
    expect(within(chat).queryByRole("button", { name: "Review in Cast" })).toBeNull();
    expect(within(chat).queryByRole("button", { name: /Accept/i })).toBeNull();
    expect(screen.queryByText(/proposal.*waiting/i)).toBeNull();
  });

  it("renders session NPC rate-limit messages with retry timing", async () => {
    server.routes.set(...playing(campaignId, {}));
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${sessionId}`, {
      status: 200,
      body: [sharedNpc],
    });
    server.routes.set(
      `GET /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/status`,
      { status: 200, body: { available: true, npc: "Cazril" } },
    );
    server.routes.set(sharedNpcTurnsPath, { status: 200, body: [] });
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${sharedNpcId}/sessions/${sessionId}/talk`,
      {
        status: 429,
        body: {
          _tag: "RateLimited",
          message:
            "You have sent too many messages to NPCs in the last minute. Wait a moment, then try again.",
          retryAfterSeconds: 60,
        },
      },
    );

    await renderTable();
    const chat = await screen.findByRole("region", { name: "Talk to Cazril" });
    await userEvent.type(
      within(chat).getByRole("textbox", { name: "Say something to Cazril" }),
      "Again.{enter}",
    );

    expect(await within(chat).findByRole("alert")).toHaveTextContent(
      "You have sent too many messages to NPCs in the last minute. Wait a moment, then try again. Retry after 60 seconds.",
    );
  });

  it("sends the sheet action to the new table route", async () => {
    server.routes.set(...playing(campaignId, {}));
    await renderSheet(brannocId);

    const action = await screen.findByRole("button", { name: /Go to the table/ });
    expect(action.getAttribute("href")).toBe(`/campaigns/${campaignId}/table`);
  });

  it("explains the quiet state instead of inventing table controls", async () => {
    await renderTable();

    await screen.findByText("No shared live table");
    expect(
      within(screen.getByRole("main")).queryByRole("button", { name: /End my turn/i }),
    ).toBeNull();
    expect(within(screen.getByRole("main")).queryByRole("button", { name: /Heal 5/i })).toBeNull();
    expect(within(screen.getByRole("main")).queryByRole("button", { name: /Take 5/i })).toBeNull();
  });
});

describe("rolling initiative at your table", () => {
  const initiativePath = `PUT /campaigns/${campaignId}/table/runs/${liveRunId}/combatants/${yourCombatantId}/initiative`;
  const yourRow = (overrides: Record<string, unknown>) => ({
    kind: "you",
    combatantId: yourCombatantId,
    characterId: brannocId,
    campaignCharacterId: brannocSeatRef.campaignCharacterId,
    displayName: "Brannoc Duskharrow",
    subtitle: null,
    initiative: null,
    initiativeBonus: 3,
    initiativeSetBy: null,
    hpCurrent: 44,
    hpMax: 52,
    tempHp: 0,
    conditions: [],
    portrait: null,
    ...overrides,
  });
  const rolling = (you: Record<string, unknown>) =>
    playing(campaignId, {
      phase: "initiative",
      upNext: null,
      order: [
        you,
        {
          kind: "npc",
          combatantId: hagCombatantId,
          displayName: "Marsh Hag",
          subtitle: "Medium Fey",
          initiative: null,
          hpBand: "unhurt",
          conditions: [],
        },
      ],
    });
  const sent = () =>
    server.calls
      .filter((call) => `${call.method} ${call.pathname}` === initiativePath)
      .map((call) => JSON.parse(call.body) as unknown);

  it("says the fight is rolling, and sends the total you type as your own", async () => {
    server.routes.set(...rolling(yourRow({})));
    server.routes.set(initiativePath, { status: 204, body: null });

    await renderTable();

    const card = within(
      (await screen.findByText("Your initiative")).closest("[data-slot=card]") as HTMLElement,
    );
    expect(screen.getByText(/Rolling initiative\. The first round starts/)).toBeInTheDocument();
    expect(screen.getAllByText("Initiative —")).toHaveLength(2);
    const send = card.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    const user = userEvent.setup();
    await user.type(card.getByLabelText("Total"), "17");
    await user.click(send);

    await waitFor(() => expect(sent()).toEqual([{ initiative: 17 }]));
  });

  it("rolls d20 plus your bonus into the tray, and sends the total", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    server.routes.set(...rolling(yourRow({})));
    server.routes.set(initiativePath, { status: 204, body: null });
    server.routes.set(`POST /campaigns/${campaignId}/rolls`, {
      status: 200,
      body: { ...roll, label: "Initiative", notation: "1d20+3", dice: [11], kept: [11], total: 14 },
    });

    await renderTable();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Roll d20 +3" }));

    await waitFor(() => expect(sent()).toEqual([{ initiative: 14 }]));
    const recorded = server.calls.find(
      (call) => call.method === "POST" && call.pathname === `/campaigns/${campaignId}/rolls`,
    );
    expect(JSON.parse(recorded!.body)).toMatchObject({ label: "Initiative", total: 14 });
  });

  it("says what you sent, and lets you change it", async () => {
    server.routes.set(...rolling(yourRow({ initiative: 12, initiativeSetBy: "player" })));

    await renderTable();

    expect(await screen.findByText(/You sent 12\. You can change it/)).toBeInTheDocument();
    expect(screen.getByLabelText("Total")).toBeInTheDocument();
  });

  it("offers nothing to change once your DM has written your number", async () => {
    server.routes.set(...rolling(yourRow({ initiative: 15, initiativeSetBy: "dm" })));

    await renderTable();

    expect(await screen.findByText("Your DM has you at 15.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Total")).toBeNull();
    expect(screen.queryByRole("button", { name: /Roll d20/ })).toBeNull();
  });

  it("offers no roll when your sheet gives no bonus, only the total", async () => {
    server.routes.set(...rolling(yourRow({ initiativeBonus: null })));

    await renderTable();

    expect(await screen.findByLabelText("Total")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll d20/ })).toBeNull();
  });

  it("draws no initiative card once round 1 has started", async () => {
    server.routes.set(...playing(campaignId, {}));

    await renderTable();

    await screen.findByText("Initiative");
    expect(screen.queryByText("Your initiative")).toBeNull();
  });
});

describe("the fight's read-aloud", () => {
  const fightEncounterId = "2b1f2a1e-0000-4000-8000-00000000ec01";
  const otherEncounterId = "2b1f2a1e-0000-4000-8000-00000000ec02";
  const shared = (over: Record<string, unknown>) => ({
    campaignId,
    body: "",
    kind: "read_aloud",
    attachedTo: null,
    updatedAt: "2026-08-04T19:00:00.000Z",
    ...over,
  });

  it("reads the player's own notes and draws the read-aloud hung on this fight's encounter", async () => {
    server.routes.set(...playing(campaignId, { encounterId: fightEncounterId }));
    server.routes.set(`GET /campaigns/${campaignId}/player-notes`, {
      status: 200,
      body: page([
        shared({
          id: "2b1f2a1e-0000-4000-8000-00000000fa01",
          title: "At the water",
          body: "The reeds part.",
          attachedTo: { kind: "encounter", id: fightEncounterId },
        }),
        shared({
          id: "2b1f2a1e-0000-4000-8000-00000000fa02",
          title: "A plain note on it",
          kind: "note",
          attachedTo: { kind: "encounter", id: fightEncounterId },
        }),
        shared({
          id: "2b1f2a1e-0000-4000-8000-00000000fa03",
          title: "Another fight's",
          attachedTo: { kind: "encounter", id: otherEncounterId },
        }),
      ]),
    });

    await renderTable();

    expect(await screen.findByText("The reeds part.")).toBeInTheDocument();
    expect(screen.getByText("At the water")).toBeInTheDocument();
    expect(screen.queryByText("A plain note on it")).toBeNull();
    expect(screen.queryByText("Another fight's")).toBeNull();
    const paths = server.calls.map((call) => call.pathname);
    expect(paths).toContain(`/campaigns/${campaignId}/player-notes`);
    expect(paths).not.toContain(`/campaigns/${campaignId}/notes`);
  });
});
