import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Guards on the one thing about this theme that is not visible in the source:
 * how Tailwind v4 compiles the utilities the animated components are built from.
 *
 * The dialog shipped with its open/close keyframes carrying `translate(-50%,-50%)`
 * "because an animated transform replaces the utility that centres the popup".
 * That was true of Tailwind v3. In v4 `-translate-x-1/2` compiles to the
 * independent `translate` property, which COMPOSES with `transform` instead of
 * being replaced by it — so the popup was centred twice for the length of the
 * animation and snapped into place on the frame it ended (measured: 230px
 * across and 82px up, on a 460x328 dialog, for 200ms).
 *
 * Nothing else in the suite can see this: jsdom computes no animations and no
 * layout, and the components render identically at rest either way. So these
 * tests compile the real stylesheet and assert on the CSS that reaches a browser.
 */

const here = dirname(fileURLToPath(import.meta.url));
const themeCss = join(here, "styles.css");

/** Resolve an `@import` the way Vite's Tailwind plugin does — CSS entry first. */
function resolveStylesheet(id: string, base: string) {
  if (id.startsWith(".") || id.startsWith("/")) return resolve(base, id);
  const require = createRequire(join(base, "_"));
  for (const candidate of id.endsWith(".css") ? [id] : [`${id}/index.css`, `${id}.css`]) {
    try {
      return require.resolve(candidate);
    } catch {
      /* try the next shape */
    }
  }
  const segments = id.split("/");
  const pkg = id.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? id);
  const subpath = id.slice(pkg.length + 1);
  return join(dirname(require.resolve(`${pkg}/package.json`)), subpath || "index.css");
}

/** The classes whose compiled output these tests depend on. */
const CANDIDATES = [
  "-translate-x-1/2",
  "-translate-y-1/2",
  "animate-dialog-in",
  "data-ending-style:animate-dialog-out",
  "toast-stack",
  "transition-toast",
];

let css = "";

beforeAll(async () => {
  const compiler = await compile(readFileSync(themeCss, "utf8"), {
    base: here,
    loadStylesheet: async (id, base) => {
      const path = resolveStylesheet(id, base);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  css = compiler.build(CANDIDATES);
}, 30_000);

/** The body of a rule whose selector contains `needle`, comments stripped. */
function ruleBody(needle: string) {
  const at = css.indexOf(needle);
  expect(at, `no rule for ${needle} in the compiled CSS`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces after ${needle}`);
}

describe("dialog motion", () => {
  it("centres the popup with `translate`, which composes with `transform` rather than replacing it", () => {
    // The premise the keyframes are written against. If a future Tailwind emits
    // `transform` for these again, this fails first and the keyframes below can
    // go back to carrying the centring themselves.
    const body = ruleBody(".-translate-x-1\\/2");
    expect(body).toMatch(/(^|[;\s])translate:/);
    expect(body).not.toMatch(/(^|[;\s])transform:/);
  });

  it("keeps the centring out of the keyframes — they carry the motion delta only", () => {
    for (const name of ["tt-dialog-in", "tt-dialog-out"]) {
      const body = ruleBody(`@keyframes ${name}`);
      expect(body, `${name} restates the popup's centring translate`).not.toMatch(/-50%/);
    }
  });

  it("ends the open animation on the popup's resting transform, so there is nothing to snap to", () => {
    // `transform: none` IS the resting state, which is what makes the absence of
    // a jump structural rather than a coincidence of matching percentages.
    expect(ruleBody("@keyframes tt-dialog-in")).toMatch(/to\s*\{[^}]*transform:\s*none/);
    expect(ruleBody("@keyframes tt-dialog-out")).toMatch(/from\s*\{[^}]*transform:\s*none/);
  });

  it("still animates the popup, on a real duration and the design system's easing", () => {
    expect(ruleBody(".animate-dialog-in")).toMatch(
      /animation:\s*tt-dialog-in\s+var\(--dur-base\)\s+var\(--ease-out\)/,
    );
  });

  it("resolves the easing tokens to real curves, not to themselves", () => {
    // The bridge names its easings after the tokens they point at, so `@theme
    // inline` emits `--ease-out: var(--ease-out)`. That is inert only because the
    // design system's own `:root` is imported into layer(base), which outranks
    // Tailwind's layer(theme). Lose the real declaration and every one of these
    // becomes a self-referential cycle — invalid at computed-value time, taking
    // the whole `animation` shorthand down with it and silently killing the
    // animation. Assert a real curve survives somewhere in the output.
    for (const token of ["--ease-out", "--ease-in-out"]) {
      const declarations = [...css.matchAll(new RegExp(`${token}:\\s*([^;}]+)`, "g"))].map((m) =>
        (m[1] ?? "").trim(),
      );
      expect(declarations.length, `${token} is never declared`).toBeGreaterThan(0);
      expect(
        declarations.some((value) => value.startsWith("cubic-bezier(")),
        `${token} only ever resolves to ${JSON.stringify(declarations)} — no real curve`,
      ).toBe(true);
    }
  });
});

describe("toast motion", () => {
  it("stacks on Base UI's published geometry rather than a hand-rolled offset", () => {
    const body = ruleBody(".toast-stack");
    for (const variable of [
      "--toast-index",
      "--toast-offset-y",
      "--toast-height",
      "--toast-frontmost-height",
      "--toast-swipe-movement-x",
      "--toast-swipe-movement-y",
    ]) {
      expect(body, `toast-stack ignores ${variable}`).toContain(variable);
    }
  });

  it("expands the stack, and leaves along the swipe", () => {
    const body = ruleBody(".toast-stack");
    expect(body).toContain("[data-expanded]");
    for (const direction of ["up", "down", "left", "right"]) {
      expect(body, `no exit for a ${direction} swipe`).toContain(
        `[data-swipe-direction="${direction}"]`,
      );
    }
  });

  it("drives its timing entirely from duration tokens, so reduced motion flattens it", () => {
    // tokens/motion.css zeroes every --dur-* under prefers-reduced-motion. A
    // literal duration here would keep animating for a DM who asked it not to.
    const body = ruleBody(".transition-toast");
    expect(body).toMatch(/transform\s+var\(--dur-/);
    expect(body).toMatch(/opacity\s+var\(--dur-/);
    expect(body).toMatch(/height\s+var\(--dur-/);
    expect(body).not.toMatch(/\d+m?s\b/);
  });
});
