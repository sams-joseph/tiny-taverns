import { type Actor, type CampaignId, CurrentActor, type NotFound } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { dieOnSqlError } from "./rows.js";
import { ensureCampaignWritable } from "./visibility.js";

/**
 * A proof that this actor is a DM of *this* campaign, carried in the type.
 *
 * `CurrentActor` makes an unscoped read impossible; this is the same idea one
 * level down. Five repositories — `Combatants`, `EncounterRuns`,
 * `SessionEvents`, `Recap` and `Memberships` — return rows whose **player
 * projection differs from their DM projection**: exact hit points on a `shared`
 * combatant, the whole initiative order, the combat log, the night assembled
 * out of all three, and the roster of who else is at the table. Every other
 * actor-scoped read in the product returns a `shared` row a player is entitled
 * to see in full, so a player calling `GET …/notes` and receiving the ordinary
 * `Note` discloses nothing.
 *
 * Those five take a `DmActor` instead of reading `CurrentActor`, so a method
 * that skipped the check has no way to obtain one and does not compile. The
 * alternative — an `ensureDm(…)` at the top of each — is the same sixteen
 * sites with none of them enforced, and the seventeenth is the leak.
 *
 * ### `Memberships.list` is the fifth, and its player projection is nothing
 *
 * `GET /campaigns/:c/members` is other people's account names and the shape of
 * somebody's table — who was invited, when they joined, who runs it. There is
 * no narrower version of that a player is owed, so unlike `Recap` there is no
 * second method beside the gated one; the gate is the whole answer. It went on
 * with the endpoint rather than after it, which is this comment's own rule
 * below working for once in the right order.
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
 * rather than compiled, and the set does grow.
 *
 * ### `Recap.read` was the fourth, and it is why "in the same change" is the
 * ### whole rule
 *
 * This comment used to name `Recap.read` as *the next candidate* and say it was
 * being left alone because the player Chronicle was a planned screen and gating
 * it would decide that screen's shape by accident. **That reasoning was wrong
 * the moment player accounts and invitations shipped, and the cost was a live
 * disclosure**: a player member of a `shared` campaign read the recap and got a
 * shared monster's exact `hpCurrent`, `hpMax` and `ac` back. Measured against
 * real Postgres, not inferred — 41 of 82, armour class 17.
 *
 * The mistake worth learning from is not the omission but its shape. Deferring
 * a projection *and* leaving the wide read reachable are two decisions, and
 * only the first one is cheap. The gate could have gone on unconditionally the
 * day the other three did, costing nothing but a 404 for a screen that did not
 * exist yet; instead the wide read stayed open across the release that minted
 * the first player. So: **gate first, project later.** A boundary that waits
 * for the screen behind it is not a boundary.
 *
 * `Recap.read` now takes the proof and `Recap.readAsPlayer` answers the narrow
 * `PlayerSessionRecap` — the captain's decision of 2026-08-12, which is that a
 * player projection is a distinct schema on a distinct path rather than a
 * filter over the DM's type. Which screen consumes it is still undecided, and
 * that is fine; the disclosure did not wait for it.
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
