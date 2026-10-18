import { Schema } from "effect";
import { CampaignId, LocationId, SharedWorldId } from "./Ids.js";
import { provenanceFields } from "./Provenance.js";

/**
 * What kind of place a location is. A closed list, restated by
 * `location_kind_check` (`0105_locations.ts`); the kind is what a map later
 * decides by, so a free-text kind would be a guess at every reader.
 */
export const LOCATION_KINDS = [
  "realm",
  "region",
  "wilderness",
  "city",
  "town",
  "village",
  "district",
  "dungeon",
  "landmark",
  "building",
] as const;
export const LocationKind = Schema.Literals(LOCATION_KINDS);
export type LocationKind = typeof LocationKind.Type;

/** The bounds the schema and the table both state. */
export const LOCATION_NAME_MAX = 120;
export const LOCATION_DESCRIPTION_MAX = 2000;
export const LOCATION_APPEARANCE_MAX = 400;
export const LOCATION_NOTES_MAX = 4000;

/**
 * Where a place stands on its parent's picture: fractions of that picture's
 * width and height, from its top-left corner, so a pin survives a picture of
 * any size. Only a place with a parent has one.
 */
export const LocationPin = Schema.Struct({
  x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  y: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
});
export type LocationPin = typeof LocationPin.Type;

/**
 * A place's picture: a map seen from above for a realm, a region, a
 * settlement, a district or a dungeon, a scene for a landmark or a building.
 * Its whole size, uncropped, because the pins are fractions of it. Minted on
 * every read that may see the place, and on no other.
 */
export class LocationImages extends Schema.Class<LocationImages>("LocationImages")({
  /** At most 768 × 512, for a card. */
  cardUrl: Schema.String,
  /** At most 1536 × 1024, the drawn size, for the map. */
  fullUrl: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
}) {}

/** The picture fields every read of a place carries. */
const pictureFields = {
  pin: Schema.NullOr(LocationPin),
  /** `null` while there is no picture ready to show. */
  image: Schema.NullOr(LocationImages),
  /** Hob is drawing its picture now. */
  imagePending: Schema.Boolean,
} as const;

/**
 * A place, as its **owner** reads it, on the Library's Locations shelf.
 *
 * Account-owned and top-level, like a character: a location is in no campaign
 * and no world. A world has it through a placement, and a table shows it to
 * its players through a reveal; neither copies it. `parentId` is another of the
 * owner's own places (`location_parent_fkey` makes a cross-owner tree
 * unrepresentable), and `notes` are the owner's alone, never on
 * {@link WorldLocation}, {@link CampaignLocation} or {@link PlayerLocation}.
 *
 * `description` is what a player is told; `appearance` is the one line a
 * place's picture is drawn from.
 */
export class Location extends Schema.Class<Location>("Location")({
  id: LocationId,
  parentId: Schema.NullOr(LocationId),
  kind: LocationKind,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  appearance: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  ...pictureFields,
  /**
   * Whether the place has ever had a picture record — drawn, drawing,
   * uploaded, failed or taken off. Only a place with none can be drawn
   * (`libraryLocations.draw`): a picture is drawn once.
   */
  pictured: Schema.Boolean,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A place as a **member of a world** reads it: no notes, and who owns it.
 *
 * A place is in a world when it, or a place above it, is placed there.
 * `parentId` is set only when the parent is in the world too, which it is
 * unless the owner placed the child alone. `placed` says the place has a
 * placement of its own here, the row its owner can take back out; `mine` says
 * the reader owns it.
 */
export const worldLocationFields = {
  id: LocationId,
  parentId: Schema.NullOr(LocationId),
  kind: LocationKind,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  appearance: Schema.NullOr(Schema.String),
  ownerName: Schema.String,
  mine: Schema.Boolean,
  placed: Schema.Boolean,
  ...pictureFields,
} as const;

export class WorldLocation extends Schema.Class<WorldLocation>("WorldLocation")(
  worldLocationFields,
) {}

/**
 * A place as a campaign's **creator** reads it at their table: the world's
 * read, and whether this table has revealed it to its players.
 */
export class CampaignLocation extends Schema.Class<CampaignLocation>("CampaignLocation")({
  ...worldLocationFields,
  revealed: Schema.Boolean,
}) {}

/**
 * A place as a **player** at a table is told it: one this campaign has
 * revealed, in the campaign's world. A distinct type on a distinct path:
 * no notes, no appearance line, no owner. `parentId` is set only when the
 * parent is revealed too, computed in SQL, so an unrevealed parent's id never
 * reaches the wire.
 */
export class PlayerLocation extends Schema.Class<PlayerLocation>("PlayerLocation")({
  id: LocationId,
  parentId: Schema.NullOr(LocationId),
  kind: LocationKind,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  /** `pin` is set only when the parent is revealed too, as `parentId` is. */
  ...pictureFields,
}) {}

/** One campaign a place appears at, for the delete confirmation. */
export const LocationAppearanceCampaign = Schema.Struct({
  id: CampaignId,
  name: Schema.String,
});

/**
 * Where a place, or any place under it, is in use: each context it is placed
 * in, with the campaigns there. What the delete confirmation lists, because a
 * delete takes it from every one of those tables. `worldName` is `null` for a
 * standalone campaign's hidden context, which a person knows by its campaign.
 */
export class LocationAppearance extends Schema.Class<LocationAppearance>("LocationAppearance")({
  contextId: SharedWorldId,
  worldName: Schema.NullOr(Schema.String),
  campaigns: Schema.Array(LocationAppearanceCampaign),
}) {}

const name = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(LOCATION_NAME_MAX));
const prose = (max: number) => Schema.String.check(Schema.isMaxLength(max));

/**
 * A new place in the asker's Library. No `origin`: a place kept from Hob is
 * stamped by the accept (`repo/Proposals.ts`). A blank prose field is stored
 * as nothing.
 */
export const LocationCreate = Schema.Struct({
  kind: LocationKind,
  name,
  /** Another of the asker's own places; anything else is `NotFound`. */
  parentId: Schema.optional(LocationId),
  description: Schema.optional(prose(LOCATION_DESCRIPTION_MAX)),
  appearance: Schema.optional(prose(LOCATION_APPEARANCE_MAX)),
  notes: Schema.optional(prose(LOCATION_NOTES_MAX)),
});
export type LocationCreate = typeof LocationCreate.Type;

/**
 * An owner's edit. `null` clears a prose field or makes the place top-level;
 * an omitted field is left alone. A parent that is the place itself or one of
 * its own descendants is a `Conflict`.
 */
export const LocationUpdate = Schema.Struct({
  kind: Schema.optional(LocationKind),
  name: Schema.optional(name),
  parentId: Schema.optional(Schema.NullOr(LocationId)),
  description: Schema.optional(Schema.NullOr(prose(LOCATION_DESCRIPTION_MAX))),
  appearance: Schema.optional(Schema.NullOr(prose(LOCATION_APPEARANCE_MAX))),
  notes: Schema.optional(Schema.NullOr(prose(LOCATION_NOTES_MAX))),
  /**
   * Where it stands on its parent's picture; `null` takes it off. A place
   * with no parent refuses one with a `Conflict`. A new parent clears the pin
   * unless this sets one too.
   */
  pin: Schema.optional(Schema.NullOr(LocationPin)),
});
export type LocationUpdate = typeof LocationUpdate.Type;
