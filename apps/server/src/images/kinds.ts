/**
 * The kinds of thing Hob draws a picture of, and **everything that differs
 * between them** — in one table, so the worker, the signer, the records and the
 * route are written once and a new kind is a new entry here plus its table.
 *
 * What a kind decides:
 *
 * - **`table` / `subjectColumn`** — its record (`character_portrait`,
 *   `campaign_image`, `shared_world_image`), one row per subject, bound to the subject and its owner
 *   by a composite key (see `0049_campaign_images.ts` for why a table per kind).
 * - **`root`** — the first segment of its storage keys:
 *   `{root}/{accountId}/{subjectId}/{imageId}/`.
 * - **`tag` / `route`** — what its URL signatures cover and the path they name.
 *   The tag is inside the HMAC, so a signature minted for one kind's route can
 *   never open another's, whatever the ids.
 * - **`size`, `variants`, `position`** — what is asked for, the WebP sizes kept
 *   and where a crop keeps its subject.
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
}

export const IMAGE_KINDS = {
  /**
   * A character's portrait: a square bust. `full` 1024, `card` 640 (the 4:3
   * card at 2x), `thumb` 160 (the 28, 40 and 64 px plates at 2x). Its `tag`,
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
  } satisfies ImageKindSpec<"thumb" | "card" | "full">,
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
