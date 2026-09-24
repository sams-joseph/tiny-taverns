/**
 * Makes the global row's panel heroes (`src/shell/heroes/`) from the full-size
 * pictures, which are not committed:
 *
 *   node apps/web/scripts/nav-heroes.mjs <campaigns.png> <library.png>
 *
 * Each picture is cropped to a 4:1 banner across the top of a panel, which is
 * 28rem wide at most and the phone's width below that. The two widths are the
 * banner at 1x and a 768px 2x: the pictures on hand are 768px wide, and a
 * picture is never enlarged past its source.
 * `sharp` is the server's dependency, borrowed from there rather than added to
 * the web app for a step that runs by hand.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, "../../server/package.json"))("sharp");

const [campaigns, library] = process.argv.slice(2);
if (campaigns === undefined || library === undefined) {
  console.error("usage: nav-heroes.mjs <campaigns.png> <library.png>");
  process.exit(1);
}

const out = join(here, "../src/shell/heroes");
for (const [name, source] of [
  ["campaigns", campaigns],
  ["library", library],
])
  for (const width of [448, 768]) {
    const file = join(out, `${name}-${width}.webp`);
    const info = await sharp(source)
      .resize({ width, height: width / 4, fit: "cover" })
      .webp({ quality: 78, effort: 6 })
      .toFile(file);
    console.log(`${file}\t${info.width}x${info.height}\t${info.size} bytes`);
  }
