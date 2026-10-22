import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { installStubServer } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";
import { crypt, cryptLevelId, ford, fordLevelId } from "./levels.fixtures";

/**
 * The Levels shelf: cards that open their level, a new level at a chosen
 * size, and a delete that asks first.
 */

const server = installStubServer();

beforeEach(() => server.reset());
afterEach(cleanup);

const at = (path: string) =>
  renderAt(path, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));

const bodies = (method: string) =>
  server.calls.filter((call) => call.method === method).map((call) => call.body);

describe("the Library's Levels shelf", () => {
  it("shows each level's size and what is on it, and its card opens the level", async () => {
    await at("/library/levels");

    const name = await screen.findByRole("link", { name: "The Crypt" });
    expect(name.getAttribute("data-card-link")).not.toBeNull();
    expect(name.getAttribute("href")).toBe(`/library/levels/${cryptLevelId}`);
    const card = name.closest("[data-slot=card]") as HTMLElement;
    expect(within(card).getByText("6 × 4 squares · 30 × 20 ft")).toBeTruthy();
    expect(within(card).getByText("2 walls · 1 prop · 1 light · 1 region")).toBeTruthy();
    expect(screen.getByText("Empty")).toBeTruthy();

    await userEvent.click(name);
    expect(await screen.findByDisplayValue("The Crypt")).toBeTruthy();
  });

  it("makes a level at a chosen size and opens it", async () => {
    server.routes.set("POST /library/levels", { status: 200, body: ford });
    await at("/library/levels");

    await userEvent.click(await screen.findByRole("button", { name: "New level" }));
    const dialog = await screen.findByRole("dialog", { name: "New level" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Ford");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create level" }));

    await waitFor(() =>
      expect(bodies("POST")).toEqual([JSON.stringify({ name: "Ford", columns: 48, rows: 32 })]),
    );
    expect(await screen.findByDisplayValue("Ford")).toBeTruthy();
    expect(server.calls.map((call) => call.pathname)).toContain(`/library/levels/${fordLevelId}`);
  });

  it("asks before deleting a level", async () => {
    server.routes.set(`DELETE /library/levels/${cryptLevelId}`, { status: 204, body: undefined });
    await at("/library/levels");

    await userEvent.click(await screen.findByRole("button", { name: "Delete The Crypt" }));
    const dialog = await screen.findByRole("dialog", { name: /Delete The Crypt/ });
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete level" }));
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "DELETE").map((call) => call.pathname),
      ).toEqual([`/library/levels/${cryptLevelId}`]),
    );
  });
});

describe("a level's page", () => {
  it("opens the level in the full-screen editor, with the way back to the shelf", async () => {
    await at(`/library/levels/${cryptLevelId}`);

    const name = await screen.findByRole("textbox", { name: "Level name" });
    expect((name as HTMLInputElement).value).toBe("The Crypt");
    expect(document.querySelector("[data-slot=level-editor]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Levels" }).getAttribute("href")).toBe(
      "/library/levels",
    );
  });

  it("saves the whole document with the version it was read at", async () => {
    server.routes.set(`PUT /library/levels/${cryptLevelId}`, {
      status: 200,
      body: { ...crypt, name: "The Drowned Crypt", version: crypt.version + 1 },
    });
    await at(`/library/levels/${cryptLevelId}`);

    const name = await screen.findByRole("textbox", { name: "Level name" });
    await userEvent.clear(name);
    await userEvent.type(name, "The Drowned Crypt{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(bodies("PUT")).toHaveLength(1));
    const sent = JSON.parse(bodies("PUT")[0] as string) as Record<string, unknown>;
    expect(sent["name"]).toBe("The Drowned Crypt");
    expect(sent["version"]).toBe(crypt.version);
    expect(sent["walls"]).toEqual(crypt.walls);
    expect(sent).not.toHaveProperty("id");
  });
});
