import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

export default Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE IF NOT EXISTS monsters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid (),

      name text NOT NULL CHECK (btrim(name) <> ''),

      size text NOT NULL,
      kind text NOT NULL,

      subtype text NULL CHECK (subtype IS NULL OR btrim(subtype) <> ''),

      alignment text NOT NULL CHECK (btrim(alignment) <> ''),

      ac integer NOT NULL,
      hp_avg integer NOT NULL,
      hp_formula text NOT NULL CHECK (btrim(hp_formula) <> ''),

      -- abilities struct
      str integer NOT NULL,
      dex integer NOT NULL,
      con integer NOT NULL,
      int integer NOT NULL,
      wis integer NOT NULL,
      cha integer NOT NULL,

      cr integer NOT NULL,
      xp integer NOT NULL,

      proficiency_bonus integer NOT NULL,

      passive_perception integer NULL,

      languages text NOT NULL CHECK (btrim(languages) <> ''),
      senses text NOT NULL CHECK (btrim(senses) <> ''),

      source text NOT NULL CHECK (btrim(source) <> ''),

      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Helpful indexes
    CREATE INDEX IF NOT EXISTS monsters_name_idx ON monsters (name);
    CREATE INDEX IF NOT EXISTS monsters_kind_size_idx ON monsters (kind, size);
    CREATE INDEX IF NOT EXISTS monsters_cr_idx ON monsters (cr);
  `,
);
