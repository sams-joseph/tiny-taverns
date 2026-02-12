import * as Tool from "@effect/ai/Tool";
import * as Toolkit from "@effect/ai/Toolkit";
import * as Schema from "effect/Schema";
import { Character, CharacterNotFound } from "./CharactersApi.js";
import { TransientResponse } from "./Toolkit.js";

export const LocationContext = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  description: Schema.NonEmptyTrimmedString,
  notableNpcs: Schema.Array(Schema.NonEmptyTrimmedString),
  rumors: Schema.Array(Schema.NonEmptyTrimmedString),
  events: Schema.Array(Schema.NonEmptyTrimmedString),
});

export class npcToolkit extends Toolkit.make(
  Tool.make("GetNpcProfile", {
    description: "Get the current NPC profile for grounded replies.",
    parameters: {},
    success: TransientResponse(Character),
    failure: CharacterNotFound,
  }),
  Tool.make("GetLocationContext", {
    description: "Fetch the current location context for the NPC.",
    parameters: {},
    success: TransientResponse(LocationContext),
  }),
) {}
