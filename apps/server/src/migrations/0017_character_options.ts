import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The pieces a character is **built from** — a class, a species — as rows a
 * campaign can hold and an account can author.
 *
 * ### One table with a `kind`, not one per piece
 *
 * `0001`'s own precedent, applied a second time: *"one `note` table with a
 * `kind` and an optional attachment, not a `read_aloud` column on three tables
 * each with its own visibility rule to get wrong."* A background — and, much
 * later, a subclass — is then a new value in the check constraint rather than a
 * migration plus a repository plus an API group plus a screen.
 *
 * ### The ownership shape is `creature`'s, column for column, and that was
 * proven rather than assumed
 *
 * | row              | `campaign_id` | `account_id` | who may write it   |
 * | ---------------- | ------------- | ------------ | ------------------ |
 * | the bundle       | null          | null         | **nobody**         |
 * | a Library entity | null          | an account   | that account       |
 * | a campaign copy  | a campaign    | null         | that campaign's DM |
 *
 * The four predicates that carry it — `libraryRowReadable`,
 * `libraryRowWritable`, `corpusRowReadable`, `copyableIntoCampaign` — have
 * always taken a `table: string` and have only ever been called with
 * `"creature"`. A design probe built a table with exactly this shape and called
 * those functions **unmodified** against it, including the leak-shaped cases: a
 * player reading a stranger's Library, a bundled row named through somebody
 * else's campaign, an unshared campaign's copy. All of them answered the way
 * they answer for a creature. **So this migration adds no predicate, no base
 * case and no change to `repo/visibility.ts` at all** — if a change there ever
 * seems to be needed for this table, that is a finding rather than a step.
 *
 * ### Two constraints carry the model, and both are `creature`'s
 *
 * `character_option_one_owner` makes ownership exclusive, so each write
 * predicate can name one column and be complete. Without it, `account_id = me`
 * would be a way to write a row inside a campaign the actor does not DM.
 *
 * `character_option_system_is_unowned` makes `origin = 'system'` and *owned by
 * nobody* the same statement, in both directions — which is what keeps the
 * bundle unreachable by every write path **structurally** rather than by a rule
 * somebody has to remember. There is no `origin = 'system'` check anywhere in
 * `apps/server/src` for creatures and there is none for options either.
 *
 * ### What is a column, and what is the document
 *
 * The rule `character` and `creature` both follow: *a field earns a column when
 * something in the product reads it.* `kind` and `name` are read — the
 * vocabulary is looked up by both, and the picker groups by the first — so they
 * are columns. Nothing filters classes by hit die; `seedFor` reads it after
 * fetching one row. So everything that differs between a class and a species is
 * one `jsonb` document, and adding a `background` kind costs no column.
 *
 * ### `character` gains nothing, and could not gain the useful thing
 *
 * No `class_id`, no `species_id`, no migration on `character` at all.
 *
 * Two reasons, and the first is a hard constraint rather than a preference:
 * **`character.descriptor` is a generated column** (`0012`), and a generated
 * column cannot reference another table — `cannot use subquery in column
 * generation expression`, measured. So `"Level 3 Dwarf Bloodsworn"` can only
 * ever be written from text on the character's own row, whatever else exists.
 *
 * The second is that nothing would read the pointer. `seedFor` consumes the
 * class once at creation and never again, and the label is what every reader
 * actually renders. A provenance pointer arrives at the slice where something
 * reads it — the first plausible reader being a *report* ("4 characters were
 * made from Bloodsworn before this edit"), which is the honest form of
 * propagation and is not a write.
 *
 * ### No `tsvector`, and no fifth arm in `repo/Search.ts`
 *
 * `0008_beats.ts` shipped without one deliberately — *an index nothing reads is
 * worse than none* — and nothing searches a vocabulary of a few dozen rows. A
 * fifth arm is about eight lines the day a surface wants one.
 *
 * ### No backfill, and none is possible
 *
 * Every character already in the product keeps its free-text `species` and
 * `class_name` exactly as typed. Nothing here reads them, rewrites them or
 * offers them a match: `optionNamed` refuses fuzzy matching for the reason
 * `Ruleset.ts` refused it — *"a prefix or a contains rule would read 'Circle of
 * the Moon Druid' as a druid and 'Half-orc' as an orc, which is a guess written
 * into a number somebody reads out at the table."* That holds harder under
 * homebrew, because a campaign may genuinely have a "Moon Druid" that is a
 * different class.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table character_option (
      id                 uuid primary key default gen_random_uuid(),
      campaign_id        uuid references campaign (id) on delete cascade,
      account_id         uuid references account (id) on delete cascade,
      derived_from       uuid references character_option (id) on delete set null,
      kind               text not null check (kind in ('class', 'species')),
      name               text not null,
      body               jsonb not null default '{}'::jsonb,
      visibility         text not null default 'dm'
                           check (visibility in ('dm', 'shared')),
      origin             text not null default 'authored'
                           check (origin in ('system', 'imported', 'authored', 'assistant')),
      assistant_turn_id  uuid,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now(),
      constraint character_option_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null)),
      constraint character_option_one_owner
        check (campaign_id is null or account_id is null),
      constraint character_option_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
    )
  `;

  // The provenance pointer, made real — `0010`'s constraint, named its way, on a
  // table that arrived after it.
  //
  // `deferrable initially deferred` for `0010`'s reason: `delete from campaign`
  // cascades into `character_option` and into `assistant_turn` in one statement,
  // and an immediate `no action` fires before the referencing rows are gone.
  // Under autocommit the check is still the end of that one statement, so a lone
  // `delete from assistant_turn` that an option points at is refused on the
  // spot. No `on delete` clause, so `no action`: an accepted row pins the turn
  // that produced it, which is what makes the trail worth having.
  //
  // Nothing writes an `assistant` option today — Hob has no `proposeOption` and
  // `repo/Proposals.ts` has no fourth target for one — so the column is inert
  // here exactly as it was inert on every table from `0001` until `0010`. The
  // constraint is what makes it not a lie the day something does.
  yield* sql`
    alter table character_option
      add constraint character_option_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;

  yield* sql`create index character_option_campaign_id_idx on character_option (campaign_id)`;
  // Partial, like `creature_account_id_idx`: the column is null on every row
  // that is not somebody's Library original, and the Library read is the only
  // thing that asks about it.
  yield* sql`
    create index character_option_account_id_idx on character_option (account_id)
      where account_id is not null
  `;
  yield* sql`
    create index character_option_derived_from_idx on character_option (derived_from)
      where derived_from is not null
  `;

  // The seeder's upsert target, and the bundle's only uniqueness rule.
  //
  // **`kind` has to be in it**, unlike `creature_system_name_key`: a class and a
  // species may share a name (nothing stops a table having both a "Warden"
  // class and a "Warden" species), and an index over the name alone would refuse
  // the second one with a constraint violation naming an index nobody has heard
  // of. Not `lower(kind)` — `kind` is a closed, check-constrained value, so
  // there is no casing for it to vary in.
  //
  // Partial for `creature`'s reason: a campaign and a Library get no uniqueness
  // rule at all. Two classes called Bloodsworn in one campaign is a thing a DM
  // may reasonably do while they work out which they want, and `derive` has no
  // uniqueness rule either — copying twice makes two copies, which the screen
  // says out loud.
  yield* sql`
    create unique index character_option_system_name_key
      on character_option (kind, lower(name))
      where campaign_id is null and account_id is null
  `;
});
