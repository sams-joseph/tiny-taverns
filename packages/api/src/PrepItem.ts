import { Schema } from "effect";
import { PrepItemId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * One line of the "Before you sit down" checklist (`data.js:3-8`).
 *
 * **It hangs off `session`, not `campaign`** — settled, see the report's D6 and
 * `decisions/prep-scope.md`. The fixture pairs the heading with "Session 12" and
 * a 2/4 count (`CampaignHome.jsx:79-80`), which reads as a per-session ritual.
 * Carrying unchecked items into the next session is a UI affordance, not a model
 * change.
 *
 * It carries a `visibility` like every other readable row even though the report
 * lists the prep checklist as unreachable by players (§2.3). The two are the
 * same statement: the column defaults to `dm`, so "unreachable" is what the
 * table does on its own rather than a rule someone has to remember.
 *
 * There is no `campaignId` here because there is no such column — a prep item
 * reaches its campaign through its session, and the read predicate walks the
 * same path rather than trusting a denormalised copy.
 */
export class PrepItem extends Schema.Class<PrepItem>("PrepItem")({
  id: PrepItemId,
  sessionId: SessionId,
  label: Schema.String,
  done: Schema.Boolean,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 500));

export const PrepItemCreate = Schema.Struct({
  label,
  /** Omitted means not done — the column default, like `visibility`. */
  done: Schema.optional(Schema.Boolean),
  visibility: Schema.optional(Visibility),
});
export type PrepItemCreate = typeof PrepItemCreate.Type;

export const PrepItemUpdate = Schema.Struct({
  label: Schema.optional(label),
  done: Schema.optional(Schema.Boolean),
  visibility: Schema.optional(Visibility),
});
export type PrepItemUpdate = typeof PrepItemUpdate.Type;
