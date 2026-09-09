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
  sessionId,
  yourCombatantId,
} from "../characters/characters.fixtures";
import { renderAt } from "../test/renderRoute";
import { HostedSessionScope } from "../auth/AuthProvider";
import { noSession } from "../characters/characters.fixtures";

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
    <HostedSessionScope session={noSession}>{route}</HostedSessionScope>
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
            hpCurrent: 44,
            hpMax: 52,
            tempHp: 3,
            conditions: ["Blessed"],
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

  it("persists a browser-submitted roll and shows only this character's log", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    server.routes.set(...playing(campaignId));
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

  it("re-reads the narrow table when a contentless stream tick arrives", async () => {
    server.routes.set(...playing(campaignId));
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
    server.routes.set(...playing(campaignId));
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
    server.routes.set(...playing(campaignId));
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
    server.routes.set(...playing(campaignId));
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
    server.routes.set(...playing(campaignId));
    await renderSheet(brannocId);

    const action = await screen.findByRole("button", { name: /Go to the table/ });
    expect(action.getAttribute("href")).toBe(`/#/campaigns/${campaignId}/table`);
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
