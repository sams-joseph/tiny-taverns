import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { POPUP_ROW_HIGHLIGHTED, POPUP_ROW_HOVERED } from "./popup-row";

/**
 * A highlighted row must not be filled with its popup's own colour. Both are
 * resolved the way the browser would — utility, bridge, delivered token, down
 * to the hex — because each name alone looks fine: it was `bg-slate-700` on
 * `bg-surface-raised` that drew nothing, once a delivery made those one step.
 */

const here = dirname(fileURLToPath(import.meta.url));
const bridge = readFileSync(join(here, "..", "styles.css"), "utf8");
const colors = readFileSync(
  join(here, "..", "..", "..", "design-system", "tokens", "colors.css"),
  "utf8",
);

function declarations(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name!,
      value!.trim(),
    ]),
  );
}

const tokens = declarations(colors);
const theme = declarations(bridge);

/** A `bg-*` utility's colour, through the bridge and the token chain. */
function resolve(utility: string): string {
  const name = /bg-([\w-]+)$/.exec(utility)?.[1];
  expect(name, `${utility} is a background utility`).toBeDefined();
  let value = theme.get(`--color-${name}`);
  expect(value, `the bridge has --color-${name}`).toBeDefined();
  for (let hops = 0; value!.startsWith("var("); hops += 1) {
    expect(hops, `${utility} resolves`).toBeLessThan(8);
    value = tokens.get(/var\((--[\w-]+)\)/.exec(value!)![1]!);
    expect(value, `${utility} resolves through the delivered tokens`).toBeDefined();
  }
  return value!.toLowerCase();
}

describe("a popup row's highlight", () => {
  const popup = resolve("bg-surface-raised");

  it.each([
    ["data-highlighted", POPUP_ROW_HIGHLIGHTED],
    ["hover and focus-visible", POPUP_ROW_HOVERED],
  ])("on %s is not the popup's own fill", (_, classes) => {
    for (const utility of classes.split(" ")) {
      expect(resolve(utility), utility).not.toBe(popup);
    }
  });
});
