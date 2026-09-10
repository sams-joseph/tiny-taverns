import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  cazril,
  cazrilSource,
  group,
  groupId,
  installMemoryStorage,
  installStubServer,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

afterEach(() => cleanup());

const renderLibrary = async (): Promise<void> => {
  await renderAt("/library/npcs");
};

describe("NpcLibraryScreen", () => {
  it("draws account-owned NPC sources on the Library shelf", async () => {
    await renderLibrary();

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    const shelves = screen.getByRole("navigation", { name: "Library shelves" });
    expect(within(shelves).getByRole("link", { name: "NPCs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("1 NPC source")).toBeInTheDocument();
    expect(screen.getByText("Cazril")).toBeInTheDocument();
    expect(screen.getByText("Private material")).toBeInTheDocument();
  });

  it("writes a source as a Library original", async () => {
    server.routes.set("POST /library/npcs", {
      status: 200,
      body: { ...cazrilSource, name: "Fen" },
    });
    await renderLibrary();
    await screen.findByText("Cazril");

    await userEvent.click(screen.getByRole("button", { name: "Write an NPC source" }));
    const dialog = await screen.findByRole("dialog", { name: "New NPC source" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Fen");
    await userEvent.type(within(dialog).getByLabelText("Role"), "the fence");
    await userEvent.type(within(dialog).getByLabelText("Who they are"), "Trades in copper names.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Advanced" }));
    await userEvent.type(within(dialog).getByLabelText("Secrets"), "Keeps a false ledger.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save source" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/library/npcs")).toMatchObject({
        name: "Fen",
        role: "the fence",
        persona: { identity: { summary: "Trades in copper names." } },
        privateMaterial: { secrets: "Keeps a false ledger." },
      }),
    );
  });

  it("shares a source with a Shared World and copies it into a campaign as a snapshot", async () => {
    server.routes.set(`POST /worlds/${groupId}/library`, {
      status: 200,
      body: {
        groupId,
        ownerAccountId: cazrilSource.accountId,
        kind: "npc",
        resourceId: cazrilSource.id,
        name: cazrilSource.name,
        sharedByName: "Wren Alderby",
        createdAt: cazrilSource.createdAt,
      },
    });
    server.routes.set(`POST /campaigns/${campaignId}/npcs/sources/${cazrilSource.id}/copy`, {
      status: 200,
      body: { ...cazril, derivedFrom: cazrilSource.id, derivedFromName: cazrilSource.name },
    });
    await renderLibrary();
    await screen.findByText("Cazril");

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(
      await screen.findByText(/another creator's copy does not receive your private material/),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "The Salt Company" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${groupId}/library`)).toEqual({
        kind: "npc",
        resourceId: cazrilSource.id,
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Add to campaign" }));
    expect(await screen.findByText(/independent campaign Cast snapshot/)).toBeInTheDocument();
    expect(screen.getByText(/their secrets are not copied/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "The Salt Road" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/campaigns/${campaignId}/npcs/sources/`)).toEqual({}),
    );
  });

  it("offers owned Shared Worlds directly, never a campaign's standalone context", async () => {
    const standaloneContextId = "5a1e2b3c-0000-4000-8000-00000000bbb1";
    const ownedWorldId = "5a1e2b3c-0000-4000-8000-00000000bbb2";
    const memberWorldId = "5a1e2b3c-0000-4000-8000-00000000bbb3";
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [
        {
          campaign: { ...campaign, groupId: standaloneContextId },
          relation: "creator",
          sharedWorld: null,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    server.routes.set("GET /worlds", {
      status: 200,
      body: [
        {
          group: { ...group, id: ownedWorldId, name: "The Roads Between" },
          isOwner: true,
          joinedAt: group.createdAt,
        },
        {
          group: { ...group, id: memberWorldId, name: "A Friend's World" },
          isOwner: false,
          joinedAt: group.createdAt,
        },
      ],
    });
    server.routes.set(`POST /worlds/${ownedWorldId}/library`, {
      status: 200,
      body: {
        groupId: ownedWorldId,
        ownerAccountId: cazrilSource.accountId,
        kind: "npc",
        resourceId: cazrilSource.id,
        name: cazrilSource.name,
        sharedByName: "Wren Alderby",
        createdAt: cazrilSource.createdAt,
      },
    });

    await renderLibrary();
    await userEvent.click(await screen.findByRole("button", { name: "Share" }));

    expect(
      await screen.findByRole("dialog", { name: "Share Cazril with a Shared World" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The Roads Between" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "The Salt Road's group" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A Friend's World" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "The Roads Between" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/worlds/${ownedWorldId}/library`)).toEqual({
        kind: "npc",
        resourceId: cazrilSource.id,
      }),
    );
    expect(server.calls.some((call) => call.pathname.includes(standaloneContextId))).toBe(false);
  });
});
