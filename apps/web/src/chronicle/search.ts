import type { CampaignId, SearchHit, SearchSource } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * Searching the record — the other half of what this screen is for.
 *
 * The prototype searches its own fixture array (`Chronicle.jsx:149`). The real
 * corpus is not on the client: `GET /campaigns/:c/search` is the one path over
 * it (`repo/Search.ts`), it reaches a note's body and a beat's prose and a
 * creature's stat block and a character's sheet through four `tsvector`s, and it
 * applies the visibility predicate that a substring match over an already-loaded
 * list could not. So the box in the top bar asks the server, and what comes back
 * spans four sources rather than the recap titles the prototype could see.
 */

/**
 * `source` is **one value or none**, never a list.
 *
 * `Search.ts` states why and it is a property of the wire, not a simplification:
 * a one-element array does not survive at `effect@4.0.0-beta.102` — the derived
 * client encodes `["beat"]` as a single `?source=beat` and `Schema.Array` then
 * refuses the scalar the server decodes. The realistic narrowing is *"only the
 * beats"*, which a scalar expresses exactly, so the control is a single-choice
 * one and `"all"` is the absence of the parameter rather than a fifth value on
 * the wire. Do not widen this into an array; see the bestiary's environment
 * chips for the same defect met from the other side.
 */
export type SearchScope = SearchSource | "all";

export interface SearchQuery {
  readonly q: string;
  readonly scope: SearchScope;
}

/**
 * An answer, carrying the question it answers.
 *
 * **The query travels back with the hits, and that is not decoration.** The box
 * is debounced, so `q` in the component moves before the request that follows it
 * lands: rendering a count beside the *current* `q` attributes the previous
 * query's answer to this one, and for one frame the screen says *"0 results for
 * quokka"* about a search for `quokk`. Measured, in exactly those words, before
 * this field existed. It is also the right string to highlight the excerpts
 * against — `segments` should pick out the words that made the row match, not
 * whatever has been typed since.
 */
export interface SearchAnswer {
  readonly q: string;
  readonly hits: ReadonlyArray<SearchHit>;
}

/**
 * An empty box costs no request.
 *
 * Returning early inside the Effect rather than not running it keeps the screen
 * on one resource with one loading state — clearing the search puts the timeline
 * back without a round trip to say nothing matched nothing.
 */
export const searchCampaign =
  (campaignId: CampaignId, query: SearchQuery) => (client: TavernsClient) => {
    const q = query.q.trim();
    if (q === "") return Effect.succeed<SearchAnswer>({ q, hits: [] });
    return Effect.map(
      client.search.search({
        params: { campaignId },
        query: { q, ...(query.scope === "all" ? {} : { source: query.scope }) },
      }),
      (hits): SearchAnswer => ({ q, hits }),
    );
  };

const escaped = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Where the emphasis goes, decided here.
 *
 * **The excerpt arrives as plain text and is rendered as text.** `Search.ts` is
 * explicit that Postgres would happily wrap the match in `<b>` and that the API
 * refuses to: *"a JSON string carrying HTML is both an injection to remember
 * forever and a rendering contract nobody agreed to. Where the emphasis goes is
 * the client's to decide from the query it already has."* This is that decision
 * — the snippet is split against the terms the DM typed and the pieces are
 * rendered as elements, so nothing is ever parsed as markup and a note whose
 * body genuinely contains `<b>` shows those characters.
 *
 * The terms are the query's words, minus the operators `websearch_to_tsquery`
 * understands — a leading `-` excludes, `or` joins — because highlighting a word
 * the search excluded would be a lie about why the row matched. Quotes are
 * dropped rather than honoured as phrases: a phrase highlights term by term,
 * which is close enough and cannot be wrong.
 */
export const segments = (
  text: string,
  q: string,
): ReadonlyArray<{ readonly text: string; readonly match: boolean }> => {
  const terms = [
    ...new Set(
      q
        .replace(/["']/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(
          (term) =>
            term.length > 1 && !term.startsWith("-") && !["or", "and"].includes(term.toLowerCase()),
        )
        .map(escaped),
    ),
  ];
  if (terms.length === 0 || text === "") return [{ text, match: false }];

  // A capturing split keeps the separators, so the pieces alternate between
  // matched and unmatched runs. `whole` is what says which is which — testing
  // with the `g`-flagged pattern instead would carry `lastIndex` between calls
  // and mark alternate matches as misses.
  const whole = new RegExp(`^(?:${terms.join("|")})$`, "i");
  return text
    .split(new RegExp(`(${terms.join("|")})`, "gi"))
    .filter((piece) => piece !== "")
    .map((piece) => ({ text: piece, match: whole.test(piece) }));
};
