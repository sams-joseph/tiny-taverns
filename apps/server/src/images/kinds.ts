/**
 * The kinds of thing Hob draws a picture of, and **everything that differs
 * between them** — in one table, so the worker, the signer, the records and the
 * route are written once and a new kind is a new entry here plus its table.
 *
 * What a kind decides:
 *
 * - **`table` / `subjectColumn`** — its record (`character_portrait`,
 *   `character_banner`, `campaign_image`, `shared_world_image`, `npc_image`,
 *   `npc_banner`, `battle_map_image`), one row per subject, bound to the subject and its owner
 *   by a composite key (see `0049_campaign_images.ts` for why a table per kind).
 * - **`root`** — the first segment of its storage keys:
 *   `{root}/{accountId}/{subjectId}/{imageId}/`.
 * - **`tag` / `route`** — what its URL signatures cover and the path they name.
 *   The tag is inside the HMAC, so a signature minted for one kind's route can
 *   never open another's, whatever the ids.
 * - **`size`, `variants`, `position`, `fit`** — what is asked for, the WebP
 *   sizes kept, where a crop keeps its subject, and whether a variant is
 *   cropped at all.
 *
 * What a kind does **not** decide: the house style, the daily budget, the
 * timeout, the concurrency and the deletion outbox are one for all of them.
 * Who may start a draw and whose account it is billed to is the kind's
 * ownership statement in `repo/Images.ts`; who may *see* the result is the
 * subject's own reads, which mint its URLs.
 */

export interface VariantSize {
  readonly width: number;
  readonly height: number;
}

export interface ImageKindSpec<Variant extends string> {
  readonly table: string;
  readonly subjectColumn: string;
  readonly root: string;
  readonly tag: string;
  readonly route: string;
  /** The `size` asked of the image model. */
  readonly size: string;
  /** The WebP sizes stored beside the original, largest last. */
  readonly variants: Readonly<Record<Variant, VariantSize>>;
  /** Where `sharp`'s cover crop anchors: a bust keeps the head, a scene its middle. */
  readonly position: "top" | "centre";
  /**
   * `cover` crops each variant to its exact size; `inside` scales it to fit
   * without cropping, keeping the original's aspect. A picture something is
   * measured against (a battle map's grid) must never lose an edge.
   */
  readonly fit: "cover" | "inside";
}

export const IMAGE_KINDS = {
  /**
   * A character's portrait: a square bust. `full` 1024, `card` 640 (the *My
   * characters* 4:3 card at 2x, and a band's picture while it has no banner),
   * `thumb` 160 (the 28, 40 and 64 px plates at 2x). Its `tag`,
   * `root` and `route` are the names portraits had before there was a second
   * kind, so every URL and stored key already issued stays good.
   */
  character: {
    table: "character_portrait",
    subjectColumn: "character_id",
    root: "portraits",
    tag: "portrait",
    route: "/portraits",
    size: "1024x1024",
    variants: {
      thumb: { width: 160, height: 160 },
      card: { width: 640, height: 640 },
      full: { width: 1024, height: 1024 },
    },
    position: "top",
    fit: "cover",
  } satisfies ImageKindSpec<"thumb" | "card" | "full">,
  /**
   * A character's banner: the wide picture a card's portrait band shows, drawn
   * as its own image beside the square (`HOUSE_BANNER_STYLE`), never cut from
   * it. Asked for at 3:2, the widest size OpenAI's image models take, and cut
   * to 2:1: the bands it fills run from about 1.8:1 (the NPC drawer at a
   * phone's width) to about 2.5:1 (a Party or Cast card at its widest), and
   * 2:1 sits between them, so a band's own `object-cover` trims a sliver
   * rather than half the picture. The crop is centred, because the banner
   * framing keeps the head in the middle band. `card` 768 × 384 is a card band
   * at 2x; `full` 1536 × 768 the NPC drawer's and a wide screen's.
   */
  characterBanner: {
    table: "character_banner",
    subjectColumn: "character_id",
    root: "portrait-banners",
    tag: "portrait-banner",
    route: "/portrait-banners",
    size: "1536x1024",
    variants: {
      card: { width: 768, height: 384 },
      full: { width: 1536, height: 768 },
    },
    position: "centre",
    fit: "cover",
  } satisfies ImageKindSpec<"card" | "full">,
  /**
   * A campaign's cover: a 3:2 landscape scene. `full` is the drawn 1536 × 1024,
   * for the Overview's cover band at up to 2x; `card` 768 × 512, for the
   * campaign list's cards at 2x. Both screens crop it with `object-cover`, so
   * the scene is framed to keep its subject away from the edges (the cover
   * framing in `HouseStyle.ts`).
   */
  campaign: {
    table: "campaign_image",
    subjectColumn: "campaign_id",
    root: "campaign-images",
    tag: "campaign-image",
    route: "/campaign-images",
    size: "1536x1024",
    variants: {
      card: { width: 768, height: 512 },
      full: { width: 1536, height: 1024 },
    },
    position: "centre",
    fit: "cover",
  } satisfies ImageKindSpec<"card" | "full">,
  /**
   * A Shared World's cover: the campaign cover's shape exactly, because it is
   * shown in the same two places — the head of a card on the Shared World list
   * (`card`) and a band above the world's own screen (`full`).
   */
  sharedWorld: {
    table: "shared_world_image",
    subjectColumn: "group_id",
    root: "shared-world-images",
    tag: "shared-world-image",
    route: "/shared-world-images",
    size: "1536x1024",
    variants: {
      card: { width: 768, height: 512 },
      full: { width: 1536, height: 1024 },
    },
    position: "centre",
    fit: "cover",
  } satisfies ImageKindSpec<"card" | "full">,
  /**
   * A campaign NPC's portrait: a square bust, drawn and cut exactly as a
   * character's is, so a cast and a party sit on the same plates. The cast's
   * plates are 28 and 44 px, so they load `thumb`; a band shows the banner.
   */
  npc: {
    table: "npc_image",
    subjectColumn: "npc_id",
    root: "npc-images",
    tag: "npc-image",
    route: "/npc-images",
    size: "1024x1024",
    variants: {
      thumb: { width: 160, height: 160 },
      card: { width: 640, height: 640 },
      full: { width: 1024, height: 1024 },
    },
    position: "top",
    fit: "cover",
  } satisfies ImageKindSpec<"thumb" | "card" | "full">,
  /**
   * A campaign NPC's banner: the character banner's shape exactly, for the
   * Cast card's portrait band and the NPC drawer's header.
   */
  npcBanner: {
    table: "npc_banner",
    subjectColumn: "npc_id",
    root: "npc-banners",
    tag: "npc-banner",
    route: "/npc-banners",
    size: "1536x1024",
    variants: {
      card: { width: 768, height: 384 },
      full: { width: 1536, height: 768 },
    },
    position: "centre",
    fit: "cover",
  } satisfies ImageKindSpec<"card" | "full">,
  /**
   * An encounter's battle map: the cover's size and cost (the captain's
   * decision), drawn top-down with no grid. **Never cropped** (`fit:
   * "inside"`): the grid is aligned in the original's pixels, so a variant is
   * the whole picture scaled, and a provider that answers another aspect ratio
   * still lines up. Only the creator's map reads mint its URLs.
   */
  battleMap: {
    table: "battle_map_image",
    subjectColumn: "map_id",
    root: "battle-map-images",
    tag: "battle-map-image",
    route: "/battle-map-images",
    size: "1536x1024",
    variants: {
      card: { width: 768, height: 512 },
      full: { width: 1536, height: 1024 },
    },
    position: "centre",
    fit: "inside",
  } satisfies ImageKindSpec<"card" | "full">,
} as const;

export type ImageKind = keyof typeof IMAGE_KINDS;

export type VariantOf<K extends ImageKind> = keyof (typeof IMAGE_KINDS)[K]["variants"] & string;

/** Every kind, in a fixed order, for the statements that read all of their tables. */
export const ALL_IMAGE_KINDS: ReadonlyArray<ImageKind> = Object.keys(
  IMAGE_KINDS,
) as Array<ImageKind>;

export const variantsOf = <K extends ImageKind>(kind: K): ReadonlyArray<VariantOf<K>> =>
  Object.keys(IMAGE_KINDS[kind].variants) as Array<VariantOf<K>>;

export const variantSize = (kind: ImageKind, variant: string): VariantSize =>
  (IMAGE_KINDS[kind].variants as Readonly<Record<string, VariantSize>>)[variant]!;
