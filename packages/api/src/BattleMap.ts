import { Schema } from "effect";
import { BattleMapId, CampaignId, EncounterId } from "./Ids.js";

/**
 * An encounter's battle map: the board a fight on it is played on, and the
 * picture Hob drew of the place. **The creator's alone** — no player path
 * carries a map, its setting line or its picture's URL; showing a map to the
 * table is a later play feature the DM will trigger, with a player schema of
 * its own.
 *
 * ### One map per encounter, and a board before a picture
 *
 * Every encounter has exactly one map (`0057_battle_maps.ts`), made in the
 * same transaction as the encounter. The board is always `columns × rows`
 * squares of `feetPerCell` feet, laid over the picture at `alignment`; a map
 * Hob did not draw (nothing to draw from, images off, the budget spent, the
 * provider refused) is the same board with no picture, so a fight always has
 * one to play on.
 *
 * ### Positions
 *
 * `alignment` is in the **original picture's pixels** (`image.width` ×
 * `image.height`), whatever variant a screen loads: square `(c, r)` spans
 * `offset + [c, c+1) · cellPx` across and down. A variant is scaled from the
 * original without a crop (`fit: "inside"` in the server's kinds table), so
 * `drawnWidth / image.width` is the one factor between them.
 */

/**
 * The bound on the setting line, shared by the form, the schema, the tool and
 * the column's own check (`0057_battle_maps.ts`). A line, not a page: it says
 * what the place looks like, and the picture is drawn from it.
 */
export const ENCOUNTER_SETTING_MAX = 300;

/** The setting line as the wire carries it. A blank is stored as none. */
export const EncounterSetting = Schema.String.check(Schema.isMaxLength(ENCOUNTER_SETTING_MAX));

/**
 * Whether the app draws squares over the picture and snaps to them. `none`
 * turns off only the lines and the snapping: the board keeps its size and
 * scale, so distances still measure. Hex is not offered: a value no renderer
 * could draw would be a stub.
 */
export const BattleMapGrid = Schema.Literals(["square", "none"]);
export type BattleMapGrid = typeof BattleMapGrid.Type;

/** The most squares a board runs across or down. */
export const BATTLE_MAP_SQUARES_MAX = 200;

/** The DMG's scale, and every new map's. */
export const FEET_PER_SQUARE_DEFAULT = 5;

const squares = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BATTLE_MAP_SQUARES_MAX }));
const feetPerCell = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const cellPx = Schema.Finite.check(Schema.isBetween({ minimum: 8, maximum: 1024 }));
const offsetPx = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * Where the grid sits on the picture: the size of one square and how far the
 * first square's corner is from the picture's top-left, all in the original's
 * pixels. **One fact, set whole**, because each offset is only meaningful
 * against the square size: an offset is within one square (`0 ≤ offset <
 * cellPx`), since a whole square more is the same grid moved by one column.
 */
export const BattleMapAlignment = Schema.Struct({
  cellPx,
  offsetXPx: offsetPx,
  offsetYPx: offsetPx,
}).check(
  Schema.makeFilter((alignment) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (alignment.offsetXPx >= alignment.cellPx) {
      issues.push({ path: ["offsetXPx"], issue: "an offset is less than one square" });
    }
    if (alignment.offsetYPx >= alignment.cellPx) {
      issues.push({ path: ["offsetYPx"], issue: "an offset is less than one square" });
    }
    return issues;
  }),
);
export type BattleMapAlignment = typeof BattleMapAlignment.Type;

/**
 * Where a map's picture loads from: two sizes of one WebP, each a short-lived
 * signed path on this API (`/battle-map-images/:imageId/:variant?e=…&s=…`),
 * minted only inside the creator's own map reads. `width` and `height` are the
 * original's, the pixels `alignment` is measured in.
 */
export class BattleMapImages extends Schema.Class<BattleMapImages>("BattleMapImages")({
  /** At most 768 × 512, for a card. */
  cardUrl: Schema.String,
  /** At most 1536 × 1024, the drawn size, for the page. */
  fullUrl: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
}) {}

export class BattleMap extends Schema.Class<BattleMap>("BattleMap")({
  id: BattleMapId,
  encounterId: EncounterId,
  campaignId: CampaignId,
  /**
   * One line on what the place looks like — what Hob drew the picture from,
   * written on the encounter's form. The creator's alone, like everything
   * here. `null` when none was written.
   */
  setting: Schema.NullOr(Schema.String),
  grid: BattleMapGrid,
  /** Squares across. */
  columns: Schema.Int,
  /** Squares down. */
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  alignment: BattleMapAlignment,
  /**
   * The picture Hob drew once, after the encounter was made — or `null`: none
   * was drawn (images are off, there was nothing to draw from, the budget was
   * spent, the provider refused), it is still being drawn, or this server
   * cannot sign URLs.
   */
  image: Schema.NullOr(BattleMapImages),
  /** The picture is being drawn right now. It never becomes true again. */
  imagePending: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The grid, changed in place. The setting line is not here: it is written on
 * the encounter's own form (`EncounterCreate` / `EncounterUpdate`), and editing
 * it redraws nothing.
 */
export const BattleMapUpdate = Schema.Struct({
  grid: Schema.optional(BattleMapGrid),
  columns: Schema.optional(squares),
  rows: Schema.optional(squares),
  feetPerCell: Schema.optional(feetPerCell),
  alignment: Schema.optional(BattleMapAlignment),
});
export type BattleMapUpdate = typeof BattleMapUpdate.Type;

/**
 * The text an image model is given for a battle map — **one implementation,
 * pure**, beside `campaignImagePromptFor` (`CampaignImage.ts`) and for the same
 * reason: the server builds it when it draws, and anything that says what a map
 * is drawn from calls this rather than restating it.
 *
 * ### What goes in
 *
 * 1. **The setting line** — what the place looks like. It is the scene, and
 *    without it there is nothing to draw ({@link battleMapHasSubject}): an
 *    encounter's name says what happens, not where, and a map drawn from a name
 *    alone is a draw spent on a guess.
 * 2. **The encounter's name**, colouring the place, shown rather than written.
 * 3. **Its tags** — the DM's own labels, often the terrain and the hour.
 * 4. **Style** — `HOUSE_MAP_STYLE` (`HouseStyle.ts`): top-down, no grid (the
 *    app draws its own over the picture), no creatures, no text.
 *
 * ### What never goes in
 *
 * The roster: a creature named in the prompt is a creature drawn on the board,
 * and the board is where the tokens go. The read-aloud and notes attached to
 * the encounter are the DM's prose, often private, and not a description of
 * the ground. The difficulty band is not visual.
 */

/** The most the name contributes; it is open text. */
const NAME_MAX = 120;

/** The most the tags contribute together. */
const TAGS_MAX = 200;

/** The parts of an encounter and its map a battle map reads. */
export interface BattleMapImageSubject {
  readonly name: string;
  readonly tags: ReadonlyArray<string>;
  readonly setting: string | null;
}

export interface BattleMapImageOptions {
  /** The style sentence(s) appended last; `HOUSE_MAP_STYLE` is the one there is. */
  readonly style: string;
}

const clean = (text: string | null | undefined, max: number): string | undefined => {
  const trimmed = (text ?? "").replace(/\s+/g, " ").replace(/["“”]/g, "").trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max).trim();
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Whether there is anything to draw: a setting line with any letters in it. */
export const battleMapHasSubject = (subject: BattleMapImageSubject): boolean =>
  clean(subject.setting, ENCOUNTER_SETTING_MAX) !== undefined;

export const battleMapPromptFor = (
  subject: BattleMapImageSubject,
  options: BattleMapImageOptions,
): string => {
  const setting = clean(subject.setting, ENCOUNTER_SETTING_MAX);
  const name = clean(subject.name, NAME_MAX);
  const tags = clean(
    subject.tags
      .map((tag) => clean(tag, NAME_MAX))
      .filter((tag) => tag !== undefined)
      .join(", "),
    TAGS_MAX,
  );
  return [
    setting === undefined
      ? "Top-down battle map for a tabletop roleplaying game."
      : `Top-down battle map for a tabletop roleplaying game: ${sentence(setting)}`,
    name === undefined
      ? undefined
      : `A fight here is called ${name}; let that colour the place, shown rather than written.`,
    tags === undefined ? undefined : `Its feel: ${sentence(tags)}`,
    options.style.trim(),
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
};
