import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  campaignId,
  installMemoryStorage,
  installStubServer,
  noSession,
  npcId,
  playerCazril,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

const renderChat = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/cast/${npcId}/talk`, (route) => (
    <HostedSessionScope session={noSession}>{route}</HostedSessionScope>
  ));
};

describe("PlayerNpcChatScreen", () => {
  it("explains Talk privately transcript privacy and memory boundaries", async () => {
    await renderChat();

    expect(
      await screen.findByText("Talk privately · only you can read this transcript"),
    ).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Talk privately with Cazril" });
    expect(within(panel).getByText(/not this private transcript/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/does not change campaign canon or create NPC memory/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not automatically create or approve NPC memory/),
    ).toBeInTheDocument();
  });

  it("shows the NPC's public summary and appearance, and nothing private", async () => {
    await renderChat();

    expect(
      await screen.findByText(
        "Stooped and weathered, river-grey eyes, a lantern hung from his pole.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/takes names instead of coin/)).toBeInTheDocument();
    expect(screen.queryByText("No public profile yet")).toBeNull();
  });

  it("draws an appearance alone as the profile, not as a missing one", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/player`, {
      status: 200,
      body: { ...playerCazril, persona: { identity: { appearance: "A tall shadow." } } },
    });
    await renderChat();

    expect(await screen.findByText("A tall shadow.")).toBeInTheDocument();
    expect(screen.queryByText("No public profile yet")).toBeNull();
  });

  it("keeps the manual fallback visible when Talk privately has no model", async () => {
    await renderChat();

    await screen.findByText("Talk privately · only you can read this transcript");
    const panel = screen.getByRole("region", { name: "Talk privately with Cazril" });
    expect(await within(panel).findByText(/Talk privately is unavailable/)).toBeInTheDocument();
    expect(within(panel).getByText(/profile, knowledge and approved memory/)).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox")).toBeNull();
  });
});
