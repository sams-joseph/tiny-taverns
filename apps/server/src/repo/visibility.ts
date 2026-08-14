import { type AccountId, type Actor, type CampaignId, NotFound } from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient, SqlError, Statement } from "effect/unstable/sql";

/**
 * The visibility seam, in SQL.
 *
 * Every read composes one of these fragments into its `WHERE` clause, so rows
 * the actor may not see are never fetched. Post-filtering in a handler is the
 * leak pattern: the DM-only text is already in memory and one forgotten
 * `.filter` ships it. Filtering here means the bytes never leave Postgres.
 *
 * Four conditions, all required:
 *
 *   membership  the actor's account holds a live `campaign_member` row for the
 *               campaign
 *   scope       the campaign is the one this credential was minted for, unless
 *               the credential covers the whole account
 *   the campaign is itself readable — for a player member, `campaign.visibility`
 *               has to be `shared`
 *   the row is itself readable — for a player member, `visibility` has to be
 *               `shared`
 *
 * The third is the master toggle, and it is why a `shared` note inside an
 * unshared campaign stays invisible. The fixtures show the same two levels for
 * a live encounter: a `Share` switch over the whole run plus a per-combatant
 * `Hide from players` override. Sharing one note must not open the campaign,
 * and closing the campaign must close everything under it.
 *
 * **The role is not on the actor, and cannot be.** A person is the DM of one
 * table and a player at another *on the same credential*, so "may this actor
 * see `dm` rows" is a question about a pair — this account, this campaign — and
 * a pair is a row. `isDm` is that question, and it is the only thing in this
 * file that changed shape when membership arrived: the four branches that used
 * to read `actor.seesDmContent` read it instead.
 *
 * Players are real now — `Invites.redeem` mints the membership — so those
 * branches are exercised rather than merely present, which is what the file
 * was built for.
 *
 * **One reach has been added since, and one only**: `ownedRowReadable`, which
 * lets an account read the row that names it whatever that row's own
 * `visibility` says. It is written as a third disjunct of the innermost test
 * rather than as an alternative to the whole predicate, so every condition
 * above it still applies. See its own comment for what that buys.
 *
 * `ownRowReadable` beside it is **not** a second reach and the distinction is
 * worth keeping: it is that same predicate conjoined with ownership, so it can
 * only ever return fewer rows. A narrowing is free to be added; a reach is not.
 *
 * **The write half is no longer all `isDm`, and that is the newest thing in this
 * file.** `ownRowWritable` is the first predicate here that lets somebody who is
 * not a DM change a row — a player editing their own character, settled by the
 * captain. It is one hole, in one table, over the columns a payload schema
 * allows, and it is strictly narrower than the read beside it; the argument is
 * on the function itself and is worth reading before anything like it is added.
 *
 * **Every predicate here reaches `campaignInScope` except the two the Library
 * added, and those two reach nothing at all.** `libraryRowReadable` and
 * `libraryRowWritable` are about rows that are in **no campaign**: the bundled
 * corpus and the creatures an account authored for itself. There is no
 * membership question to ask about a row no campaign contains, so they ask none
 * — they compare `account_id` to the actor's own account and stop. That is not a
 * hole in the rule above; it is the rule not applying, because reach is about
 * campaigns and these rows are outside every one of them.
 *
 * (An earlier draft of the Library did compose `campaignInScope`, by
 * quantifying the campaign rather than binding it — `corpusRowReadableAnywhere`,
 * now deleted. It answered every campaign copy the credential could reach, which
 * is the opposite of what the Library is for: those are copies, and the Library
 * shows originals. The trap that comment warned about survives its deletion and
 * is restated on `corpusRowReadable` below, because it is a fact about unions
 * over a gate rather than about that one predicate.)
 */

/**
 * The campaign a membership question is asked about.
 *
 * Almost always a `CampaignId` bound as a parameter, because almost every read
 * names its campaign in the path — and that is what makes the answer a constant
 * for the whole query rather than a test repeated per row. Postgres hoists it
 * to an `InitPlan` and evaluates it once even where the containment chain
 * mentions it four times, which is why these fragments take the campaign
 * explicitly instead of reaching for the correlated `campaign.id` by default.
 *
 * The correlated form is for the one read with no campaign in its path: the
 * campaign list, where the role genuinely is per row.
 *
 * **A caller may only pass an id the enclosing query has already bound the
 * `campaign` row to.** Every one below does — `rowReadable` constrains
 * `<table>.campaign_id` to the same value in a sibling clause — which is what
 * makes the bound and correlated forms two spellings of one question rather
 * than two questions.
 */
type CampaignRef = CampaignId | Statement.Identifier;

/** The `campaign` row of the query this fragment lands in. */
const correlatedCampaign = (sql: SqlClient.SqlClient): Statement.Identifier => sql("campaign.id");

/**
 * The campaign a row of `table` is in — the ref for a read over a
 * campaign-scoped table that names **no** campaign in its path.
 *
 * There is one such read today, `GET /me/characters`, and it is the second time
 * the file has needed a correlated form: `campaignReadable`'s default is the
 * first, for the campaign list. The difference is which row the question is
 * asked from. There, the row *is* the campaign; here the row points at one, so
 * the ref is the pointer rather than the outer `campaign.id` — which means the
 * predicate composes with no join to `campaign` at all, and no inner alias
 * shadowing an outer one.
 *
 * It satisfies `CampaignRef`'s rule trivially and therefore exactly: the
 * sibling clause `withinReadableCampaign` writes becomes
 * `<table>.campaign_id = <table>.campaign_id`, so the campaign the membership
 * and scope questions are asked about is, by construction, the campaign the row
 * is in. A caller cannot pass one it is not.
 */
export const rowCampaign = (sql: SqlClient.SqlClient, table: string): Statement.Identifier =>
  sql(`${table}.campaign_id`);

/**
 * Whether this actor's account holds a live membership of the campaign.
 *
 * This replaced `campaign.account_id = <the actor's account>`, and the
 * replacement is the whole of the change. `campaign.account_id` still exists —
 * it is the cascade parent and the answer to "whose account is this" — but it
 * is no longer a reach path, and `apps/server/test/membership.test.ts` greps
 * `src` to keep a future predicate from quietly making it one again.
 */
const isMember = (
  sql: SqlClient.SqlClient,
  campaign: CampaignRef,
  actor: Actor,
): Statement.Fragment => memberOfCampaign(sql, campaign, actor.accountId);

/**
 * Whether a *named* account holds a live membership of the campaign.
 *
 * `isMember` above is this question asked about the actor, and asking it about
 * an account the request named is the only other legitimate form: a DM
 * assigning a character to somebody at their table
 * (`repo/Characters.ts`'s `assign`) is naming an account, and the thing that
 * keeps that from being "name any account in the product" is that it has to be
 * a member here.
 *
 * Deliberately not keyed on the role, for the reason `campaignInScope` is not:
 * the narrowing that matters is *this campaign*, and a role test here would be
 * a second, quieter answer to a question `campaign_member.role` already
 * answers — one that would have to be revisited the day co-DMs arrive.
 */
export const memberOfCampaign = (
  sql: SqlClient.SqlClient,
  campaign: CampaignRef,
  accountId: AccountId,
): Statement.Fragment =>
  sql`exists (select 1 from campaign_member
              where campaign_member.campaign_id = ${campaign}
                and campaign_member.account_id = ${accountId}
                and campaign_member.revoked_at is null)`;

/**
 * Whether this actor is a DM of the campaign — the thing `actor.seesDmContent`
 * used to answer for free, and the one part of this file that a row now decides.
 *
 * That is the real cost of membership and it is worth stating plainly: a
 * player's write refusal used to compile to the literal `false` and never reach
 * a row. What buys it back is `campaign_owner_is_dm_member`
 * (`0011_membership.ts`), which makes "a campaign whose owner is not its DM"
 * unrepresentable rather than merely unwritten — so there is no state in which
 * this returns false for the person who created the campaign.
 */
const isDm = (sql: SqlClient.SqlClient, campaign: CampaignRef, actor: Actor): Statement.Fragment =>
  sql`exists (select 1 from campaign_member
              where campaign_member.campaign_id = ${campaign}
                and campaign_member.account_id = ${actor.accountId}
                and campaign_member.role = 'dm'
                and campaign_member.revoked_at is null)`;

/**
 * The campaigns this actor's credential reaches at all, before any question of
 * what it may then do with them.
 *
 * Membership is not scope, and the two narrow independently. A DM token is
 * minted for an account and carries `campaignId: null`, so it reaches every
 * campaign that account is a member of and the second clause is one redundant
 * `true` in the plan. A credential minted for a single table carries that
 * table's id — and without that clause it would reach every campaign the same
 * account belongs to, so a DM running two tables would leak table A's shared
 * rows to table B's players.
 *
 * Deliberately not keyed on the role: a scoped credential minted later for
 * something other than a player must not reach past its campaign either.
 *
 * The scope clause stays on the correlated `campaign.id` rather than on the
 * ref, because it is a statement about the row being returned and is right
 * however a future caller composes it.
 */
const campaignInScope = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  campaign: CampaignRef,
): Statement.Fragment =>
  sql.and([
    isMember(sql, campaign, actor),
    actor.campaignId === null ? sql`true` : sql`campaign.id = ${actor.campaignId}`,
  ]);

/** Rows of `campaign` this actor may read. */
export const campaignReadable = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  campaign: CampaignRef = correlatedCampaign(sql),
): Statement.Fragment =>
  sql.and([
    campaignInScope(sql, actor, campaign),
    sql.or([isDm(sql, campaign, actor), sql`campaign.visibility = 'shared'`]),
  ]);

/**
 * Rows of `campaign` this actor may write.
 *
 * A player matches nothing rather than being rejected with a distinct error:
 * telling a reader that a campaign exists but is not theirs to edit is itself
 * a disclosure, and the caller turns "no rows" into a plain 404.
 *
 * `isDm` implies membership, so the first clause looks redundant and is not:
 * it carries the credential-scope narrowing, which is a different question and
 * applies to a DM too.
 */
export const campaignWritable = (
  sql: SqlClient.SqlClient,
  actor: Actor,
  campaign: CampaignRef = correlatedCampaign(sql),
): Statement.Fragment =>
  sql.and([campaignInScope(sql, actor, campaign), isDm(sql, campaign, actor)]);

/**
 * The half of a row read that is about the *campaign*: this row is in the
 * campaign the path names, and that campaign is one this actor may read at all
 * — which is where membership, credential scope and the master toggle are
 * actually checked.
 *
 * It is a named piece rather than two lines inlined twice because
 * `ownedRowReadable` below widens the *other* half and must not be able to
 * restate this one slightly differently. Everything a caller is allowed to
 * relax lives after it.
 */
const withinReadableCampaign = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignRef,
  actor: Actor,
): ReadonlyArray<Statement.Fragment> => [
  sql`${sql(table)}.campaign_id = ${campaignId}`,
  sql`exists (select 1 from campaign where campaign.id = ${sql(table)}.campaign_id and ${campaignReadable(sql, actor, campaignId)})`,
];

/** Rows of a campaign-scoped table (`session`, `character`, `note`) this actor may read. */
export const rowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    ...withinReadableCampaign(sql, table, campaignId, actor),
    sql.or([isDm(sql, campaignId, actor), sql`${sql(table)}.visibility = 'shared'`]),
  ]);

/**
 * Rows of a campaign-scoped table whose rows may *belong to* an account — today
 * only `character`, whose `account_id` says whose character it is.
 *
 * `rowReadable` plus one disjunct: **your own row, whatever its visibility.**
 * That is a new reach and the only one this file has grown since membership
 * arrived, so what it does *not* do is the part worth reading.
 *
 * **The campaign gate stays outside the union.** The extra disjunct sits inside
 * the same `or` the row's own `visibility` is tested in, after
 * `withinReadableCampaign` — so ownership relaxes the row-level toggle and
 * nothing above it. A player still has to hold a live membership, the
 * credential still has to reach this campaign, and `campaign.visibility` still
 * has to be `shared`. Written the other way round — `rowReadable(…) or
 * account_id = me` — a character would be readable by its owner in a campaign
 * they had been revoked from, through a credential minted for another table,
 * and in a campaign the DM has never shared. That is the `corpusRowReadable`
 * lesson, met a second time: the union is over the *innermost* test only.
 *
 * **It grants your own row and no one else's.** `account_id` is compared to the
 * actor's own account and to nothing a caller supplied, so there is no shape of
 * request that asks for somebody else's character this way — a player reading
 * another player's still needs the row to be `shared`.
 *
 * **It changes nothing a DM sees.** `isDm` is already a disjunct of the same
 * `or`, so for a DM the clause is satisfied before ownership is reached.
 *
 * There is deliberately no `ownedRowWritable`, and there still is not. The
 * player write that has since shipped is `ownRowWritable` — the **conjoined**
 * shape, one row rather than a relaxed toggle. A player editing their own
 * character does not make a `shared` row somebody else owns writable, which is
 * what an `ownedRowWritable` would have meant.
 *
 * It takes a `CampaignRef` rather than a bound id so that a read with no
 * campaign in its path can compose it — see `ownRowReadable` below and
 * `rowCampaign` above. Every existing caller passes a bound id and is unchanged.
 */
export const ownedRowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignRef,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    ...withinReadableCampaign(sql, table, campaignId, actor),
    sql.or([
      isDm(sql, campaignId, actor),
      sql`${sql(table)}.visibility = 'shared'`,
      sql`${sql(table)}.account_id = ${actor.accountId}`,
    ]),
  ]);

/**
 * Rows of an ownable table that are **this actor's own** — `GET /me/characters`,
 * and the only read in the product that is narrower than what the actor may see
 * rather than equal to it.
 *
 * It is `ownedRowReadable` **conjoined** with ownership, not a fourth predicate
 * that restates it. That shape is the whole guarantee: a conjunction cannot be
 * wider than either half, so however `ownedRowReadable` changes, this stays
 * inside it. (Postgres then simplifies the disjunction away, since
 * `account_id = me` implies the `or` it sits in — what survives is *in a
 * campaign I may read* and *mine*, which is what "my characters" means.)
 *
 * **The narrowing is the only thing this adds, and it is not a security
 * boundary.** Every refusal is still the seam's: a revoked membership, a
 * credential minted for another table and an unshared campaign each take the row
 * away before ownership is reached, exactly as they do for `characters.list`. So
 * the endpoint discloses nothing `GET /campaigns/:c/characters` would not, one
 * campaign at a time.
 *
 * `account_id` is compared to the actor's own account and to nothing a caller
 * supplied — there is no request shape that asks for somebody else's characters
 * here. This is the one place the comparison is written, for the reason the
 * whole file exists: a repository that spelled it in its own `WHERE` would be
 * the second place the ownership rule lives.
 */
export const ownRowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignRef,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    ownedRowReadable(sql, table, campaignId, actor),
    sql`${sql(table)}.account_id = ${actor.accountId}`,
  ]);

/**
 * Rows of an ownable table this actor may **write because they are theirs** —
 * *the first player write in the product's history*, and the only hole in the
 * write half of this file.
 *
 * Until this existed, every write predicate here bottomed out in `isDm`, so a
 * player's refusal was a fact about the seam rather than a check anywhere. That
 * simplification is now spent, deliberately, by the captain's decision
 * (`player-edits-own-character`). What follows is the shape it bought, and why
 * each part of it is the narrow version.
 *
 * **It sits beside `rowWritable`, not inside it.** `rowWritable` composes
 * `campaignWritableById`, which requires `isDm` — there is no argument that
 * relaxes it into this, and one that tried would have to weaken the DM test for
 * every table at once. Two predicates that mean different things, exactly as
 * `rowWritable` is not `rowReadable`.
 *
 * **The campaign half is `withinReadableCampaign`, shared with the two read
 * predicates above and not restated.** So a write is bounded by every narrowing
 * a read is: a live membership, a credential that reaches this campaign, and
 * `campaign.visibility = 'shared'`. Written as its own `exists (…)` it would be
 * a second spelling of the campaign gate, and the day the two disagree the
 * wrong one is the one nobody is looking at.
 *
 * **The row half is ownership and nothing else.** No `visibility` disjunct: a
 * `shared` row somebody else owns is not writable here, and neither is an
 * unassigned one — `account_id = ${actor.accountId}` never matches null. There
 * is no shape of request that names an account, so this cannot be pointed at
 * anybody else's row.
 *
 * The consequence worth stating: this fragment is **strictly narrower than
 * `ownedRowReadable`**, because `account_id = me` implies the disjunct it would
 * have had to satisfy there. A player can never write a row they could not
 * read, however either predicate changes, and that is a property of the shapes
 * rather than of two lists kept in step.
 *
 * **What it does not bound is which columns move**, and a predicate cannot:
 * `WHERE` decides rows. The live half of a character — `hp_current`, `temp_hp`,
 * `conditions` — is kept out by the payload schema instead
 * (`CharacterOwnUpdate` has no field for any of them), which is the same shape
 * as the recap's player projection: a leak has to be *written*, not caused by a
 * forgotten flag. Anything composing this fragment owes the same discipline.
 */
export const ownRowWritable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignRef,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    ...withinReadableCampaign(sql, table, campaignId, actor),
    sql`${sql(table)}.account_id = ${actor.accountId}`,
  ]);

/**
 * Whether a row of `table` belongs to no campaign and to no account — the
 * **bundle**, the corpus `pnpm -F server bestiary:import` provisions.
 *
 * One fragment rather than two clauses inlined at each of its callers, because
 * this is the sentence the shared corpus's immutability is written in: the
 * bundle is the content nobody owns. `creature_system_is_unowned` makes it the
 * same statement as `origin = 'system'`, which is why no predicate in this file
 * and no query in `src` ever names that origin.
 */
const unowned = (sql: SqlClient.SqlClient, table: string): Statement.Fragment =>
  sql.and([sql`${sql(table)}.campaign_id is null`, sql`${sql(table)}.account_id is null`]);

/**
 * Rows of a table whose content is *either* campaign-scoped or bundled — today
 * only `creature`, where an `origin = 'system'` row is owned by nobody and
 * belongs to every campaign at once. **The campaign bestiary.**
 *
 * Three things about this are easy to get wrong, and all three are the
 * difference between a shared corpus and a leak.
 *
 * **The campaign gate is not inside the branch.** A bundled row is reachable
 * *through a campaign this actor can read*, and through nothing else — the
 * `exists (…)` clause below applies to both halves of the union. Written the
 * other way round, as `unowned(…) or rowReadable(…)`, a bundled row would be
 * readable by any authenticated request naming any campaign id at all,
 * including one belonging to somebody else. There is no separate check to lean
 * on: `findById` on this table is reached by path, and the path is a claim.
 *
 * **The global half is `unowned`, not `campaign_id is null`.** Since
 * `0015_library_creatures.ts` a null campaign no longer means "bundled": an
 * account's own Library entities sit there too. Spelled the old way this
 * predicate would hand every campaign bestiary in the product every Library
 * entity of every account — the widest disclosure the seam has ever been one
 * clause away from. A Library entity is invisible here until it is *copied in*,
 * which is what `creatures/:id/derive` is for and what the model means by the
 * campaign holding copied state.
 *
 * **The row's own visibility still applies.** Bundled creatures default to `dm`
 * like everything else, so "global" means shared between a DM's campaigns, not
 * shared with their players. A stat block is exactly the thing the product says
 * a player must not have.
 *
 * **This predicate did not otherwise change when the Library arrived, and that
 * was decided rather than skipped.** The campaign bestiary is a different
 * question: it answers *what is in this campaign*, plus the bundle every
 * campaign shares. Narrowing it to the campaign's own rows would take the bundle
 * away from the screen and from `derive`'s source; widening it to reach a DM's
 * Library would put originals in a list whose whole content is copies.
 *
 * There is deliberately no `corpusRowWritable`. Writes use `rowWritable`
 * unchanged, which requires `campaign_id` to equal the campaign in the path —
 * and a null never equals a uuid, so the immutability of the bundle is a
 * consequence of the predicate rather than a rule someone has to remember.
 */
export const corpusRowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql.or([sql`${sql(table)}.campaign_id = ${campaignId}`, unowned(sql, table)]),
    sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignReadable(sql, actor, campaignId)})`,
    sql.or([isDm(sql, campaignId, actor), sql`${sql(table)}.visibility = 'shared'`]),
  ]);

/**
 * Rows of that same table that are in **no campaign at all** and are either the
 * bundle or this actor's own. **The Library.**
 *
 * The captain's model, and the whole of it in one line: *the library should only
 * show the raw entity, not anything in campaigns, as the campaign is a copied
 * state of the entity.* So this predicate is anchored on `campaign_id is null`
 * and nothing it returns has ever been in a campaign.
 *
 * **It composes no campaign gate, and that is not an omission.** Every other
 * read in this file bottoms out in `campaignInScope`, because every other read
 * is about a row a campaign contains and reach is the question of which
 * campaigns an actor's credential and memberships let it touch. A Library entity
 * is in no campaign, so there is no membership to check — the row's *owner* is
 * the entire question, and it is compared to the actor's own account and to
 * nothing a caller supplied. There is no shape of request that asks for somebody
 * else's Library this way.
 *
 * **`Actor.campaignId` does not narrow it either, and that is a decision.** The
 * standing rule is that membership and credential scope narrow independently and
 * both apply to every read — but `campaignId` says *which campaign this
 * credential was minted for*, and every predicate that uses it is answering "may
 * this credential reach campaign C". There is no campaign here for it to be
 * about, so applying it would mean **inventing** a second meaning for the field
 * ("scoped to a table ⇒ no Library"), which is not derivable from what it says
 * and is the second-answer shape this file refuses everywhere else. What is not
 * narrowed by scope is the credential's *account*, and the Library is the
 * account's.
 *
 * Nothing mints a campaign-scoped credential over HTTP today, so this changes no
 * answer now; `library.test.ts` pins it so that whatever mints one first meets
 * the decision rather than inheriting it silently. It is on the list in
 * `AGENTS.md` of what the captain has not been asked.
 *
 * This **reverses** the rule that shipped hours earlier. `corpusRowReadableAnywhere`
 * gathered every campaign copy the credential could reach; under the model those
 * are precisely the rows the Library must not show, and the read it replaces is
 * simpler than the one it replaces — no quantifier, no join to `campaign`, no
 * membership subplan.
 *
 * Three consequences worth stating, because each is a real change of answer:
 *
 * - **A DM sees no campaign creature here**, not even their own tables'. Those
 *   are copies. What they see is the bundle and what they have authored.
 * - **An account that is a member of nothing has a Library**, where before it
 *   read `[]`. That is the point of the model: authoring is not an act inside a
 *   campaign, so it cannot require one.
 * - **The row's own `visibility` is not tested, in either half.** For your own
 *   rows there is nobody to hide from. For the bundle it would hide the whole
 *   corpus, since `bestiary:import` never writes a visibility and the column
 *   defaults to `dm` — and `visibility` is a statement about *players at a
 *   table*, which a read with no table in it cannot be asking. What a player at
 *   somebody's table may see of the corpus is still `corpusRowReadable`'s
 *   question, unchanged.
 */
export const libraryRowReadable = (
  sql: SqlClient.SqlClient,
  table: string,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(table)}.campaign_id is null`,
    sql.or([
      sql`${sql(table)}.account_id is null`,
      sql`${sql(table)}.account_id = ${actor.accountId}`,
    ]),
  ]);

/**
 * Rows of the Library this actor may **write** — the ones they own.
 *
 * `libraryRowReadable` with the bundle's disjunct removed, which makes it
 * strictly narrower than the read beside it by shape rather than by two lists
 * kept in step: an account can never write a Library row it could not read.
 *
 * **This is where the shared corpus's structural immutability now lives, and it
 * is the same argument one column across.** `0004_bestiary.ts` bought it with
 * "every write requires `campaign_id` to equal the campaign in the path, and a
 * null never equals a uuid". That sentence stopped being sufficient the moment a
 * second kind of row appeared at `campaign_id is null` with a write path of its
 * own. What replaces it:
 *
 * > A Library write requires `account_id` to equal the account the credential
 * > resolved to. A bundled row's `account_id` is null, and a null never equals a
 * > uuid.
 *
 * And a bundled row's `account_id` *is* null as a fact about the schema rather
 * than about how the importer happens to be written:
 * `creature_system_is_unowned` makes `origin = 'system'` and *owned by nobody*
 * the same statement, so a system row that named an account is not a row
 * somebody forgot to reject — it is not a row Postgres will store.
 *
 * So there is still no `origin = 'system'` check anywhere in `apps/server/src`,
 * and there still does not need to be one. `apps/server/test/library.test.ts`
 * pins it from the endpoints and `apps/server/test/bestiary.test.ts` from raw
 * SQL.
 *
 * `campaign_id is null` is carried over from the read rather than dropped as
 * redundant. `creature_one_owner` does make it implied — a row with an
 * `account_id` has no campaign — but a predicate that leans on a constraint to
 * mean what it says is one constraint away from meaning something else, and the
 * something else here would be "the owner of a row may write it inside a
 * campaign they do not DM".
 */
export const libraryRowWritable = (
  sql: SqlClient.SqlClient,
  table: string,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(table)}.campaign_id is null`,
    sql`${sql(table)}.account_id = ${actor.accountId}`,
  ]);

/**
 * Rows this actor may **copy into** the named campaign — the campaign's own
 * bestiary, plus their own Library. The source read of `creatures/:id/derive`.
 *
 * A plain `or` of two predicates that are each complete on their own, which is a
 * different shape from the union inside `corpusRowReadable` and must not be
 * confused with it. The trap there is hoisting a *disjunct* out of a gate, so
 * that one half of a union escapes the campaign check the other half is bounded
 * by. Here neither half is a fragment of the other: `corpusRowReadable` carries
 * its own campaign gate and `libraryRowReadable` is anchored on there being no
 * campaign, so the disjunction says exactly "readable through this campaign, or
 * mine and in no campaign" and there is nothing for a row to slip between.
 *
 * **And no further.** Not another account's Library, and not another campaign's
 * bestiary — copying between a DM's *own* tables is still refused (see
 * `AGENTS.md`), because that would need `corpusRowReadable`'s campaign to be
 * quantified, which is the shape this change has just taken out.
 */
export const copyableIntoCampaign = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.or([corpusRowReadable(sql, table, campaignId, actor), libraryRowReadable(sql, table, actor)]);

/** Whether the named campaign accepts writes from this actor. */
export const campaignWritableById = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignWritable(sql, actor, campaignId)})`;

/**
 * Rows of a campaign-scoped table this actor may write.
 *
 * Note this is *not* `rowReadable`: a player can read a `shared` note, and must
 * still not be able to edit or delete it.
 */
export const rowWritable = (
  sql: SqlClient.SqlClient,
  table: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(table)}.campaign_id = ${campaignId}`,
    campaignWritableById(sql, campaignId, actor),
  ]);

/**
 * A table whose rows hang off another campaign-scoped row rather than off the
 * campaign directly — `prep_item` under `session`, `encounter_creature` under
 * `encounter`, `encounter_run` under `session`, `combatant` under
 * `encounter_run`.
 *
 * The alternative is a denormalised `campaign_id` on the child, which would let
 * the existing `rowReadable` apply unchanged. It is rejected because it stores
 * the answer to "which campaign is this in" twice: a child whose copy disagrees
 * with its parent's is then readable in a campaign it is not part of, and
 * nothing in a `WHERE` clause would notice. Walking the parent means there is
 * one answer.
 */
export interface NestedTable {
  /** The child table, e.g. `prep_item`. */
  readonly table: string;
  /** The parent table, e.g. `session`. */
  readonly parent: string;
  /** The child's column pointing at the parent, e.g. `session_id`. */
  readonly foreignKey: string;
}

/**
 * How a table reaches the campaign that scopes it.
 *
 * Nesting stopped being one level deep when the live session arrived:
 * `combatant` hangs off `encounter_run`, which hangs off `session`, which is
 * the campaign-scoped table. Writing that predicate out by hand would mean a
 * second, longer restatement of the containment rule, and two statements of one
 * rule is how they come to disagree. So the chain is data, and the predicate
 * walks it.
 */
export type Containment =
  | { readonly _tag: "campaign"; readonly table: string }
  | {
      readonly _tag: "under";
      readonly table: string;
      readonly foreignKey: string;
      readonly parent: Containment;
    };

/** A table with a `campaign_id` of its own — the end of every chain. */
export const inCampaign = (table: string): Containment => ({ _tag: "campaign", table });

/** A table reached through a parent, e.g. `under("combatant", "encounter_run_id", …)`. */
export const under = (table: string, foreignKey: string, parent: Containment): Containment => ({
  _tag: "under",
  table,
  foreignKey,
  parent,
});

/**
 * Whether the *correlated* row of this table is readable.
 *
 * Correlated, meaning no id is bound: the row comes from the query this is
 * dropped into, or from the `exists (…)` one level up. That is what lets the
 * chain recurse — each link asks the same question of its parent, and the base
 * case is `rowReadable`, which is where membership, credential scope and
 * the campaign's own visibility are actually checked.
 *
 * Every level applies its own row's `visibility` on the way down, so the two
 * levels the fixtures ask for — the runner's `Share` switch over the whole
 * fight (`EncounterRunner.jsx:122`) and `Hide from players` on one row (`:139`)
 * — are the ordinary behaviour of the chain rather than a rule about runs.
 */
export const containedRowReadable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => {
  if (containment._tag === "campaign") {
    return rowReadable(sql, containment.table, campaignId, actor);
  }
  const { table, foreignKey, parent } = containment;
  return sql.and([
    sql`exists (select 1 from ${sql(parent.table)} where ${sql(`${parent.table}.id`)} = ${sql(`${table}.${foreignKey}`)} and ${containedRowReadable(sql, parent, campaignId, actor)})`,
    sql.or([isDm(sql, campaignId, actor), sql`${sql(`${table}.visibility`)} = 'shared'`]),
  ]);
};

/**
 * Whether the correlated row of this table accepts writes from this actor.
 *
 * Not `containedRowReadable`, and the difference is the same one `rowWritable`
 * makes: a player may read a `shared` combatant and must still not be able to
 * damage it. No level applies a row `visibility` here — the base case refuses
 * every non-DM outright.
 */
export const containedRowWritable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => {
  if (containment._tag === "campaign") {
    return rowWritable(sql, containment.table, campaignId, actor);
  }
  const { table, foreignKey, parent } = containment;
  return sql`exists (select 1 from ${sql(parent.table)} where ${sql(`${parent.table}.id`)} = ${sql(`${table}.${foreignKey}`)} and ${containedRowWritable(sql, parent, campaignId, actor)})`;
};

/**
 * Rows of a nested table this actor may read.
 *
 * Three levels now rather than two: the campaign has to be readable, *and* the
 * parent row, *and* the child. Composing rather than restating is what carries
 * the campaign-scope containment down — a credential minted for one table
 * cannot reach a prep item through a session in another, because the clause it
 * inherits already refused the session.
 */
export const nestedRowReadable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${parentId}`,
    containedRowReadable(
      sql,
      under(nested.table, nested.foreignKey, inCampaign(nested.parent)),
      campaignId,
      actor,
    ),
  ]);

/**
 * Rows of a nested table this actor may read, correlated to the parent row of
 * an *enclosing* query rather than to a parent id a caller supplied.
 *
 * This exists for one shape: an aggregate over the children computed alongside
 * the parent, such as an encounter's creature count. `nestedRowReadable` binds
 * the parent id as a value, which a correlated subquery cannot do — it has to
 * join to the outer row.
 *
 * **The parent's own readability is the enclosing query's job here, and this
 * function does not check it.** That is safe only because the enclosing query
 * is already selecting the parent through `rowReadable`, which is the thing
 * that carries campaign scope and membership. Used anywhere else it would be a
 * child read with no containment at all — so it belongs in a subquery whose
 * `FROM` is the parent table, and nowhere else.
 *
 * It takes the campaign for the same reason: the role test is a question about
 * this actor and this campaign, and the enclosing query has the id bound.
 */
export const nestedRowReadableWithin = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${sql(`${nested.parent}.id`)}`,
    sql.or([isDm(sql, campaignId, actor), sql`${sql(`${nested.table}.visibility`)} = 'shared'`]),
  ]);

/** Rows of a nested table this actor may write. Not `nestedRowReadable`. */
export const nestedRowWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`${sql(`${nested.table}.${nested.foreignKey}`)} = ${parentId}`,
    nestedParentWritable(sql, nested, parentId, campaignId, actor),
  ]);

/** Whether the named parent row exists and accepts writes from this actor. */
const nestedParentWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from ${sql(nested.parent)} where ${sql(`${nested.parent}.id`)} = ${parentId} and ${rowWritable(sql, nested.parent, campaignId, actor)})`;

const ensure = (
  sql: SqlClient.SqlClient,
  resource: string,
  id: string,
  predicate: Statement.Fragment,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly allowed: boolean }>`select ${predicate} as allowed`;
    if (rows[0]?.allowed !== true) {
      return yield* new NotFound({ resource, id });
    }
  });

/**
 * Fails with `NotFound` unless the campaign exists and accepts writes from this
 * actor. Used before an insert, where there is no row yet to constrain.
 */
export const ensureCampaignWritable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(sql, "campaign", campaignId, campaignWritableById(sql, campaignId, actor));

/**
 * Fails with `NotFound` unless the campaign is visible to this actor. Used by
 * list endpoints, so an unreachable campaign is a 404 rather than an empty list
 * that reads as "you have no notes".
 */
export const ensureCampaignReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    "campaign",
    campaignId,
    sql`exists (select 1 from campaign where campaign.id = ${campaignId} and ${campaignReadable(sql, actor, campaignId)})`,
  );

/**
 * Fails with `NotFound` unless the nested table's parent row exists, sits in
 * this campaign, and accepts writes from this actor. Used before inserting a
 * child, where there is no row yet to constrain.
 *
 * The failure names the *parent* — `NotFound { resource: "session" }` — because
 * that is the thing the caller asked about and could not have.
 */
export const ensureNestedParentWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.parent,
    parentId,
    nestedParentWritable(sql, nested, parentId, campaignId, actor),
  );

/**
 * Fails with `NotFound` unless the nested table's parent row is visible to this
 * actor. Used by list endpoints, so an unreachable session is a 404 rather than
 * an empty checklist that reads as "you have nothing to prepare".
 */
export const ensureNestedParentReadable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.parent,
    parentId,
    sql`exists (select 1 from ${sql(nested.parent)} where ${sql(`${nested.parent}.id`)} = ${parentId} and ${rowReadable(sql, nested.parent, campaignId, actor)})`,
  );

/**
 * Fails with `NotFound` unless the named row of a nested table exists, hangs
 * off *this* parent, and is readable.
 *
 * Both halves matter, and separating them is a real hole rather than a
 * theoretical one. Checking "the session is readable" and "the run is readable"
 * as two independent questions is satisfiable by a run in a *different* session
 * of the same campaign — each check passes on its own, and the pair says
 * nothing about whether the parent in the path is the parent of the row. The
 * predicate here binds the foreign key, so the question asked is the one meant:
 * is this row in this parent, and may this actor have it.
 */
export const ensureNestedRowReadable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  id: string,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.table,
    id,
    sql`exists (select 1 from ${sql(nested.table)} where ${sql(`${nested.table}.id`)} = ${id} and ${nestedRowReadable(sql, nested, parentId, campaignId, actor)})`,
  );

/** The same, for writes. Not `ensureNestedRowReadable` — see `rowWritable`. */
export const ensureNestedRowWritable = (
  sql: SqlClient.SqlClient,
  nested: NestedTable,
  id: string,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    nested.table,
    id,
    sql`exists (select 1 from ${sql(nested.table)} where ${sql(`${nested.table}.id`)} = ${id} and ${nestedRowWritable(sql, nested, parentId, campaignId, actor)})`,
  );

/** Whether the named row of a contained table exists and is readable. */
export const containedRowReadableById = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  id: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql`exists (select 1 from ${sql(containment.table)} where ${sql(`${containment.table}.id`)} = ${id} and ${containedRowReadable(sql, containment, campaignId, actor)})`;

/**
 * Fails with `NotFound` unless the named row of a contained table is visible to
 * this actor.
 *
 * Used before reading its children, so an unreachable run is a 404 naming the
 * *run* rather than an empty initiative list that reads as "this fight has
 * nobody in it".
 */
export const ensureContainedRowReadable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  id: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    containment.table,
    id,
    containedRowReadableById(sql, containment, id, campaignId, actor),
  );

/**
 * Fails with `NotFound` unless the named row of a contained table accepts
 * writes from this actor. Used before inserting a child, where there is no row
 * yet to constrain.
 */
export const ensureContainedRowWritable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  id: string,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<void, SqlError.SqlError | NotFound> =>
  ensure(
    sql,
    containment.table,
    id,
    sql`exists (select 1 from ${sql(containment.table)} where ${sql(`${containment.table}.id`)} = ${id} and ${containedRowWritable(sql, containment, campaignId, actor)})`,
  );

/** Rows of a contained table this actor may write, bound to a parent id. */
export const containedChildWritable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  containment._tag === "campaign"
    ? containedRowWritable(sql, containment, campaignId, actor)
    : sql.and([
        sql`${sql(`${containment.table}.${containment.foreignKey}`)} = ${parentId}`,
        containedRowWritable(sql, containment, campaignId, actor),
      ]);

/** Rows of a contained table this actor may read, bound to a parent id. */
export const containedChildReadable = (
  sql: SqlClient.SqlClient,
  containment: Containment,
  parentId: string,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  containment._tag === "campaign"
    ? containedRowReadable(sql, containment, campaignId, actor)
    : sql.and([
        sql`${sql(`${containment.table}.${containment.foreignKey}`)} = ${parentId}`,
        containedRowReadable(sql, containment, campaignId, actor),
      ]);
