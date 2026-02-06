import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE monsters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      kind TEXT NOT NULL,
      subtype TEXT,
      alignment TEXT NOT NULL,
      ac INT NOT NULL,
      hp_avg INT NOT NULL,
      hp_formula TEXT NOT NULL,
      str INT NOT NULL,
      dex INT NOT NULL,
      con INT NOT NULL,
      int INT NOT NULL,
      wis INT NOT NULL,
      cha INT NOT NULL,
      cr NUMERIC NOT NULL,
      xp INT NOT NULL,
      proficiency_bonus INT NOT NULL,
      passive_perception INT,
      languages TEXT NOT NULL,
      senses TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION update_updated_at_column () RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_monsters_updated_at BEFORE
    UPDATE ON monsters FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column ();
  `,
);
