import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { partySeat } from "../campaign/campaign.fixtures";
import { seatId } from "../test/ids";
import {
  beat,
  beatId,
  campaignId,
  chronicle,
  installChronicleServer,
  renderChronicle,
  session11,
  session11Id,
  session12,
  session12Id,
  sharedBeat,
  sharedBeatId,
  summary11,
  type Frame,
} from "./chronicle.fixtures";

/**
 * Writing a night up and sharing it, on the DM's Chronicle, against a stub
 * server that answers writes and streams Hob.
 *
 * What is pinned: the composer's night and its one write, Hob's draft kept
 * through the accept and never by posting its words, what each write names so
 * the screens re-read, and the controls inside an opened night.
 */
const server = installChronicleServer();

beforeEach(() => {
  server.reset();
  // Brannoc is at the table, so the Spotlight has somebody to light.
  server.routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: [partySeat] });
});

const threadId = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const turnId = "c4f4b6d2-9b1a-4c3e-8f7a-2b1c3d4e5f60";
const drafted = "They crossed the ford at dusk and paid the ferryman in salt.";

const hobDrafts = (text: string, sessionId = session12Id): Array<Frame> => [
  { event: "began", data: { threadId, turnId } },
  { event: "tool", data: { phase: "called", name: "sessionRecap", detail: "" } },
  {
    event: "proposal",
    data: { turnId, proposal: { target: "nightSummary", sessionId, sessionNumber: 12, text } },
  },
  { event: "done", data: { reason: "stop" } },
];

const writes = () => server.calls.filter((call) => call.method !== "GET");
const recordPath = `/campaigns/${campaignId}/chronicle`;

/** Answers the Chronicle's one read with these two sessions on the fixture's nights. */
const recordIs = (twelve: object, eleven: object) =>
  server.routes.set(`GET ${recordPath}`, {
    status: 200,
    body: [
      { ...chronicle[0], session: twelve },
      { ...chronicle[1], session: eleven },
    ],
  });
const reads = (path: string) =>
  server.calls.filter((call) => call.method === "GET" && call.pathname === path).length;

const composer = () => screen.findByRole("region", { name: "Write up session 12" });

const night = (n: number): Promise<HTMLElement> =>
  waitFor(() => {
    const card = document.getElementById(`session-${String(n)}`);
    if (card === null) throw new Error(`no card for session ${String(n)}`);
    return card;
  });

/** What the `PATCH` of session 12 answers: the row with what was sent on it. */
const answerPatch = (sessionId: string, row: object) =>
  server.routes.set(`PATCH /campaigns/${campaignId}/sessions/${sessionId}`, {
    status: 200,
    body: row,
  });

describe("the composer", () => {
  it("writes up the newest played night, and adds nothing until it has words", async () => {
    await renderChronicle();
    const card = await composer();

    expect(within(card).getByRole("heading", { name: "Session 12" })).toBeInTheDocument();
    expect(within(card).getByText("Draft")).toBeInTheDocument();
    // The night's runs, by kind, as the drawing's *Played* row.
    const played = await within(card).findByRole("list", { name: "Played" });
    expect(within(played).getByText("Ambush in the reeds")).toBeInTheDocument();

    const add = within(card).getByRole("button", { name: "Add to chronicle" });
    expect(add).toBeDisabled();
    await userEvent.type(within(card).getByRole("textbox", { name: "Summary" }), "   ");
    expect(add).toBeDisabled();
  });

  it("sends the title, the words and the spotlight in one write, naming the reads it changed", async () => {
    const summary = "Wren opened the crate. Brannoc told Hollis.";
    answerPatch(session12Id, { ...session12, title: "The warm crate", summary });
    await renderChronicle();
    const card = await composer();

    await userEvent.type(within(card).getByLabelText("Title (optional)"), "The warm crate");
    await userEvent.type(within(card).getByRole("textbox", { name: "Summary" }), summary);
    const brannoc = within(within(card).getByRole("group", { name: "Spotlight" })).getByRole(
      "button",
      { name: "Brannoc" },
    );
    await userEvent.click(brannoc);
    expect(brannoc).toHaveAttribute("aria-pressed", "true");

    const recordBefore = reads(recordPath);
    // The record the save re-reads now holds the written night.
    recordIs(
      {
        ...session12,
        title: "The warm crate",
        summary,
        summaryOrigin: "authored",
        spotlightSeatId: seatId,
      },
      session11,
    );
    await userEvent.click(within(card).getByRole("button", { name: "Add to chronicle" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "PATCH",
      pathname: `/campaigns/${campaignId}/sessions/${session12Id}`,
      body: { title: "The warm crate", summary, spotlightSeatId: seatId },
    });
    // Nothing Hob drafted, so nothing is accepted.
    expect(server.calls.some((call) => call.pathname.endsWith("/accept"))).toBe(false);

    // `reads.sessions`, which the Chronicle's one read answers.
    await waitFor(() => expect(reads(recordPath)).toBeGreaterThan(recordBefore));
    // Written, so the card goes and the night says it.
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Write up session 12" })).toBeNull(),
    );
    const written = await night(12);
    expect(within(written).getByRole("heading", { name: "The warm crate" })).toBeInTheDocument();
    expect(within(written).getByText(/Spotlight on Brannoc/)).toBeInTheDocument();
    expect(within(written).getByText(summary)).toBeInTheDocument();
  });

  it("puts nobody in the spotlight when the lit toggle is pressed again", async () => {
    await renderChronicle();
    const card = await composer();
    const brannoc = within(card).getByRole("button", { name: "Brannoc" });
    await userEvent.click(brannoc);
    await userEvent.click(brannoc);
    expect(brannoc).toHaveAttribute("aria-pressed", "false");
  });

  it("is not there once the newest night has a summary", async () => {
    recordIs({ ...session12, summary: "Written.", summaryOrigin: "authored" }, session11);
    await renderChronicle();
    await night(12);
    expect(screen.queryByRole("region", { name: /Write up session/ })).toBeNull();
  });
});

describe("Hob's draft", () => {
  it("fills the box for the DM to edit, and Add keeps it through the accept, then the edit", async () => {
    server.frames = hobDrafts(drafted);
    server.routes.set(
      `POST /campaigns/${campaignId}/hob/threads/${threadId}/turns/${turnId}/accept`,
      {
        status: 200,
        body: {
          accepted: "nightSummary",
          session: {
            ...session12,
            summary: drafted,
            summaryOrigin: "assistant",
            summaryAssistantTurnId: turnId,
          },
        },
      },
    );
    answerPatch(session12Id, { ...session12, summary: `${drafted} Wren kept quiet.` });
    await renderChronicle();
    const card = await composer();

    await userEvent.click(within(card).getByRole("button", { name: "Ask Hob to draft" }));
    const box = within(card).getByRole("textbox", { name: "Summary" });
    await waitFor(() => expect(box).toHaveValue(drafted));

    // The ask named this night, so the server bound it before the model ran.
    const ask = server.calls.find((call) => call.pathname.endsWith("/hob/ask"));
    expect(ask?.body).toMatchObject({ intent: "nightSummary", sessionId: session12Id });
    expect(ask?.body).not.toHaveProperty("threadId");
    expect(writes().filter((call) => !call.pathname.endsWith("/hob/ask"))).toEqual([]);

    await userEvent.type(box, " Wren kept quiet.");
    // The DM's words now, so Hob does not draft over them.
    expect(within(card).getByRole("button", { name: "Ask Hob again" })).toBeDisabled();
    await userEvent.click(within(card).getByRole("button", { name: "Add to chronicle" }));

    await waitFor(() =>
      expect(writes().map((call) => `${call.method} ${call.pathname}`)).toEqual([
        `POST /campaigns/${campaignId}/hob/ask`,
        `POST /campaigns/${campaignId}/hob/threads/${threadId}/turns/${turnId}/accept`,
        `PATCH /campaigns/${campaignId}/sessions/${session12Id}`,
      ]),
    );
    // The accept carries no words; the edit is the DM's own write.
    expect(writes()[1]?.body).toEqual({});
    expect(writes()[2]?.body).toMatchObject({ summary: `${drafted} Wren kept quiet.` });
  });

  it("keeps Hob's draft unedited through the accept alone, sending no words of its own", async () => {
    server.frames = hobDrafts(drafted);
    server.routes.set(
      `POST /campaigns/${campaignId}/hob/threads/${threadId}/turns/${turnId}/accept`,
      {
        status: 200,
        body: {
          accepted: "nightSummary",
          session: {
            ...session12,
            summary: drafted,
            summaryOrigin: "assistant",
            summaryAssistantTurnId: turnId,
          },
        },
      },
    );
    answerPatch(session12Id, { ...session12, summary: drafted });
    await renderChronicle();
    const card = await composer();

    await userEvent.click(within(card).getByRole("button", { name: "Ask Hob to draft" }));
    await waitFor(() =>
      expect(within(card).getByRole("textbox", { name: "Summary" })).toHaveValue(drafted),
    );
    await userEvent.click(within(card).getByRole("button", { name: "Add to chronicle" }));

    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[2]?.body).not.toHaveProperty("summary");
  });

  it("lets the draft go when the DM empties the box, so their own words are never Hob's", async () => {
    server.frames = hobDrafts(drafted);
    answerPatch(session12Id, { ...session12, summary: "Mine." });
    await renderChronicle();
    const card = await composer();

    await userEvent.click(within(card).getByRole("button", { name: "Ask Hob to draft" }));
    const box = within(card).getByRole("textbox", { name: "Summary" });
    await waitFor(() => expect(box).toHaveValue(drafted));
    await userEvent.clear(box);
    await userEvent.type(box, "Mine.");
    await userEvent.click(within(card).getByRole("button", { name: "Add to chronicle" }));

    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(server.calls.some((call) => call.pathname.endsWith("/accept"))).toBe(false);
    expect(writes()[1]?.body).toMatchObject({ summary: "Mine." });
  });

  it("says so when Hob answers without a draft, and ignores a draft of another night", async () => {
    server.frames = [
      { event: "began", data: { threadId, turnId } },
      { event: "delta", data: { text: "The record is thin for that night." } },
      ...hobDrafts(drafted, session11Id).slice(2),
    ];
    await renderChronicle();
    const card = await composer();

    await userEvent.click(within(card).getByRole("button", { name: "Ask Hob to draft" }));
    expect(await within(card).findByText("The record is thin for that night.")).toBeInTheDocument();
    expect(within(card).getByRole("textbox", { name: "Summary" })).toHaveValue("");
  });

  it("is not offered when no model is behind Hob, and the DM writes by hand", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/hob`, {
      status: 200,
      body: { available: false, model: null, campaign: "The Salt Road" },
    });
    await renderChronicle();
    const card = await composer();
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/hob"))).toBe(true),
    );
    expect(within(card).queryByRole("button", { name: /Ask Hob/ })).toBeNull();
    expect(within(card).getByRole("textbox", { name: "Summary" })).toBeEnabled();
  });
});

describe("inside an opened night", () => {
  // The fixture's session 11 is written up already (`summary11`).
  const written = session11;

  const openEleven = async (): Promise<HTMLElement> => {
    await renderChronicle(`?session=${session11Id}`);
    const card = await night(11);
    await within(card).findByText(sharedBeat.body);
    return card;
  };

  it("leads with the summary, and edits it in place with the same fields", async () => {
    answerPatch(session11Id, { ...written, summary: "Rewritten." });
    const card = await openEleven();
    expect(within(card).getByText(summary11)).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const box = within(card).getByRole("textbox", { name: "Summary" });
    expect(box).toHaveValue(summary11);
    await userEvent.clear(box);
    await userEvent.type(box, "Rewritten.");
    await userEvent.click(within(card).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "PATCH",
      pathname: `/campaigns/${campaignId}/sessions/${session11Id}`,
      body: { summary: "Rewritten.", title: null, spotlightSeatId: null },
    });
  });

  it("asks before clearing the summary, and clears only the summary", async () => {
    answerPatch(session11Id, { ...written, summary: null });
    const card = await openEleven();

    await userEvent.click(within(card).getByRole("button", { name: "Clear summary" }));
    const dialog = await screen.findByRole("dialog");
    expect(writes()).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes()).toEqual([]);

    await userEvent.click(within(card).getByRole("button", { name: "Clear summary" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Clear summary" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.body).toEqual({ summary: null });
  });

  it("shares the night with the table, and unshares it", async () => {
    answerPatch(session11Id, { ...written, visibility: "shared" });
    const card = await openEleven();
    const share = within(card).getByRole("switch", { name: "Share with the table" });
    expect(share).not.toBeChecked();

    const before = reads(recordPath);
    await userEvent.click(share);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "PATCH",
      pathname: `/campaigns/${campaignId}/sessions/${session11Id}`,
      body: { visibility: "shared" },
    });
    await waitFor(() => expect(reads(recordPath)).toBeGreaterThan(before));
  });

  it("shares a kept moment and unshares a shared one, one write each", async () => {
    server.routes.set(`PATCH /campaigns/${campaignId}/sessions/${session11Id}/beats/${beatId}`, {
      status: 200,
      body: { ...beat, visibility: "shared" },
    });
    server.routes.set(
      `PATCH /campaigns/${campaignId}/sessions/${session11Id}/beats/${sharedBeatId}`,
      { status: 200, body: { ...sharedBeat, visibility: "dm" } },
    );
    const card = await openEleven();

    const kept = within(card).getByRole("list", { name: "Kept from the table" });
    await userEvent.click(
      within(kept).getByRole("button", { name: "Share this moment with the table" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      pathname: `/campaigns/${campaignId}/sessions/${session11Id}/beats/${beatId}`,
      body: { visibility: "shared" },
    });

    const moments = within(card).getByRole("list", { name: "Moments" });
    await waitFor(() =>
      expect(within(moments).getByRole("button", { name: "Unshare this moment" })).toBeEnabled(),
    );
    await userEvent.click(within(moments).getByRole("button", { name: "Unshare this moment" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({
      pathname: `/campaigns/${campaignId}/sessions/${session11Id}/beats/${sharedBeatId}`,
      body: { visibility: "dm" },
    });
  });

  it("offers to write up an older night with no summary from inside its card", async () => {
    recordIs(session12, { ...session11, summary: null, summaryOrigin: null });
    await renderChronicle(`?session=${session11Id}`);
    const card = await night(11);
    await within(card).findByText(sharedBeat.body);
    expect(within(card).queryByRole("button", { name: "Clear summary" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Write a summary" }));
    expect(within(card).getByRole("textbox", { name: "Summary" })).toHaveValue("");
    await userEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(within(card).queryByRole("textbox", { name: "Summary" })).toBeNull();
  });

  it("has no second composer inside the night the card above is writing up", async () => {
    await renderChronicle();
    const card = await night(12);
    await within(card).findByRole("switch", { name: "Share with the table" });
    expect(within(card).queryByRole("button", { name: "Write a summary" })).toBeNull();
  });
});
