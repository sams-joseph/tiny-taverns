import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function*() {
  const sql = yield* SqlClient;

  yield* sql`DROP TABLE npcs`;

  yield* sql`
    CREATE TABLE npcs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      campaign_id UUID NOT NULL,
      title       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  yield* sql`CREATE INDEX npcs_user_id_idx ON npcs (user_id)`;
  yield* sql`CREATE INDEX npcs_campaign_id_idx ON npcs (campaign_id)`;
});
