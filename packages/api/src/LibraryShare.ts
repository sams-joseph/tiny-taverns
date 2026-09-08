import { Schema } from "effect";
import { AccountId, GroupId } from "./Ids.js";

/**
 * Explicit group Library sharing — the captain's decision of 2026-09-01.
 *
 * A share is a **grant to copy**, never content and never a view: the
 * original stays account-owned in its owner's Library, a member's own Library
 * never shows a groupmate's rows, and what the grant changes is exactly one
 * thing — the shared original becomes a `derive` source for campaigns of that
 * group, landing as the ordinary snapshot when a creator copies it in. Group
 * membership alone never widens Library visibility; the row is the whole of
 * the reach, and its absence is the refusal.
 */

export const LibraryShareKind = Schema.Literals([
  "creature",
  "character_option",
  "spell",
  "equipment",
  "magic_item",
  "rule_article",
  "feat",
  "npc",
]);
export type LibraryShareKind = typeof LibraryShareKind.Type;

export class GroupLibraryShare extends Schema.Class<GroupLibraryShare>("GroupLibraryShare")({
  groupId: GroupId,
  ownerAccountId: AccountId,
  kind: LibraryShareKind,
  /** The shared original's own id, in whichever of the copyable Library tables `kind` names. */
  resourceId: Schema.String.check(Schema.isUUID()),
  /**
   * The original's display name, resolved at read time from the row itself —
   * `null` when the original has since been deleted, in which case the grant
   * is inert (the predicate requires the row to still exist) and the list
   * says so rather than hiding the leftover.
   */
  name: Schema.NullOr(Schema.String),
  /** Who shared it — the owner, which the repository enforces. */
  sharedByName: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The grant. `resourceId` must be a Library original of the **caller's own**
 * — there is no field for an owner, so sharing somebody else's is not
 * expressible, and a row the caller does not own answers the ordinary
 * `NotFound`. Sharing the same original twice is the same success.
 */
export const LibraryShareCreate = Schema.Struct({
  kind: LibraryShareKind,
  resourceId: Schema.String.check(Schema.isUUID()),
});
export type LibraryShareCreate = typeof LibraryShareCreate.Type;
