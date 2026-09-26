import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import {
  bodyOf,
  bridgeId,
  campaign,
  campaignId,
  encounter,
  encounterId,
  encounterShelf,
  installStubServer,
  liveRun,
  mintingSession,
  page,
  playedRunId,
  playedSessionId,
  renderScreen,
  runId,
  session,
  sessionId,
  tollBridge,
  wolves,
} from "./campaign.fixtures";

/**
 * **An encounter is played once.** The server refuses a second start
 * (`repo/EncounterRuns.ts`, `playthroughOf`), so no press offers one: every
 * way into `runs.start` offers only an encounter never played, a played one
 * offers its log, and one a night finished over offers *Pick up*, which
 * continues the same playthrough through `runs.resume`. A fight on the table
 * still shows the way back to it.
 */

const server = installStubServer();
const base = `/campaigns/${campaignId}`;
const runsPath = `${base}/sessions/${sessionId}/runs`;
const logPath = `${base}/sessions/${playedSessionId}/runs/${playedRunId}`;

/** The toll bridge, as a conversation a night finished over. */
const carriedBridge = {
  ...tollBridge,
  lastPlayed: { ...tollBridge.lastPlayed, endedReason: "carried" },
};

/** The shelf, with the toll bridge carried rather than resolved. */
const shelveCarried = () => {
  const shelf = encounterShelf();
  const listed = shelf.get(`GET ${base}/encounters`)!.body as { readonly items: Array<unknown> };
  server.routes.set(`GET ${base}/encounters`, {
    status: 200,
    body: {
      ...listed,
      items: listed.items.map((row) =>
        (row as { readonly id: string }).id === bridgeId ? carriedBridge : row,
      ),
    },
  });
};

beforeEach(() => {
  server.reset();
  for (const [route, answer] of encounterShelf()) server.routes.set(route, answer);
});

const preview = () => screen.getByRole("article");

describe("the Encounters preview", () => {
  it("offers a played encounter its log and never Run", async () => {
    await renderAt(`${base}/encounters?encounter=${bridgeId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Toll bridge standoff"));

    expect(within(preview()).getByRole("button", { name: "View log" })).toHaveAttribute(
      "href",
      logPath,
    );
    expect(within(preview()).queryByRole("button", { name: /^Run/ })).toBeNull();
    expect(within(preview()).queryByRole("button", { name: /^Pick up/ })).toBeNull();
  });

  it("picks a carried encounter up into tonight, as the same playthrough", async () => {
    shelveCarried();
    server.routes.set(`POST ${runsPath}/resume`, {
      status: 200,
      body: { ...liveRun, encounterId: bridgeId, mode: "social", continuedFrom: playedRunId },
    });
    await renderAt(`${base}/encounters?encounter=${bridgeId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Toll bridge standoff"));

    expect(within(preview()).getByText("Social · Played · Session 11")).toBeInTheDocument();
    expect(within(preview()).getByRole("button", { name: "View log" })).toBeInTheDocument();
    expect(within(preview()).queryByRole("button", { name: /^Run/ })).toBeNull();

    await userEvent.click(
      within(preview()).getByRole("button", { name: "Pick up the conversation" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Pick up Toll bridge standoff" });
    expect(
      within(dialog).getByText(
        "This picks the conversation up in session 12, where session 11 left it.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Pick up the conversation" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/sessions/${sessionId}/runs/resume`)).toEqual({
        continuedFrom: playedRunId,
      }),
    );
    // Continuing is never a start.
    expect(server.calls.some((call) => call.method === "POST" && call.pathname === runsPath)).toBe(
      false,
    );
    await waitFor(() => expect(globalThis.location.pathname).toBe(`${runsPath}/${runId}`));
  });

  it("opens the night on the way when none is open", async () => {
    shelveCarried();
    server.routes.set(`GET ${base}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });
    server.routes.set(`POST ${base}/sessions`, { status: 200, body: session });
    server.routes.set(`PATCH ${base}`, {
      status: 200,
      body: { ...campaign, currentSessionId: sessionId },
    });
    server.routes.set(`POST ${runsPath}/resume`, { status: 200, body: liveRun });
    await renderAt(`${base}/encounters?encounter=${bridgeId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Toll bridge standoff"));

    await userEvent.click(
      within(preview()).getByRole("button", { name: "Pick up the conversation" }),
    );
    await screen.findByText(/This starts session 13 and picks the conversation up/);
    await userEvent.click(screen.getByRole("button", { name: "Pick up the conversation" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/sessions/${sessionId}/runs/resume`)).toEqual({
        continuedFrom: playedRunId,
      }),
    );
    expect(bodyOf(server, "POST", `${base}/sessions`)).toEqual({ number: 13 });
  });

  it("offers no pick-up while another fight is on the table", async () => {
    shelveCarried();
    server.routes.set(`GET ${runsPath}`, { status: 200, body: [liveRun] });
    await renderAt(`${base}/encounters?encounter=${bridgeId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Toll bridge standoff"));

    expect(within(preview()).getByRole("button", { name: "View log" })).toBeInTheDocument();
    expect(within(preview()).queryByRole("button", { name: /^Pick up/ })).toBeNull();
  });
});

describe("the start dialog", () => {
  it("offers only encounters never played", async () => {
    await renderAt(`${base}/encounters?encounter=${encounterId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Ambush in the reeds"));

    await userEvent.click(within(preview()).getByRole("button", { name: "Run encounter" }));
    await screen.findByText("Put an encounter on the table");
    await userEvent.click(screen.getByRole("combobox", { name: "Encounter" }));

    // Seven on the shelf, two of them played.
    expect(await screen.findAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: /^Ambush in the reeds/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Toll bridge standoff/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /^Wolves at the caravan/ })).toBeNull();
  });

  it("says so when every encounter has been played", async () => {
    server.routes.set(`GET ${base}/encounters`, {
      status: 200,
      body: page([tollBridge, wolves]),
    });
    await renderScreen(mintingSession());

    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Start an encounter" }))[0]!,
    );

    expect(await screen.findByText(/Every encounter here has been played/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "Start the fight" })).toBeDisabled();
  });
});

describe("the Overview's Next session rows", () => {
  const rowOf = async (name: string) => {
    const card = (await screen.findByText("Next session")).closest("[data-slot=card]");
    const link = await within(card as HTMLElement).findByRole("link", { name });
    return link.closest("li")!;
  };

  it("give a played encounter its log, a carried one Pick up, and only the rest Run", async () => {
    server.routes.set(`GET ${base}/encounters`, {
      status: 200,
      body: page([encounter, carriedBridge, wolves]),
    });
    await renderScreen(mintingSession());

    const ambush = await rowOf("Ambush in the reeds");
    expect(within(ambush).getByRole("button", { name: "Run Ambush in the reeds" })).toBeVisible();

    const wolvesRow = await rowOf("Wolves at the caravan");
    expect(within(wolvesRow).queryByRole("button", { name: /^Run/ })).toBeNull();
    expect(
      within(wolvesRow).getByRole("button", { name: "View log — Wolves at the caravan" }),
    ).toHaveAttribute("href", logPath);

    const bridge = await rowOf("Toll bridge standoff");
    expect(within(bridge).queryByRole("button", { name: /^Run/ })).toBeNull();
    await userEvent.click(
      within(bridge).getByRole("button", { name: "Pick up Toll bridge standoff" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Pick up Toll bridge standoff" }),
    ).toBeInTheDocument();
  });

  it("keep the way back to the fight on the table", async () => {
    server.routes.set(`GET ${runsPath}`, { status: 200, body: [liveRun] });
    server.routes.set(`GET ${base}/encounters`, {
      status: 200,
      body: page([encounter, carriedBridge]),
    });
    await renderScreen(mintingSession());

    const ambush = await rowOf("Ambush in the reeds");
    expect(
      within(ambush).getByRole("button", { name: "On the table now — Ambush in the reeds" }),
    ).toBeVisible();
    // Nothing can be picked up while a fight is on the table.
    const bridge = await rowOf("Toll bridge standoff");
    expect(within(bridge).queryByRole("button", { name: /^Pick up/ })).toBeNull();
    expect(
      within(bridge).getByRole("button", { name: "View log — Toll bridge standoff" }),
    ).toBeVisible();
  });
});

describe("the encounter's page", () => {
  const pageOf = (id: string) => renderAt(`${base}/encounters/${id}`);

  it("runs an encounter never played", async () => {
    await pageOf(encounterId);
    expect(await screen.findByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View log" })).toBeNull();
  });

  it("offers a played encounter its log and no Run", async () => {
    await pageOf(bridgeId);
    expect(await screen.findByRole("button", { name: "View log" })).toHaveAttribute(
      "href",
      logPath,
    );
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pick up/ })).toBeNull();
  });

  it("offers a carried encounter Pick up, and no Run", async () => {
    shelveCarried();
    await pageOf(bridgeId);
    expect(
      await screen.findByRole("button", { name: "Pick up the conversation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View log" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });

  it("goes back to the fight on the table rather than offering Run", async () => {
    server.routes.set(`GET ${runsPath}`, { status: 200, body: [liveRun] });
    await pageOf(encounterId);
    expect(await screen.findByRole("button", { name: "Back to the fight" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });
});
