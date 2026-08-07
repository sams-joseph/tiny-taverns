import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  goblinBoss,
  installRunServer,
  liveRun,
  renderRunner,
  sessionEvent,
} from "./run.fixtures";

/**
 * The runner, against a stub server.
 *
 * These cover what jsdom can see: which rows render, what is sent, and what the
 * screen does with the answer. They cannot see the two things that matter most
 * about this screen — that a dropped connection recovers, and that a number
 * moving before the round trip *looks* immediate — so those were driven in a
 * real Chromium and what was measured is recorded in `AGENTS.md`.
 * `stream.test.ts` covers the reconnect contract itself, which is logic rather
 * than pixels and so does fit here.
 */

const server = installRunServer();

/** The combatant list, which is the only thing with `role="row"` in it. */
const rows = () => screen.getAllByRole("row");
const rowFor = (name: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no row for ${name}`);
  return found;
};
const panel = () => within(screen.getByRole("region", { name: "Selected combatant" }));
const initiative = () => within(screen.getByRole("table", { name: "Initiative order" }));
/** The header, whose card the two sentences about visibility live on. */
const listCard = () => screen.getByText("Initiative").closest("[data-slot=card]") as HTMLElement;

/** Point every route matching a fragment at a new answer. */
const reaim = (fragment: string, answer: { status: number; body: unknown }) => {
  for (const [key] of [...server.routes]) {
    if (key.includes(fragment)) server.routes.set(key, answer);
  }
};

const damage = async (name: string, amount: string) => {
  const row = rowFor(name);
  await userEvent.type(
    within(row).getByLabelText(`Hit points to apply to ${name}`),
    `${amount}{Enter}`,
  );
};

beforeEach(() => server.reset());
afterEach(() => server.drop());

describe("the runner", () => {
  it("renders the initiative list in the order the server sent it", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });

    // Not sorted here: the server's order is `initiative desc, created_at asc,
    // id asc`, which is also what `nextTurn` walks. A second sort in the client
    // could disagree with the marker the server moves.
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(
      initiative()
        .getAllByText(/Brannoc|Goblin Boss/)
        .map((el) => el.textContent),
    ).toEqual(["Brannoc", "Goblin Boss"]);
    expect(screen.getByText(/Round 1 · Brannoc is up/)).toBeInTheDocument();
    // The two halves of the fixtures' `sub` line, assembled for rendering.
    expect(initiative().getByText("Half-orc paladin · Ilse")).toBeInTheDocument();
  });

  it("keeps a combatant at zero hit points in the order, struck through", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith("/combatants")) {
        server.routes.set(key, { ...answer, body: [brannoc, { ...goblinBoss, hpCurrent: 0 }] });
      }
    }

    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    const row = rowFor("Goblin Boss");
    expect(within(row).getByText("0/21")).toBeInTheDocument();
    expect(row.className).toContain("opacity-45");
    expect(within(row).getByText("Goblin Boss").className).toContain("line-through");
    // Nothing on the row offers to tidy it away: removal is an explicit act,
    // inside the edit dialog. `EncounterRunner.jsx:107` says so in the
    // product's own voice and `Combatant.ts` repeats it.
    expect(within(row).queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("moves hit points before the round trip, and sends a delta with a request id", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    await damage("Goblin Boss", "5");

    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("16/21")).toBeInTheDocument(),
    );

    const sent = bodyOf(server, "POST", "/damage") as { amount: number; requestId: string };
    // A delta, not an absolute value: "the ogre hits for 12" stays true
    // whatever this screen last showed.
    expect(sent.amount).toBe(5);
    // Not offline-first design — it stops a double-tapped button applying twice.
    expect(sent.requestId).toMatch(/.+/);
  });

  it("heals with a negative delta", async () => {
    reaim("/damage", { status: 200, body: { ...goblinBoss, hpCurrent: 21 } });
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    const row = rowFor("Goblin Boss");
    await userEvent.type(within(row).getByLabelText("Hit points to apply to Goblin Boss"), "6");
    await userEvent.click(within(row).getByRole("button", { name: "Heal Goblin Boss" }));

    await waitFor(() =>
      expect((bodyOf(server, "POST", "/damage") as { amount: number }).amount).toBe(-6),
    );
  });

  it("puts the hit points back when the server refuses the hit", async () => {
    reaim("/damage", { status: 404, body: { _tag: "NotFound", resource: "combatant", id: "x" } });
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    await damage("Goblin Boss", "5");

    // The server's row is authoritative, so the optimistic number is a bet that
    // expires: it goes back to what the server actually holds, and says so.
    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("21/21")).toBeInTheDocument(),
    );
    await screen.findByText("Goblin Boss is unchanged");
  });

  it("advances the turn through the run's own endpoint", async () => {
    renderRunner();
    await screen.findByText(/Round 1 · Brannoc is up/);

    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));

    await screen.findByText(/Round 1 · Goblin Boss is up/);
    // Bound to a button and to the space bar, so a repeat must be safe.
    expect((bodyOf(server, "POST", "/next-turn") as { requestId: string }).requestId).toMatch(/.+/);
  });

  it("says which of the two visibility levels is in force, and never implies more", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    // Both levels default to `dm` on the server, deliberately.
    expect(within(listCard()).getByText(/DM only — nothing here is on the players/)).toBeVisible();

    await userEvent.click(screen.getByRole("switch"));
    expect(bodyOf(server, "PATCH", `/runs/${liveRun.id}`)).toEqual({ visibility: "shared" });

    // Every row is still `dm`. Saying "shared" and leaving it there would imply
    // the players can see two combatants they cannot.
    await within(listCard()).findByText(/every line in it is hidden from them/);
    expect(screen.getAllByLabelText("Hidden from players")).toHaveLength(2);
  });

  it("re-reads the fight when the stream rings, rather than trusting the payload", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));
    const before = server.calls.filter((call) => call.pathname.endsWith("/combatants")).length;

    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith("/combatants")) {
        server.routes.set(key, { ...answer, body: [brannoc, { ...goblinBoss, hpCurrent: 3 }] });
      }
    }
    // The event's `payload` is `{}` — this screen never reads it. The rows come
    // from a re-read of the state tables, which is the only place they live.
    server.emit(sessionEvent(9, "combatant-damaged", goblinBoss.id));

    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("3/21")).toBeInTheDocument(),
    );
    expect(
      server.calls.filter((call) => call.pathname.endsWith("/combatants")).length,
    ).toBeGreaterThan(before);
    // And the log panel renders it from `kind` plus the combatant id alone.
    await within(screen.getByRole("log")).findByText("Goblin Boss took a hit");
  });

  it("shows the selected combatant, following the turn until told otherwise", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    // Brannoc is up, so the panel is on Brannoc without anyone choosing.
    expect(panel().getByText("Brannoc")).toBeInTheDocument();
    expect(panel().getByText("Party")).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Follow the turn" })).toBeNull();

    await userEvent.click(rowFor("Goblin Boss"));

    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();
    expect(panel().getByRole("button", { name: "Follow the turn" })).toBeInTheDocument();
    // The document half of the creature, which no column holds: the
    // parenthetical is the whole reason `statBlock` is a document and not
    // derived from the `ac` beside it.
    expect(panel().getByText("17 (chain shirt, shield)")).toBeInTheDocument();
    expect(panel().getByText("Nimble Escape")).toBeInTheDocument();
    expect(panel().getByText("1d6+2")).toBeInTheDocument();
  });

  it("tells the DM a fight is over rather than pretending it is live", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, endedAt: liveRun.startedAt } });
      }
    }
    renderRunner();

    await screen.findByText(/came off the table/);
    expect(screen.queryByRole("button", { name: "Next turn" })).toBeNull();
    // Nothing was deleted: the order and the hit points are still readable.
    expect(rows()).toHaveLength(2);
  });

  it("says where to get a credential rather than looking broken", async () => {
    reaim("GET", { status: 401, body: { _tag: "Unauthorized", message: "no token" } });
    renderRunner();

    await screen.findByText("No credential yet");
  });

  it("keeps the fight on screen when a re-read fails, and says it may be behind", async () => {
    renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    // The doorbell and the re-read travel over different connections: an open
    // stream can keep delivering while a new request cannot leave at all.
    server.transportDown = true;
    server.emit(sessionEvent(11, "turn-advanced", goblinBoss.id));

    await screen.findByText(/may be a moment behind/);
    // The list is still there. A fight the DM can read beats an error card.
    expect(rows()).toHaveLength(2);
  });
});
