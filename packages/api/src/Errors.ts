import { Schema } from "effect";

/**
 * A row was not found, or the current actor may not see it. Deliberately the
 * same error for both: telling a player that a `dm` row exists but is hidden is
 * itself a leak.
 */
export class NotFound extends Schema.ErrorClass<NotFound>("NotFound")(
  {
    _tag: Schema.tag("NotFound"),
    resource: Schema.String,
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

/** A uniqueness rule was violated — today, only a repeated session number. */
export class Conflict extends Schema.ErrorClass<Conflict>("Conflict")(
  {
    _tag: Schema.tag("Conflict"),
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
