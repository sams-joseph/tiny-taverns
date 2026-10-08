import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  account,
  allyCombatantId,
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
  banner: null,
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
  kind: "plain",
  combatantId: null,
  targetCombatantId: null,
  targetAc: null,
  outcome: null,
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
        // No marker, so no turn banner naming a row a second time.
        upNext: null,
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
            ac: 18,
            actionUsed: false,
            bonusUsed: false,
            reactionUsed: false,
            feetMoved: 0,
            conditions: ["Blessed"],
            deathSaves: { successes: 0, failures: 0 },
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
            hpCurrent: 30,
            hpMax: 34,
            conditions: [],
            deathSaves: { successes: 0, failures: 0 },
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

    const strip = within(await screen.findByRole("region", { name: "Initiative" }));
    // Your own chip: your numbers and your armour class.
    expect(
      strip.getByRole("button", {
        name: "Brannoc Duskharrow (you), initiative 16, 44 of 52 hit points, AC 18, Blessed",
      }),
    ).toBeInTheDocument();
    // An ally's numbers, and no armour class.
    expect(
      strip.getByRole("button", { name: "Nessa, initiative 14, 30 of 34 hit points" }),
    ).toBeInTheDocument();
    // A creature's band, never a number.
    expect(
      strip.getByRole("button", { name: "Marsh Hag, initiative 12, bloodied, Frightened" }),
    ).toBeInTheDocument();
    expect(strip.getByText("Bloodied")).toBeInTheDocument();
    // Your card opens on your own character.
    const card = within(screen.getByRole("region", { name: "Your character" }));
    expect(card.getByText("44/52")).toBeInTheDocument();
    expect(card.getByText("3 temporary hit points.")).toBeInTheDocument();
    expect(screen.queryByText(/82/)).toBeNull();
    expect(screen.queryByText(/AC 17|17 AC/i)).toBeNull();
  });

  it("shows no map until the DM shares one, and asks for no board of its own", async () => {
    server.routes.set(...playing(campaignId, {}));
    await renderTable();
    await screen.findByRole("region", { name: "Initiative" });
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
    const you = map.getByRole("button", { name: "Brannoc Duskharrow (you), column 6, row 5" });
    expect(you.style.left).toMatch(/^20\.8333/);
    expect(you.style.top).toBe("25%");
    expect(you).toHaveTextContent("BD");
    expect(map.getByRole("button", { name: "Marsh Hag, column 12, row 7" })).toHaveTextContent(
      "MH",
    );
    expect(map.queryByRole("button", { name: /^Nessa/ })).toBeNull();

    // A token selects; nothing is written by looking, and nothing more is fetched.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(server.calls.some((call) => call.pathname.endsWith("/board"))).toBe(false);
  });

  it("lays a character's portrait on its token, and leaves the rest their initials", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.map((row) =>
          row.kind === "you" ? { ...row, portrait: drawnPortrait } : row,
        ),
        board: sharedBoard,
      }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const you = map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    expect(you.querySelector("[data-slot=token-portrait] img")?.getAttribute("src")).toBe(
      apiUrl(drawnPortrait.thumbUrl),
    );
    const hag = map.getByRole("button", { name: /^Marsh Hag/ });
    expect(hag.querySelector("[data-slot=token-portrait]")).toBeNull();
    expect(hag).toHaveTextContent("MH");
  });

  it("covers the squares under fog outright, under the player's own token", async () => {
    // The table sent the hag's row away with the fog over her square; only the
    // player's own token still stands under it.
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.filter((row) => row.kind !== "npc"),
        board: {
          ...sharedBoard,
          fog: [
            { column: 5, row: 4 },
            { column: 6, row: 4 },
          ],
          tokens: sharedBoard.tokens.filter((token) => token.combatantId === yourCombatantId),
        },
      }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const fog = document.querySelector<SVGElement>("[data-slot=battle-map] [data-slot=fog]");
    expect(fog?.dataset.veil).toBe("opaque");
    expect(fog?.dataset.squares).toBe("2");
    // Opaque: the full surface, not the DM's dimmed one.
    const cover = fog?.querySelector("path");
    expect(cover?.getAttribute("class")).toBe("fill-surface-sunken");
    expect(cover?.getAttribute("d")).toBe("M320 256h64v64h-64zM384 256h64v64h-64z");
    // Over the picture and the grid, under the player's own token.
    const you = map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    expect(fog!.compareDocumentPosition(you) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      document.querySelector("[data-slot=battle-map-grid]")!.compareDocumentPosition(fog!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(map.queryByRole("button", { name: /^Marsh Hag/ })).toBeNull();
  });

  it("draws no fog over a clear board", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder, board: sharedBoard }));
    await renderTable();
    await screen.findByRole("region", { name: "Battle map" });
    expect(document.querySelector("[data-slot=fog]")).toBeNull();
  });

  it("fades a token that is down, and rings whoever is up", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.map((row) => (row.kind === "npc" ? { ...row, hpBand: "down" } : row)),
        upNext: { kind: "visible", combatantId: hagCombatantId, displayName: "Marsh Hag" },
        board: sharedBoard,
      }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const hag = map.getByRole("button", { name: /^Marsh Hag/ });
    expect(hag.className).toMatch(/opacity-45/);
    expect(map.getByRole("button", { name: /^Brannoc/ }).className).not.toMatch(/opacity-/);
    // The turn's ring is on the hag's face, and on nobody else's.
    expect(hag.querySelector("[data-ring=active]")).not.toBeNull();
    expect(
      map.getByRole("button", { name: /^Brannoc/ }).querySelector("[data-ring=active]"),
    ).toBeNull();
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
    expect(map.queryByRole("button", { name: /^Marsh Hag/ })).toBeNull();
  });

  it("draws the area the DM pinned under the tokens, and names nobody it catches", async () => {
    const sphere = { shape: "sphere", feet: 10, origin: { column: 5, row: 4 } } as const;
    server.routes.set(
      ...playing(campaignId, { order: tableOrder, board: { ...sharedBoard, area: sphere } }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const area = map.getByRole("img", { name: "Pinned: a 10 ft sphere" });
    // Two squares each way of the square it is centred on, drawn under the tokens.
    expect(area.querySelector("[data-square='5,4']")).not.toBeNull();
    expect(area.querySelector("[data-square='7,4']")).not.toBeNull();
    expect(area.querySelector("[data-square='8,4']")).toBeNull();
    const you = map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    expect(area.compareDocumentPosition(you) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Who it catches is the DM's banner, over creatures this player may not see.
    expect(screen.queryByText(/caught/)).toBeNull();
  });

  it("draws no area once the DM has cleared it", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder, board: sharedBoard }));
    await renderTable();
    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    expect(map.getByRole("button", { name: /^Brannoc Duskharrow/ })).toBeInTheDocument();
    expect(map.queryByRole("img", { name: /^Pinned/ })).toBeNull();
  });

  it("lays an ally's portrait on its row, and draws none where there is none", async () => {
    server.routes.set(
      ...playing(campaignId, {
        upNext: null,
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
            ac: 18,
            actionUsed: false,
            bonusUsed: false,
            reactionUsed: false,
            feetMoved: 0,
            conditions: [],
            deathSaves: { successes: 0, failures: 0 },
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
            hpCurrent: 30,
            hpMax: 34,
            conditions: [],
            deathSaves: { successes: 0, failures: 0 },
            portrait: drawnPortrait,
          },
        ],
      }),
    );

    await renderTable();
    await screen.findByText("Nessa");

    const strip = within(screen.getByRole("region", { name: "Initiative" }));
    const chipOf = (name: RegExp) => strip.getByRole("button", { name });
    expect(
      chipOf(/^Nessa/)
        .querySelector("img")
        ?.getAttribute("src"),
    ).toBe(apiUrl(drawnPortrait.thumbUrl));
    expect(chipOf(/^Brannoc Duskharrow/).querySelector("img")).toBeNull();
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
    await user.click(screen.getByRole("button", { name: "Roll Halberd" }));

    // The to-hit and the damage, as one act, under your character and naming
    // no combatant: the table never tells a player a creature's armour class.
    await waitFor(() => {
      const bodies = server.calls
        .filter(
          (entry) => entry.method === "POST" && entry.pathname === `/campaigns/${campaignId}/rolls`,
        )
        .map((call) => JSON.parse(call.body) as Record<string, unknown>);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({
        characterId: brannocId,
        label: "Brannoc Duskharrow · Halberd",
        kind: "attack",
        notation: "1d20+7",
        dice: [11],
        total: 18,
      });
      expect(bodies[1]).toMatchObject({
        characterId: brannocId,
        label: "Brannoc Duskharrow · Halberd",
        kind: "damage",
        notation: "1d10+4",
        dice: [6],
        total: 10,
      });
      for (const body of bodies) {
        expect(Object.keys(body)).not.toContain("combatantId");
        expect(Object.keys(body)).not.toContain("targetCombatantId");
      }
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
    expect(screen.queryByRole("region", { name: "Initiative" })).toBeNull();
    expect(screen.queryByText(/round \d|DC/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Roll Halberd" }));
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
    expect(screen.queryByRole("region", { name: "Initiative" })).toBeNull();
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
    ac: 18,
    actionUsed: false,
    bonusUsed: false,
    reactionUsed: false,
    feetMoved: 0,
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
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
    expect(screen.getByText("Session 12 · rolling initiative")).toBeInTheDocument();
    const strip = within(screen.getByRole("region", { name: "Initiative" }));
    expect(strip.getAllByRole("button", { name: /initiative not rolled/ })).toHaveLength(2);
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

    await screen.findByRole("region", { name: "Initiative" });
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
    category: null,
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

describe("the turn banner", () => {
  const banner = async () => within(await screen.findByRole("status", { name: "Turn" }));

  it("names whose turn it is and the next row the player can see", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder }));
    await renderTable();

    const turn = await banner();
    expect(turn.getByText("Round 3")).toBeInTheDocument();
    expect(turn.getByText("Brannoc Duskharrow's turn")).toBeInTheDocument();
    expect(turn.getByText("Up next")).toBeInTheDocument();
    expect(turn.getByText("Nessa")).toBeInTheDocument();
  });

  it("wraps to the top of the order after the last row", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder,
        round: 4,
        upNext: { kind: "visible", combatantId: hagCombatantId, displayName: "Marsh Hag" },
      }),
    );
    await renderTable();

    const turn = await banner();
    expect(turn.getByText("Round 4")).toBeInTheDocument();
    expect(turn.getByText("Marsh Hag's turn")).toBeInTheDocument();
    expect(turn.getByText("Brannoc Duskharrow")).toBeInTheDocument();
  });

  it("says only that something moves when the creature that is up is hidden", async () => {
    // The hag is hidden: absent from the order, and the marker on her arrives
    // as the hidden arm, which carries no id and no name.
    const visible = tableOrder.filter((row) => row.kind !== "npc");
    server.routes.set(...playing(campaignId, { order: visible, upNext: { kind: "hidden" } }));
    await renderTable();

    const turn = await banner();
    expect(turn.getByText("Round 3")).toBeInTheDocument();
    expect(turn.getByText("Something moves")).toBeInTheDocument();
    // Where the hidden row stands is not on the wire, so nobody follows it.
    expect(turn.queryByText("Up next")).toBeNull();
    expect(turn.queryByText(/Brannoc|Nessa|Marsh Hag/)).toBeNull();
    expect(screen.queryByText("Marsh Hag")).toBeNull();
    expect(screen.queryByText("Your turn")).toBeNull();
  });

  it("has no up next when the player can see one row alone", async () => {
    server.routes.set(...playing(campaignId, {}));
    await renderTable();

    const turn = await banner();
    expect(turn.getByText("Brannoc Duskharrow's turn")).toBeInTheDocument();
    expect(turn.queryByText("Up next")).toBeNull();
  });

  it("follows the ally whose turn it is to the next row", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder,
        upNext: { kind: "visible", combatantId: allyCombatantId, displayName: "Nessa" },
      }),
    );
    await renderTable();

    const turn = await banner();
    expect(turn.getByText("Nessa's turn")).toBeInTheDocument();
    expect(turn.getByText("Marsh Hag")).toBeInTheDocument();
  });

  it.each([
    ["no marker is set", { order: tableOrder, upNext: null }],
    ["the fight is rolling initiative", { order: tableOrder, phase: "initiative", upNext: null }],
    ["the scene has no order", { mode: "social", order: [], upNext: null }],
  ] as const)("draws no banner when %s", async (_, fight) => {
    server.routes.set(...playing(campaignId, fight));
    await renderTable();

    await screen.findByText(/Session 12/);
    expect(screen.queryByRole("status", { name: "Turn" })).toBeNull();
    expect(screen.queryByText(/'s turn$|^Something moves$/)).toBeNull();
  });
});

describe("your turn at the table", () => {
  const ownRow = `/campaigns/${campaignId}/table/runs/${liveRunId}/combatants/${yourCombatantId}`;
  const writes = (what: "turn" | "move") =>
    server.calls
      .filter((call) => call.method === "POST" && call.pathname === `${ownRow}/${what}`)
      .map((call) => JSON.parse(call.body) as Record<string, unknown>);
  const offTurn = {
    kind: "visible",
    combatantId: hagCombatantId,
    displayName: "Marsh Hag",
  } as const;

  beforeEach(() => {
    server.routes.set(`POST ${ownRow}/turn`, { status: 204, body: null });
    server.routes.set(`POST ${ownRow}/move`, { status: 204, body: null });
  });

  it("ticks your own action on your turn, with the DM's This turn block", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder }));
    await renderTable();

    const turn = within(
      await screen.findByRole("region", { name: "This turn of Brannoc Duskharrow" }),
    );
    await userEvent.click(turn.getByRole("button", { name: "Action" }));
    await waitFor(() => expect(writes("turn")).toHaveLength(1));
    expect(writes("turn")[0]).toMatchObject({ actionUsed: true });
    expect(typeof writes("turn")[0]!.requestId).toBe("string");
  });

  it("leaves only your reaction to tick off your turn", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder, upNext: offTurn }));
    await renderTable();

    const turn = within(
      await screen.findByRole("region", { name: "This turn of Brannoc Duskharrow" }),
    );
    expect(turn.getByRole("button", { name: "Action" })).toBeDisabled();
    expect(turn.getByRole("button", { name: "Bonus" })).toBeDisabled();
    await userEvent.click(turn.getByRole("button", { name: "Reaction" }));
    await waitFor(() =>
      expect(writes("turn")).toEqual([expect.objectContaining({ reactionUsed: true })]),
    );
  });

  it("moves your own token on your turn, and nobody else's", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder, board: sharedBoard }));
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    const you = map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ });
    you.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(writes("move")).toHaveLength(1));
    expect(writes("move")[0]).toMatchObject({ position: { column: 6, row: 4 } });

    const hag = map.getByRole("button", { name: /^Marsh Hag/ });
    hag.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(writes("move")).toHaveLength(1);
  });

  it("moves nothing off your turn", async () => {
    server.routes.set(
      ...playing(campaignId, { order: tableOrder, board: sharedBoard, upNext: offTurn }),
    );
    await renderTable();

    const map = within(await screen.findByRole("region", { name: "Battle map" }));
    map.getByRole("button", { name: /^Brannoc Duskharrow \(you\)/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(writes("move")).toEqual([]);
  });

  it("opens anyone else on the card with what the table says of them, and back to you", async () => {
    server.routes.set(...playing(campaignId, { order: tableOrder }));
    await renderTable();

    const strip = within(await screen.findByRole("region", { name: "Initiative" }));
    await userEvent.click(strip.getByRole("button", { name: /^Marsh Hag/ }));
    const card = within(screen.getByRole("region", { name: "Selected combatant" }));
    expect(card.getByText("Marsh Hag")).toBeInTheDocument();
    expect(card.getByText("Hostile")).toBeInTheDocument();
    expect(card.getByText("Bloodied")).toBeInTheDocument();
    expect(card.getByText("Frightened")).toBeInTheDocument();
    // Nothing to press on somebody else but the way back.
    expect(card.getAllByRole("button").map((button) => button.textContent)).toEqual(["You"]);

    await userEvent.click(card.getByRole("button", { name: "You" }));
    expect(screen.getByRole("region", { name: "Your character" })).toBeInTheDocument();
  });

  it("marks your own death saves at zero hit points", async () => {
    server.routes.set(
      ...playing(campaignId, {
        order: tableOrder.map((row) => (row.kind === "you" ? { ...row, hpCurrent: 0 } : row)),
      }),
    );
    server.routes.set(`POST /me/characters/${brannocId}/death-saves`, {
      status: 200,
      body: { ...brannoc, deathSaves: { successes: 1, failures: 0 } },
    });
    await renderTable();

    const saves = within(
      await screen.findByRole("region", { name: "Death saves of Brannoc Duskharrow" }),
    );
    await userEvent.click(saves.getByRole("button", { name: "Success 1 of 3" }));
    await waitFor(() => {
      const call = server.calls.find(
        (entry) =>
          entry.method === "POST" && entry.pathname === `/me/characters/${brannocId}/death-saves`,
      );
      expect(JSON.parse(call!.body)).toMatchObject({ successes: 1, failures: 0 });
    });
  });
});
