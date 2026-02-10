import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE IF NOT EXISTS encounters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
      phase TEXT NOT NULL,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,

      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_encounters_campaign_id ON encounters(campaign_id);
    CREATE INDEX IF NOT EXISTS encounters_name_idx ON encounters (name);
  `,
);
