import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssistantTurnId, HobProposal } from "@taverns/api";
import { artifactFrom } from "../hob/transcript";
import {
  bodyOf,
  brannoc,
  brannocId,
  installCharacterServer,
  ownedBrannoc,
  renderSheet,
  sseFrames,
  sorrelId,
} from "./characters.fixtures";

/**
 * **Asking Hob for the next level, on the sheet** — the composer beside
 * *Level up* (`/me/hob/ask` with `intent: "levelUp"`), the card it draws, and
 * the two answers a person gives it: *Keep it*, the accept, which re-reads
 * every screen the wizard's own confirm does, and *Discard*.
 */

const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const threadId = "2b1f2a1e-0000-4000-8000-00000000b001";
const turnId = "2b1f2a1e-0000-4000-8000-00000000b002";
const styleId = "2b1f2a1e-0000-4000-8000-00000000b003";
const defenseId = "2b1f2a1e-0000-4000-8000-00000000b004";
const acceptPath = `/me/hob/threads/${threadId}/turns/${turnId}/accept`;
const discardPath = `/me/hob/threads/${threadId}/turns/${turnId}/discard`;
const logPath = `/me/characters/${brannocId}/level-ups`;

/** The level the scripted model offers, as the proposal the server stores. */
const proposal = {
  target: "levelUp",
  characterId: brannocId,
  characterName: brannoc.name,
  className: "Paladin",
  fromLevel: 5,
  toLevel: 6,
  hitPointGain: 9,
  payload: {
    expectedVersion: 1,
    toLevel: 6,
    hitPoints: "fixed",
    picks: [{ offeredBy: styleId, featureId: defenseId }],
  },
  choices: {
    picks: [
      {
        kind: "feature",
        offeredBy: { featureId: styleId, name: "Fighting Style" },
        featureId: defenseId,
        name: "Defense",
      },
    ],
    spells: [],
  },
  rationale: ["Defense: they stand in front of everybody else."],
} as const;

const offered = {
  status: 200,
  sse: sseFrames([
    { event: "began", data: { threadId, turnId } },
    { event: "tool", data: { name: "readLevelUpOffer", phase: "called", detail: "" } },
    { event: "delta", data: { text: "Level 6, with Defense." } },
    { event: "proposal", data: { turnId, proposal } },
    { event: "done", data: { reason: "stop" } },
  ]),
};

const dialog = () => within(screen.getByRole("dialog"));

const openComposer = async () => {
  await renderSheet();
  await userEvent.click(await screen.findByRole("button", { name: "Level up with Hob" }));
  await screen.findByRole("dialog", { name: /^Ask Hob for level/ });
};

const askHob = async (text?: string) => {
  const box = await dialog().findByRole("textbox", { name: "What should Hob weigh?" });
  if (text !== undefined) await userEvent.type(box, text);
  await userEvent.click(dialog().getByRole("button", { name: "Ask Hob" }));
};

const withHob = (available = true) => {
  server.routes.set("GET /me/hob", {
    status: 200,
    body: { available, model: available ? "scripted-local" : null },
  });
  server.routes.set("POST /me/hob/ask", offered);
};

describe("asking Hob for the next level", () => {
  it("asks for this character's next level and draws what keeping it applies", async () => {
    withHob();
    await openComposer();
    expect(dialog().getByText("Ask Hob for level 6")).toBeTruthy();
    await askHob("Keep them standing.");

    expect(await dialog().findByText("Paladin · Level 5 → 6")).toBeTruthy();
    expect(dialog().getByText("+9 (fixed)")).toBeTruthy();
    expect(dialog().getByText("Fighting Style")).toBeTruthy();
    expect(dialog().getByText("Defense")).toBeTruthy();
    expect(dialog().getByText("Defense: they stand in front of everybody else.")).toBeTruthy();
    // The composer names its surface and its character; nothing else is sent.
    expect(bodyOf(server, "POST", "/me/hob/ask")).toEqual({
      text: "Keep them standing.",
      intent: "levelUp",
      characterId: brannocId,
    });
    // Nothing is applied until it is kept.
    expect(server.calls.some((call) => call.pathname === acceptPath)).toBe(false);
  });

  it("asks Hob to choose for them when the box is left empty", async () => {
    withHob();
    await openComposer();
    await askHob();
    await dialog().findByText("Paladin · Level 5 → 6");
    expect(bodyOf(server, "POST", "/me/hob/ask")).toMatchObject({
      text: "Choose my next level for me.",
    });
  });

  it("keeps it through the accept, and the sheet and its Log read themselves again", async () => {
    withHob();
    server.routes.set(`POST ${acceptPath}`, {
      status: 200,
      body: {
        accepted: "levelUp",
        owned: {
          ...ownedBrannoc,
          character: {
            ...brannoc,
            level: 6,
            version: 2,
            descriptor: "Level 6 Half-orc Paladin",
          },
        },
        advancement: {
          id: "2b1f2a1e-0000-4000-8000-00000000b005",
          characterId: brannocId,
          level: 6,
          className: "Paladin",
          hitPoints: { method: "fixed", die: 6, gain: 9 },
          choices: proposal.choices,
          note: null,
          origin: "assistant",
          assistantTurnId: turnId,
          createdAt: "2026-10-02T20:00:00.000Z",
        },
      },
    });
    await openComposer();
    await askHob();
    await dialog().findByText("Paladin · Level 5 → 6");

    const sheetReads = () =>
      server.calls.filter((call) => call.pathname === "/me/characters").length;
    const logReads = () => server.calls.filter((call) => call.pathname === logPath).length;
    const before = { sheet: sheetReads(), log: logReads() };
    await userEvent.click(dialog().getByRole("button", { name: "Keep it" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The accept takes no content: the server applies the proposal it stored.
    expect(bodyOf(server, "POST", acceptPath)).toEqual({});
    await waitFor(() => expect(sheetReads()).toBeGreaterThan(before.sheet));
    await waitFor(() => expect(logReads()).toBeGreaterThan(before.log));
  });

  it("says why a keep was refused, with a way to read the sheet again", async () => {
    withHob();
    server.routes.set(`POST ${acceptPath}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message:
          "the sheet moved on since the level-up was offered (version 2, you read 1). Read the offer again and choose again.",
      },
    });
    await openComposer();
    await askHob();
    await dialog().findByText("Paladin · Level 5 → 6");
    await userEvent.click(dialog().getByRole("button", { name: "Keep it" }));
    expect(await dialog().findByText(/the sheet moved on/)).toBeTruthy();
    expect(dialog().getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("discards it, and the card goes", async () => {
    withHob();
    server.routes.set(`POST ${discardPath}`, { status: 204, body: null });
    await openComposer();
    await askHob();
    await dialog().findByText("Paladin · Level 5 → 6");
    await userEvent.click(dialog().getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(dialog().queryByText("Paladin · Level 5 → 6")).toBeNull());
    expect(bodyOf(server, "POST", discardPath)).toEqual({});
    expect(server.calls.some((call) => call.pathname === acceptPath)).toBe(false);
  });

  it("says so when no model is behind Hob, and asks nothing", async () => {
    withHob(false);
    await openComposer();
    expect(await dialog().findByText(/No model is configured behind Hob/)).toBeTruthy();
    expect(dialog().queryByRole("button", { name: "Ask Hob" })).toBeNull();
    expect(server.calls.some((call) => call.pathname === "/me/hob/ask")).toBe(false);
  });

  it("is absent where there is no level to take", async () => {
    // Sorrel's class resolves to nothing in her rules: no *Level up*, and no
    // Hob to ask for one.
    withHob();
    await renderSheet(sorrelId);
    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Level up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Level up with Hob" })).toBeNull();
  });
});

describe("a level-up proposal's card", () => {
  it("sets out the hit points, then each choice by name, as the panel draws it too", () => {
    const artifact = artifactFrom(
      turnId as AssistantTurnId,
      {
        ...proposal,
        choices: {
          subclass: { name: "Devotion" },
          abilityScores: [{ ability: "STR", from: 16, to: 18 }],
          picks: proposal.choices.picks,
          spells: [
            { spellId: "s1", name: "Bless", level: 1, kind: "learned" },
            { spellId: "s2", name: "Guidance", level: 0, kind: "cantrip" },
          ],
          replaced: {
            from: { spellId: "s3", name: "Command", level: 1 },
            to: { spellId: "s4", name: "Heroism", level: 1 },
          },
        },
      } as unknown as HobProposal,
    );
    expect(artifact).toMatchObject({
      kind: "levelUp",
      title: brannoc.name,
      meta: "Paladin · Level 5 → 6",
      lines: [
        ["Hit points", "+9 (fixed)"],
        ["Subclass", "Devotion"],
        ["Ability scores", "STR 16 → 18"],
        ["Fighting Style", "Defense"],
        ["Cantrips", "Guidance"],
        ["Spells", "Bless"],
        ["Swapped", "Command for Heroism"],
      ],
    });
  });
});
