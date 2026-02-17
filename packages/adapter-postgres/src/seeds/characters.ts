import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";

export const seedCharacters = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO characters ${sql.insert({
      name: "Mira of the Ember",
      kind: "npc",
      npc_metadata: {
        role: "tavern regular",
        location: "The Ember & Oak",
        traits: ["wry", "watchful"],
        voice: "dry and measured",
        constraints: ["Never name names when speaking of the city guard."],
      },
    })}
  `;
});
