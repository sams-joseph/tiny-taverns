import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocPlaced,
  campaign,
  campaignId,
  cazril,
  directUpdate,
  goblinBoss,
  installRunServer,
  liveRun,
  liveScene,
  npcId,
  playerCazril,
  renderRunner,
  runBoard,
  runParty,
  session,
  sessionEvent,
} from "./run.fixtures";
import { apiUrl } from "../api/client";
import { reads } from "../api/keys";
import { drawnPortrait } from "../campaign/campaign.fixtures";
import { boardFogWrites, combatantVisibilityWrites, combatantWrites } from "./load";

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

/** The initiative strip's order, whose chips are the only buttons in it. */
const initiative = () => within(screen.getByRole("list", { name: "Initiative order" }));
const rows = () => initiative().getAllByRole("button");
const rowFor = (name: string): HTMLElement => {
  const found = rows().find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no chip for ${name}`);
  return found;
};
const panel = () => within(screen.getByRole("region", { name: "Selected combatant" }));
/** Open the panel's overflow menu, which portals to the body, and read it. */
const panelMenu = async (name: string) => {
  await userEvent.click(panel().getByRole("button", { name: `More for ${name}` }));
  return within(await screen.findByRole("menu"));
};
/** Unfold the selected creature's stat block. */
const openStatBlock = async () => {
  await userEvent.click(panel().getByRole("button", { name: "Stat block" }));
};
/** The strip itself: the round, the order and its trailing controls. */
const strip = () => within(screen.getByRole("region", { name: "Initiative" }));
/** Open the strip's overflow menu, where the visibility sentence and *Reroll* live. */
const stripMenu = async () => {
  await userEvent.click(strip().getByRole("button", { name: "More about the order" }));
  return within(await screen.findByRole("menu"));
};
/** The fight's *Rolls* dock, and its lines newest first: the latest, then the older ones once open. */
const dock = () => within(screen.getByRole("region", { name: "Rolls" }));
const openDock = async () => {
  const toggle = dock().getByRole("button", { name: /^Rolls/ });
  if (toggle.getAttribute("aria-expanded") !== "true") await userEvent.click(toggle);
};
const dockLabels = (): ReadonlyArray<string | null | undefined> => {
  const latest = dock().getByRole("status", { name: "Latest roll" });
  const older = dock().queryByRole("list", { name: "Earlier rolls" });
  return [
    latest.querySelector("p")?.textContent,
    ...(older === null
      ? []
      : within(older)
          .getAllByRole("listitem")
          .map((item) => item.querySelector("p")?.textContent)),
  ];
};

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

/**
 * Put the runner on its canvas. The canvas is chosen by a probe the stylesheet
 * displays only from `@3xl` of `main` (`RunStage.tsx`'s `useStage`), and jsdom
 * applies no stylesheet, so the probe is given the width a browser would.
 */
const onTheCanvas = () =>
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === "run-stage-probe" ? 1024 : 0;
  });

/** The two layouts a fight with a board is drawn in, for what both must do alike. */
const layouts = [
  { layout: "the narrow grid", wide: false },
  { layout: "the canvas", wide: true },
] as const;

describe("the runner", () => {
  it("renders the initiative strip in the order the server sent it", async () => {
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
    // The round is boxed at the strip's head, and whoever is up is marked.
    expect(strip().getByText("Round")).toBeInTheDocument();
    expect(rowFor("Brannoc")).toHaveAttribute("aria-current", "step");
    expect(rowFor("Goblin Boss")).not.toHaveAttribute("aria-current");
    expect(rowFor("Brannoc").className).toContain("border-accent");
    // The header: the round beside the title, and who is up and who is next in
    // the server's order, which is what `nextTurn` walks.
    const header = within(document.querySelector("[data-slot=page-heading]") as HTMLElement);
    expect(header.getByText("Round 1")).toBeInTheDocument();
    expect(header.getByText("Brannoc is up · Goblin Boss next")).toBeInTheDocument();
    // The two halves of the fixtures' `sub` line, assembled for the card.
    expect(panel().getByText("Half-orc paladin · Ilse")).toBeInTheDocument();
  });

  it("rings every chip's initials by side when nobody has a portrait", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().some((row) => row.querySelector("img") !== null)).toBe(false);
    // The board's initials, so a chip and its token read alike.
    const disc = (name: string) => rowFor(name).querySelector("[data-slot=strip-disc]")!;
    expect(disc("Brannoc")).toHaveTextContent("B");
    expect(disc("Brannoc").className).toContain("border-info");
    expect(disc("Goblin Boss")).toHaveTextContent("GB");
    expect(disc("Goblin Boss").className).toContain("border-danger");
    // The fight is not shared, so nothing is held back from anyone yet.
    expect(disc("Goblin Boss").className).toContain("border-solid");
  });

  it("lays a PC's portrait on its chip's disc, and leaves the monster its initials", async () => {
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

  it("keeps an NPC at zero hit points in the order, struck through", async () => {
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
    // Nothing on the strip offers to tidy it away: removal is an explicit act,
    // inside the edit dialog. `EncounterRunner.jsx:107` says so in the
    // product's own voice and `Combatant.ts` repeats it.
    expect(strip().queryByRole("button", { name: /remove/i })).toBeNull();
  });

  describe("a PC at zero hit points", () => {
    const answerWith = (failures: number) => {
      for (const [key, route] of [...server.routes]) {
        if (key.startsWith("GET") && key.endsWith("/combatants")) {
          server.routes.set(key, {
            ...route,
            body: [
              { ...brannoc, hpCurrent: 0, deathSaves: { successes: 1, failures } },
              goblinBoss,
            ],
          });
        }
      }
    };

    it("stays as they are while they make death saves", async () => {
      answerWith(2);
      await renderRunner();
      await waitFor(() => expect(rows()).toHaveLength(2));
      // Down, not out: they still take a turn, and the DM still has to look.
      expect(within(rowFor("Brannoc")).getByText("0/52").className).toContain("text-danger");
      expect(rowFor("Brannoc").className).not.toContain("opacity-45");
      expect(within(rowFor("Brannoc")).getByText("Brannoc").className).not.toContain(
        "line-through",
      );
      expect(rowFor("Brannoc")).not.toHaveAccessibleName(/out of the fight/);
    });

    it("is struck through once they have failed three", async () => {
      answerWith(3);
      await renderRunner();
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(rowFor("Brannoc").className).toContain("opacity-45");
      expect(within(rowFor("Brannoc")).getByText("Brannoc").className).toContain("line-through");
      expect(rowFor("Brannoc")).toHaveAccessibleName(/out of the fight/);
    });
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
    // A press can be repeated on a slow network, so it is safe to repeat.
    expect((bodyOf(server, "POST", "/next-turn") as { requestId: string }).requestId).toMatch(/.+/);
  });

  it("moves the turn only from its button: no key is a shortcut for it", async () => {
    await renderRunner();
    await screen.findByText("Brannoc is up · Goblin Boss next");
    expect(screen.getByRole("button", { name: "Next turn" })).not.toHaveAttribute(
      "aria-describedby",
    );

    await userEvent.click(document.body);
    await userEvent.keyboard(" ");
    await userEvent.keyboard("n");
    await userEvent.keyboard("{Enter}");

    expect(server.calls.some((call) => call.pathname.endsWith("/next-turn"))).toBe(false);
    expect(screen.getByText("Brannoc is up · Goblin Boss next")).toBeInTheDocument();
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

    // Both levels default to `dm` on the server, deliberately. The sentence
    // is one press away, in the strip's own menu, with who is left standing.
    let menu = await stripMenu();
    expect(menu.getByText(/DM only — nothing here is on the players/)).toBeVisible();
    expect(menu.getByText(/1 hostile standing/)).toBeVisible();
    // While nothing is shared, a dashed ring on every chip would mark nothing.
    for (const row of rows()) {
      expect(row.querySelector("[data-slot=strip-disc]")?.className).toContain("border-solid");
    }
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("switch", { name: "Share" }));
    expect(bodyOf(server, "PATCH", `/runs/${liveRun.id}`)).toEqual({ visibility: "shared" });

    // Every row is still `dm`. Saying "shared" and leaving it there would imply
    // the players can see two combatants they cannot: the rings go dashed.
    await waitFor(() =>
      expect(rowFor("Brannoc").querySelector("[data-slot=strip-disc]")?.className).toContain(
        "border-dashed",
      ),
    );
    for (const row of rows()) expect(row).toHaveAccessibleName(/hidden from players/);
    menu = await stripMenu();
    expect(menu.getByText(/every line in it is hidden from them/)).toBeVisible();
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
    reaim("/rolls", { status: 200, body: [roll] });
    await renderRunner();

    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    // The players' tray is in the fight's one *Rolls* dock, with who rolled it.
    const latest = () => within(dock().getByRole("status", { name: "Latest roll" }));
    await waitFor(() => expect(latest().getByText("Halberd")).toBeTruthy());
    expect(latest().getByText("Mara Voss · Brannoc Duskharrow · 1d20+7 [12]")).toBeTruthy();
    expect(latest().getByText("19")).toBeTruthy();

    const next = {
      ...roll,
      id: "2b1f2a1e-0000-4000-8000-00000000aa02",
      total: 24,
      dice: [17],
      kept: [17],
    };
    reaim("/rolls", { status: 200, body: [next, roll] });
    server.emit(sessionEvent(4, "roll-made"));
    await waitFor(() => expect(latest().getByText("24")).toBeTruthy());
    // The ring itself is not a second line: the roll is already there as itself.
    expect(dock().getByRole("button", { name: /^Rolls/ })).toHaveTextContent("2 in log");
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
    // The event's `payload` is `{}`: the rows come from a re-read of the state
    // tables, which is the only place they live, and the dock prints numbers
    // only from a payload that decodes as its kind declares.
    server.emit(sessionEvent(9, "combatant-damaged", goblinBoss.id));

    await waitFor(() =>
      expect(within(rowFor("Goblin Boss")).getByText("3/21")).toBeInTheDocument(),
    );
    expect(
      server.calls.filter((call) => call.pathname.endsWith("/combatants")).length,
    ).toBeGreaterThan(before);
    // And the dock says it from `kind` plus the combatant id alone.
    await dock().findByText("Goblin Boss took a hit");
  });

  it("shows the selected combatant, following the turn until told otherwise", async () => {
    await renderRunner();
    await screen.findByRole("heading", { name: "Ambush in the reeds" });
    await waitFor(() => expect(rows()).toHaveLength(2));

    // Brannoc is up, so the panel is on Brannoc without anyone choosing.
    expect(panel().getByText("Brannoc")).toBeInTheDocument();
    expect(panel().getByText("Party")).toBeInTheDocument();
    // Following already: the menu has nothing to follow, and nobody to make up.
    const following = await panelMenu("Brannoc");
    expect(following.queryByRole("menuitem", { name: "Follow the turn" })).toBeNull();
    expect(following.queryByRole("menuitem", { name: "Make it their turn" })).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(rowFor("Goblin Boss"));

    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();
    const picked = await panelMenu("Goblin Boss");
    expect(picked.getByRole("menuitem", { name: "Follow the turn" })).toBeInTheDocument();
    expect(picked.getByRole("menuitem", { name: "Make it their turn" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    // The stat block is folded under the Actions until the DM wants it.
    expect(panel().queryByText("17 (chain shirt, shield)")).toBeNull();
    await openStatBlock();
    // The document half of the creature, which no column holds: the
    // parenthetical is the whole reason `statBlock` is a document and not
    // derived from the `ac` beside it.
    expect(panel().getByText("17 (chain shirt, shield)")).toBeInTheDocument();
    expect(panel().getByText("Nimble Escape")).toBeInTheDocument();
    expect(panel().getByRole("button", { name: "Roll Scimitar, 1d6+2" })).toBeInTheDocument();
  });

  it("selects from a chip, and Next turn puts the selection back on whoever is up", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    // Following the turn: whoever is up is the one shown, and pressed.
    expect(rowFor("Brannoc")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(rowFor("Goblin Boss"));
    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();
    expect(rowFor("Goblin Boss")).toHaveAttribute("aria-pressed", "true");
    expect(rowFor("Goblin Boss").className).toContain("border-faint");
    expect(rowFor("Brannoc")).toHaveAttribute("aria-pressed", "false");
    // Choosing is not a turn: the marker stays where the server has it.
    expect(rowFor("Brannoc")).toHaveAttribute("aria-current", "step");

    // Back on Brannoc by hand, then the turn moves: the card follows it.
    await userEvent.click(rowFor("Brannoc"));
    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));
    await screen.findByText("Goblin Boss is up · Brannoc next");
    expect(rowFor("Goblin Boss")).toHaveAttribute("aria-current", "step");
    expect(rowFor("Goblin Boss")).toHaveAttribute("aria-pressed", "true");
    expect(rowFor("Brannoc")).toHaveAttribute("aria-pressed", "false");
    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Follow the turn" })).toBeNull();
  });

  it("marks the chip of a token nobody has put down", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    // Brannoc stands on the board; the Goblin Boss waits for a square.
    await waitFor(() =>
      expect(rowFor("Goblin Boss").querySelector("[data-slot=strip-unplaced]")).not.toBeNull(),
    );
    expect(rowFor("Goblin Boss")).toHaveAccessibleName(/not on the board/);
    expect(rowFor("Brannoc").querySelector("[data-slot=strip-unplaced]")).toBeNull();
    expect(rowFor("Brannoc")).not.toHaveAccessibleName(/not on the board/);
  });

  it("marks nobody unplaced on a fight with no board", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, { status: 200, body: null });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(document.querySelector("[data-slot=strip-unplaced]")).toBeNull();
  });

  it("names the conditions a chip's creature carries, and counts them on its disc", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rowFor("Goblin Boss")).toHaveAccessibleName(/Hostile/);
    expect(rowFor("Goblin Boss").querySelector("[data-slot=strip-conditions]")).toHaveTextContent(
      "1",
    );
  });

  it("shows each chip's armour class beside its disc", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rowFor("Brannoc").querySelector("[data-slot=strip-ac]")).toHaveTextContent("AC 18");
    expect(rowFor("Goblin Boss").querySelector("[data-slot=strip-ac]")).toHaveTextContent("AC 17");
  });

  it("names a chip's conditions in a tooltip on hover and on focus", async () => {
    // Base UI's tooltip popup carries no role, so it is found by its slot.
    const tooltip = () => document.querySelector("[data-slot=tooltip-content]");
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.hover(rowFor("Goblin Boss"));
    await waitFor(() => expect(tooltip()).toHaveTextContent("Hostile"));
    await userEvent.unhover(rowFor("Goblin Boss"));
    await waitFor(() => expect(tooltip()).toBeNull());

    rowFor("Brannoc").focus();
    await userEvent.tab();
    expect(rowFor("Goblin Boss")).toHaveFocus();
    await waitFor(() => expect(tooltip()).toHaveTextContent("Hostile"));
  });

  it("names a chip without conditions in full in its tooltip", async () => {
    const tooltip = () => document.querySelector("[data-slot=tooltip-content]");
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rowFor("Brannoc").querySelector("[data-slot=strip-conditions]")).toBeNull();
    await userEvent.hover(rowFor("Brannoc"));
    await waitFor(() => expect(tooltip()).toHaveTextContent("Brannoc"));
  });

  it("adds a combatant from the strip's trailing chip", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(strip().getByRole("button", { name: "Add combatant" }));
    expect(await screen.findByRole("dialog", { name: "Add a combatant" })).toBeInTheDocument();
  });

  // Heights are the browser's (`pnpm -F web e2e` measures the runner);
  // what jsdom can pin is who scrolls. The window does, and only the window:
  // the runner is a document screen (no `fill`), so nothing between these
  // cards and the page may bound a height or scroll on its own.
  it("leads the aside with the sheet, and leaves the scrolling to the window", async () => {
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());

    const sheet = screen.getByRole("region", { name: "Selected combatant" });
    const log = screen.getByRole("region", { name: "Rolls" });
    // The sheet is its own area; the *Rolls* dock leads the next, and every
    // card the drawing leaves out follows it there (`RunLayout.tsx`, which puts
    // the rest beside the card from `@2xl` and a phone splits around the map).
    const area = sheet.parentElement as HTMLElement;
    expect(area.firstElementChild).toBe(sheet);
    const rest = area.nextElementSibling as HTMLElement;
    expect(rest.firstElementChild).toBe(log);
    expect(rest).toContainElement(screen.getByRole("region", { name: "Hob's direct spends" }));
    // The players' tray and the log are the dock's now, not cards of their own.
    expect(screen.queryByRole("region", { name: "Dice tray" })).toBeNull();
    expect(screen.queryByRole("log", { name: "What just happened" })).toBeNull();

    const classOf = (element: Element): string => element.getAttribute("class") ?? "";
    // Nothing inside the cards scrolls on its own — the strip's chips scroll
    // sideways, as the drawing does, but never up and down…
    const scroller = /(^|\s)(overflow(-y)?-(auto|scroll)|max-h-\S+)(\s|$)/;
    // …and nothing from them up to the page bounds a height to hand one. The
    // frame's `min-h-screen` is it growing with the document, and `clip` is not
    // a scroll container.
    const bound =
      /(^|\s)(overflow(-y)?-(auto|scroll|hidden)|max-h-\S+|h-screen|min-h-(?!screen)\S+)(\s|$)/;
    for (const card of [sheet, log, screen.getByRole("region", { name: "Initiative" })]) {
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

  it("counts the enemies still standing when the fight is ended", async () => {
    const goblin = (id: string, hpCurrent: number) => ({
      ...goblinBoss,
      id,
      displayName: "Goblin",
      hpCurrent,
    });
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith("/combatants")) {
        server.routes.set(key, {
          ...answer,
          body: [
            // A downed PC is not an enemy: the line counts the NPC rows only.
            { ...brannoc, hpCurrent: 0 },
            { ...goblinBoss, hpCurrent: 0 },
            goblin("2b1f2a1e-0000-4000-8000-0000000d0a01", 7),
            goblin("2b1f2a1e-0000-4000-8000-0000000d0a02", 0),
          ],
        });
      }
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, round: 3 } });
      }
    }
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(4));

    await userEvent.click(screen.getByRole("button", { name: "End" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByText(/^2 of 3 enemies are down after 3 rounds\. 1 still standing\./),
    ).toBeInTheDocument();
    // The line is added, not swapped in: the title, the switch and both
    // endings are the dialog's own, and nothing offers to award anything.
    expect(dialog.getByText("End this fight?")).toBeInTheDocument();
    expect(dialog.getByRole("switch", { name: /Finish session 12 too/ })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Keep playing" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "End the fight" })).toBeInTheDocument();
    expect(dialog.queryByText(/XP/)).toBeNull();
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
    await userEvent.click((await panelMenu("Goblin Boss")).getByRole("menuitem", { name: "Edit" }));

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
    // The drawing's fourteen — the SRD's but Exhaustion, which has levels, plus
    // Concentrating — then the word the row already carries, pressed so it can
    // be cleared: the vocabulary is open.
    expect(chips.getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "Blinded",
      "Charmed",
      "Concentrating",
      "Deafened",
      "Frightened",
      "Grappled",
      "Incapacitated",
      "Invisible",
      "Paralyzed",
      "Poisoned",
      "Prone",
      "Restrained",
      "Stunned",
      "Unconscious",
      "Hostile",
    ]);
    for (const chip of chips.getAllByRole("button").slice(0, 14))
      expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chips.getByRole("button", { name: "Hostile" })).toHaveAttribute("aria-pressed", "true");
    expect(panel().getByText("1 active")).toBeInTheDocument();

    await userEvent.click(chips.getByRole("button", { name: "Prone" }));
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({
        conditions: ["Hostile", "Prone"],
      }),
    );
    // The answer is merged into the fight: the chip wears it without a re-read.
    await waitFor(() => expect(rowFor("Goblin Boss")).toHaveAccessibleName(/Hostile, Prone/));
    expect(rowFor("Goblin Boss").querySelector("[data-slot=strip-conditions]")).toHaveTextContent(
      "2",
    );
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

    expect(dock().getByText(/Nothing rolled yet/)).toBeInTheDocument();

    await openStatBlock();
    await userEvent.click(panel().getByRole("button", { name: "Roll DEX check, 1d20+2" }));
    await userEvent.click(panel().getByRole("button", { name: "Roll Scimitar, 1d6+2" }));
    await userEvent.click(dock().getByRole("button", { name: "Roll a d20" }));

    await openDock();
    // Newest first, each named for what rolled it.
    expect(dockLabels()).toEqual(["d20", "Goblin Boss · Scimitar", "Goblin Boss · DEX"]);
    expect(dock().getByText(/^1d6\+2 \[\d\]$/)).toBeInTheDocument();
    // A roll is not durable state: nothing left this browser.
    expect(server.calls.filter((call) => call.method !== "GET")).toHaveLength(before);
  });

  it("keeps forty lines in the dock, and shows the latest over the twelve before it", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    const d4 = dock().getByRole("button", { name: "Roll a d4" });
    for (let i = 0; i < 45; i += 1) fireEvent.click(d4);
    const toggle = dock().getByRole("button", { name: /^Rolls/ });
    expect(toggle).toHaveTextContent("40 in log");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(dock().queryByRole("list", { name: "Earlier rolls" })).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveTextContent("Hide log");
    expect(
      within(dock().getByRole("list", { name: "Earlier rolls" })).getAllByRole("listitem"),
    ).toHaveLength(12);
  });

  it("reads a party member's speed and actions off their sheet, and has no stat block", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: runParty.map((seat) => ({
        ...seat,
        character: {
          ...seat.character,
          sheet: {
            ...seat.character.sheet,
            actions: [
              {
                id: "atk:longsword",
                name: "Longsword",
                cost: "action",
                hit: "+7",
                dice: "1d8+4",
                damageType: "Slashing",
                source: "weapon",
              },
              { id: "spell:bless", name: "Bless", cost: "action", source: "spell" },
            ],
          },
        },
      })),
    });
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());

    // A person's line in the sans; a monster's in the stat block's serif.
    expect(panel().getByText("Half-orc paladin · Ilse")).not.toHaveClass("font-serif");
    const tiles = (label: string) => panel().getByText(label).nextElementSibling?.textContent;
    expect(tiles("AC")).toBe("18");
    expect(tiles("HP")).toBe("44/52");
    // The sheet's "25 ft.", as the board's range reads it.
    await waitFor(() => expect(tiles("Speed")).toBe("25"));
    expect(tiles("Init")).toBe("21");

    // What the sheet rolls for; *Bless* has nothing to roll.
    const actions = within(panel().getByRole("region", { name: "Actions of Brannoc" }));
    expect(
      actions.getAllByRole("listitem").map((line) => line.firstElementChild?.textContent),
    ).toEqual(["Longsword+7 to hit · 1d8+4 slashing"]);
    expect(panel().queryByRole("button", { name: "Stat block" })).toBeNull();
  });

  it("lists a monster's attacks over its folded stat block, in the block's own face", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    expect(panel().getByText("Small humanoid")).toHaveClass("font-serif", "italic");
    const tiles = (label: string) => panel().getByText(label).nextElementSibling?.textContent;
    expect(tiles("Speed")).toBe("30");
    const actions = within(panel().getByRole("region", { name: "Actions of Goblin Boss" }));
    expect(
      actions.getAllByRole("listitem").map((line) => line.firstElementChild?.textContent),
    ).toEqual(["Scimitar1d6+2"]);
    expect(panel().getByRole("button", { name: "Stat block" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("draws a creature at zero hit points in red, and a row typed in with no speed or actions", async () => {
    const guard = {
      ...goblinBoss,
      id: "2b1f2a1e-0000-4000-8000-000000000c77",
      creatureId: null,
      displayName: "Guard",
      subtitle: null,
      hpCurrent: 0,
      conditions: [],
    };
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, guard],
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Guard"));

    const hp = panel().getByText("HP").nextElementSibling;
    expect(hp).toHaveTextContent("0/21");
    expect(hp).toHaveClass("text-danger");
    expect(panel().getByText("Speed").nextElementSibling).toHaveTextContent("—");
    expect(panel().queryByRole("region", { name: "Actions of Guard" })).toBeNull();
    expect(panel().getByText("None")).toBeInTheDocument();
  });

  it("hides a creature from the players with the eye, and shows it again", async () => {
    // The fixture's boss is hidden, as a row added at the table starts.
    const hidden = { ...goblinBoss, visibility: "dm" };
    server.routes.set(`PATCH ${serverRunBase()}/combatants/${goblinBoss.id}`, {
      status: 200,
      body: { ...goblinBoss, visibility: "shared" },
    });
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, hidden],
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    const eye = panel().getByRole("button", {
      name: "Goblin Boss is hidden from players. Reveal them.",
    });
    expect(eye).toHaveAttribute("title", "Hidden from players. Click to reveal.");
    await userEvent.click(eye);

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({
        visibility: "shared",
      }),
    );
    // The answer is merged into the fight, and the eye turns over without a re-read.
    const shown = await panel().findByRole("button", { name: "Hide Goblin Boss from players" });
    expect(shown).toHaveAttribute("title", "Hide from players");
    // It changes what a seated player's table answers, and nothing of the party's.
    expect(combatantVisibilityWrites(campaignId)).toEqual([reads.playerTable(campaignId)]);

    server.routes.set(`PATCH ${serverRunBase()}/combatants/${goblinBoss.id}`, {
      status: 200,
      body: hidden,
    });
    server.calls.length = 0;
    await userEvent.click(shown);
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/combatants/${goblinBoss.id}`)).toEqual({
        visibility: "dm",
      }),
    );
    await panel().findByRole("button", {
      name: "Goblin Boss is hidden from players. Reveal them.",
    });
  });

  it("makes a creature's turn from the menu", async () => {
    server.routes.set(`PATCH ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: goblinBoss.id },
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    await userEvent.click(
      (await panelMenu("Goblin Boss")).getByRole("menuitem", { name: "Make it their turn" }),
    );
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/runs/${liveRun.id}`)).toEqual({
        activeCombatantId: goblinBoss.id,
      }),
    );
  });

  it("asks before removing a creature from the fight, and follows the turn after", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(rowFor("Goblin Boss"));

    await userEvent.click(
      (await panelMenu("Goblin Boss")).getByRole("menuitem", { name: "Remove from the fight" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Remove Goblin Boss from the fight?")).toBeInTheDocument();
    // Asking is not removing.
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
    await userEvent.click(dialog.getByRole("button", { name: "Keep them" }));
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();

    await userEvent.click(
      (await panelMenu("Goblin Boss")).getByRole("menuitem", { name: "Remove from the fight" }),
    );
    server.routes.set(`GET ${serverRunBase()}/combatants`, { status: 200, body: [brannocPlaced] });
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Remove from the fight",
      }),
    );
    await waitFor(() =>
      expect(
        server.calls.some(
          (call) =>
            call.method === "DELETE" && call.pathname.endsWith(`/combatants/${goblinBoss.id}`),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(panel().getByText("Brannoc")).toBeInTheDocument();
  });

  it("offers nothing that writes once the fight is over", async () => {
    server.routes.set(`GET ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, endedAt: liveRun.startedAt },
    });
    await renderRunner();
    await screen.findByText(/came off the table/);
    await userEvent.click(rowFor("Goblin Boss"));

    expect(
      panel().getByRole("button", { name: "Goblin Boss is hidden from players. Reveal them." }),
    ).toBeDisabled();
    const menu = await panelMenu("Goblin Boss");
    expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Follow the turn",
    ]);
  });

  it("says nothing is selected when the turn marker is on nobody", async () => {
    server.routes.set(`GET ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: null },
    });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(
      panel().getByText("Nothing selected. Click a token, or a name in the initiative."),
    ).toBeInTheDocument();
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
    server.routes.set(`POST ${serverRunBase()}/initiative`, { status: 200, body: combatants });
  };
  const rollPanel = () => within(screen.getByRole("region", { name: "Roll initiative" }));
  const boxFor = (name: string) => rollPanel().getByLabelText(`${name} initiative`);
  const initiativeWrites = () =>
    server.calls.filter((call) => call.method === "POST" && call.pathname.endsWith("/initiative"));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A different d20 face at every call. Other code on the page draws from
   * `Math.random` too, so a test can say which rolls matched and which did
   * not, but not which faces came up.
   */
  const everyRollDifferent = () => {
    let calls = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (calls++ % 20) / 20 + 0.01);
  };
  type Sent = { entries: ReadonlyArray<{ combatantId: string; initiative: number }> };
  const sentAt = (index: number): Sent => JSON.parse(initiativeWrites()[index]!.body) as Sent;

  it("takes the initiative strip's place, and waits for every number before round 1", async () => {
    rollingWith(unrolled);
    await renderRunner();

    await screen.findByText("Rolling initiative · 1 player, 1 monster");
    expect(screen.queryByRole("list", { name: "Initiative order" })).toBeNull();
    expect(rollPanel().getByRole("button", { name: "Start round 1" })).toBeDisabled();
    expect(rollPanel().getByText("1 player to go · monsters not rolled")).toBeInTheDocument();
    // One way into the round, the panel's; the bar has no second one.
    expect(screen.getAllByRole("button", { name: /Start round/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Next turn" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More about the order" })).toBeNull();
    expect(boxFor("Brannoc")).toHaveValue("");
    // The name opens the row on the card; nobody is up, so nobody can be made up.
    await userEvent.click(rollPanel().getByRole("button", { name: "Brannoc" }));
    expect(panel().getByLabelText("Hit points to apply to Brannoc")).toBeInTheDocument();
    expect(
      (await panelMenu("Brannoc")).queryByRole("menuitem", { name: "Make it their turn" }),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(document.body);
    await userEvent.keyboard(" ");
    expect(server.calls.some((call) => call.pathname.endsWith("/next-turn"))).toBe(false);
  });

  it("rolls one d20 per creature type, plus each bonus, in one write", async () => {
    everyRollDifferent();
    const secondGoblin = {
      ...unrolled[1],
      id: "5d1c7c52-0000-4000-8000-00000000c0b2",
    };
    const wolf = {
      ...unrolled[1],
      id: "5d1c7c52-0000-4000-8000-00000000c0b3",
      creatureId: null,
      displayName: "Wolf",
      initiativeBonus: null,
    };
    rollingWith([...unrolled, secondGoblin, wolf]);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 3 monsters");
    expect(rollPanel().getByRole("switch", { name: "One roll per creature type" })).toBeChecked();

    await userEvent.click(rollPanel().getByRole("button", { name: "Roll for monsters" }));

    await waitFor(() => expect(initiativeWrites()).toHaveLength(1));
    const at = new Map(sentAt(0).entries.map((entry) => [entry.combatantId, entry.initiative]));
    expect([...at.keys()].sort()).toEqual([goblinBoss.id, secondGoblin.id, wolf.id].sort());
    // Both goblins on one d20, plus their 2; the hand-added wolf rolls its own, plus nothing.
    expect(at.get(goblinBoss.id)).toBe(at.get(secondGoblin.id));
    expect(at.get(wolf.id)).not.toBe(at.get(goblinBoss.id)! - 2);
    const entries = sentAt(0).entries;
    // The party are nobody's to roll for in that press.
    expect(entries.some((entry) => entry.combatantId === brannoc.id)).toBe(false);
  });

  it("rolls each monster its own d20 with the switch off, and rerolls one row alone", async () => {
    everyRollDifferent();
    const secondGoblin = { ...unrolled[1], id: "5d1c7c52-0000-4000-8000-00000000c0b2" };
    rollingWith([...unrolled, secondGoblin]);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 2 monsters");

    await userEvent.click(rollPanel().getByRole("switch", { name: "One roll per creature type" }));
    await userEvent.click(rollPanel().getByRole("button", { name: "Roll for monsters" }));
    await waitFor(() => expect(initiativeWrites()).toHaveLength(1));
    const [one, two] = sentAt(0).entries;
    expect(one!.initiative).not.toBe(two!.initiative);

    await userEvent.click(rollPanel().getAllByRole("button", { name: "Reroll Goblin Boss" })[0]!);
    await waitFor(() => expect(initiativeWrites()).toHaveLength(2));
    expect(sentAt(1).entries).toHaveLength(1);
  });

  it("sends a typed total for one row on Enter, digits and a minus only", async () => {
    rollingWith(unrolled);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 1 monster");

    await userEvent.type(boxFor("Goblin Boss"), "1x5{Enter}");

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/initiative")).toMatchObject({
        entries: [{ combatantId: goblinBoss.id, initiative: 15 }],
      }),
    );
    expect(initiativeWrites()).toHaveLength(1);
  });

  it("rolls for a player with d20 plus their bonus", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    rollingWith(unrolled);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 1 monster");

    await userEvent.click(rollPanel().getByRole("button", { name: "Roll for Brannoc" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/initiative")).toMatchObject({
        entries: [{ combatantId: brannoc.id, initiative: 12 }],
      }),
    );
  });

  it("does not roll for a character whose sheet gives no bonus", async () => {
    rollingWith([{ ...unrolled[0], initiativeBonus: null }, unrolled[1]]);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 1 monster");

    expect(rollPanel().queryByRole("button", { name: "Roll for Brannoc" })).toBeNull();
    expect(boxFor("Brannoc")).toBeEnabled();
  });

  it("shows the number a player sent, and the DM's typing replaces it", async () => {
    rollingWith([{ ...unrolled[0], initiative: 14, initiativeSetBy: "player" }, unrolled[1]]);
    await renderRunner();
    await screen.findByText("Rolling initiative · 1 player, 1 monster");

    expect(boxFor("Brannoc")).toHaveValue("14");
    expect(rollPanel().getByText(/sent from their table/)).toBeInTheDocument();
    expect(rollPanel().getByText("monsters not rolled")).toBeInTheDocument();

    // Leaving the box untouched sends nothing.
    await userEvent.click(boxFor("Brannoc"));
    await userEvent.tab();
    expect(initiativeWrites()).toHaveLength(0);

    await userEvent.clear(boxFor("Brannoc"));
    await userEvent.type(boxFor("Brannoc"), "9");
    await userEvent.tab();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/initiative")).toMatchObject({
        entries: [{ combatantId: brannoc.id, initiative: 9 }],
      }),
    );
  });

  it("starts the round once everyone has a number", async () => {
    rollingWith([
      { ...brannoc, initiativeSetBy: "player" },
      { ...goblinBoss, initiativeSetBy: "dm" },
    ]);
    server.routes.set(`POST ${serverRunBase()}/begin`, { status: 200, body: liveRun });
    await renderRunner();

    await screen.findByText("Ties go to the higher initiative bonus, then the players.");
    await userEvent.click(rollPanel().getByRole("button", { name: "Start round 1" }));

    await screen.findByText("Brannoc is up · Goblin Boss next");
    expect(screen.getByRole("button", { name: "Next turn" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Initiative order" })).toBeInTheDocument();
    expect((bodyOf(server, "POST", "/begin") as { requestId: string }).requestId).toMatch(/.+/);
  });

  it("goes back to rolling, keeping the numbers, and offers the round again", async () => {
    server.routes.set(`POST ${serverRunBase()}/reroll`, {
      status: 200,
      body: { ...rollingRun, round: 3 },
    });
    await renderRunner();
    await screen.findByText("Brannoc is up · Goblin Boss next");

    await userEvent.click((await stripMenu()).getByRole("menuitem", { name: "Reroll initiative" }));

    await screen.findByText("Rolling initiative · 1 player, 1 monster");
    expect(rollPanel().getByRole("button", { name: "Start round 3" })).toBeEnabled();
    expect(boxFor("Brannoc")).toHaveValue("21");
    expect(boxFor("Goblin Boss")).toHaveValue("19");
  });
});

describe.each(layouts)("the fight's tokens, on $layout", ({ wide }) => {
  beforeEach(() => {
    if (wide) onTheCanvas();
  });
  afterEach(() => vi.restoreAllMocks());

  const card = () => within(screen.getByRole("region", { name: "Battle map" }));
  const hint = () => card().getByRole("status");
  const moves = () => server.calls.filter((call) => call.pathname.endsWith("/move"));
  const brannocMove = () => `POST ${serverRunBase()}/combatants/${brannoc.id}/move`;
  const bossMove = () => `POST ${serverRunBase()}/combatants/${goblinBoss.id}/move`;

  /**
   * jsdom lays nothing out, so the tokens' layer is given the box a browser
   * would: 240 × 160 for the fixture's 24 × 16 board, ten pixels a square.
   */
  const layOut = () => {
    const layer = document.querySelector<HTMLElement>("[data-slot=run-tokens]");
    if (layer === null) throw new Error("no board");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }),
    );
  };
  /** The middle of a square, on that laid-out board. */
  const middle = (column: number, row: number) => ({
    clientX: column * 10 + 5,
    clientY: row * 10 + 5,
  });

  /** Click the board at a square: where a token from the tray goes down. */
  const clickSquare = (column: number, row: number) => {
    const squares = document.querySelector<HTMLElement>("[data-slot=run-board-squares]");
    if (squares === null) throw new Error("no board to click");
    layOut();
    fireEvent.click(squares, middle(column, row));
  };

  /** Press a token, carry it over each square in turn, and leave it on the last (or don't). */
  const drag = (
    from: HTMLElement,
    path: ReadonlyArray<readonly [number, number]>,
    end: "drop" | "hold" = "drop",
  ) => {
    layOut();
    const start = path[0]!;
    fireEvent.pointerDown(from, { pointerId: 7, button: 0, ...middle(...start) });
    for (const [column, row] of path.slice(1)) {
      fireEvent.pointerMove(from, { pointerId: 7, ...middle(column, row) });
    }
    if (end === "drop") {
      const last = path.at(-1)!;
      fireEvent.pointerUp(from, { pointerId: 7, ...middle(...last) });
    }
  };
  const ruler = () => document.querySelector<HTMLElement>("[data-slot=ruler-reading]");
  const range = () =>
    [
      ...document.querySelectorAll<SVGElement>("[data-slot=run-tokens] [data-slot=range-square]"),
    ].map((square) => square.dataset.square);

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
    expect(rowFor("Brannoc")).toHaveAttribute("aria-pressed", "true");
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

  it("moves a dragged token, with a ruler on the way, and says how far it went", async () => {
    let answer: (value: void) => void = () => {};
    const answered = new Promise<void>((resolve) => (answer = resolve));
    server.routes.set(brannocMove(), {
      status: 200,
      body: { ...brannocPlaced, position: { column: 11, row: 2 } },
      until: answered,
    });
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });

    drag(
      brannocToken,
      [
        [5, 4],
        [8, 3],
        [11, 2],
      ],
      "hold",
    );
    // He is up, so the ruler counts against his 25 ft: six squares is 30.
    await waitFor(() => expect(ruler()).toHaveTextContent("30 ft · 5 over"));
    expect(ruler()).toHaveAttribute("data-verdict", "over");
    // The token rides under the pointer, and wears its name while carried.
    expect(brannocToken.style.left).toMatch(/^45\.8333/);
    expect(within(brannocToken).getByText("Brannoc")).toBeInTheDocument();
    expect(moves()).toEqual([]);

    fireEvent.pointerUp(brannocToken, { pointerId: 7, ...middle(11, 2) });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect(bodyOf(server, "POST", "/move")).toMatchObject({
      position: { column: 11, row: 2 },
      requestId: expect.any(String),
    });
    expect(ruler()).toBeNull();
    // Until the server answers, the token stays where it was dropped.
    expect(brannocToken.style.left).toMatch(/^45\.8333/);

    answer();
    await waitFor(() =>
      expect(hint()).toHaveTextContent("Brannoc moved 30 ft, past their 25 ft speed"),
    );
    await waitFor(() => expect(token("Brannoc")).toHaveAccessibleName("Brannoc, column 12, row 3"));
  });

  it("measures a move by the campaign's diagonal rule, as the server counts it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, diagonalRule: "alternating" },
    });
    server.routes.set(brannocMove(), {
      status: 200,
      body: { ...brannocPlaced, position: { column: 9, row: 8 } },
    });
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });

    drag(
      brannocToken,
      [
        [5, 4],
        [9, 8],
      ],
      "hold",
    );
    // Four squares on each side alternate 5, 10, 5, 10: 30 ft, not 20.
    await waitFor(() => expect(ruler()).toHaveTextContent("30 ft · 5 over"));
    fireEvent.pointerUp(brannocToken, { pointerId: 7, ...middle(9, 8) });
    await waitFor(() =>
      expect(hint()).toHaveTextContent("Brannoc moved 30 ft, past their 25 ft speed"),
    );
  });

  it("reads plain feet for a creature whose turn it is not, and what is left for the one up", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, position: { column: 20, row: 10 } }],
    });
    await open();
    drag(
      await card().findByRole("button", { name: /^Goblin Boss,/ }),
      [
        [20, 10],
        [17, 10],
      ],
      "hold",
    );
    await waitFor(() => expect(ruler()).toHaveTextContent(/^15 ft$/));
    expect(ruler()).toHaveAttribute("data-verdict", "distance");
    fireEvent.pointerCancel(token("Goblin Boss"), { pointerId: 7 });
    await waitFor(() => expect(ruler()).toBeNull());

    drag(
      token("Brannoc"),
      [
        [5, 4],
        [7, 4],
      ],
      "hold",
    );
    await waitFor(() => expect(ruler()).toHaveTextContent("10 ft · 15 left"));
    expect(ruler()).toHaveAttribute("data-verdict", "left");
  });

  it("refuses a drop on a square someone holds, and a drag that ends where it began", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, position: { column: 7, row: 4 } }],
    });
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });

    drag(
      brannocToken,
      [
        [5, 4],
        [7, 4],
      ],
      "hold",
    );
    await waitFor(() => expect(ruler()).toHaveTextContent("Occupied"));
    fireEvent.pointerUp(brannocToken, { pointerId: 7, ...middle(7, 4) });
    // Back on his own square, and nothing sent.
    await waitFor(() => expect(brannocToken.style.left).toMatch(/^20\.8333/));

    drag(brannocToken, [
      [5, 4],
      [9, 4],
      [5, 4],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(moves()).toEqual([]);
  });

  it("tints the squares the active creature can reach, less the ones others hold", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, position: { column: 6, row: 4 } }],
    });
    await open();
    // He is up and followed: his 25 ft is five squares every way from (5, 4),
    // cut at the board's top edge, less his own square and the boss's.
    await waitFor(() => expect(range()).toHaveLength(11 * 10 - 2));
    expect(range()).toContain("0,0");
    expect(range()).toContain("10,9");
    expect(range()).not.toContain("5,4");
    expect(range()).not.toContain("6,4");
    expect(range()).not.toContain("11,4");

    // A creature whose turn it is not shows no range when selected.
    await userEvent.click(token("Goblin Boss"));
    await waitFor(() => expect(panel().getByText("Goblin Boss")).toBeInTheDocument());
    expect(range()).toEqual([]);
  });

  it("dresses each token: hit points, conditions, a hidden ring and a struck-out monster", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        { ...brannocPlaced, conditions: ["Blessed", "Concentrating"], visibility: "shared" },
        {
          ...goblinBoss,
          position: { column: 20, row: 10 },
          hpCurrent: 0,
          conditions: [],
          visibility: "dm",
        },
      ],
    });
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });
    const boss = token("Goblin Boss");

    expect(brannocToken.querySelectorAll("[data-slot=hp-bar]")).toHaveLength(1);
    expect(boss.querySelectorAll("[data-slot=hp-bar]")).toHaveLength(1);
    expect(within(brannocToken).getByText("2")).toHaveAttribute("data-slot", "token-conditions");
    expect(boss.querySelector("[data-slot=token-conditions]")).toBeNull();
    // The boss is down and held back: faded, struck, and dashed on the DM's board.
    expect(boss.className).toMatch(/(^|\s)opacity-45(\s|$)/);
    expect(boss.querySelector("text")?.getAttribute("class")).toMatch(/line-through/);
    expect(boss.querySelector("[data-ring=hidden]")).not.toBeNull();
    expect(brannocToken.querySelector("[data-ring=hidden]")).toBeNull();
    // He is up and followed: the active ring, and his name under him.
    expect(brannocToken.querySelector("[data-ring=active]")).not.toBeNull();
    expect(within(brannocToken).getByText("Brannoc")).toHaveAttribute("data-slot", "token-name");
    expect(within(boss).queryByText("Goblin Boss")).toBeNull();
  });

  it("names every token, or none, by the DM's choice, kept on this browser", async () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
    });
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, position: { column: 20, row: 10 } }],
    });
    await open();
    await card().findByRole("button", { name: /^Goblin Boss,/ });
    const named = () =>
      [...document.querySelectorAll("[data-slot=run-tokens] [data-slot=token-name]")].map(
        (name) => name.textContent,
      );
    expect(named()).toEqual(["Brannoc"]);

    await userEvent.click(card().getByRole("button", { name: /^Names on tokens/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Every token" }));
    await waitFor(() => expect(named()).toEqual(["Brannoc", "Goblin Boss"]));
    expect(kept.get("taverns:run:token-names")).toBe("all");

    await userEvent.click(card().getByRole("button", { name: /^Names on tokens/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "None" }));
    await waitFor(() => expect(named()).toEqual([]));
    // A view, not a write.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("opens on the choice this browser kept", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "none", setItem: () => undefined });
    await open();
    await card().findByRole("button", { name: /^Brannoc,/ });
    expect(document.querySelector("[data-slot=run-tokens] [data-slot=token-name]")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("draws the board, and keeps a choice for the visit, when this browser keeps no storage", async () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    await open();
    await card().findByRole("button", { name: /^Brannoc,/ });
    const name = () => document.querySelector("[data-slot=run-tokens] [data-slot=token-name]");
    // The drawing's default stands in.
    expect(name()?.textContent).toBe("Brannoc");
    await userEvent.click(card().getByRole("button", { name: /^Names on tokens/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "None" }));
    await waitFor(() => expect(name()).toBeNull());
    vi.unstubAllGlobals();
  });

  it("reaches as far as a stat block's speed, and draws no range where none is written", async () => {
    const guard = "2b1f2a1e-0000-4000-8000-000000000c99";
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        brannocPlaced,
        { ...goblinBoss, position: { column: 20, row: 10 } },
        {
          ...goblinBoss,
          id: guard,
          creatureId: null,
          displayName: "Guard",
          position: { column: 1, row: 1 },
        },
      ],
    });
    server.routes.set(`GET ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: goblinBoss.id },
    });
    await open();
    // "30 ft." is six squares: from column 14 to the board's last, 23.
    await waitFor(() => expect(range()).toContain("14,10"));
    expect(range()).not.toContain("13,10");
    expect(range()).toContain("23,15");

    server.routes.set(`GET ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: guard },
    });
    await userEvent.click(token("Guard"));
    await waitFor(() => expect(panel().getByText("Guard")).toBeInTheDocument());
    expect(range()).toEqual([]);
  });

  it("reaches, and measures a drag against, only what is left of the speed for whoever is up", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [{ ...brannocPlaced, feetMoved: 15 }, goblinBoss],
    });
    await open();
    // 25 ft less the 15 the server counted is two squares every way from (5, 4).
    await waitFor(() => expect(range()).toContain("3,2"));
    expect(range()).toContain("7,6");
    expect(range()).not.toContain("2,4");
    expect(range()).not.toContain("8,4");

    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });
    drag(
      brannocToken,
      [
        [5, 4],
        [7, 4],
      ],
      "hold",
    );
    await waitFor(() => expect(ruler()).toHaveTextContent("10 ft · 0 left"));
    fireEvent.pointerMove(brannocToken, { pointerId: 7, ...middle(8, 4) });
    await waitFor(() => expect(ruler()).toHaveTextContent("15 ft · 5 over"));
    expect(ruler()).toHaveAttribute("data-verdict", "over");
    fireEvent.pointerCancel(brannocToken, { pointerId: 7 });
  });

  it("reaches nothing once whoever is up has walked past their speed", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [{ ...brannocPlaced, feetMoved: 30 }, goblinBoss],
    });
    await open();
    await waitFor(() =>
      expect(document.querySelector("[data-slot=movement]")).toHaveTextContent("30/25 ft"),
    );
    expect(range()).toEqual([]);
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

  it("takes a standing token off the board from the panel's menu, where the board is played on", async () => {
    server.routes.set(brannocMove(), { status: 200, body: { ...brannocPlaced, position: null } });
    await open();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());
    const menu = await panelMenu("Brannoc");
    if (!wide) {
      // Below the canvas the board is read-only, so its tokens stay put.
      expect(menu.queryByRole("menuitem", { name: "Take off the board" })).toBeNull();
      return;
    }
    await userEvent.click(menu.getByRole("menuitem", { name: "Take off the board" }));
    await waitFor(() => expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: null }));
    await waitFor(() =>
      expect(card().getByRole("button", { name: "Brannoc, not on the board" })).toBeInTheDocument(),
    );
    // Off the board, there is nothing left to take off.
    expect(
      (await panelMenu("Brannoc")).queryByRole("menuitem", { name: "Take off the board" }),
    ).toBeNull();
  });

  it("leaves the token where the server has it when a move is refused", async () => {
    server.routes.set(brannocMove(), {
      status: 409,
      body: { _tag: "Conflict", message: "that square is off the board" },
    });
    await open();
    const brannocToken = await card().findByRole("button", { name: /^Brannoc,/ });
    drag(brannocToken, [
      [5, 4],
      [9, 9],
    ]);

    await screen.findByText("Brannoc did not move");
    expect(token("Brannoc")).toHaveAccessibleName("Brannoc, column 6, row 5");
    await waitFor(() => expect(brannocToken.style.left).toMatch(/^20\.8333/));
    expect(hint()).toHaveTextContent("Drag Brannoc to a square, or step with the arrow keys.");
  });

  it("hides the grid on this screen only, and the squares still take a token", async () => {
    await open();
    await waitFor(() => expect(document.querySelectorAll("[data-line=column]")).toHaveLength(25));
    const grid = card().getByRole("button", { name: "Grid" });
    expect(grid).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(grid);
    expect(document.querySelectorAll("[data-line=column]")).toHaveLength(0);
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);

    drag(token("Brannoc"), [
      [5, 4],
      [7, 4],
    ]);
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
    drag(await card().findByRole("button", { name: /^Brannoc,/ }), [
      [5, 4],
      [9, 9],
    ]);
    expect(ruler()).toBeNull();
    token("Brannoc").focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(hint()).toHaveTextContent("Where everyone stood when it ended.");
    expect(card().queryByRole("button", { name: /off the board/ })).toBeNull();
    expect(moves()).toEqual([]);
  });
});

describe.each(layouts)("what the table sees of the map, on $layout", ({ wide }) => {
  beforeEach(() => {
    if (wide) onTheCanvas();
  });
  afterEach(() => vi.restoreAllMocks());

  const card = () => within(screen.getByRole("region", { name: "Battle map" }));
  const shareMap = () => screen.getByRole("switch", { name: "Share map" });
  /** Every write to the run itself, in the order they were sent. */
  const runPatches = () =>
    server.calls
      .filter((call) => call.method === "PATCH" && call.pathname.endsWith(`/runs/${liveRun.id}`))
      .map((call) => JSON.parse(call.body) as unknown);
  const answerRun = (run: Record<string, unknown>) =>
    server.routes.set(`PATCH ${serverRunBase()}`, { status: 200, body: { ...liveRun, ...run } });

  it("waits for the fight to be shared, then shares the map as a switch of its own", async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await waitFor(() => expect(shareMap()).toHaveAttribute("aria-disabled", "true"));
    // Off by default, fail closed.
    expect(shareMap()).toHaveAttribute("aria-checked", "false");

    answerRun({ visibility: "shared" });
    await userEvent.click(screen.getByRole("switch", { name: "Share" }));
    await waitFor(() => expect(shareMap()).not.toHaveAttribute("aria-disabled"));

    answerRun({ visibility: "shared", mapShown: true });
    await userEvent.click(shareMap());
    await waitFor(() => expect(shareMap()).toHaveAttribute("aria-checked", "true"));
    // Each switch writes itself and nothing else.
    expect(runPatches()).toEqual([{ visibility: "shared" }, { mapShown: true }]);

    // Unsharing the fight leaves the map where the DM put it, and waits again.
    answerRun({ visibility: "dm", mapShown: true });
    await userEvent.click(screen.getByRole("switch", { name: "Share" }));
    await waitFor(() => expect(shareMap()).toHaveAttribute("aria-disabled", "true"));
    expect(shareMap()).toHaveAttribute("aria-checked", "true");
    expect(runPatches().at(-1)).toEqual({ visibility: "dm" });
  });

  it("has no Share map for a fight with no board", async () => {
    reaim("/board", { status: 200, body: null });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByRole("switch", { name: "Share" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Share map" })).toBeNull();
  });

  it("has no Share map for a run that is not a fight, which shows players no board", async () => {
    // A conversation on the same board: the board is read, and still no switch.
    server.routes = liveScene("social");
    await renderRunner();
    await screen.findByRole("switch", { name: "Share" });
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/board"))).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("switch", { name: "Share map" })).toBeNull();
  });

  it("hides every monster token from the players at once, and fades them here", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        { ...brannocPlaced, visibility: "shared" },
        { ...goblinBoss, position: { column: 9, row: 4 }, visibility: "shared" },
      ],
    });
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    const boss = await card().findByRole("button", { name: /^Goblin Boss, column/ });
    const hide = card().getByRole("button", { name: "Hide from players" });
    expect(hide).toHaveAttribute("aria-pressed", "false");
    expect(boss.className).not.toMatch(/opacity-/);
    expect(boss.querySelector("[data-ring=hidden]")).toBeNull();

    answerRun({ hostileTokensHidden: true });
    await userEvent.click(hide);
    await waitFor(() => expect(hide).toHaveAttribute("aria-pressed", "true"));
    expect(runPatches()).toEqual([{ hostileTokensHidden: true }]);
    // Off the players' board: faded and dashed here, the party untouched.
    const hidden = card().getByRole("button", { name: /^Goblin Boss, column/ });
    expect(hidden.className).toMatch(/opacity-70/);
    expect(hidden.querySelector("[data-ring=hidden]")).not.toBeNull();
    const brannocToken = card().getByRole("button", { name: /^Brannoc, column/ });
    expect(brannocToken.className).not.toMatch(/opacity-/);
    expect(brannocToken.querySelector("[data-ring=hidden]")).toBeNull();

    answerRun({ hostileTokensHidden: false });
    await userEvent.click(hide);
    await waitFor(() => expect(hide).toHaveAttribute("aria-pressed", "false"));
    expect(runPatches().at(-1)).toEqual({ hostileTokensHidden: false });
  });

  it("changes nothing once the fight is over", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, endedAt: liveRun.startedAt } });
      }
    }
    await renderRunner();
    await screen.findByText(/came off the table/);
    expect(screen.queryByRole("switch", { name: "Share map" })).toBeNull();
    expect(await card().findByRole("button", { name: "Hide from players" })).toBeDisabled();
  });
});

describe("the canvas", () => {
  beforeEach(() => {
    onTheCanvas();
  });
  afterEach(() => vi.restoreAllMocks());

  const stage = () => document.querySelector<HTMLElement>("[data-slot=run-stage]");
  const hud = (name: string) => {
    const found = document.querySelector<HTMLElement>(`[data-slot=run-hud-${name}]`);
    if (found === null) throw new Error(`no ${name} region on the stage`);
    return found;
  };
  const board = () => screen.getByRole("region", { name: "Battle map" });
  const content = () =>
    document.querySelector<HTMLElement>("[data-slot=board-canvas-content]") as HTMLElement;
  const canvasEl = () => document.querySelector<HTMLElement>("[data-slot=board-canvas]")!;
  const zoomOf = () => Number(content().style.getPropertyValue("--zoom"));
  const panOf = () => ({
    x: parseFloat(content().style.getPropertyValue("--pan-x")),
    y: parseFloat(content().style.getPropertyValue("--pan-y")),
  });

  const open = async () => {
    await renderRunner();
    await waitFor(() => expect(stage()).not.toBeNull());
    await waitFor(() => expect(board()).toBeInTheDocument());
  };

  it("floats every card the runner keeps over the board, each in its home", async () => {
    await open();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());

    // No grid: the stage is the layout.
    expect(document.querySelector("[data-slot=run-layout]")).toBeNull();
    expect(stage()).toContainElement(board());
    // The board is the canvas's content, drawn at its plane's own size.
    expect(content()).toContainElement(board().querySelector("[data-slot=battle-map]"));
    expect(content().style.getPropertyValue("--board-w")).toBe(`${String(24 * 64)}px`);

    // Initiative, across the top; nothing rolls initiative in the column under it.
    expect(hud("strip")).toContainElement(screen.getByRole("list", { name: "Initiative order" }));
    expect(document.querySelector("[data-slot=run-hud-rolling]")).toBeNull();
    // The selected creature leads the right-hand panel, the table's own cards under it.
    const sheet = screen.getByRole("region", { name: "Selected combatant" });
    expect(hud("panel").firstElementChild).toBe(sheet);
    expect(hud("panel")).toContainElement(
      screen.getByRole("region", { name: "Hob's direct spends" }),
    );
    expect(hud("panel")).toContainElement(
      screen.getByText("Open at the table", { selector: "h3" }),
    );
    // The *Rolls* dock — the DM's dice, the players' tray and the log — bottom left.
    expect(hud("rolls").firstElementChild).toBe(screen.getByRole("region", { name: "Rolls" }));
    // The board's switches, zoom, hint, tray and size, in the tool dock over it.
    const tools = within(hud("tools"));
    expect(tools.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    expect(tools.getByRole("button", { name: "Hide from players" })).toBeInTheDocument();
    expect(tools.getByRole("group", { name: "Zoom" })).toBeInTheDocument();
    expect(tools.getByRole("button", { name: /^Names on tokens/ })).toBeInTheDocument();
    expect(tools.getByRole("status")).toHaveTextContent(
      "Drag Brannoc to a square, or step with the arrow keys.",
    );
    expect(tools.getByRole("group", { name: "Not on the board" })).toBeInTheDocument();
    expect(hud("tools")).toHaveTextContent("24 × 16 squares · 5 ft each · 120 × 80 ft");
    // The header keeps the fight's switches and its one peach.
    expect(screen.getByRole("switch", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next turn" })).toBeInTheDocument();
    // Every floating region is on the one HUD rung.
    expect(hud("strip").parentElement?.className).toMatch(/(^|\s)z-hud(\s|$)/);
    for (const name of ["left", "panel"]) expect(hud(name).closest(".z-hud")).not.toBeNull();
    expect(hud("tools").parentElement?.className).toMatch(/(^|\s)z-hud(\s|$)/);
  });

  it("bounds the screen to the viewport under the chrome, and lets each panel scroll itself", async () => {
    await open();
    const screenBox = document.querySelector<HTMLElement>("[data-slot=run-screen]")!;
    expect(screenBox.className).toContain("var(--chrome-height)");
    for (const name of ["rolls", "panel"]) expect(hud(name).className).toMatch(/overflow-y-auto/);
  });

  it("zooms from the dock and fits the board back", async () => {
    await open();
    const before = zoomOf();
    await userEvent.click(within(hud("tools")).getByRole("button", { name: "Zoom in" }));
    expect(zoomOf()).toBeCloseTo(before * 1.25);
    await userEvent.click(within(hud("tools")).getByRole("button", { name: "Zoom out" }));
    await userEvent.click(within(hud("tools")).getByRole("button", { name: "Zoom out" }));
    expect(zoomOf()).toBeCloseTo(before / 1.25);
    // Nothing on the canvas is a write.
    expect(server.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("pans on a scroll and zooms on a pinch, and the page itself never scrolls for either", async () => {
    await open();
    const zoom = zoomOf();
    const scrolled = fireEvent.wheel(canvasEl(), { deltaX: 30, deltaY: 40 });
    expect(scrolled).toBe(false);
    expect(zoomOf()).toBe(zoom);
    expect(panOf().x).toBeCloseTo(-30);
    expect(panOf().y).toBeCloseTo(-40);

    const pinched = fireEvent.wheel(canvasEl(), { deltaY: -100, ctrlKey: true });
    expect(pinched).toBe(false);
    expect(zoomOf()).toBeGreaterThan(zoom);
  });

  it("pans on a drag over the board, and the drag's click puts nobody down", async () => {
    server.routes.set(`POST ${serverRunBase()}/combatants/${goblinBoss.id}/move`, {
      status: 200,
      body: { ...goblinBoss, position: { column: 1, row: 1 } },
    });
    await open();
    await waitFor(() =>
      expect(within(board()).getByRole("button", { name: /^Brannoc,/ })).toBeInTheDocument(),
    );
    // The Goblin Boss is in the tray, so a click on a square would put him down.
    await userEvent.click(
      within(hud("tools")).getByRole("button", { name: "Goblin Boss, not on the board" }),
    );
    vi.spyOn(
      document.querySelector<HTMLElement>("[data-slot=run-tokens]")!,
      "getBoundingClientRect",
    ).mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }));
    const squares = document.querySelector<HTMLElement>("[data-slot=run-board-squares]")!;

    fireEvent.pointerDown(squares, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(squares, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(squares, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.click(squares, { detail: 1, clientX: 160, clientY: 130 });

    expect(panOf().x).toBeCloseTo(60);
    expect(panOf().y).toBeCloseTo(30);
    expect(server.calls.some((call) => call.pathname.endsWith("/move"))).toBe(false);

    // A press that does not travel is still the click that puts him down.
    fireEvent.pointerDown(squares, { pointerId: 2, button: 0, clientX: 15, clientY: 15 });
    fireEvent.pointerUp(squares, { pointerId: 2, clientX: 15, clientY: 15 });
    fireEvent.click(squares, { detail: 1, clientX: 15, clientY: 15 });
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/move"))).toBe(true),
    );
    expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: { column: 1, row: 1 } });
  });

  it("moves a token dragged on the canvas, and pans nothing", async () => {
    await open();
    const brannocToken = await within(board()).findByRole("button", { name: /^Brannoc,/ });
    const before = panOf();
    vi.spyOn(
      document.querySelector<HTMLElement>("[data-slot=run-tokens]")!,
      "getBoundingClientRect",
    ).mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }));

    fireEvent.pointerDown(brannocToken, { pointerId: 3, button: 0, clientX: 55, clientY: 45 });
    fireEvent.pointerMove(brannocToken, { pointerId: 3, clientX: 75, clientY: 45 });
    fireEvent.pointerUp(brannocToken, { pointerId: 3, clientX: 75, clientY: 45 });
    fireEvent.click(brannocToken, { detail: 1, clientX: 75, clientY: 45 });

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/move")).toMatchObject({ position: { column: 7, row: 4 } }),
    );
    expect(panOf()).toEqual(before);
  });

  it("lets the next click through after a drag that was cancelled", async () => {
    await open();
    await waitFor(() =>
      expect(within(board()).getByRole("button", { name: /^Brannoc,/ })).toBeInTheDocument(),
    );
    const squares = document.querySelector<HTMLElement>("[data-slot=run-board-squares]")!;

    fireEvent.pointerDown(squares, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(squares, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.pointerCancel(squares, { pointerId: 1, clientX: 160, clientY: 130 });
    expect(panOf().x).toBeCloseTo(60);

    server.routes.set(`POST ${serverRunBase()}/combatants/${goblinBoss.id}/move`, {
      status: 200,
      body: { ...goblinBoss, position: { column: 1, row: 1 } },
    });
    await userEvent.click(
      within(hud("tools")).getByRole("button", { name: "Goblin Boss, not on the board" }),
    );
    vi.spyOn(
      document.querySelector<HTMLElement>("[data-slot=run-tokens]")!,
      "getBoundingClientRect",
    ).mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }));
    fireEvent.pointerDown(squares, { pointerId: 2, button: 0, clientX: 15, clientY: 15 });
    fireEvent.pointerUp(squares, { pointerId: 2, clientX: 15, clientY: 15 });
    fireEvent.click(squares, { detail: 1, clientX: 15, clientY: 15 });
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/move"))).toBe(true),
    );
  });

  it("swallows the click of a finger that drifted into a pan, and lets a keyboard press through", async () => {
    // jsdom's PointerEvent carries no pointerType, so a fired pointer event would have none.
    const jsdomPointer = Object.getOwnPropertyDescriptor(window, "PointerEvent");
    class TouchPointer extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? "";
      }
    }
    Object.defineProperty(window, "PointerEvent", { value: TouchPointer, configurable: true });
    try {
      await open();
      await waitFor(() =>
        expect(within(board()).getByRole("button", { name: /^Brannoc,/ })).toBeInTheDocument(),
      );
      const squares = document.querySelector<HTMLElement>("[data-slot=run-board-squares]")!;
      server.routes.set(`POST ${serverRunBase()}/combatants/${brannoc.id}/move`, {
        status: 200,
        body: { ...brannocPlaced, position: { column: 1, row: 1 } },
      });
      vi.spyOn(squares, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }),
      );
      const touch = { pointerId: 1, pointerType: "touch", button: 0 };

      fireEvent.pointerDown(squares, { ...touch, clientX: 9, clientY: 15 });
      fireEvent.pointerMove(squares, { ...touch, clientX: 15, clientY: 15 });
      fireEvent.pointerUp(squares, { ...touch, clientX: 15, clientY: 15 });
      fireEvent.click(squares, { detail: 1, clientX: 15, clientY: 15 });

      expect(panOf().x).toBeCloseTo(6);

      fireEvent.pointerDown(squares, { ...touch, pointerId: 2, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(squares, { ...touch, pointerId: 2, clientX: 106, clientY: 100 });
      fireEvent.pointerUp(squares, { ...touch, pointerId: 2, clientX: 106, clientY: 100 });
      await userEvent.click(rowFor("Goblin Boss"));
      const token = within(board()).getByRole("button", { name: /^Brannoc,/ });
      await waitFor(() => expect(token).toHaveAttribute("aria-pressed", "false"));
      fireEvent.click(token, { detail: 0 });
      expect(token).toHaveAttribute("aria-pressed", "true");
      expect(server.calls.some((call) => call.pathname.endsWith("/move"))).toBe(false);
    } finally {
      // Put jsdom's own back, which later tests fire pointer events through.
      if (jsdomPointer === undefined) Reflect.deleteProperty(window, "PointerEvent");
      else Object.defineProperty(window, "PointerEvent", jsdomPointer);
    }
  });

  it("is the grid again for a fight with no board, which has nothing to pan", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, { status: 200, body: null });
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await waitFor(() =>
      expect(document.querySelector("[data-slot=run-layout]")?.className).not.toContain("map"),
    );
    expect(stage()).toBeNull();
    expect(screen.queryByRole("region", { name: "Battle map" })).toBeNull();
  });

  it("puts Roll initiative top left in the strip's place, and keeps Start round as the one way in", async () => {
    server.routes.set(`GET ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, phase: "initiative", activeCombatantId: null },
    });
    await open();
    const roll = await screen.findByRole("region", { name: "Roll initiative" });
    expect(hud("rolling")).toContainElement(roll);
    expect(hud("left").firstElementChild).toBe(hud("rolling"));
    // A box per row wants a column: nothing runs across the top while rolling.
    expect(document.querySelector("[data-slot=run-hud-strip]")).toBeNull();
    expect(hud("rolling").className).toMatch(/overflow-y-auto/);
    expect(screen.getAllByRole("button", { name: /Start round/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Next turn" })).toBeNull();
  });

  it("keeps the ended and behind lines above the stage", async () => {
    for (const [key, answer] of [...server.routes]) {
      if (key.startsWith("GET") && key.endsWith(liveRun.id)) {
        server.routes.set(key, { ...answer, body: { ...liveRun, endedAt: liveRun.startedAt } });
      }
    }
    await open();
    const ended = await screen.findByText(/came off the table/);
    expect(stage()).not.toContainElement(ended);
    expect(ended.compareDocumentPosition(stage()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Over, nothing on the board moves.
    expect(within(hud("tools")).getByRole("status")).toHaveTextContent(
      "Where everyone stood when it ended.",
    );
  });
});

describe.each(layouts)("an attack, on $layout", ({ wide }) => {
  beforeEach(() => {
    if (wide) onTheCanvas();
    // Brannoc is up, and his sheet carries a Longsword to swing; the Goblin
    // Boss stands on the board beside him, AC 17.
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: runParty.map((seat) => ({
        ...seat,
        character: {
          ...seat.character,
          sheet: {
            ...seat.character.sheet,
            actions: [
              {
                id: "atk:longsword",
                name: "Longsword",
                cost: "action",
                hit: "+7",
                dice: "1d8+4",
                damageType: "Slashing",
                source: "weapon",
              },
            ],
          },
        },
      })),
    });
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, position: { column: 7, row: 4 } }],
    });
    server.routes.set(`POST ${serverRunBase()}/combatants/${brannoc.id}/turn`, {
      status: 200,
      body: { ...brannocPlaced, actionUsed: true },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const actions = () => within(panel().getByRole("region", { name: "Actions of Brannoc" }));
  const result = () =>
    within(panel().getByRole("region", { name: "Attack result, Longsword → Goblin Boss" }));
  const banner = () => screen.queryByText("Pick a target for Longsword");
  const damages = () =>
    server.calls.filter((call) => call.method === "POST" && call.pathname.endsWith("/damage"));
  const sentBody = (index: number): unknown => JSON.parse(String(damages()[index]!.body));

  /** The dice, in the order the attack throws them: the d20, then the damage. */
  const seed = (...values: ReadonlyArray<number>) => {
    const random = vi.spyOn(Math, "random");
    for (const value of values) random.mockReturnValueOnce(value);
  };

  /** Click whoever is the target: their token on the canvas, their row in the grid. */
  const pick = async (name: string) => {
    if (wide) {
      await userEvent.click(
        within(screen.getByRole("region", { name: "Battle map" })).getByRole("button", {
          name: new RegExp(`^${name}, column`),
        }),
      );
    } else {
      await userEvent.click(rowFor(name));
    }
  };

  const open = async () => {
    await renderRunner();
    await waitFor(() => expect(actions().getByRole("button", { name: "Attack with Longsword" })));
  };

  it("asks for a target, resolves a hit against its AC, and Apply sends the damage as a delta", async () => {
    await open();
    const attack = actions().getByRole("button", { name: "Attack with Longsword" });
    // Outline, so that *Next turn* stays the screen's one peach.
    expect(attack).not.toHaveClass("bg-accent");
    expect(
      [...document.querySelectorAll('[data-slot="button"].bg-accent')].map((b) => b.textContent),
    ).toEqual(["Next turn"]);

    await userEvent.click(attack);
    expect(banner()).toBeInTheDocument();
    expect(attack).toHaveAttribute("aria-pressed", "true");
    // Whatever can be the target says so.
    expect(document.querySelector("[data-slot=run-screen]")?.className).toContain(
      "cursor-crosshair",
    );

    // d20 19 + 7 = 26 against 17; the d8 a 5, + 4.
    seed(0.9, 0.5);
    await pick("Goblin Boss");

    expect(banner()).toBeNull();
    // The card is the attacker's: the panel still shows Brannoc.
    expect(panel().getByText("Brannoc")).toBeInTheDocument();
    expect(result().getByText("Hit")).toBeInTheDocument();
    expect(result().getByText("d20 19 +7 = 26 vs AC 17")).toBeInTheDocument();
    expect(result().getByText("1d8+4 [5] = 9 slashing")).toBeInTheDocument();
    // Picking a target moves nobody; the one write is his turn's Action, spent.
    await waitFor(() =>
      expect(server.calls.filter((call) => call.method !== "GET")).toHaveLength(1),
    );
    expect(bodyOf(server, "POST", "/turn")).toEqual({
      actionUsed: true,
      requestId: expect.any(String),
    });
    await waitFor(() =>
      expect(
        within(panel().getByRole("region", { name: "This turn of Brannoc" })).getByRole("button", {
          name: "Action",
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    // The attack is in the dock.
    expect(within(dock().getByRole("status", { name: "Latest roll" })).getByText("Hit"));
    expect(dock().getByText("Brannoc · Longsword → Goblin Boss")).toBeInTheDocument();

    await userEvent.click(result().getByRole("button", { name: "Apply 9 damage" }));
    await waitFor(() => expect(damages()).toHaveLength(1));
    const sent = damages()[0]!;
    expect(sent.pathname).toContain(`/combatants/${goblinBoss.id}/damage`);
    expect(sentBody(0)).toEqual({ amount: 9, requestId: expect.any(String) });
    // Once: the card stays to read, without its buttons.
    expect(result().queryByRole("button", { name: "Apply 9 damage" })).toBeNull();
    expect(result().queryByRole("button", { name: /Apply half/ })).toBeNull();
    await userEvent.click(result().getByRole("button", { name: "Dismiss" }));
    expect(panel().queryByRole("region", { name: /Attack result/ })).toBeNull();
  });

  it("sends half the damage, rounded down", async () => {
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0.9, 0.5);
    await pick("Goblin Boss");
    await userEvent.click(result().getByRole("button", { name: "Apply half, 4 damage" }));
    await waitFor(() => expect(damages()).toHaveLength(1));
    expect(sentBody(0)).toEqual({ amount: 4, requestId: expect.any(String) });
  });

  it("crits on a natural 20, doubling the dice, and says so to the damage write", async () => {
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0.99, 0.5, 0.25);
    await pick("Goblin Boss");
    expect(result().getByText("Critical hit")).toBeInTheDocument();
    expect(result().getByText("d20 20 +7 = 27 vs AC 17")).toBeInTheDocument();
    expect(result().getByText("2d8+4 [5, 3] = 12 slashing")).toBeInTheDocument();

    await userEvent.click(result().getByRole("button", { name: "Apply 12 damage" }));
    await waitFor(() => expect(damages()).toHaveLength(1));
    expect(sentBody(0)).toEqual({
      amount: 12,
      critical: true,
      requestId: expect.any(String),
    });
  });

  it("misses on a natural 1, with nothing to apply", async () => {
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0);
    await pick("Goblin Boss");
    expect(result().getByText("Natural 1")).toBeInTheDocument();
    expect(result().getByText("d20 1 +7 = 8 vs AC 17")).toBeInTheDocument();
    expect(result().queryByRole("button", { name: /Apply/ })).toBeNull();
    expect(within(dock().getByRole("status", { name: "Latest roll" })).getByText("Miss"));
  });

  it("names the save a concentrating target owes", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        brannocPlaced,
        { ...goblinBoss, position: { column: 7, row: 4 }, conditions: ["Concentrating"] },
      ],
    });
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0.9, 0.5);
    await pick("Goblin Boss");
    expect(result().getByText("Goblin Boss is concentrating. Con save DC 10.")).toBeInTheDocument();
  });

  it("names the save for what Half sent, and none for a hit that drops the target", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [
        brannocPlaced,
        {
          ...goblinBoss,
          hpCurrent: 8,
          position: { column: 7, row: 4 },
          conditions: ["Concentrating"],
        },
      ],
    });
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    // 9 damage against 8 hit points: down, and a creature at 0 owes no save.
    seed(0.9, 0.5);
    await pick("Goblin Boss");
    expect(result().queryByText(/is concentrating/)).toBeNull();

    await userEvent.click(result().getByRole("button", { name: "Apply half, 4 damage" }));
    await waitFor(() => expect(damages()).toHaveLength(1));
    expect(result().getByText("Goblin Boss is concentrating. Con save DC 10.")).toBeInTheDocument();
  });

  it("puts the pick away on Cancel and on Esc, and the attacker is no target", async () => {
    await open();
    const attack = actions().getByRole("button", { name: "Attack with Longsword" });
    await userEvent.click(attack);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(banner()).toBeNull();

    await userEvent.click(attack);
    // The attacker picks nothing and the pick waits.
    await pick("Brannoc");
    expect(banner()).toBeInTheDocument();
    // An Esc meant for the Hob panel is the panel's, and is left alone.
    const hob = document.createElement("section");
    hob.setAttribute("aria-label", "Hob");
    const field = hob.appendChild(document.createElement("textarea"));
    document.body.append(hob);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(banner()).toBeInTheDocument();
    hob.remove();
    // Any other Esc puts it away, wherever focus has gone.
    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false);
    expect(banner()).toBeNull();
    await userEvent.click(attack);
    fireEvent.keyDown(attack, { key: "Escape" });
    expect(banner()).toBeNull();
    // With no pick, a click selects again.
    await pick("Goblin Boss");
    expect(panel().getByText("Goblin Boss")).toBeInTheDocument();
  });

  it("ends the attack when Make it their turn moves the turn", async () => {
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0.9, 0.5);
    await pick("Goblin Boss");
    expect(result().getByText("Hit")).toBeInTheDocument();

    server.routes.set(`PATCH ${serverRunBase()}`, {
      status: 200,
      body: { ...liveRun, activeCombatantId: goblinBoss.id },
    });
    await userEvent.click(rowFor("Goblin Boss"));
    await userEvent.click(
      (await panelMenu("Goblin Boss")).getByRole("menuitem", { name: "Make it their turn" }),
    );
    await waitFor(() => expect(rowFor("Goblin Boss")).toHaveAttribute("aria-current", "step"));

    // Back to Brannoc's turn: the card went with the turn and does not return.
    server.routes.set(`PATCH ${serverRunBase()}`, { status: 200, body: liveRun });
    await userEvent.click(rowFor("Brannoc"));
    await userEvent.click(
      (await panelMenu("Brannoc")).getByRole("menuitem", { name: "Make it their turn" }),
    );
    await waitFor(() => expect(rowFor("Brannoc")).toHaveAttribute("aria-current", "step"));
    expect(screen.queryByRole("region", { name: /Attack result/ })).toBeNull();
  });

  it("ends the attack with the turn", async () => {
    await open();
    await userEvent.click(actions().getByRole("button", { name: "Attack with Longsword" }));
    seed(0.9, 0.5);
    await pick("Goblin Boss");
    expect(result().getByText("Hit")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Attack result/ })).toBeNull());
  });

  it("rolls for a creature that is not up, to-hit and damage together, with no target", async () => {
    await open();
    await pick("Goblin Boss");
    const lines = within(panel().getByRole("region", { name: "Actions of Goblin Boss" }));
    expect(lines.queryByRole("button", { name: /^Attack/ })).toBeNull();
    seed(0.5);
    await userEvent.click(lines.getByRole("button", { name: "Roll Scimitar" }));
    const latest = within(dock().getByRole("status", { name: "Latest roll" }));
    expect(latest.getByText("Goblin Boss · Scimitar")).toBeInTheDocument();
    expect(latest.getByText("1d6+2 = 6")).toBeInTheDocument();
    expect(server.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
  });
});

describe("the rolls dock", () => {
  /** A log line as the server stamps it on its kind. */
  const line = (seq: number, kind: string, combatantId: string | null, payload: unknown) => ({
    ...sessionEvent(seq, kind, combatantId),
    payload,
  });

  it("prints each kind of line the night's log carries", async () => {
    await renderRunner();
    await waitFor(() => expect(rows()).toHaveLength(2));
    server.emit(
      line(11, "combatant-damaged", goblinBoss.id, {
        amount: 12,
        hpBefore: 21,
        hpCurrent: 9,
        hpMax: 21,
        concentrationDc: 10,
      }),
    );
    server.emit(
      line(12, "combatant-damaged", brannoc.id, {
        amount: -6,
        hpBefore: 38,
        hpCurrent: 44,
        hpMax: 52,
      }),
    );
    server.emit(
      line(13, "death-save", brannoc.id, { face: 14, successes: 1, failures: 0, hpCurrent: 0 }),
    );
    server.emit(
      line(14, "combatant-updated", goblinBoss.id, {
        hpCurrent: 0,
        conditionsRemoved: ["Concentrating"],
      }),
    );
    server.emit(line(15, "turn-advanced", goblinBoss.id, {}));

    await waitFor(() =>
      expect(dock().getByRole("button", { name: /^Rolls/ })).toHaveTextContent("6 in log"),
    );
    await openDock();
    const text = (label: string) =>
      (dock().getByText(label).closest("li, [role=status]") as HTMLElement).textContent;
    expect(text("Goblin Boss takes damage")).toBe("Goblin Boss takes damage21 → 9 hp−12");
    expect(text("Goblin Boss · Concentration check")).toBe(
      "Goblin Boss · Concentration checkCon save DC 10DC 10",
    );
    expect(text("Brannoc is healed")).toBe("Brannoc is healed38 → 44 hp+6");
    expect(text("Brannoc · Death save")).toBe(
      "Brannoc · Death save1d20 = 14 · 1 success · 0 failures14",
    );
    expect(text("Goblin Boss · Conditions")).toBe("Goblin Boss · ConditionsConcentrating removed");
    expect(text("Goblin Boss is up")).toBe("Goblin Boss is up");
  });
});

describe("this turn", () => {
  const turnRoute = (id: string) => `POST ${serverRunBase()}/combatants/${id}/turn`;
  const thisTurn = () => within(panel().getByRole("region", { name: /^This turn of / }));
  const combatantsRead = () =>
    server.calls.filter(
      (call) => call.method === "GET" && call.pathname.endsWith(`${liveRun.id}/combatants`),
    ).length;

  it("is drawn for whoever is up, and for nobody else", async () => {
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());
    expect(panel().getByRole("region", { name: "This turn of Brannoc" })).toBeInTheDocument();

    await userEvent.click(rowFor("Goblin Boss"));
    await waitFor(() => expect(panel().getByText("Goblin Boss")).toBeInTheDocument());
    expect(panel().queryByRole("region", { name: /^This turn of / })).toBeNull();
  });

  it("marks the action used and unmarks it, through the turn write", async () => {
    server.routes.set(turnRoute(brannoc.id), {
      status: 200,
      body: { ...brannocPlaced, actionUsed: true },
    });
    await renderRunner();
    await waitFor(() => expect(panel().getByText("Brannoc")).toBeInTheDocument());
    const action = thisTurn().getByRole("button", { name: "Action" });
    expect(action).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(action);
    await waitFor(() =>
      expect(thisTurn().getByRole("button", { name: "Action" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(bodyOf(server, "POST", "/turn")).toMatchObject({
      actionUsed: true,
      requestId: expect.any(String),
    });

    server.routes.set(turnRoute(brannoc.id), {
      status: 200,
      body: { ...brannocPlaced, actionUsed: false },
    });
    server.calls.length = 0;
    await userEvent.click(thisTurn().getByRole("button", { name: "Action" }));
    await waitFor(() =>
      expect(thisTurn().getByRole("button", { name: "Action" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(bodyOf(server, "POST", "/turn")).toMatchObject({ actionUsed: false });
    // Nothing outside the fight reads a turn's spending.
    expect(server.calls.filter((call) => call.method === "GET")).toEqual([]);
  });

  it("says the feet walked against the speed, in red once past it", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [{ ...brannocPlaced, feetMoved: 10 }, goblinBoss],
    });
    await renderRunner();
    const moved = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("[data-slot=movement]");
      if (found === null) throw new Error("no movement line");
      return found;
    });
    // Brannoc's sheet says 25 ft.
    expect(moved).toHaveTextContent("10/25 ft");
    expect(moved).not.toHaveClass("text-danger");
    expect(document.querySelector("[data-slot=movement-fill]")).toHaveClass("bg-accent");
  });

  it("goes red once the feet walked are past the speed", async () => {
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [{ ...brannocPlaced, feetMoved: 35 }, goblinBoss],
    });
    await renderRunner();
    await waitFor(() =>
      expect(document.querySelector("[data-slot=movement]")).toHaveTextContent("35/25 ft"),
    );
    expect(document.querySelector("[data-slot=movement]")).toHaveClass("text-danger");
    const fill = document.querySelector<HTMLElement>("[data-slot=movement-fill]");
    expect(fill).toHaveClass("bg-danger");
    expect(fill?.style.width).toBe("100%");
  });

  it("starts whoever comes up on a fresh turn, as the server has it", async () => {
    // The Goblin Boss still holds his last turn's spending until the marker
    // lands on him; the server clears it then.
    server.routes.set(`GET ${serverRunBase()}/combatants`, {
      status: 200,
      body: [brannocPlaced, { ...goblinBoss, actionUsed: true, reactionUsed: true, feetMoved: 30 }],
    });
    await renderRunner();
    await screen.findByText("Brannoc is up · Goblin Boss next");
    const before = combatantsRead();

    await userEvent.click(screen.getByRole("button", { name: "Next turn" }));

    await screen.findByText("Goblin Boss is up · Brannoc next");
    await waitFor(() =>
      expect(panel().getByRole("region", { name: "This turn of Goblin Boss" })).toBeInTheDocument(),
    );
    // From the write's own answer, so it holds with the stream down: nothing
    // was re-read to learn it.
    expect(combatantsRead()).toBe(before);
    await waitFor(() =>
      expect(thisTurn().getByRole("button", { name: "Action" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(thisTurn().getByRole("button", { name: "Reaction" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(document.querySelector("[data-slot=movement]")).toHaveTextContent("0/30 ft");
  });
});

describe("the Fog tool, on the canvas", () => {
  beforeEach(() => {
    onTheCanvas();
  });
  afterEach(() => vi.restoreAllMocks());

  const fogRoute = () => `PATCH ${serverRunBase()}/board/fog`;
  const fogCalls = () =>
    server.calls
      .filter((call) => call.method === "PATCH" && call.pathname.endsWith("/board/fog"))
      .map((call) => JSON.parse(call.body) as Record<string, unknown>);
  const fogSwitch = () => screen.getByRole("button", { name: "Fog" });
  const brush = () => document.querySelector<HTMLElement>("[data-slot=fog-brush]");
  /** The DM's fog over the wide board: how many squares it dims, or 0 when there is none. */
  const dimmed = () =>
    Number(
      document.querySelector<SVGElement>("[data-slot=run-tokens] [data-slot=fog][data-veil=dim]")
        ?.dataset.squares ?? 0,
    );

  /** The runner on its canvas with the Fog tool on, its brush laid out ten pixels a square. */
  const openFog = async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await userEvent.click(await screen.findByRole("button", { name: "Fog" }));
    const layer = brush();
    if (layer === null) throw new Error("no brush");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 240, height: 160 }),
    );
    return layer;
  };
  const middle = (column: number, row: number) => ({
    clientX: column * 10 + 5,
    clientY: row * 10 + 5,
  });
  /** Press on the first square, carry the brush over the rest, and let go on the last. */
  const paint = (layer: HTMLElement, path: ReadonlyArray<readonly [number, number]>) => {
    fireEvent.pointerDown(layer, { pointerId: 3, button: 0, ...middle(...path[0]!) });
    for (const square of path.slice(1)) {
      fireEvent.pointerMove(layer, { pointerId: 3, ...middle(...square) });
    }
    fireEvent.pointerUp(layer, { pointerId: 3, ...middle(...path.at(-1)!) });
  };
  const row3 = (...columns: ReadonlyArray<number>) => columns.map((column) => ({ column, row: 3 }));

  it("hides a stroke's squares in one write, painted before the server answers", async () => {
    server.routes.set(fogRoute(), { status: 200, body: { ...runBoard, fog: row3(2, 3, 4, 5) } });
    const release = server.hold("/board/fog");
    const layer = await openFog();
    expect(fogSwitch()).toHaveAttribute("aria-pressed", "true");

    // A fast pointer skips a square between two events; the stroke still takes it.
    paint(layer, [
      [2, 3],
      [3, 3],
      [5, 3],
    ]);

    await waitFor(() => expect(fogCalls()).toHaveLength(1));
    expect(fogCalls()[0]).toEqual({ hide: row3(2, 3, 4, 5), requestId: expect.any(String) });
    // Painted while the write is on its way.
    expect(dimmed()).toBe(4);
    release();
    await waitFor(() => expect(dimmed()).toBe(4));
    expect(server.calls.filter((call) => call.pathname.endsWith("/move"))).toEqual([]);
    // It changes what a seated player's board draws, and nothing else outside
    // the fight; see the condition test above for why the list is what is pinned.
    expect(boardFogWrites(campaignId)).toEqual([reads.playerTable(campaignId)]);
  });

  it("reveals with a stroke that starts under fog, whatever it crosses", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, {
      status: 200,
      body: { ...runBoard, fog: row3(2, 3, 4) },
    });
    server.routes.set(fogRoute(), { status: 200, body: { ...runBoard, fog: row3(2) } });
    const layer = await openFog();
    await waitFor(() => expect(dimmed()).toBe(3));

    paint(layer, [
      [3, 3],
      [4, 3],
      [5, 3],
    ]);

    await waitFor(() => expect(fogCalls()).toHaveLength(1));
    expect(fogCalls()[0]).toEqual({ reveal: row3(3, 4, 5), requestId: expect.any(String) });
    await waitFor(() => expect(dimmed()).toBe(1));
  });

  it("paints over a token rather than dragging it", async () => {
    server.routes.set(fogRoute(), {
      status: 200,
      body: { ...runBoard, fog: [{ column: 5, row: 4 }] },
    });
    const layer = await openFog();
    // Brannoc stands on the sixth square across and the fifth down.
    paint(layer, [[5, 4]]);
    await waitFor(() => expect(fogCalls()).toHaveLength(1));
    expect(fogCalls()[0]).toMatchObject({ hide: [{ column: 5, row: 4 }] });
    expect(server.calls.filter((call) => call.pathname.endsWith("/move"))).toEqual([]);
    // The DM still sees him, under the fog.
    await waitFor(() => expect(dimmed()).toBe(1));
    expect(
      within(screen.getByRole("region", { name: "Battle map" })).getByRole("button", {
        name: /^Brannoc, column 6/,
      }),
    ).toBeInTheDocument();
  });

  it("reveals the board, covers it and resets it, one write each", async () => {
    server.routes.set(fogRoute(), { status: 200, body: { ...runBoard, fog: [] } });
    const release = server.hold("/board/fog");
    await openFog();
    const fog = within(screen.getByRole("group", { name: "Fog" }));

    await userEvent.click(fog.getByRole("button", { name: "Cover all" }));
    // Covered at once, before the answer.
    expect(dimmed()).toBe(24 * 16);
    await waitFor(() => expect(fogCalls()).toHaveLength(1));
    release();
    await userEvent.click(fog.getByRole("button", { name: "Reveal all" }));
    await userEvent.click(fog.getByRole("button", { name: "Reset fog" }));

    await waitFor(() => expect(fogCalls()).toHaveLength(3));
    expect(fogCalls()).toEqual([
      { coverAll: true, requestId: expect.any(String) },
      { revealAll: true, requestId: expect.any(String) },
      { reset: true, requestId: expect.any(String) },
    ]);
    await waitFor(() => expect(dimmed()).toBe(0));
  });

  it("puts the fog back as the server holds it when a write is refused, and says so", async () => {
    server.routes.set(fogRoute(), {
      status: 409,
      body: { _tag: "Conflict", message: "that square is off the board" },
    });
    const layer = await openFog();
    paint(layer, [[2, 3]]);
    await screen.findByText("The fog did not change");
    await waitFor(() => expect(dimmed()).toBe(0));
  });

  it("leaves the tool on Esc, but not on an Esc meant for Hob", async () => {
    await openFog();
    const hob = document.createElement("section");
    hob.setAttribute("aria-label", "Hob");
    const input = document.createElement("input");
    hob.append(input);
    document.body.append(hob);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(fogSwitch()).toHaveAttribute("aria-pressed", "true");
    hob.remove();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(fogSwitch()).toHaveAttribute("aria-pressed", "false"));
    expect(brush()).toBeNull();
    expect(screen.queryByRole("group", { name: "Fog" })).toBeNull();
    expect(fogCalls()).toEqual([]);
  });

  it("re-reads the board when another of the DM's tabs paints the fog", async () => {
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await waitFor(() => expect(server.open()).toBeGreaterThan(0));
    const reads = () =>
      server.calls.filter((call) => call.method === "GET" && call.pathname.endsWith("/board"))
        .length;
    const before = reads();
    server.routes.set(`GET ${serverRunBase()}/board`, {
      status: 200,
      body: { ...runBoard, fog: row3(7, 8) },
    });
    server.emit(sessionEvent(20, "board-fog-updated"));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    await waitFor(() => expect(dimmed()).toBe(2));
  });
});

describe("the fog, on the narrow grid", () => {
  it("dims the fogged squares for the DM, and offers no brush where the board takes no pointer", async () => {
    server.routes.set(`GET ${serverRunBase()}/board`, {
      status: 200,
      body: { ...runBoard, fog: [{ column: 0, row: 0 }] },
    });
    await renderRunner();
    await screen.findByRole("region", { name: "Battle map" });
    await waitFor(() =>
      expect(
        document.querySelector("[data-slot=run-tokens-view] [data-slot=fog][data-veil=dim]"),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Fog" })).toBeNull();
  });
});
