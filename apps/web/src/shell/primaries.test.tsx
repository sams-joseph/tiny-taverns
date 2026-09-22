import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { installStubServer } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { scenarios, screens } from "../test/screens";

/**
 * One peach primary per screen, at most.
 *
 * The accent fill is the one thing on a screen that says "this is the next
 * thing to do"; two of them say nothing. Phase 3 of the shell cleanup demoted
 * every card's own primary to `outline` and moved the campaign's verb into the
 * bar, and this is the test that remembers the rule afterwards. It walks the
 * same sixteen screens as the browser audit (`apps/web/audit/`), over the same
 * fixture maps, and counts `Button`'s default variant, which is the only thing
 * that paints `bg-accent` on a `[data-slot=button]`.
 */

const server = installStubServer();

afterEach(cleanup);

/**
 * Screens that break the budget today, with what is on them — open defects,
 * not exemptions. Each is asserted to still be over, so fixing one fails this
 * file until its line is deleted.
 */
const overBudget: Partial<Record<(typeof screens)[number]["name"], string>> = {
  party: "Invite a player and Start an encounter, both in the bar",
  world: "Shared World settings in the bar, Start a campaign and Write it down in the body",
};

const primaries = () =>
  [...document.querySelectorAll('[data-slot="button"]')].filter((button) =>
    button.classList.contains("bg-accent"),
  );

describe("the primary budget", () => {
  for (const { name, scenario, path } of screens) {
    const known = overBudget[name];
    it(`${known === undefined ? "draws at most one" : "still draws more than one"} primary on ${name}`, async () => {
      server.routes = scenarios[scenario]();
      await renderAt(path);
      await screen.findByRole("heading", { level: 1 });
      // A primary drawn with the screen's data counts, so wait for the reads.
      await waitFor(() => expect(document.querySelector('[data-slot="loading"]')).toBeNull());
      const labels = primaries().map((button) => button.textContent);
      if (known === undefined) expect(labels.length, labels.join(", ")).toBeLessThanOrEqual(1);
      else expect(labels.length, known).toBeGreaterThan(1);
    });
  }
});
