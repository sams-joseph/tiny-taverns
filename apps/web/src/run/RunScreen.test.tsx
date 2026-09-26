import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocPlaced,
  campaignId,
  cazril,
  directUpdate,
  goblinBoss,
  installRunServer,
  liveRun,
  npcId,
  playerCazril,
  renderRunner,
  runBoard,
  session,
  sessionEvent,
} from "./run.fixtures";
import { apiUrl } from "../api/client";
import { reads } from "../api/keys";
import { drawnPortrait } from "../campaign/campaign.fixtures";
import { combatantWrites } from "./load";

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

const serverRunBase = () =>
  `/campaigns/${campaignId}/sessions/${liveRun.sessionId}/runs/${liveRun.id}`;

/** Select the row, then type the hit into the selected card — the redesign's one place for it. */
const damage = async (name: string, amount: string) => {
  await userEvent.click(rowFor(name));
  await userEvent.type(
    panel().getByLabelText(`Hit points to apply to ${name}`),
    `${amount}{Enter}`,
  );
};

beforeEach(() => server.reset());
afterEach(() => server.drop());

describe("the runner", () => {
  it("renders the initiative list in the order the server sent it", async () => {
    await renderRunner();
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
    // The header: the round beside the title, and who is up and who is next in
    // the server's order, which is what `nextTurn` walks.
    const header = within(document.querySelector("[data-slot=page-heading]") as HTMLElement);
    expect(header.getByText("Round 1")).toBeInTheDocument();
    expect(header.getByText("Brannoc is up · Goblin Boss next")).toBeInTheDocument();
    // The two halves of the fixtures' `sub` line, assembled for the card.
    expect(panel().getByText("Half-orc paladin · Ilse")).toBeInTheDocument();
  });

  it("marks every row with its icon when nobody has a portrait", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().some((row) => row.querySelector("img") !== null)).toBe(false);
  });

  it("lays a PC's portrait on its row, and leaves the monster its skull", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [{ ...brannoc, portrait: drawnPortrait }, goblinBoss],
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));

    const plate = rowFor("Brannoc").querySelector("img");
    expect(plate?.getAttribute("src")).toBe(apiUrl(drawnPortrait.thumbUrl));
    expect(plate?.getAttribute("loading")).toBe("lazy");
    expect(rowFor("Goblin Boss").querySelector("img")).toBeNull();
  });

  it("keeps a combatant at zero hit points in the order, struck through", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith("/combatants")) {
        server.routes.set(key, { ...answer, body: [brannoc, { ...goblinBoss, hpCurrent: 0 }] });
      }
    }

    await renderRunner();
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
    await renderRunner();
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
    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    await userEvent.click(rowFor("Goblin Boss"));
    await userEvent.type(panel().getByLabelText("Hit points to apply to Goblin Boss"), "6");
    await userEvent.click(panel().getByRole("button", { name: "Heal Goblin Boss" }));

    await waitFor(() =>
      expect((bodyOf(server, "POST", "/damage") as { amount: number }).amount).toBe(-6),
    );
  });

  it("puts the hit points back when the server refuses the hit", async () => {
    reaim("/damage", { status: 404, body: { _tag: "NotFound", resource: "combatant", id: "x" } });
    await renderRunner();
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
    await renderRunner();
    await screen.findByText("Brannoc is up · Goblin Boss next");

    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));

    await screen.findByText("Goblin Boss is up · Brannoc next");
    // Bound to a button and to the space bar, so a repeat must be safe.
    expect((bodyOf(server, "POST", "/next-turn") as { requestId: string }).requestId).toMatch(/.+/);
  });

  it("labels opening an NPC as Open at the table", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    server.routes.set(
      `POST /campaigns/${campaignId}/npcs/${cazril.id}/sessions/${session.id}/open`,
      {
        status: 200,
        body: {
          id: "2b1f2a1e-0000-4000-8000-00000000e901",
          npcId: cazril.id,
          channel: "session_shared",
          sessionId: session.id,
          sessionState: "open",
          title: "Cazril",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      },
    );

    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });

    expect(screen.getAllByText("Open at the table").length).toBeGreaterThan(0);
    expect(screen.getByText(/shared live-session conversation players see/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open at the table" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/npcs/${cazril.id}/sessions/${session.id}/open`)).toEqual({}),
    );
  });

  it("monitors session NPC transcripts and keeps controls DM-side", async () => {
    let state: "open" | "paused" | "closed" = "open";
    const threadId = "2b1f2a1e-0000-4000-8000-00000000e0c1";
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${session.id}/monitor`, {
      status: 200,
      body: () => [
        {
          npc: { ...playerCazril, sessionState: state },
          thread: {
            id: threadId,
            npcId,
            channel: "session_shared",
            sessionId: session.id,
            sessionState: state,
            title: "At the table",
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          },
          turns: [
            {
              id: "2b1f2a1e-0000-4000-8000-00000000e111",
              threadId,
              who: "user",
              speakerName: "Pim",
              text: "Who paid you, Cazril?",
              templateVersion: null,
              promptTokens: null,
              createdAt: session.createdAt,
            },
            {
              id: "2b1f2a1e-0000-4000-8000-00000000e112",
              threadId,
              who: "npc",
              speakerName: null,
              text: "Names cost extra.",
              templateVersion: "npc-prompt/1.4.0",
              promptTokens: 180,
              createdAt: session.updatedAt,
            },
          ],
          pendingProposals: 0,
          available: state === "open",
          model: "scripted-local",
          lastFailure: null,
        },
      ],
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/sessions/${session.id}/pause`, {
      status: 200,
      body: () => ({
        id: threadId,
        npcId,
        channel: "session_shared",
        sessionId: session.id,
        sessionState: state,
        title: "At the table",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/sessions/${session.id}/resume`, {
      status: 200,
      body: () => ({
        id: threadId,
        npcId,
        channel: "session_shared",
        sessionId: session.id,
        sessionState: state,
        title: "At the table",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/sessions/${session.id}/close`, {
      status: 200,
      body: () => ({
        id: threadId,
        npcId,
        channel: "session_shared",
        sessionId: session.id,
        sessionState: state,
        title: "At the table",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
    });

    await renderRunner();
    expect(await screen.findByText("Who paid you, Cazril?")).toBeInTheDocument();
    expect(screen.getByText("Pim")).toBeInTheDocument();
    expect(screen.getByText("Names cost extra.")).toBeInTheDocument();
    expect(screen.getByText(/scripted-local/)).toBeInTheDocument();

    // The transcript takes its natural height and scrolls with the window;
    // fixtures never overflow, so assert the classes rather than the geometry.
    const transcript = screen.getByText("Names cost extra.").closest(".space-y-2")!;
    expect(transcript.className).not.toMatch(/overflow-|max-h-/);

    state = "paused";
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText("Who paid you, Cazril?")).toBeInTheDocument();

    state = "open";
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();

    state = "closed";
    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Pause" })).toBeNull());
    expect(screen.getAllByText("closed").length).toBeGreaterThan(0);
    expect(screen.getByText("Who paid you, Cazril?")).toBeInTheDocument();
  });

  it("says which of the two visibility levels is in force, and never implies more", async () => {
    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    // Both levels default to `dm` on the server, deliberately.
    expect(within(listCard()).getByText(/DM only — nothing here is on the players/)).toBeVisible();

    await userEvent.click(screen.getByRole("switch", { name: "Share" }));
    expect(bodyOf(server, "PATCH", `/runs/${liveRun.id}`)).toEqual({ visibility: "shared" });

    // Every row is still `dm`. Saying "shared" and leaving it there would imply
    // the players can see two combatants they cannot.
    await within(listCard()).findByText(/every line in it is hidden from them/);
    expect(screen.getAllByLabelText("Hidden from players")).toHaveLength(2);
  });

  it("draws the persisted dice tray and re-reads it when the stream rings", async () => {
    const roll = {
      id: "2b1f2a1e-0000-4000-8000-00000000aa01",
      campaignId,
      sessionId: session.id,
      encounterRunId: liveRun.id,
      accountId: "2b1f2a1e-0000-4000-8000-0000000000a2",
      accountName: "Mara Voss",
      characterId: brannoc.characterId,
      characterName: "Brannoc Duskharrow",
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
    reaim("/rolls", { status: 200, body: [roll] });
    await renderRunner();

    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    const tray = within(screen.getByRole("region", { name: "Dice tray" }));
    expect(tray.getByText("Halberd")).toBeTruthy();
    expect(tray.getByText("Mara Voss · Brannoc Duskharrow")).toBeTruthy();
    expect(tray.getByText("19")).toBeTruthy();

    const next = {
      ...roll,
      id: "2b1f2a1e-0000-4000-8000-00000000aa02",
      total: 24,
      dice: [17],
      kept: [17],
    };
    reaim("/rolls", { status: 200, body: [next, roll] });
    server.emit(sessionEvent(4, "roll-made"));
    await waitFor(() => expect(tray.getByText("24")).toBeTruthy());
  });

  it("keeps Hob's spending switch off by default and writes only that switch when toggled", async () => {
    server.routes.set(`PATCH ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, allowHobDirectWrites: true },
    });

    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });

    const hobSwitch = screen.getByRole("switch", { name: "Hob spends" });
    expect(hobSwitch).toHaveAttribute("aria-checked", "false");

    await userEvent.click(hobSwitch);

    expect(bodyOf(server, "PATCH", `/runs/${liveRun.id}`)).toEqual({
      allowHobDirectWrites: true,
    });
    await waitFor(() => expect(hobSwitch).toHaveAttribute("aria-checked", "true"));
  });

  it("loads Hob's audited spends and can undo one", async () => {
    server.routes.set(`GET ${serverRunBase()}/hob-direct-updates`, {
      status: 200,
      body: [directUpdate],
    });
    server.routes.set(`POST ${serverRunBase()}/hob-direct-updates/${directUpdate.id}/undo`, {
      status: 200,
      body: { ...directUpdate, undoneAt: "2026-08-04T19:06:00.000Z" },
    });

    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await screen.findByRole("region", { name: "Hob's direct spends" });
    expect(screen.getByText("Brannoc spent 1 Lay on Hands")).toBeInTheDocument();
    expect(screen.getByText("12 of 15 left")).toBeInTheDocument();

    server.routes.set(`GET ${serverRunBase()}/hob-direct-updates`, {
      status: 200,
      body: [{ ...directUpdate, undoneAt: "2026-08-04T19:06:00.000Z" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Undo Lay on Hands for Brannoc" }));

    expect(bodyOf(server, "POST", `/hob-direct-updates/${directUpdate.id}/undo`)).toEqual({});
    await screen.findByText("12 of 15 left · undone");
    expect(screen.queryByRole("button", { name: "Undo Lay on Hands for Brannoc" })).toBeNull();
  });

  it("keeps the audit row when undo is refused, and says the counter moved", async () => {
    server.routes.set(`GET ${serverRunBase()}/hob-direct-updates`, {
      status: 200,
      body: [directUpdate],
    });
    server.routes.set(`POST ${serverRunBase()}/hob-direct-updates/${directUpdate.id}/undo`, {
      status: 409,
      body: { _tag: "Conflict", message: "resource changed" },
    });

    await renderRunner();
    await screen.findByText("Brannoc spent 1 Lay on Hands");
    await userEvent.click(screen.getByRole("button", { name: "Undo Lay on Hands for Brannoc" }));

    await screen.findByText("Hob's spend was not undone");
    expect(screen.getByText("12 of 15 left")).toBeInTheDocument();
  });

  it("re-reads the fight when the stream rings, rather than trusting the payload", async () => {
    await renderRunner();
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
    await renderRunner();
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

  // Heights are the browser's (`pnpm -F web e2e` measures the runner);
  // what jsdom can pin is who scrolls. The window does, and only the window:
  // the runner is a document screen (no `fill`), so nothing between these
  // cards and the page may bound a height or scroll on its own.
  it("leads the aside with the sheet, and leaves the scrolling to the window", async () => {
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());

    const sheet = screen.getByRole("region", { name: "Selected combatant" });
    const log = screen.getByRole("log", { name: "What just happened" });
    // The sheet is the aside's first area; the drawn dice follow it, and every
    // card the drawing leaves out follows those, in the aside's second area
    // (`RunLayout.tsx`, which a phone splits around the map).
    const area = sheet.parentElement as HTMLElement;
    expect(area.firstElementChild).toBe(sheet);
    const rest = area.nextElementSibling as HTMLElement;
    expect(rest.firstElementChild).toBe(screen.getByRole("region", { name: "Dice" }));
    for (const kept of [
      screen.getByRole("region", { name: "Hob's direct spends" }),
      screen.getByRole("region", { name: "Dice tray" }),
      log,
    ])
      expect(rest).toContainElement(kept);

    const classOf = (element: Element): string => element.getAttribute("class") ?? "";
    // Nothing inside the cards scrolls on its own…
    const scroller = /(^|\s)(overflow(-y)?-(auto|scroll)|max-h-\S+)(\s|$)/;
    // …and nothing from them up to the page bounds a height to hand one. The
    // frame's `min-h-screen` is it growing with the document, and `clip` is not
    // a scroll container.
    const bound =
      /(^|\s)(overflow(-y)?-(auto|scroll|hidden)|max-h-\S+|h-screen|min-h-(?!screen)\S+)(\s|$)/;
    for (const card of [sheet, log, screen.getByRole("table", { name: "Initiative order" })]) {
      for (const inside of card.querySelectorAll("*"))
        expect(classOf(inside)).not.toMatch(scroller);
      for (let at: Element | null = card; at !== null; at = at.parentElement) {
        expect(classOf(at)).not.toMatch(bound);
      }
    }
  });

  it("tells the DM a fight is over rather than pretending it is live", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, endedAt: liveRun.startedAt } });
      }
    }
    await renderRunner();

    await screen.findByText(/came off the table/);
    expect(screen.queryByRole("button", { name: "Next turn" })).toBeNull();
    // Nothing was deleted: the order and the hit points are still readable.
    expect(rows()).toHaveLength(2);
  });

  /**
   * **A combatant write reaches a row that is not in a fight.**
   *
   * `conditions` is written through to the `character` row in the same
   * transaction (`repo/vitals.ts`), so a condition typed on the initiative list
   * moves what the DM's party list says on a screen this dialog has never seen.
   * That is why `CombatantDialog` names `reads.party` — and it is the one
   * key on this screen, because everything else a fight writes is the fight's.
   *
   * The fight itself is deliberately *not* named: the runner learns what it did
   * from the write's own answer and from the stream, and an atom refreshing
   * underneath it would reset the optimistic layer. So what is asserted here is
   * both halves — the campaign's characters are invalidated, and no atom read
   * of this run's own rows is triggered by the invalidation.
   */
  it("names the campaign's characters when a condition is written through", async () => {
    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await userEvent.click(rowFor("Goblin Boss"));
    await userEvent.click(panel().getByRole("button", { name: "Edit" }));

    const conditions = await screen.findByLabelText("Conditions");
    await userEvent.clear(conditions);
    await userEvent.type(conditions, "Prone");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", "/combatants/")).toMatchObject({ conditions: ["Prone"] }),
    );
    // Nothing here can observe the DM's party screen, so what is pinned is the
    // list this write hands the seam. `api/invalidation.test.tsx` is what says
    // the seam then does something with it.
    expect(combatantWrites(campaignId)).toEqual([reads.party(campaignId)]);
  });

  it("toggles a condition from the selected card, written through to the party", async () => {
    server.routes.set(`PATCH ${serverRunBase()}/combatants/${goblinBoss.id}`, {
      status: 200,
      body: { ...goblinBoss, conditions: [...goblinBoss.conditions, "Prone"] },
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    const chips = within(panel().getByRole("group", { name: "Conditions on Goblin Boss" }));
    // The drawing's five, and the word the row already carries, pressed so it
    // can be cleared: the vocabulary is open.
    for (const word of ["Prone", "Poisoned", "Restrained", "Frightened", "Concentrating"])
      expect(chips.getByRole("button", { name: word })).toHaveAttribute("aria-pressed", "false");
    expect(chips.getByRole("button", { name: "Hostile" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(chips.getByRole("button", { name: "Prone" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({
        conditions: ["Hostile", "Prone"],
      }),
    );
    // The answer is merged into the fight: the row wears it without a re-read.
    await within(rowFor("Goblin Boss")).findByText("Prone");
    expect(chips.getByRole("button", { name: "Prone" })).toHaveAttribute("aria-pressed", "true");
  });

  it("clears a word the row carries, and adds any other word", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    const chips = within(panel().getByRole("group", { name: "Conditions on Goblin Boss" }));
    await userEvent.click(chips.getByRole("button", { name: "Hostile" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({ conditions: [] }),
    );

    server.calls.length = 0;
    await userEvent.type(
      panel().getByLabelText("Another condition for Goblin Boss"),
      "  Exhaustion 1 {Enter}",
    );
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({
        conditions: ["Hostile", "Exhaustion 1"],
      }),
    );
  });

  it("rolls the selected monster's abilities and attacks into the DM's own dice, and sends nothing", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));
    const before = server.calls.filter((call) => call.method !== "GET").length;

    const dice = () => within(screen.getByRole("region", { name: "Dice" }));
    expect(dice().getByText(/Rolls show up here/)).toBeInTheDocument();

    await userEvent.click(panel().getByRole("button", { name: "Roll DEX check, 1d20+2" }));
    await userEvent.click(panel().getByRole("button", { name: "Roll Scimitar, 1d6+2" }));
    await userEvent.click(dice().getByRole("button", { name: "Roll a d20" }));

    const rolled = within(dice().getByRole("list", { name: "Your rolls" }))
      .getAllByRole("listitem")
      .map((item) => item.firstElementChild?.textContent);
    // Newest first, each named for what rolled it.
    expect(rolled).toEqual(["d20", "Goblin Boss · Scimitar", "Goblin Boss · DEX"]);
    expect(dice().getByText(/^1d6\+2 \[\d\]$/)).toBeInTheDocument();
    // A roll is not durable state: nothing left this browser.
    expect(server.calls.filter((call) => call.method !== "GET")).toHaveLength(before);
  });

  it("keeps the DM's dice to the newest six", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    const dice = within(screen.getByRole("region", { name: "Dice" }));
    for (let i = 0; i < 8; i += 1)
      await userEvent.click(dice.getByRole("button", { name: "Roll a d4" }));
    expect(
      within(dice.getByRole("list", { name: "Your rolls" })).getAllByRole("listitem"),
    ).toHaveLength(6);
  });

  it("says a party member's sheet stays with their player", async () => {
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());
    expect(
      panel().getByText(
        "Played by Ilse. Their sheet stays with them; track HP and conditions here.",
      ),
    ).toBeInTheDocument();
    // The drawing's Speed is not on a combatant; the third tile is what is.
    expect(panel().queryByText("Speed")).toBeNull();
  });

  it("surfaces live NPC proposal cues only as DM review links", async () => {
    let proposed = false;
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${session.id}`, {
      status: 200,
      body: [playerCazril],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/proposals`, {
      status: 200,
      body: () =>
        proposed
          ? [
              {
                id: "2b1f2a1e-0000-4000-8000-00000000f601",
                campaignId,
                npcId,
                threadId: "2b1f2a1e-0000-4000-8000-00000000e0c1",
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
                createdAt: cazril.createdAt,
                updatedAt: cazril.updatedAt,
              },
            ]
          : [],
    });

    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/sessions/${session.id}/monitor`, {
      status: 200,
      body: [],
    });

    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    expect(screen.getByRole("heading", { name: "Open at the table" })).toBeInTheDocument();
    expect(screen.queryByText("NPC proposals waiting")).toBeNull();
    await waitFor(() => expect(server.open()).toBeGreaterThan(0));

    proposed = true;
    server.emit(sessionEvent(10, "beat-added"));

    expect(await screen.findByText("NPC proposals waiting")).toBeInTheDocument();
    const link = screen.getByRole("button", { name: "Cazril · 1 pending" });
    expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/cast/${npcId}#proposals`);
  });

  it("says to sign in again rather than looking broken", async () => {
    reaim("GET", { status: 401, body: { _tag: "Unauthorized", message: "no token" } });
    await renderRunner();

    await screen.findByText("Not signed in");
  });

  it("keeps the fight on screen when a re-read fails, and says it may be behind", async () => {
    await renderRunner();
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

describe("the fight's battle map", () => {
  const card = () => screen.getByRole("region", { name: "Battle map" });

  it("is open, drawing the fight's own board beside the list", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));

    await waitFor(() =>
      expect(card()).toHaveTextContent("24 × 16 squares · 5 ft each · 120 × 80 ft"),
    );
    const board = card().querySelector("[data-slot=battle-map]");
    expect(board).not.toBeNull();
    expect(board?.querySelectorAll("[data-line=column]")).toHaveLength(25);
    expect(board?.querySelectorAll("[data-line=row]")).toHaveLength(17);
    // The layout has a map area for it.
    expect(document.querySelector("[data-slot=run-layout]")?.className).toContain("'map_map'");
    // Drawing it is the DM's reference, not a fight write.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("draws the grid the fight kept, not the encounter's map", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, {
      status: 200,
      body: { ...runBoard, columns: 10, rows: 6, feetPerCell: 10 },
    });
    await renderRunner();
    await waitFor(() => expect(card()).toHaveTextContent("10 × 6 squares · 10 ft each"));
    expect(document.querySelectorAll("[data-line=column]")).toHaveLength(11);
    // The runner never asks for the encounter's live map.
    expect(server.calls.some((call) => call.pathname.endsWith("/map"))).toBe(false);
  });

  it("says so when the fight's encounter was deleted, and keeps the squares", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, {
      status: 200,
      body: { ...runBoard, mapId: null, setting: null },
    });
    await renderRunner();
    await waitFor(() => expect(card()).toBeInTheDocument());
    expect(screen.getByText(/This fight's encounter was deleted/)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=battle-map]")).not.toBeNull();
  });

  it("is absent for a fight with no board, and the layout closes the gap", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, { status: 200, body: null });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/board"))).toBe(true),
    );
    await waitFor(() =>
      expect(document.querySelector("[data-slot=run-layout]")?.className).not.toContain("map"),
    );
    expect(screen.queryByRole("region", { name: "Battle map" })).toBeNull();
  });
});

describe("rolling initiative", () => {
  const rollingRun = { ...liveRun, phase: "initiative", activeCombatantId: null };
  const unrolled = [
    { ...brannoc, initiative: null, initiativeSetBy: null },
    { ...goblinBoss, initiative: null, initiativeSetBy: null, initiativeBonus: 2 },
  ];
  const rollingWith = (combatants: ReadonlyArray<unknown>) => {
    server.routes.set(`GET ${serverRunBase()}`, { status: 200, body: rollingRun });
    server.routes.set(`GET ${serverRunBase()}/combatants`, { status: 200, body: combatants });
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for every number before round 1, and Space does not advance", async () => {
    rollingWith(unrolled);
    await renderRunner();

    await screen.findByText("Rolling initiative · 2 still to roll");
    expect(screen.getByRole("button", { name: "Start round 1" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Next turn" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reroll initiative" })).toBeNull();
    expect(within(rowFor("Brannoc")).getByText("—")).toBeInTheDocument();
    // Nobody is up, so nobody can be made up.
    await userEvent.click(rowFor("Brannoc"));
    expect(panel().queryByRole("button", { name: /Make it/ })).toBeNull();

    await userEvent.keyboard(" ");
    expect(server.calls.some((call) => call.pathname.endsWith("/next-turn"))).toBe(false);
  });

  it("rolls d20 plus each monster's bonus, in one write, and leaves the party alone", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    rollingWith(unrolled);
    server.routes.set(`POST ${serverRunBase()}/initiative`, {
      status: 200,
      body: [{ ...unrolled[1], initiative: 13, initiativeSetBy: "dm" }, unrolled[0]],
    });
    await renderRunner();
    await screen.findByText("Rolling initiative · 2 still to roll");

    await userEvent.click(screen.getByRole("button", { name: "Roll for monsters" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/initiative")).toMatchObject({
        entries: [{ combatantId: goblinBoss.id, initiative: 13 }],
      }),
    );
    expect(
      server.calls.filter(
        (call) => call.method === "POST" && call.pathname.endsWith("/initiative"),
      ),
    ).toHaveLength(1);
  });

  it("starts the round once everyone has a number", async () => {
    rollingWith([
      { ...brannoc, initiativeSetBy: "player" },
      { ...goblinBoss, initiativeSetBy: "dm" },
    ]);
    server.routes.set(`POST ${serverRunBase()}/begin`, { status: 200, body: liveRun });
    await renderRunner();

    await screen.findByText("Rolling initiative · everyone has a number");
    await userEvent.click(screen.getByRole("button", { name: "Start round 1" }));

    await screen.findByText("Brannoc is up · Goblin Boss next");
    expect(screen.getByRole("button", { name: "Next turn" })).toBeInTheDocument();
    expect((bodyOf(server, "POST", "/begin") as { requestId: string }).requestId).toMatch(/.+/);
  });

  it("goes back to rolling, keeping the numbers, and offers the round again", async () => {
    server.routes.set(`POST ${serverRunBase()}/reroll`, {
      status: 200,
      body: { ...rollingRun, round: 3 },
    });
    await renderRunner();
    await screen.findByText("Brannoc is up · Goblin Boss next");

    await userEvent.click(screen.getByRole("button", { name: "Reroll initiative" }));

    await screen.findByText("Rolling initiative · everyone has a number");
    expect(screen.getByRole("button", { name: "Start round 3" })).toBeEnabled();
    expect(within(rowFor("Brannoc")).getByText("21")).toBeInTheDocument();
  });
});

describe("the fight's tokens", () => {
  const card = () => within(screen.getByRole("region", { name: "Battle map" }));
  const hint = () => card().getByRole("status");
  const moves = () => server.calls.filter((call) => call.pathname.endsWith("/move"));
  const brannocMove = () => `POST ${serverRunBase()}/combatants/${brannoc.id}/move`;
  const bossMove = () => `POST ${serverRunBase()}/combatants/${goblinBoss.id}/move`;

  /**
   * Click the board at a square. jsdom lays nothing out, so the squares' layer
   * is given the box a browser would: 240 × 160 for the fixture's 24 × 16
   * board, ten pixels a square, and the click lands in the middle of one.
   */
  const clickSquare = (column: number, row: number) => {
    const squares = document.querySelector<HTMLElement>("[data-slot=run-board-squares]");
    if (squares === null) throw new Error("no board to click");
    vi.spyOn(squares, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }),
    );
    fireEvent.click(squares, { clientX: column * 10 + 5, clientY: row * 10 + 5 });
  };

  /** The runner, once its board has answered. */
  const open = async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
  };

  const token = (name: string) =>
    card().getByRole("button", { name: new RegExp(`^${name}, column`) });

  it("stands a placed combatant on its square, and trays the one nobody has put down", async () => {
    await open();
    await waitFor(() => expect(token("Brannoc")).toBeInTheDocument());
    expect(token("Brannoc")).toHaveAccessibleName("Brannoc, column 6, row 5");
    // Its square, as a share of the board's plane: 5 × 64 of 1536 across.
    expect(token("Brannoc").style.left).toMatch(/^20\.8333/);
    expect(token("Brannoc").style.top).toBe("25%");
    expect(token("Brannoc")).toHaveTextContent("B");
    // Nothing guesses the Goblin Boss a square: he waits in the tray.
    expect(card().queryByRole("button", { name: /^Goblin Boss, column/ })).toBeNull();
    expect(
      within(card().getByRole("group", { name: "Not on the board" })).getByRole("button", {
        name: "Goblin Boss, not on the board",
      }),
    ).toBeInTheDocument();
    // Drawing them is a read.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("selects from a token, as from the list", async () => {
    await open();
    await waitFor(() => expect(token("Brannoc")).toBeInTheDocument());
    await userEvent.click(rowFor("Goblin Boss"));
    await waitFor(() => expect(panel().getByText("Goblin Boss")).toBeInTheDocument());

    await userEvent.click(token("Brannoc"));
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());
    expect(token("Brannoc")).toHaveAttribute("aria-pressed", "true");
    expect(rowFor("Brannoc")).toHaveAttribute("aria-selected", "true");
    expect(moves()).toEqual([]);
  });

  it("puts a token from the tray on the square clicked", async () => {
    server.routes.set(bossMove(), {
      status: 200,
      body: { ...goblinBoss, position: { column: 12, row: 3 } },
    });
    await open();
    await userEvent.click(
      await card().findByRole("button", { name: "Goblin Boss, not on the board" }),
    );
    await waitFor(() =>
      expect(hint()).toHaveTextContent("Click a square to put Goblin Boss on the board."),
    );

    clickSquare(12, 3);

    await waitFor(() => expect(moves()).toHaveLength(1));
    expect(bodyOf(server, "POST", "/move")).toMatchObject({
      position: { column: 12, row: 3 },
      requestId: expect.any(String),
    });
    await waitFor(() =>
      expect(token("Goblin Boss")).toHaveAccessibleName("Goblin Boss, column 13, row 4"),
    );
    expect(hint()).toHaveTextContent("Goblin Boss is on the board");
    expect(card().queryByRole("group", { name: "Not on the board" })).toBeNull();
  });

  it("moves the selected token, says how far, and says when it went past their speed", async () => {
    server.routes.set(brannocMove(), {
      status: 200,
      body: { ...brannocPlaced, position: { column: 11, row: 2 } },
    });
    await open();
    await userEvent.click(await card().findByRole("button", { name: /^Brannoc,/ }));
    // His sheet says 25 ft: five squares every way from where he stands.
    const reach = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-slot=token-reach]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(reach.style.left).toBe("0%");
    expect(reach.style.top).toBe("0%");
    expect(reach.style.width).toMatch(/^45\.8333/);

    clickSquare(11, 2);

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: { column: 11, row: 2 } }),
    );
    // Six squares on the diagonal's long side is 30 ft, past his 25.
    await waitFor(() =>
      expect(hint()).toHaveTextContent("Brannoc moved 30 ft, past their 25 ft speed"),
    );
    await waitFor(() => expect(token("Brannoc")).toHaveAccessibleName("Brannoc, column 12, row 3"));
  });

  it("reaches as far as a stat block's speed, and draws no range where none is written", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        brannocPlaced,
        { ...goblinBoss, position: { column: 20, row: 10 } },
        {
          ...goblinBoss,
          id: "2b1f2a1e-0000-4000-8000-000000000c99",
          creatureId: null,
          displayName: "Guard",
          position: { column: 1, row: 1 },
        },
      ],
    });
    await open();
    await userEvent.click(await card().findByRole("button", { name: /^Goblin Boss,/ }));
    // "30 ft." is six squares: from column 14 to the board's last, 23.
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>("[data-slot=token-reach]")?.style.left).toMatch(
        /^58\.3333/,
      ),
    );

    await userEvent.click(token("Guard"));
    await waitFor(() => expect(panel().getByText("Guard")).toBeInTheDocument());
    expect(document.querySelector("[data-slot=token-reach]")).toBeNull();
  });

  it("walks a focused token a square with the arrow keys", async () => {
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });
    brannocToken.focus();
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: { column: 6, row: 4 } }),
    );
    // An arrow is not the space bar: the turn stays where it was.
    expect(server.calls.some((call) => call.pathname.endsWith("/next-turn"))).toBe(false);
  });

  it("takes a standing token off the board, back into the tray", async () => {
    server.routes.set(brannocMove(), { status: 200, body: { ...brannocPlaced, position: null } });
    await open();
    await userEvent.click(await card().findByRole("button", { name: /^Brannoc,/ }));
    await userEvent.click(card().getByRole("button", { name: "Take Brannoc off the board" }));

    await waitFor(() => expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: null }));
    await waitFor(() =>
      expect(card().getByRole("button", { name: "Brannoc, not on the board" })).toBeInTheDocument(),
    );
    expect(hint()).toHaveTextContent("Brannoc is off the board");
  });

  it("leaves the token where the server has it when a move is refused", async () => {
    server.routes.set(brannocMove(), {
      status: 409,
      body: { _tag: "Conflict", message: "that square is off the board" },
    });
    await open();
    await userEvent.click(await card().findByRole("button", { name: /^Brannoc,/ }));
    clickSquare(9, 9);

    await screen.findByText("Brannoc did not move");
    expect(token("Brannoc")).toHaveAccessibleName("Brannoc, column 6, row 5");
    expect(hint()).toHaveTextContent("Click a square to move Brannoc.");
  });

  it("hides the grid on this screen only, and the squares still take a token", async () => {
    await open();
    await waitFor(() => expect(document.querySelectorAll("[data-line=column]")).toHaveLength(25));
    const grid = card().getByRole("button", { name: "Grid" });
    expect(grid).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(grid);
    expect(document.querySelectorAll("[data-line=column]")).toHaveLength(0);
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);

    await userEvent.click(token("Brannoc"));
    clickSquare(7, 4);
    await waitFor(() => expect(moves()).toHaveLength(1));
  });

  it("moves nothing once the fight is over", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, endedAt: liveRun.startedAt } });
      }
    }
    await open();
    await screen.findByText(/came off the table/);
    await userEvent.click(await card().findByRole("button", { name: /^Brannoc,/ }));
    clickSquare(9, 9);
    token("Brannoc").focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(hint()).toHaveTextContent("Where everyone stood when it ended.");
    expect(card().queryByRole("button", { name: /off the board/ })).toBeNull();
    expect(moves()).toEqual([]);
  });
});
