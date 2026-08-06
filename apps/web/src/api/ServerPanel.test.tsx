import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServerPanel } from "./ServerPanel";

/**
 * The panel is the one place the derived client is reached from a React
 * component, so this covers the wiring: mount, call, decode, render.
 *
 * One permanent `fetch` stub, re-aimed per test — see the note in
 * `client.test.ts` about `Context.Reference` memoising `globalThis.fetch`.
 */
const routes = new Map<string, unknown>();

vi.stubGlobal("fetch", (url: string | URL) => {
  const { pathname } = new URL(String(url));
  const body = routes.get(pathname);
  return Promise.resolve(
    new Response(JSON.stringify(body ?? {}), {
      status: body === undefined ? 404 : 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

describe("ServerPanel", () => {
  it("renders the decoded health status", async () => {
    routes.set("/health", { status: "ok", uptime: 42.4 });

    render(<ServerPanel />);

    expect(await screen.findByText("ok · up 42s")).toBeInTheDocument();
  });

  it("lists campaigns decoded from the API", async () => {
    const user = userEvent.setup();
    routes.set("/health", { status: "ok", uptime: 1 });
    routes.set("/campaigns", [
      {
        id: "2b1f2a1e-0000-4000-8000-00000000c0de",
        name: "The Reed Marches",
        partyName: "The Ferrymen",
        playerCount: 4,
        currentSessionId: null,
        visibility: "shared",
        origin: "authored",
        assistantTurnId: null,
        archivedAt: null,
        createdAt: "2026-08-04T13:03:28.035Z",
        updatedAt: "2026-08-04T13:03:28.035Z",
      },
    ]);

    render(<ServerPanel />);
    await user.type(screen.getByLabelText("DM token"), "a-dm-token");
    await user.click(screen.getByRole("button", { name: "Load campaigns" }));

    expect(await screen.findByText("The Reed Marches")).toBeInTheDocument();
    expect(screen.getByText("4 players")).toBeInTheDocument();
    expect(screen.getByText("shared")).toBeInTheDocument();
  });
});
