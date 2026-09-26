import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { campaign, campaignId, encounterId, installStubServer } from "./campaign.fixtures";

/**
 * The encounter screens and Notes, typed by somebody who only sits at the table.
 *
 * The server refuses a player every read behind these screens, and it stays
 * the gate. What is checked here is what the player reads instead of that
 * refusal — the same words at every URL, whatever encounter it names — and
 * that choosing them costs no creator read at all.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const as = (relation: "player" | null) =>
  server.routes.set("GET /me/campaigns", {
    status: 200,
    body:
      relation === null
        ? []
        : [{ campaign, relation, sharedWorld: null, joinedAt: campaign.createdAt }],
  });

const base = `/campaigns/${campaignId}`;
const encounterRoutes = [
  ["the list", `${base}/encounters`],
  ["the preview", `${base}/encounters?encounter=${encounterId}`],
  ["an encounter's page", `${base}/encounters/${encounterId}`],
  ["a new encounter", `${base}/encounters/new`],
  ["an encounter's edit", `${base}/encounters/${encounterId}/edit`],
  ["a half-typed link", `${base}/encounters/${encounterId}/nowhere`],
  ["the notes", `${base}/notes`],
] as const;

/** Anything under `…/encounters`, `…/encounter-prep` or a run: the creator's reads. */
const creatorReads = () => server.calls.filter((call) => /\/encounter|\/runs/.test(call.pathname));

describe("a player at an encounter URL", () => {
  it.each(encounterRoutes)("reads that it is the DM's, at %s", async (_, path) => {
    as("player");
    await renderAt(path);

    expect(await screen.findByText("The DM's side of the screen")).toBeInTheDocument();
    expect(screen.queryByText("Not here")).toBeNull();
    expect(screen.queryByText(/That campaign is gone/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save encounter" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Battle map" })).toBeNull();
    expect(creatorReads()).toEqual([]);
  });

  it("is taken back to the table's Overview", async () => {
    as("player");
    await renderAt(`${base}/encounters/${encounterId}`);

    await userEvent.click(await screen.findByRole("button", { name: "Back to the Overview" }));
    await waitFor(() => expect(globalThis.location.pathname).toBe(base));
  });
});

describe("somebody who is not at the table", () => {
  it("still reads the server's refusal, the same as before", async () => {
    as(null);
    // What the server answers somebody with no seat: the creator's map read refuses.
    server.routes.set(`GET ${base}/encounters/${encounterId}/map`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderAt(`${base}/encounters/${encounterId}`);

    expect(await screen.findByText("Not here")).toBeInTheDocument();
    expect(screen.queryByText("The DM's side of the screen")).toBeNull();
  });
});
