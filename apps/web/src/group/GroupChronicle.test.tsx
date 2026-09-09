import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  groupId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderSharedWorld,
} from "../campaign/campaign.fixtures";

/**
 * The chronicle section on the Shared World screen — read-only plus the composer.
 *
 * What is pinned is the boundary's client half: the section draws only what
 * `GET /groups/:g/history` answered (copies, admitted on purpose), and the
 * composer's write names the one resource it changes. The server-side
 * boundary — who may read, what a recap copy survives — is
 * `apps/server/test/group-history.test.ts`'s.
 */

const server = installStubServer();
installMemoryStorage();

const historyPath = `/groups/${groupId}/history`;

const entry = {
  id: "7a1e2b3c-0000-4000-8000-00000000f001",
  groupId,
  campaignId,
  sessionId: null,
  sourceKind: "recap",
  groupSeq: 2,
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
  groupSeq: 1,
  title: null,
  body: "Both parties reached the crossing the same night.",
};

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

describe("the chronicle section", () => {
  it("draws what was admitted, a recap copy badged as a played night", async () => {
    server.routes.set(`GET ${historyPath}`, { status: 200, body: [entry, manual] });
    await renderSharedWorld(mintingSession());

    expect(await screen.findByText("Session 12 — The crossing")).toBeTruthy();
    expect(screen.getByText("The ferryman is called Cazril.")).toBeTruthy();
    expect(screen.getByText("A night played")).toBeTruthy();
    // A manual entry wears no badge: writing by hand is the ordinary act.
    expect(screen.getByText("Both parties reached the crossing the same night.")).toBeTruthy();
  });

  it("says the empty state in words rather than looking broken", async () => {
    await renderSharedWorld(mintingSession());
    expect(await screen.findByText(/Nothing admitted yet/)).toBeTruthy();
  });

  it("writes a manual entry and re-reads the one resource it changed", async () => {
    server.routes.set(`POST ${historyPath}`, { status: 200, body: manual });
    await renderSharedWorld(mintingSession());

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
    await renderSharedWorld(mintingSession());
    const button = await screen.findByRole("button", { name: "Write it down" });
    expect(button).toHaveProperty("disabled", true);
  });
});
