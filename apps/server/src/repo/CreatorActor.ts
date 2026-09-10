import {
  type Actor,
  type CampaignId,
  CurrentActor,
  type SharedWorldId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { dieOnSqlError } from "./rows.js";
import { campaignWritable } from "./visibility.js";

/**
 * A proof that this actor is the **creator** of *this* campaign — its sole DM
 * — carried in the type.
 *
 * `CurrentActor` makes an unscoped read impossible; this is the same idea one
 * level down. Six repositories — `Combatants`, `EncounterRuns`,
 * `SessionEvents`, `Recap`, `Memberships` and `HobDirectWrites` — return rows
 * or perform writes whose **player projection differs from their creator
 * projection**: exact hit points on a `shared` combatant, the whole initiative
 * order, the combat log, the night assembled out of all three, the roster of
 * who else is at the table, and Hob's direct resource-spend seam.
 * Those six take a `CampaignCreatorActor` instead of reading `CurrentActor`,
 * so a method that skipped the check has no way to obtain one and does not
 * compile.
 *
 * This is the `DmActor` pattern renamed to what it proves. Under the group
 * architecture DM-ness *is* creator-ness — `campaign.creator_account_id`, the
 * captain's decision of 2026-09-01 — so the proof is minted by the ordinary
 * `campaignWritable` predicate, whose authority half is `isCreator`. There is
 * no role column left for the two to disagree about.
 *
 * ### Why it carries the campaign — and now the group
 *
 * A proof is a fact about a **pair** — this account, this campaign — for
 * exactly the reason `Actor` carries no role. The campaign travels *inside*
 * the proof, so one obtained for campaign A cannot be spent on campaign B.
 * `group` rides along because it is a fact about the campaign read in the same
 * statement that proved creator-ness: the campaign's group is the group whose
 * shared context a creator-scoped surface (group-aware Hob) may reach, and
 * carrying it here means those surfaces need no second read that could be
 * asked about a different campaign.
 *
 * ### What it does not replace
 *
 * The SQL predicates are untouched. Every gated method still composes
 * `repo/visibility.ts` exactly as before, so this is a precondition on top of
 * the seam rather than a substitute for it — the failure mode of a bug here is
 * today's behaviour, not an open door. Denial is `NotFound`, like every other
 * refusal in the product.
 *
 * ### The standing rule
 *
 * *When a table's player projection diverges from its creator projection, its
 * creator-side repository takes a `CampaignCreatorActor` in the same change.*
 * Gate first, project later — a boundary that waits for the screen behind it
 * is not a boundary. (The history of that rule being learned the hard way is
 * in this file's git log: `Recap.read` shipped ungated and leaked a monster's
 * exact hit points to a player before the gate went on.)
 */

/**
 * The proof, and the reason it cannot be forged.
 *
 * The brand is a module-private `unique symbol`: declared here, never
 * exported, never given a runtime value. So no other module can write an
 * object with that key, `actor as CampaignCreatorActor` is not a legal
 * assertion, and the only expression in the repository that produces one is
 * `CampaignCreatorActors.of` below. `apps/server/test/creator-actor.test.ts`
 * greps `src` for a second one.
 */
declare const checked: unique symbol;

export interface CampaignCreatorActor {
  readonly [checked]: true;
  /** Who is asking. Unchanged — this is the actor `Authorization` resolved. */
  readonly actor: Actor;
  /** The campaign creator-ness was checked against, and the only one it spends on. */
  readonly campaign: CampaignId;
  /** That campaign's group — read in the same statement that proved the pair. */
  readonly group: SharedWorldId;
}

/**
 * The one checked path to a `CampaignCreatorActor`.
 *
 * A service rather than a plain function over `sql`, because the callers that
 * must reach it are HTTP handlers and `assistant/Hob.ts`, neither of which has
 * a `SqlClient` and neither of which should acquire one.
 *
 * The check is `campaignWritable` — membership, credential scope and
 * creator-ness, through the shipped predicate — selecting the campaign's own
 * `group_id` so the proof carries it without a second read.
 */
export class CampaignCreatorActors extends Context.Service<
  CampaignCreatorActors,
  {
    readonly of: (
      campaignId: CampaignId,
    ) => Effect.Effect<CampaignCreatorActor, NotFound, CurrentActor>;
  }
>()("CampaignCreatorActors") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        of: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly group_id: SharedWorldId }>`
                select campaign.group_id from campaign
                where campaign.id = ${campaignId}
                  and ${campaignWritable(sql, actor, campaignId)}
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "campaign", id: campaignId });
              }
              // The only construction of the brand in the product. `checked`
              // has no runtime value, so this is a compile-time token and
              // nothing is carried at run time but the three fields above.
              return {
                actor,
                campaign: campaignId,
                group: rows[0]!.group_id,
              } as CampaignCreatorActor;
            }),
          ),
      };
    }),
  );
}
