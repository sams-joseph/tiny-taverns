import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The overlay layering scale, guarded the only way it can be.
 *
 * This is the same class of defect as the dialog animation bug that
 * `motion.test.ts` exists for: invisible to the test environment, because jsdom
 * computes neither layout nor stacking. Every component test passed while a
 * select opened *underneath* the dialog it belongs to — the popup rendered, the
 * dialog's `fixed inset-0` backdrop covered it, and the click that should have
 * chosen an option landed on the backdrop instead. In a browser that reads as
 * "the dropdown does not open"; under Testing Library it reads as nothing at
 * all, because the popup is in the DOM and queryable either way.
 *
 * So these tests do two things a component test cannot:
 *
 *   1. compile the real `styles.css` and assert the *order* the browser will
 *      compute, from the emitted CSS rather than from the source that hoped for
 *      it, and
 *   2. refuse to let a component name a layer number at all, which is what made
 *      the numbers drift apart in the first place — four components, four
 *      independent choices, no scale.
 *
 * Both were confirmed to fail against the ordering that shipped before them
 * (select 40, dialog 50, toast 50, tooltip 60): the first on
 * `popup > dialog`, the second on every `z-40`/`z-50`/`z-60` literal.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const componentsDir = join(here, "components", "ui");
const themeCss = join(here, "styles.css");

/**
 * The scale, lowest first. This list *is* the contract: adding a rung means
 * adding it here, which is the moment to think about where it goes relative to
 * everything else — the thing that never happened when each component picked a
 * number by itself.
 */
const SCALE = ["chrome", "scrim", "dialog", "popup", "toast", "tooltip"] as const;

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

let css = "";

beforeAll(async () => {
  const compiler = await compile(readFileSync(themeCss, "utf8"), {
    base: here,
    loadStylesheet: async (id, base) => {
      const path = resolveStylesheet(id, base);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  css = compiler.build([...SCALE.map((name) => `z-${name}`), "toast-stack"]);
}, 30_000);

/** The number a `z-<name>` utility will actually compute to in a browser. */
function layerOf(name: string): number {
  const utility = new RegExp(`\\.z-${name}\\s*\\{\\s*z-index:\\s*var\\((--z-index-${name})\\)`);
  expect(css, `no .z-${name} utility in the compiled CSS`).toMatch(utility);

  const declaration = new RegExp(`--z-index-${name}:\\s*(-?\\d+)\\s*;`);
  const match = declaration.exec(css);
  expect(match, `--z-index-${name} is never given a value`).not.toBeNull();
  return Number(match?.[1]);
}

function sources(dir: string, extension: string) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension) && !name.includes(".test."))
    .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));
}

/** Prose about "z-50" in a comment is a description, not a layer. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");
}

/**
 * A Tailwind z-index utility carrying a number rather than a name: `z-50`,
 * `-z-10`, `z-[9999]`, `z-(--whatever)`. Anchored on a class boundary so
 * `size-50` and `data-z-3` do not match.
 */
const NUMERIC_LAYER = /(?:^|[\s"'`])-?z-(?:\d+|\[|\()/m;

describe("the layering scale", () => {
  it("is strictly increasing, in the order the overlays nest", () => {
    const layers = SCALE.map((name) => [name, layerOf(name)] as const);

    for (let i = 1; i < layers.length; i++) {
      const [lowerName, lower] = layers[i - 1]!;
      const [upperName, upper] = layers[i]!;
      expect(
        upper,
        `${upperName} (${upper}) must sit above ${lowerName} (${lower})`,
      ).toBeGreaterThan(lower);
    }
  });

  it("puts a select above the dialog it opens inside, and its backdrop", () => {
    // The reported defect, stated as the property rather than as three numbers:
    // a popup is anchored to a control that may itself be inside a modal, so it
    // is strictly more nested than the modal and must be strictly above it.
    expect(layerOf("popup")).toBeGreaterThan(layerOf("dialog"));
    expect(layerOf("popup")).toBeGreaterThan(layerOf("scrim"));
  });

  it("puts a toast above a modal, so one raised mid-dialog cannot be lost", () => {
    // These were equal, which left document order to decide — and the toast
    // viewport mounts with the Toaster near the app root, so it is always
    // earlier than a dialog portal and always lost.
    expect(layerOf("toast")).toBeGreaterThan(layerOf("dialog"));
    expect(layerOf("toast")).toBeGreaterThan(layerOf("scrim"));
  });

  it("keeps the backdrop under the surface it dims, by number and not by order", () => {
    expect(layerOf("dialog")).toBeGreaterThan(layerOf("scrim"));
  });

  it("keeps sticky page chrome below every overlay", () => {
    const chrome = layerOf("chrome");
    for (const name of SCALE.filter((rung) => rung !== "chrome")) {
      expect(layerOf(name), `${name} must sit above the page chrome`).toBeGreaterThan(chrome);
    }
  });

  it("stacks the toasts within their own viewport, off the toast rung", () => {
    // The viewport is a stacking context, so this ordering is local and the base
    // it counts down from is inert — but naming it is what stops a second copy
    // of the toast layer's number appearing in this file.
    expect(css).toMatch(/z-index:\s*calc\(var\(--z-index-toast\)\s*-\s*var\(--toast-index\)\)/);
  });
});

describe("nothing outside the scale names a layer", () => {
  it.each(sources(componentsDir, ".tsx"))(
    "$name reaches for a rung, not a number",
    ({ source }) => {
      expect(stripComments(source)).not.toMatch(NUMERIC_LAYER);
    },
  );

  it("keeps the theme bridge's only layer numbers inside the scale", () => {
    const code = stripComments(readFileSync(themeCss, "utf8"));
    const declarations = [...code.matchAll(/z-index:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim());

    expect(declarations.length, "the bridge declares no z-index at all").toBeGreaterThan(0);
    for (const value of declarations) {
      expect(value, `a z-index in styles.css is written out rather than named`).toMatch(
        /var\(--z-index-/,
      );
    }
  });

  it("declares every rung, and no rung nothing uses", () => {
    const code = stripComments(readFileSync(themeCss, "utf8"));
    const declared = [...code.matchAll(/--z-index-([a-z-]+):/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...SCALE].sort());
  });

  it("holds for the app's own screens too — the shell is on the scale", () => {
    const webSrc = join(repoRoot, "apps", "web", "src");
    const walk = (dir: string): { name: string; source: string }[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) return [];
        return [{ name: path.slice(webSrc.length + 1), source: readFileSync(path, "utf8") }];
      });

    for (const { name, source } of walk(webSrc)) {
      expect(stripComments(source), `${name} names a layer number`).not.toMatch(NUMERIC_LAYER);
    }
  });
});
