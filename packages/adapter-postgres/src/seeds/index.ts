import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import { seedCharacters } from "./characters.js";

export type SeedStep = {
  name: string;
  effect: Effect.Effect<void, unknown, SqlClient.SqlClient>;
};

export const seeds: Array<SeedStep> = [
  {
    name: "characters",
    effect: seedCharacters,
  },
];
