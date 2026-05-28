import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    ALTER TABLE chats
    ADD COLUMN campaign_id UUID NOT NULL
  `;

  yield* sql`CREATE INDEX chats_campaign_id_idx ON chats (campaign_id)`;
});
