import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cn } from "./utils";
import { twSpacing, twTheme } from "./tw-theme";

const themeCss = join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css");

/** The `@theme` namespaces we bridge, longest prefix first so `font-weight` wins over `font`. */
const NAMESPACES = [
  "font-weight",
  "color",
  "font",
  "text",
  "tracking",
  "leading",
  "radius",
  "shadow",
  "blur",
  "ease",
  "animate",
  "container",
  "spacing",
] as const;

/** Pulls the `@theme inline { … }` block out of styles.css by brace counting. */
function themeInlineBlock(css: string) {
  const start = css.indexOf("@theme inline");
  expect(start, "styles.css has no `@theme inline` block").toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("unterminated @theme inline block");
}

function declaredKeys() {
  const block = themeInlineBlock(readFileSync(themeCss, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Record<string, string[]> = {};

  for (const [, property] of block.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)) {
    const namespace = NAMESPACES.find((candidate) => property!.startsWith(`${candidate}-`));
    if (!namespace) continue;
    (found[namespace] ??= []).push(property!.slice(namespace.length + 1));
  }
  return found;
}

describe("tailwind-merge knows the theme", () => {
  const declared = declaredKeys();

  it.each(Object.keys(twTheme))("%s matches the @theme inline block", (namespace) => {
    const configured = [...(twTheme[namespace as keyof typeof twTheme] as readonly string[])];
    const fromCss = declared[namespace] ?? [];
    expect(configured.sort(), `tw-theme.ts and styles.css disagree on --${namespace}-*`).toEqual(
      fromCss.sort(),
    );
  });

  it("names every bridged spacing token", () => {
    expect([...twSpacing].sort()).toEqual((declared.spacing ?? []).sort());
  });

  it("bridges every namespace declared in styles.css", () => {
    const covered = new Set([...Object.keys(twTheme), "spacing"]);
    expect(Object.keys(declared).filter((key) => !covered.has(key))).toEqual([]);
  });
});

describe("cn", () => {
  it("keeps a text colour and a text size together — they are different properties", () => {
    expect(cn("text-label", "text-on-accent")).toBe("text-label text-on-accent");
    expect(cn("text-on-accent", "text-label")).toBe("text-on-accent text-label");
  });

  it("still resolves genuine conflicts, last one winning", () => {
    expect(cn("text-label", "text-body-s")).toBe("text-body-s");
    expect(cn("bg-accent", "bg-danger")).toBe("bg-danger");
    expect(cn("h-control", "h-row")).toBe("h-row");
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
    expect(cn("shadow-1", "shadow-3")).toBe("shadow-3");
    expect(cn("font-medium", "font-semibold")).toBe("font-semibold");
  });

  it("does not confuse a font family with a font weight", () => {
    expect(cn("font-sans", "font-medium")).toBe("font-sans font-medium");
  });
});
