import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installPlayerChronicleServer,
  renderPlayerChronicle,
  sharedStory,
} from "./player.fixtures";

/**
 * The story so far as the table reads it: through `…/story/player` and never
 * the DM's path, only once shared, and without any of the DM's controls.
 */
const server = installPlayerChronicleServer();

beforeEach(() => {
  server.reset();
});

const playerStory = (afterSessionNumber: number) => ({ ...sharedStory, afterSessionNumber });

const share = (body: ReturnType<typeof playerStory>): void => {
  server.routes.set(`GET /campaigns/${campaignId}/story/player`, { status: 200, body });
};

const paths = (): ReadonlyArray<string> => server.calls.map((call) => call.pathname);

describe("the story so far, to a player", () => {
  it("draws nothing until the DM shares it, and never asks the DM's path", async () => {
    await renderPlayerChronicle();

    await waitFor(() => {
      expect(paths()).toContain(`/campaigns/${campaignId}/story/player`);
    });
    await screen.findByText("Jump to");
    expect(screen.queryByRole("region", { name: "The story so far" })).toBeNull();
    expect(paths().some((path) => path.endsWith("/story"))).toBe(false);
  });

  it("reads a shared story and its Previously, with none of the DM's controls", async () => {
    share(playerStory(11));
    await renderPlayerChronicle();

    const card = await screen.findByRole("region", { name: "The story so far" });
    expect(within(card).getByText(playerStory(11).text)).toBeInTheDocument();
    expect(within(card).getByText("Previously, to open session 12")).toBeInTheDocument();
    expect(within(card).getByText(playerStory(11).previously)).toBeInTheDocument();
    expect(within(card).queryByRole("switch")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("drops a Previously a newer shared night has overtaken, and says nothing of updating", async () => {
    share(playerStory(10));
    await renderPlayerChronicle();

    const card = await screen.findByRole("region", { name: "The story so far" });
    expect(within(card).getByText(playerStory(10).text)).toBeInTheDocument();
    expect(within(card).queryByText(playerStory(10).previously)).toBeNull();
    expect(within(card).queryByText("Update needed")).toBeNull();
  });

  it("shows a shared story even before any night is shared", async () => {
    share(playerStory(11));
    server.routes.set(`GET /campaigns/${campaignId}/chronicle/player`, { status: 200, body: [] });
    await renderPlayerChronicle();

    expect(await screen.findByText(playerStory(11).text)).toBeInTheDocument();
    expect(screen.getByText("No nights shared yet")).toBeInTheDocument();
  });
});
