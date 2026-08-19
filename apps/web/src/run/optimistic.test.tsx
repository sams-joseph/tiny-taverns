import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brannoc, goblinBoss, installRunServer, renderRunner, sessionEvent } from "./run.fixtures";

/**
 * The runner's live protocol, pinned as behaviour rather than as implementation.
 *
 * `run/state.ts` and `run/stream.ts` carry the reasoning; this file is the
 * safety net under it. **Every assertion here is made through the screen**, not
 * through a hook, on purpose: the properties are what a DM sees, and a test
 * that named `useRunState`'s arguments would have to be rewritten by the very
 * change it exists to guard — at which point it stops being a characterisation
 * of anything.
 *
 * What it pins, in the order `state.ts` states the rules:
 *
 *  1. **Hit points move before the round trip; the turn marker does not.**
 *  2. **A row with an outstanding write of ours renders the pending value** —
 *     not the server's row, and not a delta laid on top of it. The
 *     double-counting case has its own test, because it is the one a "simpler"
 *     implementation gets wrong while looking right in every other test.
 *  3. **Only our own response clears it, and only the last one outstanding.** A
 *     re-read landing mid-flight merges underneath and changes nothing on
 *     screen.
 *  4. **A failure clears it with nothing to replace it**, and says so.
 *
 * Plus the two things the doorbell owes the screen: a ring costs exactly one
 * re-read of the two live rows and no more, a burst of rings collapses rather
 * than queueing, and a re-read that failed heals on its own.
 *
 * The window between a write leaving and its answer landing is the whole
 * subject, so the stub server can hold an answer open — see `hold` in
 * `run.fixtures.tsx`.
 */

const server = installRunServer();

const rows = () => screen.getAllByRole("row");
const rowFor = (name: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no row for ${name}`);
  return found;
};
const logRows = () => within(screen.getByRole("log")).queryAllByRole("listitem");

/** Point every route matching a fragment at a new answer. */
const reaim = (fragment: string, answer: { status: number; body: unknown }) => {
  for (const [key] of [...server.routes]) {
    if (key.includes(fragment)) server.routes.set(key, answer);
  }
};

/** What the server's combatant list will say from now on. */
const serverRows = (combatants: ReadonlyArray<unknown>) => {
  for (const [key, answer] of [...server.routes]) {
    if (key.startsWith("GET") && key.endsWith("/combatants")) {
      server.routes.set(key, { ...answer, body: combatants });
    }
  }
};

const countOf = (method: string, suffix: string) =>
  server.calls.filter((call) => call.method === method && call.pathname.endsWith(suffix)).length;

const damage = async (name: string, amount: string) => {
  const row = rowFor(name);
  await userEvent.type(
    within(row).getByLabelText(`Hit points to apply to ${name}`),
    `${amount}{Enter}`,
  );
};

/** The fight, loaded and listening. */
const openFight = async () => {
  await renderRunner();
  await screen.findByRole("heading", { name: "Ambush in the reeds" });
  await waitFor(() => expect(rows()).toHaveLength(2));
  await waitFor(() => expect(server.open()).toBe(1));
};

beforeEach(() => server.reset());
afterEach(() => {
  server.reset();
  server.drop();
});

describe("what is optimistic, and what is not", () => {
  it("shows the hit points before the round trip, and holds them until the answer lands", async () => {
    const release = server.hold("/damage");
    await openFight();

    await damage("Goblin Boss", "5");

    // The whole point: the number is already right while the write is still in
    // flight. A tool that waits 200ms to change reads as one that is thinking.
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );
    expect(countOf("POST", "/damage")).toBe(1);

    release();
    // The server's answer says the same thing, so nothing moves.
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );
  });

  it("does not move the turn marker until the server has moved it", async () => {
    const release = server.hold("/next-turn");
    await openFight();
    await screen.findByText(/Round 1 · Brannoc is up/);

    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));
    await screen.findByRole("button", { name: "Advancing…" });

    // Whose turn it is gets read aloud. Guessing the order here would be a
    // second implementation of what `nextTurn` walks, and being wrong means
    // saying the wrong name at the table.
    expect(screen.getByText(/Round 1 · Brannoc is up/)).toBeInTheDocument();

    release();
    await screen.findByText(/Round 1 · Goblin Boss is up/);
  });

  it("takes the run the write answered with, without re-reading the fight", async () => {
    await openFight();
    const before = countOf("GET", `/runs/${goblinBoss.encounterRunId}`);

    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));
    await screen.findByText(/Round 1 · Goblin Boss is up/);

    // With the stream down this is the only thing that keeps the screen right,
    // which is why the answer is used rather than left to the doorbell.
    expect(countOf("GET", `/runs/${goblinBoss.encounterRunId}`)).toBe(before);
  });
});

describe("when the optimistic value and the server disagree", () => {
  it("renders the pending number rather than a delta on the server's row", async () => {
    const release = server.hold("/damage");
    await openFight();

    await damage("Goblin Boss", "5");
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );

    // The server applied the hit and a re-read landed before our own response
    // did — the window a delta would double-count in. 16, not 16 − 5 = 11.
    serverRows([brannoc, { ...goblinBoss, hpCurrent: 16 }]);
    server.emit(sessionEvent(31, "combatant-damaged", goblinBoss.id));
    await waitFor(() => expect(logRows()).toHaveLength(1));
    await waitFor(() => expect(countOf("GET", "/combatants")).toBe(2));

    expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument();

    release();
    await waitFor(() => expect(countOf("POST", "/damage")).toBe(1));
    expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument();
  });

  it("merges a mid-flight re-read underneath, changing nothing on the pending row", async () => {
    const release = server.hold("/damage");
    await openFight();

    await damage("Goblin Boss", "5");
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );

    // A re-read that says something else entirely about both rows. The row we
    // are holding a write for must ignore it; the row we are not must not.
    serverRows([
      { ...brannoc, hpCurrent: 30 },
      { ...goblinBoss, hpCurrent: 3 },
    ]);
    server.emit(sessionEvent(32, "combatant-damaged", brannoc.id));
    await waitFor(() => expect(within(rowFor("Brannoc")).getByText("30/52")).toBeInTheDocument());

    expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument();

    // Our own answer is what releases it, and it is merged before the
    // optimistic value is taken away — so the row never flashes the 3.
    release();
    await waitFor(() => expect(countOf("POST", "/damage")).toBe(1));
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );
  });

  it("stacks a second hit on the first, and clears only when the last one answers", async () => {
    const release = server.hold("/damage");
    await openFight();

    await damage("Goblin Boss", "5");
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );
    await damage("Goblin Boss", "5");
    // The second hit is computed from what this screen believes, not from the
    // row the server last sent — which is what "the endpoint takes a delta"
    // buys.
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("11/21")).toBeInTheDocument(),
    );
    expect(countOf("POST", "/damage")).toBe(2);

    // The first answer lands. One write is still outstanding, so the optimistic
    // value stands: 11, not the 16 that answer carries.
    reaim("/damage", { status: 200, body: { ...goblinBoss, hpCurrent: 16 } });
    release(1);
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("11/21")).toBeInTheDocument(),
    );

    reaim("/damage", { status: 200, body: { ...goblinBoss, hpCurrent: 11 } });
    release();
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("11/21")).toBeInTheDocument(),
    );
  });

  it("puts the number back with nothing to replace it when the write is refused", async () => {
    reaim("/damage", { status: 404, body: { _tag: "NotFound", resource: "combatant", id: "x" } });
    await openFight();

    await damage("Goblin Boss", "5");

    // No silent retry: the request id makes a repeat safe, but leaving the DM
    // unsure whether the hit landed is worse than telling them it did not.
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("21/21")).toBeInTheDocument(),
    );
    await screen.findByText("Goblin Boss is unchanged");
    expect(countOf("POST", "/damage")).toBe(1);
  });
});

describe("the doorbell", () => {
  it("costs exactly one re-read of the two live rows, and nothing else", async () => {
    await openFight();
    const before = {
      run: countOf("GET", `/runs/${goblinBoss.encounterRunId}`),
      combatants: countOf("GET", "/combatants"),
      creatures: countOf("GET", "/creatures"),
    };

    serverRows([brannoc, { ...goblinBoss, hpCurrent: 9 }]);
    server.emit(sessionEvent(41, "combatant-damaged", goblinBoss.id));
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("9/21")).toBeInTheDocument(),
    );

    // Two requests, not five: the campaign, the session and the whole bestiary
    // are read once by the screen and never again by a hit.
    expect(countOf("GET", `/runs/${goblinBoss.encounterRunId}`)).toBe(before.run + 1);
    expect(countOf("GET", "/combatants")).toBe(before.combatants + 1);
    expect(countOf("GET", "/creatures")).toBe(before.creatures);
  });

  it("collapses a burst of rings into one more re-read rather than a queue", async () => {
    await openFight();
    expect(countOf("GET", "/combatants")).toBe(1);

    // Six goblins seeded, or a DM holding the space bar. Six identical requests
    // whose answers could land out of order would put an older list on screen
    // than the one already there.
    const release = server.hold("GET ");
    for (const seq of [51, 52, 53, 54, 55]) {
      server.emit(sessionEvent(seq, "combatant-damaged", goblinBoss.id));
    }
    await waitFor(() => expect(logRows()).toHaveLength(5));
    await waitFor(() => expect(countOf("GET", "/combatants")).toBe(2));
    release();

    // One in flight, at most one behind it — whatever the doorbell did.
    await waitFor(() => expect(countOf("GET", "/combatants")).toBe(3));
    await new Promise((resume) => setTimeout(resume, 150));
    expect(countOf("GET", "/combatants")).toBe(3);
  });

  it("never lets an older answer win over a newer one", async () => {
    await openFight();

    // The first re-read is held with the old rows; the second answers with the
    // new ones. Whatever the mechanism — a queue, or an interrupt — the list on
    // screen at the end is the newer one.
    const release = server.hold("GET ");
    serverRows([brannoc, { ...goblinBoss, hpCurrent: 18 }]);
    server.emit(sessionEvent(61, "combatant-damaged", goblinBoss.id));
    await waitFor(() => expect(countOf("GET", "/combatants")).toBe(2));

    serverRows([brannoc, { ...goblinBoss, hpCurrent: 4 }]);
    server.emit(sessionEvent(62, "combatant-damaged", goblinBoss.id));
    await waitFor(() => expect(logRows()).toHaveLength(2));
    release();

    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("4/21")).toBeInTheDocument(),
    );
    await new Promise((resume) => setTimeout(resume, 150));
    expect(within(rowFor("Goblin Boss")).getByText("4/21")).toBeInTheDocument();
  });

  it("keeps the fight on screen when a re-read fails, and heals without a second ring", async () => {
    await openFight();

    // The doorbell and the re-read travel over different connections: an open
    // stream keeps delivering while a new request cannot leave at all.
    server.transportDown = true;
    server.emit(sessionEvent(71, "turn-advanced", goblinBoss.id));
    await screen.findByText(/may be a moment behind/);
    expect(rows()).toHaveLength(2);

    // Nothing rings again. The re-read has to retry itself, or the screen sits
    // behind the server until something else happens to ring the bell.
    serverRows([brannoc, { ...goblinBoss, hpCurrent: 7 }]);
    server.transportDown = false;

    await waitFor(
      () => expect(within(rowFor("Goblin Boss")).getByText("7/21")).toBeInTheDocument(),
      {
        timeout: 10_000,
      },
    );
    expect(screen.queryByText(/may be a moment behind/)).toBeNull();
  });
});
