import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE IF NOT EXISTS quests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
      parent_quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      rewards JSONB NOT NULL,

      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_quests_campaign_id ON quests(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_quests_parent_id ON quests(parent_quest_id);
    CREATE INDEX IF NOT EXISTS quests_name_idx ON quests (name);

    CREATE TABLE IF NOT EXISTS quest_encounters (
      quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),

      PRIMARY KEY (quest_id, encounter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_quest_encounters_quest_id ON quest_encounters(quest_id);
    CREATE INDEX IF NOT EXISTS idx_quest_encounters_encounter_id ON quest_encounters(encounter_id);
  `,
);
