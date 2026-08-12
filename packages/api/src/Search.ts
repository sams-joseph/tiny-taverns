import { Schema } from "effect";
import { BeatId, CharacterId, CreatureId, NoteId, SessionId } from "./Ids.js";

/**
 * Searching one campaign's record.
 *
 * **One search path over this corpus, and this is it.** Hob's `searchCampaign`
 * tool is this repository method behind a `Tool.make` wrapper — it writes no SQL
 * and gets no predicate of its own, which is what stops a second, subtly
 * different answer to "what may this actor read" appearing next to the first
 * one. See `apps/server/src/assistant/toolkit.ts`.
 *
 * Lexical, not semantic. A DM searches for the words they wrote — the ferryman,
 * the crate, Cazril — and invented proper nouns are precisely what an embedding
 * is worst at and what `ILIKE` and `tsvector` are best at. Embeddings would also
 * mean a second AI vendor, since Anthropic ships no embedding model.
 */

/**
 * Which table a hit came from.
 *
 * Four arms, and the reason each is here rather than a fifth:
 *
 * - `note` — the DM's prep prose, written before the night.
 * - `beat` — the DM's own line about what happened during it.
 * - `creature` — the bestiary, which already had a `tsvector` before this
 *   existed. It is in the union so that "find the hag" is *one* question with
 *   one answer, rather than a prose search beside `creatures.list?q=`.
 * - `character` — the party. It arrived with `0012_character_sheet.ts`, which
 *   gave a character a document to search: until then the people the campaign
 *   is about were the one part of the record that could not be found at all,
 *   and "what is Ilse's AC" had no answer here.
 *
 * `session_event` is deliberately absent — see `0009_search_index.ts`, which
 * carries the captain's reasoning. Combat is reached by name, by recap, or by
 * reading the log.
 */
export const SearchSource = Schema.Literals(["note", "beat", "creature", "character"]);
export type SearchSource = typeof SearchSource.Type;

/**
 * The fields every hit carries, whatever it is a hit on.
 *
 * A hit is a **pointer plus enough to render a result line**, not a copy of the
 * row. Whoever wants the whole thing reads it through the group that owns it,
 * where the visibility predicate that let the hit through applies again.
 * Provenance is not here for the same reason it is not on a bestiary card:
 * nothing writes an `assistant` row yet, and a field the API cannot honestly
 * fill is worse than an absent one.
 */
const hitFields = {
  /**
   * `ts_rank` of the row's `tsvector` against the query.
   *
   * Comparable across the arms because they share one weighting scheme (title
   * and name at A, body at B). **Zero is a real answer**: a hit found only by
   * the `ILIKE` half — "ferry" halfway through typing "ferryman" — has no
   * lexeme match to rank, and ordering falls through to recency.
   */
  rank: Schema.Number,
  /**
   * A plain-text excerpt centred on the match, or the row's own subtitle when
   * it has no prose document to excerpt.
   *
   * **No markup.** Postgres would happily wrap the matched words in `<b>`, and
   * a JSON string carrying HTML is both an injection to remember forever and a
   * rendering contract nobody agreed to. Where the emphasis goes is the
   * client's to decide from the query it already has.
   */
  snippet: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
} as const;

/** A prep note or a read-aloud. */
export const NoteHit = Schema.Struct({
  source: Schema.Literal("note"),
  id: NoteId,
  title: Schema.String,
  ...hitFields,
});

/**
 * One line the DM jotted during play.
 *
 * `sessionId` is here and on no other member, which is the whole argument for a
 * union rather than one record with nullable fields: a beat is the only thing
 * in the corpus that belongs to a *night*, and that is exactly what makes it
 * worth finding. A `null` session on a note hit would be a field the API does
 * not have, rendered anyway.
 *
 * There is no `title`, because a beat has none — that absence is the schema
 * saying so rather than an empty string pretending otherwise.
 */
export const BeatHit = Schema.Struct({
  source: Schema.Literal("beat"),
  id: BeatId,
  sessionId: SessionId,
  ...hitFields,
});

/**
 * A creature from this campaign or from the shared corpus.
 *
 * `snippet` is the stat block's own meta line (`"Small humanoid (goblinoid),
 * neutral evil"`) rather than an excerpt: the document half of a creature is
 * `jsonb`, and there is no prose paragraph to centre a headline on. So a
 * creature found by a trait — "nimble escape" matches through
 * `jsonb_to_tsvector(body)` — comes back with its subtitle and the stat block
 * is one read away.
 */
export const CreatureHit = Schema.Struct({
  source: Schema.Literal("creature"),
  id: CreatureId,
  /** The creature's name. */
  title: Schema.String,
  ...hitFields,
});

/**
 * Somebody at the table.
 *
 * `title` is the character's own name and the snippet is their sheet's opening
 * prose, or — when the sheet has none — the derived `"Level 3 Half-orc
 * Paladin"` line, which is the same fallback the creature arm makes to its meta
 * line and for the same reason: a document with no paragraph has nothing for
 * `ts_headline` to centre on, and the subtitle is the honest result line.
 *
 * There is no `playerName` here. A hit is a pointer plus enough to render a
 * line, not a copy of the row — and the player's real name is the one field on
 * this table that a player surface will have to think hardest about.
 */
export const CharacterHit = Schema.Struct({
  source: Schema.Literal("character"),
  id: CharacterId,
  /** The character's name. */
  title: Schema.String,
  ...hitFields,
});

/**
 * One result.
 *
 * Discriminated on `source`, the same shape `NoteAttachment` and `LiveEvent`
 * use, so a client branches once and gets the branded id and the fields that
 * actually exist for that arm.
 */
export const SearchHit = Schema.Union([NoteHit, BeatHit, CreatureHit, CharacterHit]);
export type SearchHit = typeof SearchHit.Type;

/**
 * What to search for.
 *
 * `q` is **required**, unlike `CreatureFilter.q`: a search with no query is a
 * list, and every arm already has a list endpoint of its own.
 *
 * `source` is a single value rather than an array, and that is not a
 * simplification for its own sake — a one-element array does not survive the
 * wire at `effect@4.0.0-beta.102` (the derived client encodes `["beat"]` as one
 * `?source=beat`, and `Schema.Array` then refuses the scalar the server
 * decodes). The realistic narrowing is "only the beats", which a scalar
 * expresses exactly. Two-of-three has no surface asking for it.
 */
export const SearchFilter = {
  q: Schema.String.check(Schema.isLengthBetween(1, 200)),
  /** Absent means every arm. */
  source: Schema.optional(SearchSource),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
} as const;

/**
 * The decoded filter, as a repository sees it. Derived from the same fields the
 * endpoint declares, so a filter added to one arrives in the other.
 */
export type SearchFilterValues = typeof SearchFilterValues.Type;
const SearchFilterValues = Schema.Struct(SearchFilter);
