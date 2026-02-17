CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$;

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaigns_description_check CHECK ((btrim(description) <> ''::text)),
    CONSTRAINT campaigns_name_check CHECK ((btrim(name) <> ''::text))
);

CREATE TABLE public.characters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'player'::text NOT NULL,
    user_id uuid,
    npc_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.effect_sql_migrations (
    migration_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL
);

CREATE TABLE public.encounters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    campaign_id uuid,
    phase text NOT NULL,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.monsters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    size text NOT NULL,
    kind text NOT NULL,
    subtype text,
    alignment text NOT NULL,
    ac integer NOT NULL,
    hp_avg integer NOT NULL,
    hp_formula text NOT NULL,
    str integer NOT NULL,
    dex integer NOT NULL,
    con integer NOT NULL,
    "int" integer NOT NULL,
    wis integer NOT NULL,
    cha integer NOT NULL,
    cr integer NOT NULL,
    xp integer NOT NULL,
    proficiency_bonus integer NOT NULL,
    passive_perception integer,
    languages text NOT NULL,
    senses text NOT NULL,
    source text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT monsters_alignment_check CHECK ((btrim(alignment) <> ''::text)),
    CONSTRAINT monsters_hp_formula_check CHECK ((btrim(hp_formula) <> ''::text)),
    CONSTRAINT monsters_languages_check CHECK ((btrim(languages) <> ''::text)),
    CONSTRAINT monsters_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT monsters_senses_check CHECK ((btrim(senses) <> ''::text)),
    CONSTRAINT monsters_source_check CHECK ((btrim(source) <> ''::text)),
    CONSTRAINT monsters_subtype_check CHECK (((subtype IS NULL) OR (btrim(subtype) <> ''::text)))
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.effect_sql_migrations
    ADD CONSTRAINT effect_sql_migrations_pkey PRIMARY KEY (migration_id);

ALTER TABLE ONLY public.encounters
    ADD CONSTRAINT encounters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.monsters
    ADD CONSTRAINT monsters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX campaigns_name_idx ON public.campaigns USING btree (name);

CREATE INDEX characters_kind_idx ON public.characters USING btree (kind);

CREATE INDEX characters_name_idx ON public.characters USING btree (name);

CREATE INDEX encounters_name_idx ON public.encounters USING btree (name);

CREATE INDEX idx_characters_user_id ON public.characters USING btree (user_id);

CREATE INDEX idx_encounters_campaign_id ON public.encounters USING btree (campaign_id);

CREATE INDEX monsters_cr_idx ON public.monsters USING btree (cr);

CREATE INDEX monsters_kind_size_idx ON public.monsters USING btree (kind, size);

CREATE INDEX monsters_name_idx ON public.monsters USING btree (name);

CREATE INDEX users_name_idx ON public.users USING btree (name);

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.encounters
    ADD CONSTRAINT encounters_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (1, '2026-02-17 03:47:29.108351+00', 'create-users_table');
INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (2, '2026-02-17 03:47:29.108351+00', 'create-monsters_table');
INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (3, '2026-02-17 03:47:29.108351+00', 'create-campaigns_table');
INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (4, '2026-02-17 03:47:29.108351+00', 'create-characters_table');
INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (5, '2026-02-17 03:47:29.108351+00', 'create-encounters_table');