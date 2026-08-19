import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderScreen,
} from "./campaign.fixtures";

/**
 * Inviting a player, from the DM's side.
 *
 * The four things this surface has to get right are all about a credential
 * rather than about a form: the link is shown **once**, the list says who took
 * one, withdrawing says which of its two meanings is about to apply, and a
 * private campaign warns that anyone joining it will see nothing.
 */

const server = installStubServer();
installMemoryStorage();

const invitesPath = `/campaigns/${campaignId}/invites`;

const inviteId = "2b1f2a1e-0000-4000-8000-000000000e01";
const stamps = { createdAt: "2026-08-04T13:03:28.070Z" };

const waiting = {
  id: inviteId,
  campaignId,
  label: "Ilse",
  status: "live",
  expiresAt: "2026-08-18T13:03:28.070Z",
  revokedAt: null,
  redeemedAt: null,
  redeemedByName: null,
  ...stamps,
};

const taken = {
  ...waiting,
  status: "redeemed",
  redeemedAt: "2026-08-05T19:00:00.000Z",
  redeemedByName: "Ilse",
};

const withdrawn = {
  ...taken,
  status: "revoked",
  revokedAt: "2026-08-06T09:00:00.000Z",
};

/** The plaintext token — the one thing that exists in exactly one response. */
const TOKEN = "Nk9-b3JkZXJfb2ZfdGhlX2ZlcnJ5bWFu";

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  // The subpath fixtures below move the page's own path, and jsdom keeps one
  // `location` for the whole file — so it is put back rather than left for the
  // next test to inherit.
  window.history.replaceState({}, "", "/");
});

const openInvites = async () => {
  await renderScreen(mintingSession());
  await screen.findByRole("heading", { name: "Overview" });
  await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
};

describe("inviting a player", () => {
  it("shows the link once, and says so", async () => {
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [] });
    server.routes.set(`POST ${invitesPath}`, {
      status: 200,
      body: { invite: waiting, token: TOKEN },
    });

    await openInvites();
    await userEvent.type(await screen.findByLabelText("Who is it for?"), "Ilse");
    await userEvent.click(screen.getByRole("button", { name: "Make a link" }));

    // The whole link, composed in the browser because only the browser knows
    // its own origin — and carrying the token in the **fragment**, which is
    // what keeps it out of the server's access log.
    const link = await screen.findByText(new RegExp(`#/join/${TOKEN}$`));
    expect(link.textContent).toContain(`#/join/${TOKEN}`);
    expect(screen.getByText("Copy this now — it is shown once")).toBeTruthy();

    expect(bodyOf(server, "POST", "/invites")).toEqual({ label: "Ilse" });
  });

  /**
   * The link is the one URL this product hands to somebody who is not already
   * standing in the app, so it has to be right wherever the app is served
   * from. Both shapes are asserted whole — origin, path and fragment — because
   * a link that is merely *plausible* is one a stranger discovers is wrong.
   */
  describe("the link survives being hosted anywhere", () => {
    const mintLink = async (): Promise<string> => {
      server.routes.set(`GET ${invitesPath}`, { status: 200, body: [] });
      server.routes.set(`POST ${invitesPath}`, {
        status: 200,
        body: { invite: waiting, token: TOKEN },
      });
      await openInvites();
      await userEvent.click(await screen.findByRole("button", { name: "Make a link" }));
      const link = await screen.findByText(new RegExp(`#/join/${TOKEN}$`));
      return link.textContent ?? "";
    };

    it("is the plain URL when the app is served from a root", async () => {
      expect(await mintLink()).toBe(`${window.location.origin}/#/join/${TOKEN}`);
    });

    it("keeps the prefix when the app is served under a subpath", async () => {
      // What a deployment to `example.com/taverns/` looks like from inside the
      // page: same origin, a path in front of the app.
      window.history.replaceState({}, "", "/taverns/");

      expect(await mintLink()).toBe(`${window.location.origin}/taverns/#/join/${TOKEN}`);
    });

    it("keeps the token in the fragment, and out of the path", async () => {
      window.history.replaceState({}, "", "/taverns/");
      const url = new URL(await mintLink());

      // The disclosure property, asserted rather than assumed: a browser never
      // sends a fragment in a request line, a redirect or a `Referer`, so the
      // token reaches no access log on the way to being redeemed.
      expect(url.hash).toBe(`#/join/${TOKEN}`);
      expect(url.pathname).toBe("/taverns/");
      expect(url.pathname).not.toContain(TOKEN);
      expect(url.search).not.toContain(TOKEN);
    });
  });

  it("names who took one, and offers to take the seat back", async () => {
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [taken] });
    server.routes.set(`POST ${invitesPath}/${inviteId}/revoke`, {
      status: 200,
      body: withdrawn,
    });

    await openInvites();

    // The answer to "what if a link is forwarded to somebody I did not mean":
    // the DM can see who took it.
    expect(await screen.findByText(/Taken by Ilse/)).toBeTruthy();
    // …and the button says which of the two meanings applies, rather than
    // leaving it to be discovered.
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(
        server.calls.some(
          (call) => call.method === "POST" && call.pathname.endsWith(`/${inviteId}/revoke`),
        ),
      ).toBe(true);
    });
  });

  it("does not offer to take back a seat it has already taken back", async () => {
    // The one line here that could make a DM think a revoke had not worked:
    // asked in the wrong order, a withdrawn-after-accepted row reads "Removing
    // it takes their seat back" about a seat that is already gone. Found by
    // driving a browser against a real revoked row, which is the only state
    // that shows it.
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [withdrawn] });

    await openInvites();

    expect(await screen.findByText("Withdrawn. Ilse no longer reaches this table.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("says a waiting invitation is withdrawn rather than removed", async () => {
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [waiting] });

    await openInvites();

    expect(await screen.findByRole("button", { name: "Withdraw" })).toBeTruthy();
    expect(screen.getByText(/Good until 18 August 2026, and only once\./)).toBeTruthy();
  });

  it("warns that a private campaign shows a new player nothing", async () => {
    // The master toggle, named where it matters: a player who joins an unshared
    // campaign reads nothing in it, and an invitation sent before it is shared
    // lands somebody on a blank page.
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [] });

    await openInvites();

    expect(await screen.findByText(/so anyone who joins sees nothing in it/)).toBeTruthy();
  });

  it("drops the warning once the campaign is shared", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, visibility: "shared" },
    });
    server.routes.set(`GET ${invitesPath}`, { status: 200, body: [] });

    await openInvites();

    await screen.findByText(/None yet\./);
    expect(screen.queryByText(/so anyone who joins sees nothing in it/)).toBeNull();
  });
});
