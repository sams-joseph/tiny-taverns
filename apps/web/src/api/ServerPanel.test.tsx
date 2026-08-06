import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { ServerPanel } from "./ServerPanel";

/**
 * The panel is the one place the derived client is reached from a React
 * component, so this covers the wiring: mount, call, decode, render.
 *
 * One permanent `fetch` stub, re-aimed per test — see the note in
 * `client.test.ts` about `Context.Reference` memoising `globalThis.fetch`.
 */
const routes = new Map<string, unknown>();
const calls: Array<{ pathname: string; authorization: string | undefined; body: string }> = [];

vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
  const { pathname } = new URL(String(url));
  const headers = init?.headers as Record<string, string> | undefined;
  calls.push({
    pathname,
    authorization: headers?.["authorization"],
    body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
  });
  const body = routes.get(pathname);
  return Promise.resolve(
    new Response(JSON.stringify(body ?? {}), {
      status: body === undefined ? 404 : 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

const campaignJson = (name: string) => ({
  id: "2b1f2a1e-0000-4000-8000-00000000c0de",
  name,
  partyName: "The Ferrymen",
  playerCount: 4,
  currentSessionId: null,
  visibility: "shared",
  origin: "authored",
  assistantTurnId: null,
  archivedAt: null,
  createdAt: "2026-08-04T13:03:28.035Z",
  updatedAt: "2026-08-04T13:03:28.035Z",
});

/** A signed-in hosted session that mints a different token on every call. */
const mintingSession = (): HostedSession & { readonly minted: () => number } => {
  let issued = 0;
  return {
    configured: true,
    signedIn: true,
    fetchToken: () => Promise.resolve(`session-token-${++issued}`),
    minted: () => issued,
  };
};

describe("ServerPanel", () => {
  it("renders the decoded health status", async () => {
    routes.set("/health", { status: "ok", uptime: 42.4 });

    render(<ServerPanel />);

    expect(await screen.findByText("ok · up 42s")).toBeInTheDocument();
  });

  it("lists campaigns decoded from the API, with a pasted machine token", async () => {
    const user = userEvent.setup();
    routes.set("/health", { status: "ok", uptime: 1 });
    routes.set("/campaigns", [campaignJson("The Reed Marches")]);

    render(<ServerPanel />);
    await user.type(screen.getByLabelText("Machine token"), "a-machine-token");
    await user.click(screen.getByRole("button", { name: "Load campaigns" }));

    expect(await screen.findByText("The Reed Marches")).toBeInTheDocument();
    expect(screen.getByText("4 players")).toBeInTheDocument();
    expect(screen.getByText("shared")).toBeInTheDocument();
  });

  it("offers no hosted sign-in card when no provider is configured", async () => {
    routes.set("/health", { status: "ok", uptime: 1 });

    render(<ServerPanel />);
    await screen.findByText("ok · up 1s");

    // The machine-token path is still there; the hosted one is absent rather
    // than present and dead.
    expect(screen.getByLabelText("Machine token")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load my campaigns" })).not.toBeInTheDocument();
  });

  it("fetches a fresh session token for every call rather than caching one", async () => {
    const user = userEvent.setup();
    const session = mintingSession();
    routes.set("/health", { status: "ok", uptime: 1 });
    routes.set("/campaigns", [campaignJson("The Reed Marches")]);

    render(
      <HostedSessionContext value={session}>
        <ServerPanel />
      </HostedSessionContext>,
    );

    calls.length = 0;
    const load = screen.getByRole("button", { name: "Load my campaigns" });
    await user.click(load);
    await screen.findByText("The Reed Marches");
    await user.click(load);
    await screen.findByText("The Reed Marches");

    const listed = calls.filter((call) => call.pathname === "/campaigns");
    expect(listed).toHaveLength(2);
    // Two calls, two mints. A token read once at mount would send the same
    // string twice and start 401-ing about a minute in — this is the
    // assertion that fails if someone hoists the fetch out of the handler.
    expect(session.minted()).toBe(2);
    expect(listed[0]!.authorization).toBe("Bearer session-token-1");
    expect(listed[1]!.authorization).toBe("Bearer session-token-2");
  });

  it("creates a campaign with a session token and shows it in the list", async () => {
    const user = userEvent.setup();
    const session = mintingSession();
    routes.set("/health", { status: "ok", uptime: 1 });
    routes.set("/campaigns", campaignJson("The Salt Road"));

    render(
      <HostedSessionContext value={session}>
        <ServerPanel />
      </HostedSessionContext>,
    );

    calls.length = 0;
    await user.type(screen.getByLabelText("New campaign"), "The Salt Road");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(await screen.findByText("The Salt Road")).toBeInTheDocument();
    const created = calls.find((call) => call.pathname === "/campaigns")!;
    expect(created.authorization).toBe("Bearer session-token-1");
    expect(JSON.parse(created.body)).toEqual({ name: "The Salt Road" });
  });

  it("disables the hosted controls until someone signs in", async () => {
    routes.set("/health", { status: "ok", uptime: 1 });

    const signedOut: HostedSession = {
      configured: true,
      signedIn: false,
      fetchToken: () => Promise.resolve(undefined),
    };

    render(
      <HostedSessionContext value={signedOut}>
        <ServerPanel />
      </HostedSessionContext>,
    );

    expect(await screen.findByRole("button", { name: "Load my campaigns" })).toBeDisabled();
    expect(screen.getByText(/Sign in from the header/)).toBeInTheDocument();
  });
});
