import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE IF NOT EXISTS characters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'player',
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      npc_metadata JSONB,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
    CREATE INDEX IF NOT EXISTS characters_kind_idx ON characters (kind);
    CREATE INDEX IF NOT EXISTS characters_name_idx ON characters (name);
  `,
);
