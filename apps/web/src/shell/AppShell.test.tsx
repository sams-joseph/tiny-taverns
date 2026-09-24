import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignId, CharacterId, EncounterRunId, SharedWorldId, SessionId } from "@taverns/api";
import type { RouteIds } from "@tanstack/react-router";
import { Schema } from "effect";
import { SHELVES } from "../library/shelves";
import type { routeTree } from "../routes";
import { renderAt } from "../test/renderRoute";

/**
 * The bar, under the group architecture: one global row for every account, and
 * a campaign row derived from **what this account is at the table** rather
 * than from a global mode.
 *
 * **There is no role switch to test any more, and that is the finding.** The
 * relation is per campaign — `useCampaignRelation`, off the membership read —
 * so the same campaign URL draws creator chrome to its creator and the two
 * player screens to a player, and the global row is the same three items
 * everywhere.
 *
 * What is enumerated below is `RouteIds` of the real route tree rather than a
 * hand-written list of screens, and `Record<RouteIds<…>, string | undefined>`
 * is the point: **a new route does not compile until it is listed here with a
 * URL**, so the chrome a new screen renders is a decision somebody makes
 * rather than one that happens to them.
 *
 * **These render the real screens at real URLs**, with no stub server behind
 * them. The bar is drawn before anything loads and stays drawn when a load
 * fails — `useCampaignRelation` falls back to `creator` on a failed read for
 * exactly that reason: a screen that cannot reach a server is the case where a
 * DM most needs the nav to still work.
 */

const worldId = Schema.decodeSync(SharedWorldId)("2b1f2a1e-0000-4000-8000-00000000aaa1");
const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const npcId = "2b1f2a1e-0000-4000-8000-00000000d0c1";
const encounterId = "2b1f2a1e-0000-4000-8000-000000000e01";
const sessionId = Schema.decodeSync(SessionId)("2b1f2a1e-0000-4000-8000-00000000cafe");
const runId = Schema.decodeSync(EncounterRunId)("2b1f2a1e-0000-4000-8000-00000000beef");
const characterId = Schema.decodeSync(CharacterId)("2b1f2a1e-0000-4000-8000-00000000fade");

/**
 * Every route there is, and the URL that reaches it. Exhaustive by type, so a
 * new one lands here.
 *
 * The parents that exist only to group a subtree or decode an id are
 * `undefined`: they render `<Outlet />` and nothing of their own, so there is
 * no bar to assert about. Naming them is still the deliberate edit this record
 * exists to demand.
 */
const everyRoute: Record<RouteIds<typeof routeTree>, string | undefined> = {
  __root__: undefined,
  "/_shell": undefined,
  "/_standalone": undefined,
  "/_shell/campaigns/$campaignId": undefined,
  "/_shell/characters": undefined,

  "/_shell/": "/",
  "/_shell/$": "/nothing-like-a-route",
  "/_shell/campaigns": "/campaigns",
  "/_shell/worlds": "/worlds",
  "/_shell/worlds/$worldId": `/worlds/${worldId}`,
  "/_shell/worlds/$worldId/chronicle": `/worlds/${worldId}/chronicle`,
  "/_shell/library": "/library",
  "/_shell/library/rules": "/library/rules",
  "/_shell/library/compendium": "/library/compendium",
  "/_shell/library/spells": "/library/spells",
  "/_shell/library/equipment": "/library/equipment",
  "/_shell/library/magic-items": "/library/magic-items",
  "/_shell/library/npcs": "/library/npcs",
  "/_shell/campaigns/$campaignId/": `/campaigns/${campaignId}`,
  "/_shell/campaigns/$campaignId/$": `/campaigns/${campaignId}/a-section-we-do-not-serve`,
  "/_shell/campaigns/$campaignId/encounters": `/campaigns/${campaignId}/encounters`,
  "/_shell/campaigns/$campaignId/encounters/$encounterId": `/campaigns/${campaignId}/encounters/${encounterId}`,
  "/_shell/campaigns/$campaignId/encounters/$": `/campaigns/${campaignId}/encounters/not-a-uuid`,
  "/_shell/campaigns/$campaignId/notes": `/campaigns/${campaignId}/notes`,
  "/_shell/campaigns/$campaignId/cast": `/campaigns/${campaignId}/cast`,
  "/_shell/campaigns/$campaignId/cast/follow-up": `/campaigns/${campaignId}/cast/follow-up`,
  "/_shell/campaigns/$campaignId/cast/$npcId/talk": `/campaigns/${campaignId}/cast/${npcId}/talk`,
  "/_shell/campaigns/$campaignId/cast/$npcId": `/campaigns/${campaignId}/cast/${npcId}`,
  "/_shell/campaigns/$campaignId/cast/$": `/campaigns/${campaignId}/cast/not-a-uuid`,
  "/_shell/campaigns/$campaignId/chronicle": `/campaigns/${campaignId}/chronicle`,
  "/_shell/campaigns/$campaignId/party": `/campaigns/${campaignId}/party`,
  "/_shell/campaigns/$campaignId/table": `/campaigns/${campaignId}/table`,
  "/_shell/campaigns/$campaignId/characters/new": `/campaigns/${campaignId}/characters/new`,
  "/_shell/campaigns/$campaignId/sessions/$sessionId/runs/$runId": `/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`,
  "/_shell/characters/": "/characters",
  "/_shell/characters/new": "/characters/new",
  "/_shell/characters/$": "/characters/not-a-uuid",
  "/_shell/characters/$characterId": `/characters/${characterId}`,
  "/_standalone/server": "/server",
  "/_standalone/join/$token": "/join/aaaaaaaaaaaaaaaaaaaaaaaa",
};

/** The routes a reader can actually be at, which is what has a bar. */
const reachable = Object.entries(everyRoute).filter(
  (entry): entry is [string, string] => entry[1] !== undefined,
);

/** The global row: everything above a campaign. */
const nav = () => screen.getByRole("navigation", { name: "Sections" });
/** The global row's controls, in order: two panel triggers and a link. */
const globalControls = () =>
  [...nav().querySelectorAll<HTMLElement>("a[href], button")].map((control) => ({
    role: control.tagName === "A" ? "link" : "button",
    name: control.textContent,
  }));
const trigger = (name: "Campaigns" | "Library") => within(nav()).getByRole("button", { name });
/** The open panel, which portals out of the `nav` to the body. */
const panel = () =>
  waitFor(() => {
    const popup = document.querySelector<HTMLElement>('[data-slot="navigation-menu-popup"]');
    expect(popup).not.toBeNull();
    return popup as HTMLElement;
  });
/** An element's text by id reference, which is how a panel row names itself. */
const textOf = (link: HTMLElement, attribute: "aria-labelledby" | "aria-describedby") =>
  document.getElementById(link.getAttribute(attribute) ?? "")?.textContent ?? null;
const panelLinks = async () =>
  within(await panel())
    .getAllByRole("link")
    .map((link) => ({
      name: textOf(link, "aria-labelledby"),
      href: link.getAttribute("href"),
      current: link.getAttribute("aria-current"),
    }));
/** The open panel's hero: its picture, its label and its tagline. */
const panelHero = async () => {
  const hero = (await panel()).querySelector<HTMLElement>('[data-slot="navigation-menu-hero"]');
  expect(hero).not.toBeNull();
  const image = (hero as HTMLElement).querySelector("img");
  const [label, tagline] = [...(hero as HTMLElement).querySelectorAll("p")].map(
    (line) => line.textContent,
  );
  return {
    alt: image?.getAttribute("alt"),
    src: image?.getAttribute("src"),
    srcSet: image?.getAttribute("srcset"),
    sizes: image?.getAttribute("sizes"),
    label,
    tagline,
  };
};
/** The one panel entry marked as the page you are on. */
const currentEntry = async (item: "Campaigns" | "Library") => {
  await userEvent.click(trigger(item));
  const current = (await panelLinks()).filter((link) => link.current === "page");
  return current.map((link) => link.name);
};

/** The campaign row, which exists only inside a campaign. */
const campaignNav = () => screen.getByRole("navigation", { name: "This campaign" });
const noCampaignNav = () => screen.queryByRole("navigation", { name: "This campaign" });

/**
 * The campaign row's items settle after the membership read does — with no
 * server behind these renders that is the moment the fetch fails and the
 * `creator` fallback applies — so an assertion about them waits.
 */
const campaignItems = () =>
  waitFor(() => {
    const links = within(campaignNav()).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    return links;
  });

afterEach(cleanup);

describe("the shell's top bar", () => {
  it.each(reachable)("carries the same global row at %s", async (_id, path) => {
    await renderAt(path);

    // One row for every account — there is no mode left to branch on, so the
    // items are the same items everywhere, join and Server pages included.
    expect(globalControls()).toEqual([
      { role: "button", name: "Campaigns" },
      { role: "button", name: "Library" },
      { role: "link", name: "Characters" },
    ]);
    expect(within(nav()).getByRole("link", { name: "Characters" })).toHaveAttribute(
      "href",
      "/characters",
    );
    // …and no role switch beside them, ever again: the relation is a fact
    // about a pair, read per campaign, and there is nothing global to toggle.
    expect(screen.queryByLabelText("Role")).toBeNull();
  });

  it("leaves Components off the row in a production build", async () => {
    vi.stubEnv("DEV", false);
    try {
      await renderAt("/campaigns");
      expect(globalControls().map((control) => control.name)).toEqual([
        "Campaigns",
        "Library",
        "Characters",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("lights Characters from a sheet, because a sheet is within the roster", async () => {
    await renderAt(`/characters/${characterId}`);
    expect(within(nav()).getByRole("link", { name: "Characters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(trigger("Campaigns")).not.toHaveAttribute("aria-current");
    expect(trigger("Library")).not.toHaveAttribute("aria-current");
  });

  describe("the Campaigns item", () => {
    it("opens onto Campaigns and Shared Worlds", async () => {
      await renderAt("/library");
      const campaigns = trigger("Campaigns");
      expect(campaigns).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(campaigns);
      expect(campaigns).toHaveAttribute("aria-expanded", "true");
      expect(await panelLinks()).toEqual([
        { name: "Campaigns", href: "/campaigns", current: null },
        { name: "Shared Worlds", href: "/worlds", current: null },
      ]);
    });

    it.each([
      ["/campaigns", "Campaigns"],
      ["/worlds", "Shared Worlds"],
      [`/worlds/${worldId}`, "Shared Worlds"],
      [`/worlds/${worldId}/chronicle`, "Shared Worlds"],
    ])("is lit at %s, with %s as the current entry", async (path, entry) => {
      await renderAt(path);
      expect(trigger("Campaigns")).toHaveAttribute("aria-current", "true");
      expect(trigger("Library")).not.toHaveAttribute("aria-current");
      expect(within(nav()).getByRole("link", { name: "Characters" })).not.toHaveAttribute(
        "aria-current",
      );
      expect(await currentEntry("Campaigns")).toEqual([entry]);
    });

    it("goes to the Shared Worlds from its panel, and closes", async () => {
      await renderAt("/campaigns");
      await userEvent.click(trigger("Campaigns"));
      await userEvent.click(within(await panel()).getByRole("link", { name: "Shared Worlds" }));
      await waitFor(() => expect(globalThis.location.pathname).toBe("/worlds"));
      await waitFor(() => expect(trigger("Campaigns")).toHaveAttribute("aria-expanded", "false"));
      expect(trigger("Campaigns")).toHaveAttribute("aria-current", "true");
    });

    it("opens from the keyboard, and Escape hands focus back to it", async () => {
      await renderAt("/characters");
      const campaigns = trigger("Campaigns");
      act(() => campaigns.focus());
      await userEvent.keyboard("{ArrowDown}");
      expect(campaigns).toHaveAttribute("aria-expanded", "true");
      const first = within(await panel()).getByRole("link", { name: "Campaigns" });
      await waitFor(() => expect(first).toHaveFocus());
      await userEvent.keyboard("{ArrowDown}");
      expect(within(await panel()).getByRole("link", { name: "Shared Worlds" })).toHaveFocus();

      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(campaigns).toHaveAttribute("aria-expanded", "false"));
      expect(campaigns).toHaveFocus();

      // The row itself is walked with the arrows, triggers and link alike.
      await userEvent.keyboard("{ArrowRight}");
      expect(trigger("Library")).toHaveFocus();
      await userEvent.keyboard("{ArrowRight}");
      expect(within(nav()).getByRole("link", { name: "Characters" })).toHaveFocus();
    });
  });

  describe("the panels' heroes and descriptions", () => {
    it.each([
      ["Campaigns", /campaigns-448\.webp/, /campaigns-448\.webp 448w, .*campaigns-768\.webp 768w/],
      ["Library", /library-448\.webp/, /library-448\.webp 448w, .*library-768\.webp 768w/],
    ] as const)(
      "draws the %s hero: a decorative picture at 1x and 2x, a label and a tagline",
      async (item, src, srcSet) => {
        await renderAt("/characters");
        await userEvent.click(trigger(item));
        const hero = await panelHero();
        expect(hero.alt).toBe("");
        expect(hero.src).toMatch(src);
        expect(hero.srcSet).toMatch(srcSet);
        expect(hero.sizes).toBe("(min-width: 30rem) 28rem, 100vw");
        expect(hero.label).toBe(item);
        expect(hero.tagline).toMatch(/\w/);
        // The tile is decoration, not a second way into the section: the only
        // links in the panel are its rows.
        expect(within(await panel()).getAllByRole("link")).toHaveLength(
          item === "Campaigns" ? 2 : SHELVES.length,
        );
      },
    );

    it("describes Campaigns and Shared Worlds under their names", async () => {
      await renderAt("/characters");
      await userEvent.click(trigger("Campaigns"));
      const rows = within(await panel()).getAllByRole("link");
      expect(
        rows.map((row) => [textOf(row, "aria-labelledby"), textOf(row, "aria-describedby")]),
      ).toEqual([
        ["Campaigns", "Your tables: sessions, encounters, notes and the party"],
        ["Shared Worlds", "Settings several campaigns share, with one chronicle"],
      ]);
    });

    it("describes every shelf under its name, from the one list", async () => {
      await renderAt("/characters");
      await userEvent.click(trigger("Library"));
      const rows = within(await panel()).getAllByRole("link");
      expect(
        rows.map((row) => [textOf(row, "aria-labelledby"), textOf(row, "aria-describedby")]),
      ).toEqual(SHELVES.map((shelf) => [shelf.label, shelf.description]));
      for (const shelf of SHELVES) expect(shelf.description.trim()).not.toBe("");
      // The row's name is its title alone; the line under it is its description.
      expect(
        within(await panel()).getByRole("link", { name: "Spells" }),
      ).toHaveAccessibleDescription(
        SHELVES.find((shelf) => shelf.label === "Spells")?.description ?? "",
      );
    });
  });

  describe("the Library item", () => {
    it("opens onto every shelf, the same list as the Library's own tabs", async () => {
      await renderAt("/library/spells");
      const tabs = within(screen.getByRole("navigation", { name: "Library shelves" }))
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]);

      await userEvent.click(trigger("Library"));
      const entries = await panelLinks();
      expect(entries.map((entry) => [entry.name, entry.href])).toEqual(
        SHELVES.map((shelf) => [shelf.label, shelf.to]),
      );
      // The tab row keeps some shelves in its *More* menu on a narrow row, and
      // jsdom draws both; every one it links is on the panel, in its order.
      expect(tabs.length).toBeGreaterThan(0);
      for (const tab of tabs)
        expect(entries.map((entry) => [entry.name, entry.href])).toContainEqual(tab);
    });

    it.each(SHELVES.map((shelf) => [shelf.to, shelf.label]))(
      "is lit at %s, with %s as the current entry",
      async (path, label) => {
        await renderAt(path);
        expect(trigger("Library")).toHaveAttribute("aria-current", "true");
        expect(trigger("Campaigns")).not.toHaveAttribute("aria-current");
        expect(within(nav()).queryByRole("link", { name: "Rules" })).toBeNull();
        expect(noCampaignNav()).toBeNull();
        expect(await currentEntry("Library")).toEqual([label]);
      },
    );

    it("goes to a shelf from its panel", async () => {
      await renderAt("/campaigns");
      await userEvent.click(trigger("Library"));
      await userEvent.click(within(await panel()).getByRole("link", { name: "Magic items" }));
      await waitFor(() => expect(globalThis.location.pathname).toBe("/library/magic-items"));
      await waitFor(() => expect(trigger("Library")).toHaveAttribute("aria-current", "true"));
    });

    it("lands an old bestiary bookmark on the campaign, with the Library above", async () => {
      // The campaign corpus routes are gone with the instancing decision of
      // 2026-09-02; a stale bookmark falls through the splat to the campaign
      // it named, and the Library on the global row is where the corpus lives.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.queryByRole("link", { name: "Bestiary" })).toBeNull();
      expect(trigger("Library")).toBeTruthy();
      await waitFor(() =>
        expect(
          within(campaignNav())
            .getByRole("link", { name: "Overview" })
            .getAttribute("aria-current"),
        ).toBe("page"),
      );
      expect(screen.getByTitle("Campaign home")).toBeTruthy();
    });
  });

  it("keeps Ask Hob on the bar above any campaign", async () => {
    await renderAt("/campaigns");
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toBeTruthy();
  });

  /**
   * **Every control on the global row is the one 26px pill.** *Ask Hob* was a
   * `Button size="sm"` — 32px measured, on a 44px row, beside four 26px nav
   * pills — which is the delivery's `GlobalItem` and its *Ask Hob* drawn as two
   * different things when the delivery draws them as one. jsdom computes no
   * height, so what is asserted is the recipe they share: one class list, and
   * `h-6.5` is the part of it that is the height.
   */
  it("wears one pill for every control on the global row", async () => {
    await renderAt("/campaigns");
    const row = nav().parentElement;
    expect(row).not.toBeNull();
    const controls = [...(row as HTMLElement).querySelectorAll<HTMLElement>("a[href], button")];
    // Campaigns and Library (panel triggers), Characters, and Ask Hob.
    expect(controls.length).toBe(4);
    for (const control of controls) {
      expect(control.className).toContain("h-6.5");
      expect(control.className).toContain("rounded-pill");
    }
  });

  /**
   * The one control on the bar that has a state, saying so. `AppShell.jsx` draws
   * the open panel as an accent-soft fill under an accent border and the product
   * did not, so a panel ⌘K had closed left the button looking exactly as it did
   * with the panel up.
   */
  it("reflects the Hob panel's state on the button that opens it", async () => {
    await renderAt("/campaigns");
    const button = screen.getByRole("button", { name: /Ask Hob/ });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(button.className).toContain("bg-accent-soft");

    // Closed from the keyboard, which is the case a button holding its own idea
    // of open would get wrong: `useHobPanel` owns ⌘K and Esc.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(button.className).not.toContain("bg-accent-soft");
  });

  /**
   * A fall-back draws the bar of the screen it fell back *to*, which is the
   * whole point of falling back a level rather than to a not-found page.
   */
  it("draws a campaign's bar on a section under it that does not exist", async () => {
    await renderAt(`/campaigns/${campaignId}/a-section-we-do-not-serve`);
    const links = await campaignItems();
    expect(links.map((link) => link.textContent)).toContain("Encounters");
  });

  /**
   * The sixth delivery's rule, which is the shape of the bar rather than two
   * lists somebody keeps disjoint: *the thin top row is everything above a
   * campaign, the second row exists only inside one, and nothing appears on
   * both.*
   */
  it.each([true, false])("has no Components item when DEV is %s", async (dev) => {
    vi.stubEnv("DEV", dev);
    try {
      await renderAt("/campaigns");
      expect(within(nav()).queryByText("Components")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe("two tiers", () => {
    it("has no campaign row above a campaign", async () => {
      for (const path of [
        "/campaigns",
        "/worlds",
        `/worlds/${worldId}`,
        "/library",
        "/library/rules",
        "/library/spells",
        "/library/equipment",
        "/library/magic-items",
        "/characters",
        "/server",
      ]) {
        await renderAt(path);
        expect(noCampaignNav()).toBeNull();
        cleanup();
      }
    });

    it("draws the campaign's own screens on the second row, inside one", async () => {
      await renderAt(`/campaigns/${campaignId}`);

      const links = await campaignItems();
      // No corpus screen on this row at all — the instancing decision of
      // 2026-09-02. The Library above holds the originals; what a campaign
      // uses of them shows up inside encounters, fights and the create form.
      expect(links.map((link) => link.textContent)).toEqual([
        "Overview",
        "Encounters",
        "Party",
        "Notes",
        "Cast",
        "Chronicle",
      ]);
      // Every one of them names the campaign, because every endpoint behind
      // them does — which is the same fact that makes the row exist at all.
      for (const link of links) {
        expect(link.getAttribute("href")).toContain(`/campaigns/${campaignId}`);
      }
    });

    it("lights nothing on the global row while you are inside a campaign", async () => {
      // **This is "nothing appears on both rows", and it is one value rather
      // than two lists**: there is a single `Section` for the whole bar, so
      // being on a campaign screen and no global item being lit are the same
      // fact.
      await renderAt(`/campaigns/${campaignId}/notes`);

      for (const control of [
        trigger("Campaigns"),
        trigger("Library"),
        within(nav()).getByRole("link", { name: "Characters" }),
      ]) {
        expect(control).not.toHaveAttribute("aria-current");
      }
      await waitFor(() =>
        expect(
          within(campaignNav()).getByRole("link", { name: "Notes" }).getAttribute("aria-current"),
        ).toBe("page"),
      );
    });

    it("lights Overview from a fight, because a fight is within its campaign", async () => {
      await renderAt(`/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`);
      await waitFor(() =>
        expect(
          within(campaignNav())
            .getByRole("link", { name: "Overview" })
            .getAttribute("aria-current"),
        ).toBe("page"),
      );
    });

    it("titles the second row with the campaign, and that is the way home", async () => {
      // The shell builds this link itself — where home is, is a fact about the
      // route — so no screen can point the way back at the wrong one. And it
      // is one link now, whatever the reader is at the table: the same URL
      // renders each of them the projection that is theirs.
      await renderAt(`/campaigns/${campaignId}/bestiary`);
      expect(screen.getByTitle("Campaign home").getAttribute("href")).toBe(
        `/campaigns/${campaignId}`,
      );
    });
  });
});
