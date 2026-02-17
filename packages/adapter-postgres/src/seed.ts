import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";

export const seedDefaultNpc = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO characters (name, kind, npc_metadata)
    SELECT
      'Mira of the Ember' AS name,
      'npc' AS kind,
      '{"role": "tavern regular", "location": "The Ember & Oak", "traits": ["wry", "watchful"], "voice": "dry and measured", "constraints": ["Never name names when speaking of the city guard."]}'::jsonb AS npc_metadata
    WHERE NOT EXISTS (
      SELECT 1 FROM characters WHERE kind = 'npc'
    );
  `;
});
