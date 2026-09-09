import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaignId,
  cazril,
  cazrilSource,
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

  it("shares a source with a group and copies it into a campaign as a snapshot", async () => {
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
    await userEvent.click(await screen.findByRole("button", { name: "The Salt Road's group" }));
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
});
