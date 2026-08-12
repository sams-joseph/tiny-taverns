import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * `character`, shaped the way `creature` already is.
 *
 * `0004_bestiary.ts` is the shipped precedent and this is that shape applied to
 * the party: **a field earns a column when the product reads it, and everything
 * else goes in one `jsonb` document.** A creature's filterable half is columns
 * and its display half is `body`; a character's is now the same, and the reason
 * is the same one `Creature.ts` gives — normalising a document loses what the
 * DM wrote and nothing reconstructs it.
 *
 * ### The three new columns, and why they are columns
 *
 * `level`, `species` and `class_name` were the `"Half-orc paladin"` display
 * string. They earn columns because **players edit their own characters** and
 * levelling is the main thing they will do: as a number that is an increment,
 * and inside a display string it is four people editing prose and hoping they
 * agree. It also makes the party sortable and gives the assistant something to
 * reason about — "the party has no healer" is a question about a class, not
 * about a string.
 *
 * ### `descriptor` is that string, and it is now **generated**
 *
 * The consequence of the three columns is that the label has to be derived; a
 * label stored beside the columns it summarises is a second answer that will
 * eventually disagree with the first. So `descriptor` stops being a stored
 * column and becomes `generated always as … stored`, the same device
 * `session.is_open` and `campaign_member.is_dm` already use here.
 *
 * Three things that buys, none of which a TypeScript derivation would:
 *
 * - **It cannot go stale**, and it cannot be written at all — Postgres refuses
 *   an `INSERT` or `UPDATE` naming it, so "nothing stores a second copy" is a
 *   property of the schema rather than a rule a repository has to remember.
 * - **Every reader keeps working unchanged.** `repo/EncounterRuns.ts` seeds a
 *   combatant's `subtitle` from `character.descriptor`, and `PartyList.tsx`
 *   renders it; both still read one column.
 * - There is exactly one place the wording lives, and it is here.
 *
 * `concat_ws` would read better and cannot be used: it is `stable`, not
 * `immutable`, so Postgres refuses it in a generation expression. `||` with
 * `coalesce` is the immutable spelling. And a generated column may not
 * reference another generated column, which is why `search` below composes the
 * three columns again rather than reusing `descriptor`.
 *
 * ### What happens to the descriptors that are already there
 *
 * They are prose, and this migration deliberately **does not parse them**.
 * Splitting `"Half-orc paladin"` into a species and a class is guessing, and
 * guessing wrong writes a lie into a column the DM will trust; the whole reason
 * these are columns rather than a string is that a string cannot be relied on
 * to have a shape. So the old text is preserved verbatim in the document, under
 * `notes`, which is exactly where the governing rule puts a line the product no
 * longer reads. Nothing is lost, nothing is invented, and the DM moves it into
 * the two fields the next time they open the character.
 *
 * ### `account_id` is a hook, not a credential
 *
 * Whose character it is. Nullable, because a DM types a character for a friend
 * who has not signed up yet and because a retired player's character must not
 * vanish. **Nothing reads through it and no predicate mentions it** — the
 * player write predicate it exists for belongs with the step that mints player
 * actors, and there is no player actor yet. It is provenance and a filter, the
 * same rule as `combatant.character_id` and `creature.derived_from`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Whose character it is. `on delete set null` rather than a cascade: losing
  // an account must not lose the character it played, which is somebody else's
  // campaign history.
  yield* sql`
    alter table character
      add column account_id uuid references account (id) on delete set null
  `;
  yield* sql`
    create index character_account_id_idx on character (account_id)
      where account_id is not null
  `;

  // The row half that used to be prose.
  //
  // `level` is bounded the way `ac` and `hp_max` are, and generously: the game
  // this is built for stops at 20 and the DMs who play past it exist, so the
  // check is here to refuse a typo rather than to have an opinion.
  //
  // `species` and `class_name` are open text, like `creature.size` and
  // `creature.type` and for the identical reason: nothing branches on them, and
  // homebrew is a thing people really have. Rendered as the DM capitalised
  // them.
  yield* sql`
    alter table character
      add column level integer check (level between 1 and 100),
      add column species text,
      add column class_name text,
      add column sheet_url text
  `;

  // The document half: whatever the player pasted or the DM typed. Nothing
  // queries into it except full text.
  //
  // The default is the empty document written out, not `'{}'`, so a row created
  // without one reads the same shape as a row created with one and no client
  // needs a special case. `packages/api/src/Character.ts` states the same value
  // as `emptyCharacterSheet`.
  yield* sql`
    alter table character
      add column body jsonb not null
        default '{"notes":"","abilities":[],"traits":[]}'::jsonb
  `;

  // Keep what the DM already wrote, without guessing at its structure. See the
  // header: a character with a descriptor gets it back as the document's
  // opening note, and one without keeps the empty document.
  yield* sql`
    update character
      set body = jsonb_build_object(
        'notes', descriptor,
        'abilities', '[]'::jsonb,
        'traits', '[]'::jsonb
      )
      where descriptor is not null and btrim(descriptor) <> ''
  `;

  // Dropped and re-added rather than converted: Postgres has no way to make an
  // existing column generated in place, and the value it would have to hold is
  // one this migration has just decided nothing may store.
  yield* sql`alter table character drop column descriptor`;
  yield* sql`
    alter table character
      add column descriptor text generated always as (
        nullif(
          btrim(
            coalesce('Level ' || level::text || ' ', '') ||
            coalesce(species || ' ', '') ||
            coalesce(class_name, '')
          ),
        '')
      ) stored
  `;

  // The fourth arm of `repo/Search.ts`, and the first time a party member is
  // findable at all. Name at A, the two things a DM would search a party by at
  // B, and every string in the document at C — the weighting `creature.search`
  // uses, so `ts_rank` stays comparable across the arms of one union rather
  // than being four scales that only look like one number.
  //
  // `player_name` is at B beside the class and species because "who is Ilse
  // running" is the question a DM asks out loud. `descriptor` is deliberately
  // absent: it is generated, a generated column may not reference another, and
  // its three parts are already here.
  yield* sql`
    alter table character
      add column search tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english',
          coalesce(player_name, '') || ' ' ||
          coalesce(species, '') || ' ' ||
          coalesce(class_name, '')), 'B') ||
        setweight(jsonb_to_tsvector('english', body, '["string"]'), 'C')
      ) stored
  `;
  yield* sql`create index character_search_idx on character using gin (search)`;
});
