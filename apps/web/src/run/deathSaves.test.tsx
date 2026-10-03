import { Combatant } from "@taverns/api";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reads } from "../api/keys";
import { deathStatusOf, dotPressed, isDead } from "./deathSaves";
import { deathSaveWrites, outOfTheFight } from "./load";
import {
  bodyOf,
  brannoc,
  brannocPlaced,
  campaignId,
  goblinBoss,
  installRunServer,
  liveRun,
  renderRunner,
  sessionEvent,
} from "./run.fixtures";

/**
 * A party member's death saves on the DM's runner: the block the selected
 * card grows at zero hit points, against the stub server. The rules are the
 * server's (`repo/vitals.ts`, `deathSaveRolled`); what is pinned here is what
 * the screen sends and what it does with the row that comes back.
 */

const decode = Schema.decodeUnknownSync(Combatant);

describe("death-save status", () => {
  it("reads three failures as dead, three successes as stable, anything else as dying", () => {
    expect(deathStatusOf({ successes: 0, failures: 0 })).toBe("dying");
    expect(deathStatusOf({ successes: 2, failures: 2 })).toBe("dying");
    expect(deathStatusOf({ successes: 3, failures: 1 })).toBe("stable");
    expect(deathStatusOf({ successes: 1, failures: 3 })).toBe("dead");
    // The DM's dots can say both; dead wins, as the drawing's does.
    expect(deathStatusOf({ successes: 3, failures: 3 })).toBe("dead");
  });

  it("calls only a party member with three failures dead", () => {
    expect(isDead(decode({ ...brannoc, deathSaves: { successes: 0, failures: 3 } }))).toBe(true);
    expect(isDead(decode({ ...brannoc, deathSaves: { successes: 2, failures: 2 } }))).toBe(false);
    // A monster makes no saves, so it is never dead this way: it is out at zero.
    expect(isDead(decode({ ...goblinBoss, hpCurrent: 0 }))).toBe(false);
  });

  it("puts a party member out of the fight only when dead, and a monster at zero", () => {
    const dying = decode({ ...brannoc, hpCurrent: 0, deathSaves: { successes: 0, failures: 2 } });
    const dead = decode({ ...brannoc, hpCurrent: 0, deathSaves: { successes: 0, failures: 3 } });
    expect(outOfTheFight(dying, 0)).toBe(false);
    expect(outOfTheFight(dead, 0)).toBe(true);
    expect(outOfTheFight(decode(goblinBoss), 0)).toBe(true);
    expect(outOfTheFight(decode(goblinBoss), 1)).toBe(false);
  });

  it("fills a dot and those before it, and empties a filled one and those after it", () => {
    expect(dotPressed(0, 0)).toBe(1);
    expect(dotPressed(1, 2)).toBe(3);
    expect(dotPressed(2, 1)).toBe(1);
    expect(dotPressed(3, 0)).toBe(0);
    expect(dotPressed(1, 0)).toBe(0);
  });
});

const server = installRunServer();
beforeEach(() => server.reset());
afterEach(() => {
  server.drop();
  vi.restoreAllMocks();
});

const runBase = `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;

/** Brannoc down, with the counts a test gives him; he is up, so the card follows him. */
const downed = (successes: number, failures: number) => ({
  ...brannocPlaced,
  hpCurrent: 0,
  conditions: ["Unconscious"],
  deathSaves: { successes, failures },
});

const fightWith = (row: Record<string, unknown>) =>
  server.routes.set(`GET ${runBase}/combatants`, { status: 200, body: [row, goblinBoss] });

const panel = () => within(screen.getByRole("region", { name: "Selected combatant" }));
const block = async () =>
  within(await screen.findByRole("region", { name: "Death saves of Brannoc" }));
const dot = (row: "successes" | "failures", n: number) =>
  within(panel().getByRole("group", { name: `Death save ${row}` })).getByRole("button", {
    name: `${row === "successes" ? "Success" : "Fail"} ${String(n)} of 3`,
  });
/** The initiative strip's chips, which are the only buttons in its order. */
const rows = () =>
  within(screen.getByRole("list", { name: "Initiative order" })).getAllByRole("button");
const rowFor = (name: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no chip for ${name}`);
  return found;
};

describe("death saves on the runner", () => {
  it("draws the block only for a party member at zero hit points", async () => {
    // A monster at zero alongside him, which makes no saves: it is out, not dying.
    server.routes.set(`GET ${runBase}/combatants`, {
      status: 200,
      body: [downed(1, 2), { ...goblinBoss, hpCurrent: 0 }],
    });
    await renderRunner();

    const saves = await block();
    expect(saves.getByText("Dying")).toBeInTheDocument();
    expect(dot("successes", 1)).toHaveAttribute("aria-pressed", "true");
    expect(dot("successes", 2)).toHaveAttribute("aria-pressed", "false");
    expect(dot("failures", 2)).toHaveAttribute("aria-pressed", "true");
    expect(dot("failures", 3)).toHaveAttribute("aria-pressed", "false");
    expect(saves.getByRole("button", { name: "Roll death save" })).toBeEnabled();

    await userEvent.click(rowFor("Goblin Boss"));
    await panel().findByRole("heading", { name: "Goblin Boss" });
    expect(panel().queryByRole("region", { name: /Death saves/ })).toBeNull();
  });

  it("draws nothing for a party member still standing", async () => {
    await renderRunner();
    await screen.findByRole("heading", { name: "Brannoc" });
    expect(panel().queryByRole("region", { name: /Death saves/ })).toBeNull();
  });

  it("sets the counts outright from the dots, through the DM's endpoint", async () => {
    fightWith(downed(1, 0));
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/death-saves`, {
      status: 200,
      body: downed(2, 0),
    });
    await renderRunner();
    await block();
    const partyReads = () =>
      server.calls.filter((call) => call.method === "GET" && call.pathname.endsWith("/party"))
        .length;
    const before = partyReads();

    await userEvent.click(dot("successes", 2));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/death-saves")).toMatchObject({ successes: 2, failures: 0 }),
    );
    // Safe to repeat on a slow network.
    expect((bodyOf(server, "POST", "/death-saves") as { requestId: string }).requestId).toMatch(
      /.+/,
    );
    // The answer is the fight's row, merged without a re-read.
    await waitFor(() => expect(dot("successes", 2)).toHaveAttribute("aria-pressed", "true"));
    // Written through to the character, and drawn on the player's own row of
    // their table: the party is re-read here, and the table is named.
    await waitFor(() => expect(partyReads()).toBeGreaterThan(before));
    expect(deathSaveWrites(campaignId)).toEqual([
      reads.party(campaignId),
      reads.playerTable(campaignId),
    ]);
  });

  it("takes a dot back by pressing the first filled one", async () => {
    fightWith(downed(0, 2));
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/death-saves`, {
      status: 200,
      body: downed(0, 0),
    });
    await renderRunner();
    await block();

    await userEvent.click(dot("failures", 1));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/death-saves")).toMatchObject({ successes: 0, failures: 0 }),
    );
    await waitFor(() => expect(dot("failures", 1)).toHaveAttribute("aria-pressed", "false"));
  });

  it("rolls the d20 here, sends its face, and takes the server's reading of it", async () => {
    // 0.6 of a d20 is a 13: a success.
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    fightWith(downed(0, 1));
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/death-save-roll`, {
      status: 200,
      body: downed(1, 1),
    });
    await renderRunner();
    const saves = await block();

    await userEvent.click(saves.getByRole("button", { name: "Roll death save" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/death-save-roll")).toMatchObject({ face: 13 }),
    );
    // The rule is the server's: the screen sends a face, never counts.
    expect(bodyOf(server, "POST", "/death-save-roll")).not.toHaveProperty("successes");
    await waitFor(() => expect(dot("successes", 1)).toHaveAttribute("aria-pressed", "true"));
    // The roll's one line in the dock is the night's, once it arrives.
    expect(screen.queryByText("Brannoc · Death save")).toBeNull();
    server.emit({
      ...sessionEvent(21, "death-save", brannoc.id),
      payload: { face: 13, successes: 1, failures: 1, hpCurrent: 0 },
    });
    const dock = within(screen.getByRole("region", { name: "Rolls" }));
    await waitFor(() => expect(dock.getAllByText("Brannoc · Death save")).toHaveLength(1));
    expect(dock.getByText("1d20 = 13 · 1 success · 1 failure")).toBeInTheDocument();
  });

  it("puts the block away when a natural 20 brings them back", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    fightWith(downed(1, 2));
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/death-save-roll`, {
      status: 200,
      body: { ...downed(0, 0), hpCurrent: 1, conditions: [] },
    });
    await renderRunner();
    const saves = await block();

    await userEvent.click(saves.getByRole("button", { name: "Roll death save" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/death-save-roll")).toMatchObject({ face: 20 }),
    );
    await waitFor(() => expect(panel().queryByRole("region", { name: /Death saves/ })).toBeNull());
    expect(panel().getByText("1/52")).toBeInTheDocument();
  });

  it("calls three successes stable, and leaves nothing to roll", async () => {
    fightWith(downed(3, 1));
    await renderRunner();
    const saves = await block();

    expect(saves.getByText("Stable")).toHaveClass("text-success");
    expect(saves.getByRole("button", { name: "Roll death save" })).toBeDisabled();
  });

  it("draws three failures dead, in the danger colour, with nothing to roll", async () => {
    fightWith(downed(0, 3));
    await renderRunner();
    const saves = await block();

    expect(saves.getByText("Dead")).toHaveClass("text-danger");
    expect(saves.getByRole("button", { name: "Roll death save" })).toBeDisabled();
    // The dots stay pressable: a DM who marked one too many takes it back.
    expect(dot("failures", 3)).toBeEnabled();
  });

  it("starts a stable party member dying again when they are hit", async () => {
    fightWith(downed(3, 0));
    // The server's rule: a hit at zero is a failure, and it sets the successes back.
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/damage`, {
      status: 200,
      body: downed(0, 1),
    });
    await renderRunner();
    const saves = await block();
    expect(saves.getByText("Stable")).toBeInTheDocument();

    await userEvent.type(panel().getByLabelText("Hit points to apply to Brannoc"), "4{Enter}");

    await waitFor(() => expect(bodyOf(server, "POST", "/damage")).toMatchObject({ amount: 4 }));
    expect(await (await block()).findByText("Dying")).toBeInTheDocument();
    expect(dot("failures", 1)).toHaveAttribute("aria-pressed", "true");
    expect((await block()).getByRole("button", { name: "Roll death save" })).toBeEnabled();
  });

  it("says so, and keeps the server's dots, when a write does not land", async () => {
    fightWith(downed(1, 1));
    server.routes.set(`POST ${runBase}/combatants/${brannoc.id}/death-saves`, {
      status: 409,
      body: { _tag: "Conflict", message: "they make no death saves" },
    });
    await renderRunner();
    await block();

    await userEvent.click(dot("failures", 2));

    await screen.findByText("Brannoc's death saves are unchanged");
    expect(dot("failures", 2)).toHaveAttribute("aria-pressed", "false");
  });

  it("presses nothing once the fight is over", async () => {
    fightWith(downed(1, 1));
    server.routes.set(`GET ${runBase}`, {
      status: 200,
      body: { ...liveRun, endedAt: "2026-08-04T20:00:00.000Z" },
    });
    await renderRunner();
    const saves = await block();

    expect(dot("successes", 2)).toBeDisabled();
    expect(saves.getByRole("button", { name: "Roll death save" })).toBeDisabled();
  });
});

describe("who the fight draws as out", () => {
  const token = (name: string) =>
    within(screen.getByRole("region", { name: "Battle map" })).getByRole("button", {
      name: new RegExp(`^${name}, column`),
    });
  const placedBoss = { ...goblinBoss, hpCurrent: 0, position: { column: 9, row: 4 } };

  it("leaves a dying party member drawn as they are, in the strip and on the board", async () => {
    server.routes.set(`GET ${runBase}/combatants`, {
      status: 200,
      body: [downed(0, 2), placedBoss],
    });
    await renderRunner();
    await block();

    const row = rowFor("Brannoc");
    expect(row.className).not.toContain("opacity-45");
    expect(within(row).getByText("Brannoc").className).not.toContain("line-through");
    expect(token("Brannoc").className).not.toContain("opacity-45");
    // The monster at zero beside him is out, as before.
    expect(rowFor("Goblin Boss").className).toContain("opacity-45");
    expect(within(rowFor("Goblin Boss")).getByText("Goblin Boss").className).toContain(
      "line-through",
    );
    expect(token("Goblin Boss").className).toContain("opacity-45");
  });

  it("fades and strikes through a dead party member, in the strip and on the board", async () => {
    server.routes.set(`GET ${runBase}/combatants`, {
      status: 200,
      body: [downed(0, 3), placedBoss],
    });
    await renderRunner();
    await block();

    const row = rowFor("Brannoc");
    expect(row.className).toContain("opacity-45");
    expect(within(row).getByText("Brannoc").className).toContain("line-through");
    expect(token("Brannoc").className).toContain("opacity-45");
  });
});
