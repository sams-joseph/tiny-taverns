import { type Actor, type CampaignId, CurrentActor, type NotFound } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { dieOnSqlError } from "./rows.js";
import { ensureCampaignWritable } from "./visibility.js";

/**
 * A proof that this actor is a DM of *this* campaign, carried in the type.
 *
 * `CurrentActor` makes an unscoped read impossible; this is the same idea one
 * level down. Three repositories — `Combatants`, `EncounterRuns` and
 * `SessionEvents` — return rows whose **player projection differs from their DM
 * projection**: exact hit points on a `shared` combatant, the whole initiative
 * order, the combat log. Every other actor-scoped read in the product returns a
 * `shared` row a player is entitled to see in full, so a player calling
 * `GET …/notes` and receiving the ordinary `Note` discloses nothing.
 *
 * Those three take a `DmActor` instead of reading `CurrentActor`, so a method
 * that skipped the check has no way to obtain one and does not compile. The
 * alternative — an `ensureDm(…)` at the top of each — is the same fourteen
 * sites with none of them enforced, and the fifteenth is the leak.
 *
 * **This lands before the first player actor exists, deliberately.** The invite
 * that mints a credential reaching a campaign it does not own is a later step;
 * closing these doors afterwards would mean a release in which player actors
 * exist and these methods accept one. A boundary put in before there is
 * anything to keep out is the difference between a boundary and a race.
 *
 * ### Why it carries the campaign
 *
 * A `DmActor` is a fact about a **pair** — this account, this campaign — for
 * exactly the reason `Actor` carries no role: a person is the DM of one table
 * and a player at another on the same credential. So the campaign travels
 * *inside* the proof and the gated methods take it from there rather than as a
 * parameter of their own. A proof obtained for campaign A cannot be spent on a
 * read of campaign B, because there is no second campaign id to disagree with
 * it.
 *
 * ### What it does not replace
 *
 * The SQL predicates are untouched. Every gated method still composes
 * `repo/visibility.ts` exactly as before, so this is a precondition on top of
 * the seam rather than a substitute for it — and the failure mode of a bug here
 * is today's behaviour, not an open door. Denial is `NotFound`, like every
 * other refusal in the product: "it exists but is not yours" is a disclosure.
 *
 * ### The standing rule
 *
 * *When a table's player projection diverges from its DM projection, its DM
 * repository takes a `DmActor` in the same change.* That is written down in
 * `AGENTS.md` because it is the only part of this that has to be remembered
 * rather than compiled, and the set will grow: `Recap.read` is the next
 * candidate — it returns whole `Combatant` and `EncounterRun` values assembled
 * from the same two tables — and it is left alone here only because the player
 * Chronicle is a planned screen and gating it would decide that screen's shape
 * by accident.
 */

/**
 * The proof, and the reason it cannot be forged.
 *
 * The brand is a module-private `unique symbol`: it is declared here, never
 * exported, and never given a runtime value. So no other module can write an
 * object with that key, `actor as DmActor` is not a legal assertion (the two
 * types do not overlap), and the only expression in the repository that
 * produces one is `DmActors.of` below. `apps/server/test/dm-actor.test.ts`
 * greps `src` for a second one, in the shape of the membership and assistant
 * seam tests.
 */
declare const checked: unique symbol;

export interface DmActor {
  readonly [checked]: true;
  /** Who is asking. Unchanged — this is the actor `Authorization` resolved. */
  readonly actor: Actor;
  /** The campaign the DM role was checked against, and the only one it spends on. */
  readonly campaign: CampaignId;
}

/**
 * The one checked path to a `DmActor`.
 *
 * A service rather than a plain function over `sql`, because the callers that
 * must reach it are HTTP handlers and `assistant/Hob.ts`, neither of which has
 * a `SqlClient` and neither of which should acquire one.
 *
 * The check is `campaignWritable` — membership, credential scope and the `dm`
 * role, in one read of `campaign_member` through the shipped predicate. It
 * names no table itself: `repo/Memberships.ts` and `repo/visibility.ts` are
 * still the only two modules in `src` that spell `campaign_member`, which
 * `membership.test.ts` enforces.
 */
export class DmActors extends Context.Service<
  DmActors,
  {
    readonly of: (campaignId: CampaignId) => Effect.Effect<DmActor, NotFound, CurrentActor>;
  }
>()("DmActors") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        of: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);
              // The only construction of the brand in the product. It is a
              // phantom — `checked` has no runtime value — so this is a
              // compile-time token and nothing is carried at run time but the
              // two fields above.
              return { actor, campaign: campaignId } as DmActor;
            }),
          ),
      };
    }),
  );
}
