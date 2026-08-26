import {
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type HobAccepted,
  type HobProposal,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Beats } from "./Beats.js";
import { Campaigns } from "./Campaigns.js";
import { Characters } from "./Characters.js";
import { EncounterCreatures } from "./EncounterCreatures.js";
import { Encounters } from "./Encounters.js";
import { lockTurnForAccept, markAccepted } from "./HobThreads.js";
import { Notes } from "./Notes.js";
import type { AssistantOrigin } from "./rows.js";
import { dieOnSqlError } from "./rows.js";
import type { ConversationReach } from "./visibility.js";

/**
 * Where a proposal becomes a row, and the only place `origin = 'assistant'` is
 * ever written.
 *
 * The captain's decision is *generate with approval*: Hob may draft, and nothing
 * it drafts enters the campaign until a human says yes. This file is that yes.
 * It is deliberately the whole of it — there is no other write path with
 * assistant provenance, because `assistantColumns` (`rows.ts`) is only
 * constructible from an `AssistantOrigin`, and only this file makes one.
 *
 * ### What it does *not* take
 *
 * **No content payload.** The endpoint behind this carries an empty body: the
 * note's prose, the encounter's roster and the beat's line all come out of the
 * `proposal` column on the turn, which the server wrote when Hob proposed it.
 * If accept took the content instead, any client could post its own prose and
 * have it recorded as the assistant's, and the provenance would answer "where
 * did this come from?" with whatever the caller felt like. Storing the proposal
 * server-side is what makes the trail worth having.
 *
 * ### It writes through the ordinary repositories
 *
 * `Notes.create`, `Beats.create`, `Encounters.create`,
 * `EncounterCreatures.create` and `Characters.createOwn`, with one extra
 * argument. No SQL for those tables is written here, so an accepted row is
 * produced by *literally the same statement* that produces an authored one —
 * which is what makes it indistinguishable in usefulness (search finds it, the
 * recap includes it, the screens render it) and completely distinguishable in
 * origin.
 *
 * ### The reach is the caller's, and it is what makes the fourth case safe
 *
 * `accept` takes a {@link ConversationReach} and hands it to
 * `lockTurnForAccept`, so a DM reaches turns of the campaign's own thread and a
 * player reaches turns of theirs — and the two sets are disjoint by predicate
 * (`repo/visibility.ts`). That is what settles the question the character case
 * would otherwise raise: a `character` proposal can only ever be produced by
 * the player toolkit, into a player's own thread, so a DM cannot reach one and
 * therefore cannot come to own a character drafted for somebody else. There is
 * no role check in `materialise` because there is nothing for one to refuse.
 *
 * The whole accept is one transaction, so an encounter whose roster fails
 * halfway leaves nothing behind — unlike the client-side compositions in
 * `apps/web`, which have no transaction across requests and say so.
 */

/** A proposal is one accept, and a second one is a conflict rather than a second row. */
const alreadyAccepted = new Conflict({
  message: "that is already in the campaign",
});

/**
 * A beat is filed against the night it happened on, and there has to be one.
 *
 * Resolved at accept time from `campaign.current_session_id` rather than
 * captured when Hob proposed it: the DM may have finished the night in between,
 * and filing tonight's beat against a session that is over would be worse than
 * saying so. `Conflict` rather than `NotFound` because nothing is missing — the
 * campaign is simply not running a session.
 */
const noSession = new Conflict({
  message: "there is no session in progress to file a beat against — start one first",
});

export class Proposals extends Context.Service<
  Proposals,
  {
    readonly accept: (
      reach: ConversationReach,
      campaignId: CampaignId,
      threadId: AssistantThreadId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<HobAccepted, NotFound | Conflict, CurrentActor>;
  }
>()("Proposals") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const campaigns = yield* Campaigns;
      const notes = yield* Notes;
      const beats = yield* Beats;
      const encounters = yield* Encounters;
      const encounterCreatures = yield* EncounterCreatures;
      const characters = yield* Characters;

      const materialise = (
        campaignId: CampaignId,
        proposal: HobProposal,
        from: AssistantOrigin,
      ): Effect.Effect<HobAccepted, NotFound | Conflict, CurrentActor> => {
        switch (proposal.target) {
          case "note":
            return Effect.map(
              notes.create(
                campaignId,
                // `visibility` is deliberately not named, so the column default
                // applies and a proposal lands DM-only. Nothing about a draft
                // Hob wrote should decide what the players can read.
                { title: proposal.title, body: proposal.body, kind: proposal.kind },
                from,
              ),
              (note) => ({ accepted: "note" as const, note }),
            );

          case "beat":
            return Effect.gen(function* () {
              const campaign = yield* campaigns.findById(campaignId);
              if (campaign.currentSessionId === null) return yield* noSession;
              const beat = yield* beats.create(
                campaignId,
                campaign.currentSessionId,
                { body: proposal.body },
                from,
              );
              return { accepted: "beat" as const, beat };
            });

          case "encounter":
            return Effect.gen(function* () {
              const created = yield* encounters.create(
                campaignId,
                {
                  name: proposal.name,
                  difficulty: proposal.difficulty ?? undefined,
                  tags: proposal.tags,
                },
                from,
              );
              for (const line of proposal.roster) {
                yield* encounterCreatures.create(
                  campaignId,
                  created.id,
                  { creatureId: line.creatureId, count: line.count },
                  from,
                );
              }
              // Re-read, because `creatureCount` is computed per read and the
              // row returned by `create` was counted before the roster existed.
              // The card the DM is looking at says "6 creatures"; the row they
              // just made had better say so too.
              const encounter = yield* encounters.findById(campaignId, created.id);
              return { accepted: "encounter" as const, encounter };
            });

          case "character":
            return Effect.map(
              // `createOwn`, so `account_id` is the accepting credential's and
              // there is nowhere in a proposal to name anybody else.
              // `visibility` and the live trio stay absent for the reason
              // `CharacterOwnCreate` has no field for them: a drafted character
              // is `dm` and unhurt by column default rather than by a value
              // this file chose.
              //
              // The three seeded numbers are **copied, not computed.**
              // `Ruleset.seedFor` ran when the proposal was made, so the row
              // carries exactly what the card the player pressed *Keep them* on
              // said — the same rule the roster follows, and the reason the
              // accept can be read without knowing any arithmetic. Each is an
              // optional key on the proposal, because one written before the
              // seed existed simply has none and falls to the column default.
              characters.createOwn(
                campaignId,
                {
                  name: proposal.name,
                  ...(proposal.species === null ? {} : { species: proposal.species }),
                  ...(proposal.className === null ? {} : { className: proposal.className }),
                  ...(proposal.level === undefined ? {} : { level: proposal.level }),
                  ...(proposal.ac === undefined ? {} : { ac: proposal.ac }),
                  ...(proposal.hpMax === undefined ? {} : { hpMax: proposal.hpMax }),
                  sheet: proposal.sheet,
                },
                from,
              ),
              (character) => ({ accepted: "character" as const, character }),
            );
        }
      };

      return {
        accept: (reach, campaignId, threadId, turnId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // Takes the row lock as well as answering the question, so two
                // taps of *Save to session* are one row and one 409 rather than
                // a race for two.
                const turn = yield* lockTurnForAccept(sql, reach, campaignId, threadId, turnId);
                if (turn.proposal === null) {
                  // Nothing to accept is a `NotFound` about the proposal, not
                  // about the turn: the turn is right there, it just made no
                  // offer.
                  return yield* new NotFound({ resource: "proposal", id: turnId });
                }
                if (turn.accepted_at !== null) return yield* alreadyAccepted;

                const accepted = yield* materialise(campaignId, turn.proposal, {
                  assistantTurnId: turnId,
                });
                yield* markAccepted(sql, turnId);
                return accepted;
              }),
            ),
          ),
      };
    }),
  );
}
