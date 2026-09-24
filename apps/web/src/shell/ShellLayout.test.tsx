import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaignId, installStubServer, npcId } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { scenarios, screens } from "../test/screens";

/**
 * The shell is a layout route: mounted once, and the same nodes from one screen
 * to the next.
 *
 * It used to be composed inside every screen, so every navigation tore down the
 * header, both nav rows, the bar and the Hob panel — and an open panel closed
 * itself. Node identity is the measurement, the idiom `CharacterSheetScreen`'s
 * save test uses: a node that survived is the same object.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

afterEach(cleanup);

const sections = () => screen.getByRole("navigation", { name: "Sections" });
const header = () => sections().closest("header");
const campaignNav = () => screen.getByRole("navigation", { name: "This campaign" });
/** The sidebar the Hob panel is; it slides off-canvas rather than unmounting. */
const panel = () => document.querySelector("[data-slot=sidebar]");
/**
 * The layout's bar slot: the element a screen's `TopBar` portals into, last in
 * the sticky stack after the two nav rows' `<header>`.
 */
const slot = () => header()?.nextElementSibling;

describe("the persistent shell", () => {
  it("keeps the header, the nav, the bar's slot and an open panel across destinations", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { level: 1, name: "The Salt Road" });

    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "expanded"));

    const before = {
      header: header(),
      sections: sections(),
      panel: panel(),
      slot: slot(),
    };
    expect(before.slot).toBeTruthy();

    await userEvent.click(within(campaignNav()).getByRole("link", { name: "Notes" }));
    await screen.findByRole("heading", { level: 1, name: "Notes" });

    expect(header()).toBe(before.header);
    expect(sections()).toBe(before.sections);
    expect(panel()).toBe(before.panel);
    expect(slot()).toBe(before.slot);
    // …and the panel is still open: its state is the layout's, not the screen's.
    expect(panel()).toHaveAttribute("data-state", "expanded");
    // One header, not the old screen's left behind beside the new one.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    // …and out of the campaign the same slot carries the bar again.
    await userEvent.click(within(sections()).getByRole("link", { name: "Campaigns" }));
    await screen.findByRole("heading", { level: 1, name: "Campaigns" });
    expect(slot()).toBe(before.slot);
    expect(slot()?.querySelector("h1")).toHaveTextContent("Campaigns");
  });

  /**
   * **Inside a campaign there is no per-screen bar** — the captain's decision
   * of 2026-09-23, from the Overview redesign: the campaign row is the last
   * chrome row on every tab, and the screen's title, verbs and tabs are the top
   * of its content. Above a campaign the bar stays. `TopBar` decides from the
   * route, so this walks every screen the audit measures, a player's included,
   * and asks where each one's `h1` landed.
   */
  it.each(screens.map((entry) => [entry.name, entry] as const))(
    "draws %s's header where its route says",
    async (name, { scenario, path }) => {
      server.routes = scenarios[scenario]();
      await renderAt(path);
      await screen.findByRole("heading", { level: 1 });
      // The route wrappers draw a header of their own while the relation
      // settles, so ask once the screen behind them has loaded.
      await waitFor(() => expect(document.querySelector('[data-slot="loading"]')).toBeNull());
      const title = screen.getByRole("heading", { level: 1 });
      const inCampaign = path.startsWith(`/campaigns/${campaignId}`);

      if (inCampaign) {
        expect(slot()).toBeEmptyDOMElement();
        expect(screen.getByRole("main").contains(title)).toBe(true);
        // The creator's Overview titles itself with the campaign's name, in
        // the hero over its cover (`campaign/CampaignHero.tsx`); every other
        // campaign tab with `PageHeader`'s in-content heading.
        if (name === "overview") expect(title.closest("[data-slot=campaign-hero]")).not.toBeNull();
        else expect(title.closest("header")).toHaveAttribute("data-slot", "page-heading");
      } else {
        expect(slot()?.contains(title)).toBe(true);
        expect(title.closest("header")).toHaveAttribute("data-slot", "page-header");
      }
    },
    30_000,
  );

  it("pins one chrome stack while an ordinary screen uses the document scroll", async () => {
    await renderAt("/campaigns");

    const chrome = header()?.parentElement;
    expect(chrome).toHaveClass("sticky", "top-0", "z-chrome");

    // The chrome is inside the shell's column, and the column is the frame's
    // first child: the bars narrow with `main` rather than spanning the panel.
    const column = chrome?.parentElement;
    expect(column).toHaveClass("@container/app", "flex-1", "min-w-0");

    const frame = column?.parentElement;
    expect(frame).toHaveClass("min-h-screen");
    expect(frame).not.toHaveClass("h-screen", "overflow-hidden");
    // Vertically it grows with the document; sideways it clips, or the
    // collapsed Hob column off its right edge is 400px of horizontal scroll.
    // `HobDock.test.tsx` owns the reason.
    expect(frame).toHaveClass("overflow-x-clip");

    const contentRegion = chrome?.nextElementSibling;
    // Not `min-h-full`: inside the column that is the viewport under the
    // chrome, and the document then scrolls past the frame and the pinned panel.
    expect(contentRegion).toHaveClass("flex-1");
    expect(contentRegion).not.toHaveClass("min-h-full");
    expect(contentRegion).not.toHaveClass("overflow-hidden");
    expect(contentRegion?.firstElementChild).toHaveClass("overflow-visible");
    expect(contentRegion?.firstElementChild).not.toHaveClass("overflow-auto");
  });

  // There is no bounded mode any more: the screens that used to own a scroller
  // (the player table, the NPC talk page, the sheet and the runner) get the
  // same frame as every other, and pin their own `sticky` under the chrome by
  // the height it publishes.
  it.each([
    ["the player table", `/campaigns/${campaignId}/table`],
    ["the NPC talk page", `/campaigns/${campaignId}/cast/${npcId}/talk`],
  ])("gives %s the document scroll, not a bounded frame", async (_, path) => {
    await renderAt(path);

    const chrome = header()?.parentElement;
    expect(chrome).toHaveClass("sticky", "top-0", "z-chrome");

    const column = chrome?.parentElement;
    expect(column?.style.getPropertyValue("--chrome-height")).toMatch(/^\d+(\.\d+)?px$/);

    const frame = column?.parentElement;
    expect(frame).toHaveClass("min-h-screen");
    expect(frame).not.toHaveClass("h-screen", "overflow-hidden");

    const contentRegion = chrome?.nextElementSibling;
    expect(contentRegion).not.toHaveClass("min-h-0", "overflow-hidden");
    expect(contentRegion?.firstElementChild).toHaveClass("overflow-visible");
    expect(screen.getByRole("main")).not.toHaveClass("min-h-0");
  });

  /**
   * The geometry is the audit's (`apps/web/audit/`): inline, the panel's top is
   * 0, its height is the viewport's, and the chrome's right edge meets its left.
   * What jsdom can see is the shape that produces it — the panel is the frame's
   * own column beside the shell, in a slot pinned at the viewport's height, and
   * nothing in the chrome stack or the content region contains it.
   */
  it("docks the panel beside the whole shell, full height, not under the bars", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { level: 1, name: "The Salt Road" });
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "expanded"));

    const chrome = header()?.parentElement;
    const column = chrome?.parentElement;
    const frame = column?.parentElement;
    const slot = frame?.lastElementChild;

    expect(slot).not.toBe(column);
    expect(slot?.contains(panel())).toBe(true);
    expect(column?.contains(panel())).toBe(false);
    expect(slot).toHaveClass("sticky", "top-0", "h-screen", "self-start", "shrink-0");
  });

  /**
   * jsdom computes no layout, so the pin is the class and the number is the
   * browser audit's (`apps/web/audit/`): 44 / 46 / 76 / 40 wherever there is a
   * bar, a 91px chrome stack on every campaign tab at every width, and one
   * title y and header height across a campaign's tabs. A `min-h-*` is what let
   * sibling screens drift apart before.
   */
  it("sizes every chrome row to a fixed height, the bar's from its wrap breakpoint up", async () => {
    await renderAt("/library/spells");
    const bar = (await screen.findByRole("heading", { level: 1 })).closest(
      "[data-slot=page-header]",
    );

    expect(sections().parentElement).toHaveClass("h-11");
    // Narrow, the bar's actions wrap on their own row rather than overlap;
    // `apps/web/audit` measures that they do not.
    expect(bar?.children[0]).toHaveClass("flex-wrap", "@4xl/app:h-19", "@4xl/app:flex-nowrap");
    expect(bar?.querySelector("[data-slot=page-header-actions]")).toHaveClass("flex-wrap");
    expect(bar?.children[1]).toHaveClass("h-10");
    for (const row of [sections().parentElement, ...(bar?.children ?? [])])
      expect(row?.className).not.toMatch(/\bmin-h-/);
  });

  it("gives a campaign tab the two nav rows and its header in content, with the same reserved lines", async () => {
    await renderAt(`/campaigns/${campaignId}/cast/${npcId}`);
    const heading = (await screen.findByRole("heading", { level: 1 })).closest(
      "[data-slot=page-heading]",
    );

    expect(campaignNav().parentElement).toHaveClass("h-11.5");
    expect(campaignNav().previousElementSibling).toHaveClass("max-w-96", "min-w-0");
    // The title's two lines are reserved and the row does not wrap from the
    // breakpoint up, so the content under the header starts at one y on every
    // tab; the NPC's own tabs are a row of their own below it.
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveClass("h-12");
    expect(heading?.children[0]).toHaveClass("flex-wrap", "@4xl/app:flex-nowrap");
    expect(heading?.children[1]).toHaveClass("h-10");
    expect(
      within(heading as HTMLElement).getByRole("navigation", { name: "NPC sections" }),
    ).toBeInTheDocument();
    for (const row of [campaignNav().parentElement, ...(heading?.children ?? [])])
      expect(row?.className).not.toMatch(/\bmin-h-/);
  });

  it("keeps an open panel open on the way out of a campaign", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { level: 1, name: "The Salt Road" });
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "expanded"));
    const before = panel();

    await userEvent.click(within(sections()).getByRole("link", { name: "Campaigns" }));
    await screen.findByRole("heading", { level: 1, name: "Campaigns" });
    expect(panel()).toBe(before);
    expect(panel()).toHaveAttribute("data-state", "expanded");
    expect(screen.getByRole("button", { name: /Ask Hob/ })).toHaveAttribute("aria-pressed", "true");
  });
});

/**
 * The structural half: one mount is a property of the source, so it is checked
 * there. A screen that composed its own shell again would render a second
 * header inside the first, and nothing on screen would say which was which.
 */
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const sources = (): ReadonlyArray<{ readonly file: string; readonly source: string }> =>
  (readdirSync(srcDir, { recursive: true }) as Array<string>)
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({ file, source: readFileSync(join(srcDir, file), "utf8") }));

/** Strip comments — prose that names `AppShell` or shows a call is not a use. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one shell", () => {
  it("is imported by the layout and nothing else", () => {
    const importers = sources()
      .filter(({ source }) => /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from/.test(code(source)))
      .map(({ file }) => file);
    expect(importers).toEqual([join("shell", "ShellLayout.tsx")]);
  });

  /**
   * **The shell asks containers, not the window.** It had eight `sm:` uses while
   * every screen under it turned over on the width of the box it was in, so the
   * one file that states the rule was the one file breaking it. The page edge
   * asks `@container/app` on the frame now, and each row asks its own container
   * for everything else — see `AppShell.tsx`.
   *
   * A grep rather than a note, because the way this comes back is somebody
   * reaching for `sm:` out of habit on a row that is already a container.
   */
  it("has no viewport breakpoint anywhere in the shell", () => {
    const viewport = /(?<![@\w-])(max-)?(sm|md|lg|xl|2xl):/;
    const offenders = sources()
      .filter(({ file }) => file.startsWith(`shell${"/"}`))
      .filter(({ source }) => viewport.test(code(source)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("has no independently scrolling row in the shell chrome", () => {
    const overflow = /\boverflow-(?:x-|y-)?auto\b/;
    const offenders = sources()
      .filter(({ file }) => file.startsWith(`shell${"/"}`))
      .filter(({ source }) => overflow.test(code(source)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("has one Hob panel state, the layout's", () => {
    const callers = sources()
      .filter(({ source }) => /(?<!function )\buseHobPanel\(/.test(code(source)))
      .map(({ file }) => file);
    expect(callers).toEqual([join("shell", "ShellLayout.tsx")]);
  });
});
