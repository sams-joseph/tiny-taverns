import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import type { HostedSession } from "../auth/hostedSession";
import {
  installMemoryStorage,
  installStubServer,
  mintingSession,
  noSession,
  page,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * The spells shelf, on the standard Library pattern.
 *
 * The shared behaviour — what a trigger says, how an any-of facet accumulates,
 * where the clear affordance comes from — is pinned in
 * `library/filters.test.tsx`. What is pinned here is this tab's application of
 * it: **the filters live in the body, not the top bar** (the top bar's layout
 * broke under them, which is half of the captain's complaint), the facets this
 * corpus offers reach the wire and combine, and the reader dialog carries the
 * standard facts-then-copy shape.
 */
const server = installStubServer();
installMemoryStorage();

beforeEach(() => server.reset());

const LIST = "GET /library/spells";

const renderSpells = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt("/library/spells", (tree) => (
    <HostedSessionScope session={hosted}>{tree}</HostedSessionScope>
  ));
};

const lastQuery = () =>
  new URLSearchParams(
    server.calls.filter((call) => call.pathname === "/library/spells").at(-1)?.search ?? "",
  );

describe("SpellLibraryScreen", () => {
  it("puts the tabs on their own row and the tab's verb inside the tab's content", async () => {
    await renderSpells(mintingSession());
    await screen.findByText("Fireball");

    // The one filter group, in the content column — the standard placement.
    const bar = screen.getByRole("group", { name: "Filters" });
    expect(bar).toContainElement(screen.getByRole("textbox", { name: "Search spells" }));
    expect(bar).toContainElement(screen.getByRole("combobox", { name: "Sort" }));

    // The captain's rule, both halves. The tab strip is its own row below the
    // header's title row — not beside the title, and holding nothing but tabs…
    const nav = screen.getByRole("navigation", { name: "Library shelves" });
    expect(nav.parentElement?.contains(screen.getByRole("heading", { name: "Library" }))).toBe(
      false,
    );
    expect(nav.parentElement?.contains(bar)).toBe(false);
    const write = screen.getByRole("button", { name: /Write a spell/ });
    expect(nav.parentElement?.contains(write)).toBe(false);

    // …and the tab-scoped verb sits inside the tab's content, in the bar.
    expect(bar).toContainElement(write);
  });

  it("combines the facets on the wire — a level, a flag and the search at once", async () => {
    await renderSpells(mintingSession());
    await screen.findByText("Fireball");

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by Level" }));
    await userEvent.click(await screen.findByRole("option", { name: "Level 3" }));
    await waitFor(() => expect(lastQuery().getAll("levels")).toEqual(["3"]));

    // Any-of within the facet: a second level widens.
    await userEvent.click(screen.getByRole("option", { name: "Cantrip" }));
    await waitFor(() => expect([...lastQuery().getAll("levels")].sort()).toEqual(["0", "3"]));

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Ritual" }));
    await waitFor(() => expect(lastQuery().get("ritual")).toBe("true"));
    // The level facet is still on the same request — the facets combine.
    expect([...lastQuery().getAll("levels")].sort()).toEqual(["0", "3"]);

    await userEvent.type(screen.getByRole("textbox", { name: "Search spells" }), "fire");
    await waitFor(() => expect(lastQuery().get("q")).toBe("fire"));
    expect(lastQuery().get("ritual")).toBe("true");
  });

  it("offers the way back out, and it clears every filter at once", async () => {
    await renderSpells(mintingSession());
    await screen.findByText("Fireball");

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by School" }));
    await userEvent.click(await screen.findByRole("option", { name: "Evocation" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByRole("textbox", { name: "Search spells" }), "fire");
    await waitFor(() => expect(lastQuery().get("q")).toBe("fire"));

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastQuery().get("q")).toBe(""));
    expect(lastQuery().getAll("schools")).toEqual([]);
    expect(screen.getByRole("textbox", { name: "Search spells" })).toHaveValue("");
  });

  it("tells the two empty silences apart", async () => {
    await renderSpells(mintingSession());
    await screen.findByText("Fireball");

    server.routes.set(LIST, { status: 200, body: page([]) });
    await userEvent.type(screen.getByRole("textbox", { name: "Search spells" }), "quokka");

    expect(await screen.findByText(/Loosen a filter/)).toBeInTheDocument();
    expect(screen.queryByText(/spell:import/)).toBeNull();
  });

  it("opens the reader with the standard facts, and no copy control anywhere", async () => {
    await renderSpells(mintingSession());
    await screen.findByText("Fireball");

    await userEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(await screen.findByText("A tiny ball of bat guano and sulfur.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Casting")).toBeInTheDocument();
    expect(within(dialog).getByText("150 feet")).toBeInTheDocument();
    // The instancing decision of 2026-09-02: a spell is not copied into a
    // campaign from here or anywhere — the Library is the whole surface.
    expect(screen.queryByRole("combobox", { name: "Copy into" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy in/ })).toBeNull();
  });
});
