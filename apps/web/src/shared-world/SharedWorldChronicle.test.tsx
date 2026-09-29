import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  worldId,
  installStubServer,
  mintingSession,
  renderSharedWorldChronicle,
  sharedWorldDetails,
} from "../campaign/campaign.fixtures";

/**
 * A Shared World's Chronicle page — read-only plus the composer.
 *
 * What is pinned is the boundary's client half: the section draws only what
 * `GET /worlds/:w/history` answered (copies, admitted on purpose), and the
 * composer's write names the one resource it changes. The server-side
 * boundary — who may read, what a recap copy survives — is
 * `apps/server/test/sharedWorld-history.test.ts`'s.
 */

const server = installStubServer();

const historyPath = `/worlds/${worldId}/history`;

const entry = {
  id: "7a1e2b3c-0000-4000-8000-00000000f001",
  worldId,
  campaignId,
  sessionId: null,
  sourceKind: "recap",
  worldSeq: 2,
  occurredAt: "2026-08-20T19:00:00.000Z",
  acceptedAt: "2026-08-21T10:00:00.000Z",
  title: "Session 12 — The crossing",
  body: "The ferryman is called Cazril.",
  facts: { sessionNumber: 12 },
  origin: "authored",
  assistantTurnId: null,
  createdByAccountId: null,
  createdAt: "2026-08-21T10:00:00.000Z",
};

const manual = {
  ...entry,
  id: "7a1e2b3c-0000-4000-8000-00000000f002",
  sourceKind: "manual",
  worldSeq: 1,
  title: null,
  body: "Both parties reached the crossing the same night.",
};

beforeEach(() => {
  server.reset();
});

describe("the chronicle section", () => {
  it("draws what was admitted, a recap copy badged as a played night", async () => {
    server.routes.set(`GET ${historyPath}`, { status: 200, body: [entry, manual] });
    await renderSharedWorldChronicle(mintingSession());

    expect(await screen.findByText("Session 12 — The crossing")).toBeTruthy();
    expect(screen.getByText("The ferryman is called Cazril.")).toBeTruthy();
    expect(screen.getByText("A night played")).toBeTruthy();
    // A manual entry wears no badge: writing by hand is the ordinary act.
    expect(screen.getByText("Both parties reached the crossing the same night.")).toBeTruthy();
  });

  it("says the empty state in words rather than looking broken", async () => {
    await renderSharedWorldChronicle(mintingSession());
    expect(await screen.findByText(/Nothing admitted yet/)).toBeTruthy();
    expect(screen.getByText(/No Story So Far has been kept yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draft Story So Far with Hob" })).toBeTruthy();
  });

  it("writes a manual entry and re-reads the one resource it changed", async () => {
    server.routes.set(`POST ${historyPath}`, { status: 200, body: manual });
    await renderSharedWorldChronicle(mintingSession());

    const box = await screen.findByRole("textbox", { name: "Write the chronicle" });
    await userEvent.type(box, "It rained on both tables.");
    server.routes.set(`GET ${historyPath}`, { status: 200, body: [manual] });
    await userEvent.click(screen.getByRole("button", { name: "Write it down" }));

    await waitFor(() => {
      const posts = server.calls.filter(
        (call) => call.method === "POST" && call.pathname === historyPath,
      );
      expect(posts).toHaveLength(1);
      expect(JSON.parse(posts[0]!.body) as unknown).toEqual({
        body: "It rained on both tables.",
      });
    });
    expect(
      await screen.findByText("Both parties reached the crossing the same night."),
    ).toBeTruthy();
  });

  it("offers nothing to press with nothing typed", async () => {
    await renderSharedWorldChronicle(mintingSession());
    const button = await screen.findByRole("button", { name: "Write it down" });
    expect(button).toHaveProperty("disabled", true);
  });
});

describe("clearing the Story So Far", () => {
  const summaryPath = `${historyPath}/summary`;
  const kept = {
    id: "7a1e2b3c-0000-4000-8000-00000000f101",
    worldId,
    status: "accepted",
    lastWorldSeq: 2,
    text: "The crossing held, and the ferryman has a name.",
    origin: "assistant",
    assistantTurnId: "7a1e2b3c-0000-4000-8000-00000000f102",
    acceptedAt: "2026-08-22T10:00:00.000Z",
    createdAt: "2026-08-22T10:00:00.000Z",
  };

  it("is the owner's, behind a confirm that says what goes, and re-reads the summary", async () => {
    server.routes.set(`GET ${historyPath}`, { status: 200, body: [entry, manual] });
    server.routes.set(`GET ${summaryPath}`, { status: 200, body: kept });
    server.routes.set(`DELETE ${summaryPath}`, { status: 204, body: null });
    await renderSharedWorldChronicle(mintingSession());

    expect(await screen.findByText(kept.text)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));

    const dialog = await screen.findByRole("dialog", { name: /Clear the Story So Far/ });
    expect(dialog.textContent).toContain("The Chronicle is not touched");
    // Nothing is sent until the confirm is pressed.
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);

    server.routes.set(`GET ${summaryPath}`, { status: 200, body: null });
    await userEvent.click(screen.getByRole("button", { name: "Clear Story So Far" }));

    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "DELETE" && call.pathname === summaryPath),
      ).toHaveLength(1),
    );
    expect(await screen.findByText(/No Story So Far has been kept yet/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The Chronicle is still drawn.
    expect(screen.getByText("The ferryman is called Cazril.")).toBeTruthy();
  });

  it("keeps it when the confirm is dismissed", async () => {
    server.routes.set(`GET ${summaryPath}`, { status: 200, body: kept });
    await renderSharedWorldChronicle(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(kept.text)).toBeTruthy();
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("is not offered to a member who is not the owner", async () => {
    server.routes.set(`GET ${summaryPath}`, { status: 200, body: kept });
    server.routes.set("GET /worlds", {
      status: 200,
      body: [{ sharedWorld: sharedWorldDetails, isOwner: false, joinedAt: kept.createdAt }],
    });
    await renderSharedWorldChronicle(mintingSession());

    expect(await screen.findByText(kept.text)).toBeTruthy();
    // The list has answered, so the absence is a decision rather than a wait.
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === "GET" && call.pathname === "/worlds"),
      ).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
