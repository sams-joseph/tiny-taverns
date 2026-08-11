import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The designers' adherence rules, checked at the level ESLint cannot reach.
 *
 * `packages/eslint-config/design-system.js` catches raw hex and raw px in
 * TypeScript. These tests cover the CSS — where the same rules matter most,
 * because the theme bridge is the one place a value could quietly be restated
 * instead of referenced — plus the two structural guarantees the port rests on.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const componentsDir = join(here, "components", "ui");
const themeCss = join(here, "styles.css");
const localTokensCss = join(here, "local-tokens.css");
const deliveredTokensDir = join(repoRoot, "packages", "design-system", "tokens");

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+px\b/;
/** A `dark:` variant at the start of a class name — not `--color-on-dark:`. */
const DARK_VARIANT = /(?:^|[\s"'`])dark:[a-z[]/m;

function componentSources() {
  return readdirSync(componentsDir)
    .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
    .map((name) => ({ name, source: readFileSync(join(componentsDir, name), "utf8") }));
}

/** Strip comments — prose about "38px tall" or a `dark:` variant is not a value. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");
}

describe("design-system adherence", () => {
  it("ports every delivered component", () => {
    const names = componentSources().map((file) => file.name.replace(".tsx", ""));
    expect(names.sort()).toEqual([
      "badge",
      "button",
      "card",
      "checkbox",
      "dialog",
      "icon",
      "input",
      "label",
      "select",
      "switch",
      "tabs",
      "toast",
      "toggle",
      "tooltip",
    ]);
  });

  it.each(componentSources())("$name declares no raw hex or px value", ({ source }) => {
    const code = stripComments(source);
    expect(code).not.toMatch(HEX);
    expect(code).not.toMatch(PX);
  });

  it("keeps the theme bridge free of literal values — it may only reference tokens", () => {
    const code = stripComments(readFileSync(themeCss, "utf8"));
    expect(code).not.toMatch(HEX);
    expect(code).not.toMatch(PX);
  });

  it("ships no dark: variants — the system is dark only, with no light half", () => {
    for (const { name, source } of componentSources()) {
      expect(stripComments(source), `${name} carries a dark: variant`).not.toMatch(DARK_VARIANT);
    }
    expect(stripComments(readFileSync(themeCss, "utf8"))).not.toMatch(DARK_VARIANT);
  });

  it("builds on Base UI, with no Radix anywhere in the dependency tree", () => {
    for (const { name, source } of componentSources()) {
      expect(source, `${name} imports Radix`).not.toMatch(/@radix-ui/);
    }
    const lock = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8");
    expect(lock).not.toMatch(/@radix-ui/);
  });

  it("keeps the token import list in step with the design system's own entry point", () => {
    const names = (css: string) =>
      [...css.matchAll(/tokens\/([a-z]+\.css)/g)].map((match) => match[1]);

    const delivered = names(
      stripComments(
        readFileSync(join(repoRoot, "packages", "design-system", "styles.css"), "utf8"),
      ),
    );
    const bridged = names(stripComments(readFileSync(themeCss, "utf8")));

    expect(delivered.length).toBeGreaterThan(0);
    expect(bridged).toEqual(delivered);
  });

  /**
   * `local-tokens.css` is the only place we author a design value, and it exists
   * because the vendored design system is copied byte for byte from the
   * designers' delivery. That property is worth guarding: the previous copy
   * carried two of our additions inside the delivered token files, and the next
   * delivery's diff then read as *the designers changed typography and
   * elevation* when they had changed neither.
   */
  describe("the values the delivery never tokenised", () => {
    const declared = () =>
      [
        ...readFileSync(localTokensCss, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm),
      ].map((match) => match[1]);

    it("declares at least one, and nothing the delivery already answers", () => {
      const deliveredTokens = readdirSync(deliveredTokensDir)
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFileSync(join(deliveredTokensDir, name), "utf8"))
        .join("\n");

      const names = declared();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(
          deliveredTokens,
          `${name} is tokenised by the delivery now — delete it from local-tokens.css`,
        ).not.toMatch(new RegExp(`^\\s*${name}\\s*:`, "m"));
      }
    });

    it("keeps none the bridge has stopped using", () => {
      const bridge = readFileSync(themeCss, "utf8");
      for (const name of declared()) {
        expect(bridge, `${name} is declared but nothing bridges it`).toMatch(`var(${name})`);
      }
    });
  });
});
