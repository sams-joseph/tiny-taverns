import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { installStubServer } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";
import { crypt, cryptLevelId } from "./levels.fixtures";

/**
 * A save the server refuses because the level was saved elsewhere since the
 * editor read it: the editor says so, stops saving on its own, and offers to
 * load the saved level in place of its copy, or to keep its copy and save it
 * over the saved one.
 *
 * The renderer is three.js over WebGL, which jsdom has none of: a fake stands
 * behind the same dynamic import, as `level/LevelEditor.test.tsx` has it.
 */
vi.mock("../run/fx3d/support", () => ({ canDrawWebGL: () => true }));
vi.mock("../level/renderer", () => ({
  LevelRenderer: class {
    renderer = { domElement: document.createElement("canvas") };
    setLevel() {}
    setOptions() {}
    setVision() {}
    setOverlay() {}
    setHover() {}
    setView() {}
    resize() {}
    start() {}
    floorThumbnails() {
      return [];
    }
    dispose() {}
  },
}));

const server = installStubServer();

beforeEach(() => {
  server.reset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const PATH = `/library/levels/${cryptLevelId}`;
const conflict = {
  status: 409,
  body: { _tag: "Conflict", message: "the level was saved since you read it" },
};
/** The level as somebody else saved it, two versions on. */
const theirs = { ...crypt, name: "The Flooded Crypt", version: crypt.version + 2 };

const puts = () =>
  server.calls
    .filter((call) => call.method === "PUT")
    .map((call) => JSON.parse(call.body) as { readonly name: string; readonly version: number });

/** Open the crypt, rename it, and save: the server refuses it as stale. */
const renameIntoConflict = async () => {
  server.routes.set(`PUT ${PATH}`, conflict);
  await renderAt(PATH, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));
  const name = await screen.findByRole("textbox", { name: "Level name" });
  await userEvent.clear(name);
  await userEvent.type(name, "My Crypt{Enter}");
  await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
  expect(await screen.findByText("Saved elsewhere since you opened it")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  // Somebody else's save is what the server holds now.
  server.routes.set(`GET ${PATH}`, { status: 200, body: theirs });
};

describe("a level saved elsewhere since the editor read it", () => {
  it("loads the saved level in place of the editor's copy", async () => {
    await renameIntoConflict();
    await userEvent.click(screen.getByRole("button", { name: "Load the saved level" }));
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "Level name" }) as HTMLInputElement).value).toBe(
        "The Flooded Crypt",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    // Nothing more was sent: the editor's copy is dropped, not saved.
    expect(puts()).toHaveLength(1);
    expect(puts()[0]).toMatchObject({ name: "My Crypt", version: crypt.version });
  });

  it("keeps the editor's copy and saves it over the saved one at its version", async () => {
    await renameIntoConflict();
    server.routes.set(`PUT ${PATH}`, {
      status: 200,
      body: { ...crypt, name: "My Crypt", version: theirs.version + 1 },
    });
    await userEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    // Read first, then sent at the version the server holds now.
    expect(puts()[1]).toMatchObject({ name: "My Crypt", version: theirs.version });
    expect(
      server.calls.filter((call) => call.method === "GET" && call.pathname === PATH).length,
    ).toBeGreaterThan(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect((screen.getByRole("textbox", { name: "Level name" }) as HTMLInputElement).value).toBe(
      "My Crypt",
    );
  });
});
