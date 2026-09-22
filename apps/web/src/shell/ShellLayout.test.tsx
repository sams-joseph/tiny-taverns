import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaignId, installStubServer } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

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
/** The layout's bar slot: the element a screen's `TopBar` portals into. */
const slotOf = (title: string) =>
  screen.getByRole("heading", { level: 1, name: title }).closest("header")?.parentElement;

describe("the persistent shell", () => {
  it("keeps the header, the nav, the bar's slot and an open panel across destinations", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { level: 1, name: "Overview" });

    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
    await waitFor(() => expect(panel()).toHaveAttribute("data-state", "expanded"));

    const before = {
      header: header(),
      sections: sections(),
      panel: panel(),
      slot: slotOf("Overview"),
    };
    expect(before.slot).toBeTruthy();

    await userEvent.click(within(campaignNav()).getByRole("link", { name: "Notes" }));
    await screen.findByRole("heading", { level: 1, name: "Notes" });

    expect(header()).toBe(before.header);
    expect(sections()).toBe(before.sections);
    expect(panel()).toBe(before.panel);
    expect(slotOf("Notes")).toBe(before.slot);
    // …and the panel is still open: its state is the layout's, not the screen's.
    expect(panel()).toHaveAttribute("data-state", "expanded");
    // One bar, not the old screen's left behind beside the new one.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("pins one chrome stack while an ordinary screen uses the document scroll", async () => {
    await renderAt("/campaigns");

    const chrome = header()?.parentElement;
    expect(chrome).toHaveClass("sticky", "top-0", "z-chrome");

    const frame = chrome?.parentElement;
    expect(frame).toHaveClass("min-h-screen");
    expect(frame).not.toHaveClass("h-screen", "overflow-hidden");

    const contentRegion = chrome?.nextElementSibling;
    expect(contentRegion).toHaveClass("min-h-full");
    expect(contentRegion).not.toHaveClass("overflow-hidden");
    expect(contentRegion?.firstElementChild).toHaveClass("overflow-visible");
    expect(contentRegion?.firstElementChild).not.toHaveClass("overflow-auto");
  });

  it("keeps an explicit fill screen bounded below the same chrome stack", async () => {
    await renderAt(`/campaigns/${campaignId}/table`);

    const chrome = header()?.parentElement;
    expect(chrome).toHaveClass("sticky", "top-0", "z-chrome");

    const frame = chrome?.parentElement;
    expect(frame).toHaveClass("h-screen", "overflow-hidden");
    expect(frame).not.toHaveClass("min-h-screen");

    const contentRegion = chrome?.nextElementSibling;
    expect(contentRegion).toHaveClass("min-h-0", "overflow-hidden");
    expect(contentRegion?.firstElementChild).toHaveClass("overflow-hidden");
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

  it("has one Hob panel state, the layout's — the gallery's specimens aside", () => {
    // The gallery sits outside the persistent layout (`StandaloneLayout`), and
    // its specimens demonstrate the seam with a panel state of their own.
    const callers = sources()
      .filter(({ file }) => !file.startsWith(`gallery${"/"}`))
      .filter(({ source }) => /(?<!function )\buseHobPanel\(/.test(code(source)))
      .map(({ file }) => file);
    expect(callers).toEqual([join("shell", "ShellLayout.tsx")]);
  });
});
