import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  dryWell,
  encounter,
  encounterId,
  encounterShelf,
  hagsBargain,
  installStubServer,
  mintingSession,
  page,
  renderEncounters,
  sandstorm,
  sketch,
  sketchId,
  tollBridge,
  wellId,
  wolves,
} from "./campaign.fixtures";

/**
 * Putting *Not yet played* in the DM's order from each row's handle: the menu,
 * the call it makes, the row landing on the press, and a refused move going
 * back. Read over `encounterShelf`, whose unplayed rows are, in the list's
 * order, the ambush, the crate, the well, the bargain and the sandstorm.
 */

const server = installStubServer();
const base = `/campaigns/${campaignId}`;

beforeEach(() => {
  server.reset();
  for (const [route, answer] of encounterShelf()) server.routes.set(route, answer);
});

const unplayed = () => screen.getByRole("region", { name: "Not yet played" });
/** The unplayed rows' names, in the order drawn, read off their handles. */
const order = () =>
  within(unplayed())
    .getAllByRole("button", { name: /^Move / })
    .map((handle) => handle.getAttribute("aria-label")!.replace(/^Move /, ""));
const handle = (name: string) => screen.getByRole("button", { name: `Move ${name}` });
const moves = () => server.calls.filter((call) => call.pathname.endsWith("/move"));

const openMenu = async (name: string) => {
  handle(name).focus();
  await userEvent.keyboard("{Enter}");
  return screen.findByRole("menu");
};

describe("moving an unplayed encounter", () => {
  it("draws a handle on each unplayed row and none on a played one", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    expect(order()).toEqual([
      "Ambush in the reeds",
      "Whatever is in the crate",
      "The dry well",
      "The hag's bargain",
      "Salt-flat sandstorm",
    ]);
    const played = screen.getByRole("region", { name: "Played" });
    expect(within(played).queryByRole("button", { name: /^Move / })).toBeNull();
    // The played rows keep the handle's gutter, so their names start where the
    // unplayed rows' names do.
    expect(played.querySelectorAll("[data-slot=move-gutter]")).toHaveLength(2);
  });

  it("offers only the moves a row can make", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    const first = await openMenu("Ambush in the reeds");
    expect(within(first).getByRole("menuitem", { name: "Move to top" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(first).getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(first).getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute(
      "aria-disabled",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    const last = await openMenu("Salt-flat sandstorm");
    expect(within(last).getByRole("menuitem", { name: "Move to bottom" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(last).getByRole("menuitem", { name: "Move up" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });

  it("moves the row on the press, says where it went, and hands focus back to its handle", async () => {
    const c = `${base}/encounters`;
    server.routes.set(`POST ${c}/${wellId}/move`, { status: 204, body: null });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    // What the list says once the move is in.
    server.routes.set(`GET ${c}`, {
      status: 200,
      body: page([dryWell, encounter, sketch, hagsBargain, sandstorm, tollBridge, wolves]),
    });

    const menu = await openMenu("The dry well");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move to top" }));

    await waitFor(() =>
      expect(order()).toEqual([
        "The dry well",
        "Ambush in the reeds",
        "Whatever is in the crate",
        "The hag's bargain",
        "Salt-flat sandstorm",
      ]),
    );
    expect(moves()).toHaveLength(1);
    expect(moves()[0]!.method).toBe("POST");
    expect(JSON.parse(moves()[0]!.body)).toEqual({ before: encounterId });
    expect(
      screen.getByText("The dry well moved to 1 of 5, before Ambush in the reeds."),
    ).toBeInTheDocument();
    await waitFor(() => expect(handle("The dry well")).toHaveFocus());
    // The re-read agrees, and the order stays.
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname === c).length,
      ).toBeGreaterThan(1),
    );
    expect(order()[0]).toBe("The dry well");
  });

  it("moves down after the row drawn below it", async () => {
    server.routes.set(`POST ${base}/encounters/${encounterId}/move`, { status: 204, body: null });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    server.routes.set(`GET ${base}/encounters`, {
      status: 200,
      body: page([sketch, encounter, dryWell, hagsBargain, sandstorm, tollBridge, wolves]),
    });

    const menu = await openMenu("Ambush in the reeds");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move down" }));

    await waitFor(() => expect(moves()).toHaveLength(1));
    expect(JSON.parse(moves()[0]!.body)).toEqual({ after: sketchId });
    expect(order().slice(0, 2)).toEqual(["Whatever is in the crate", "Ambush in the reeds"]);
  });

  it("holds the next move until the list has read the last one back", async () => {
    const c = `${base}/encounters`;
    server.routes.set(`POST ${c}/${encounterId}/move`, { status: 204, body: null });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    let answer!: () => void;
    server.routes.set(`GET ${c}`, {
      status: 200,
      body: page([sketch, encounter, dryWell, hagsBargain, sandstorm, tollBridge, wolves]),
      until: new Promise<void>((resolve) => (answer = resolve)),
    });

    const menu = await openMenu("Ambush in the reeds");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move down" }));
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname === c).length,
      ).toBeGreaterThan(1),
    );
    await waitFor(() => expect(handle("Ambush in the reeds")).toHaveFocus());

    // The move is in and its re-read is on the way: the next move waits.
    const next = await openMenu("Whatever is in the crate");
    expect(within(next).getByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(order().slice(0, 2)).toEqual(["Whatever is in the crate", "Ambush in the reeds"]);

    answer();
    const after = await openMenu("Whatever is in the crate");
    await waitFor(() =>
      expect(within(after).getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute(
        "aria-disabled",
      ),
    );
    expect(order().slice(0, 2)).toEqual(["Whatever is in the crate", "Ambush in the reeds"]);
    expect(moves()).toHaveLength(1);
  });

  it("lets go of the next move when the re-read comes back unchanged", async () => {
    server.routes.set(`POST ${base}/encounters/${encounterId}/move`, { status: 204, body: null });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    const menu = await openMenu("Ambush in the reeds");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(moves()).toHaveLength(1));
    // This stub's list still holds the old order, and the list is the answer.
    await waitFor(() => expect(order()[0]).toBe("Ambush in the reeds"));

    const next = await openMenu("Ambush in the reeds");
    await waitFor(() =>
      expect(within(next).getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute(
        "aria-disabled",
      ),
    );
  });

  it("moves among the rows a kind pill shows", async () => {
    server.routes.set(`POST ${base}/encounters/${sketchId}/move`, { status: 204, body: null });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    await userEvent.click(screen.getByRole("button", { name: /^Combat/ }));
    expect(order()).toEqual(["Ambush in the reeds", "Whatever is in the crate"]);
    server.routes.set(`GET ${base}/encounters`, {
      status: 200,
      body: page([sketch, encounter, dryWell, hagsBargain, sandstorm, tollBridge, wolves]),
    });

    const menu = await openMenu("Whatever is in the crate");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move to top" }));

    await waitFor(() => expect(moves()).toHaveLength(1));
    expect(JSON.parse(moves()[0]!.body)).toEqual({ before: encounterId });
    expect(order()).toEqual(["Whatever is in the crate", "Ambush in the reeds"]);
  });

  it("puts a refused move back and says why", async () => {
    server.routes.set(`POST ${base}/encounters/${wellId}/move`, {
      status: 404,
      body: { _tag: "NotFound", resource: "encounter", id: encounterId },
    });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    const before = order();

    const menu = await openMenu("The dry well");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move to top" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(order()).toEqual(before);
    expect(moves()).toHaveLength(1);
    await waitFor(() => expect(handle("The dry well")).toHaveFocus());
  });
});
