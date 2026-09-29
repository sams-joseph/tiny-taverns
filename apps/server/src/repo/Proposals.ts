import {
  campaignCreateFrom,
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type SharedWorldId,
  type HobAccepted,
  keptFrom,
  type CharacterOwnCreate,
  type HobProposal,
  NotFound,
  type NpcPrepUpdate,
  type NpcSheetPut,
  sharedWorldCreateFrom,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Acts } from "./Acts.js";
import { Beats } from "./Beats.js";
import { Campaigns } from "./Campaigns.js";
import { CampaignStories } from "./CampaignStories.js";
import { Characters } from "./Characters.js";
import { CampaignCreatorActors } from "./CreatorActor.js";
import { Encounters } from "./Encounters.js";
import { GroupHistory } from "./GroupHistory.js";
import { Groups } from "./Groups.js";
import { discardedConflict, lockTurnForAccept, markAccepted } from "./HobThreads.js";
import { Notes } from "./Notes.js";
import { NpcPreps } from "./NpcPrep.js";
import { NpcSheets } from "./NpcSheets.js";
import { Npcs } from "./Npcs.js";
import { PrepItems } from "./PrepItems.js";
import { Sessions } from "./Sessions.js";
import type { AssistantOrigin } from "./rows.js";
import { dieOnSqlError } from "./rows.js";
import type { ConversationReach } from "./visibility.js";

/**
 * Where a proposal becomes a row, and the only place `origin = 'assistant'` is
 * ever written.
 *
 * The captain's decision is *generate with approval*: Hob may draft, and nothing
 * it drafts becomes a row until a human says yes. This file is that yes.
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
 * `Notes.create`, `Beats.create`, `Encounters.create` (whose roster goes
 * through `EncounterCreatures.create`, as a builder's does),
 * `Characters.createOwn`, for a night's summary `Sessions.update`, for a
 * planned night `Sessions.create`, then `PrepItems.create` line by line and
 * `Acts.create` for the act it starts, for an act `Acts.create`, for a
 * campaign's story so far `CampaignStories.accept` (which shares the creator's
 * own write's upsert), for an NPC's sheet `NpcSheets.put` (the creator's
 * own PUT, behind the creator proof), and for a new NPC the cast's
 * `Npcs.create`, then `NpcPreps.update` and `NpcSheets.put` behind the same
 * proof, each with one extra argument. No SQL for those tables
 * is written here, so an accepted row is produced by *literally the same
 * statement* that produces an authored one —
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
 * `acceptDraft` is the same yes for a thread with no campaign (`"account"`):
 * it reaches only the actor's own thread, and makes the two things such a
 * thread can hold: a character, through `Characters.createCore` against the
 * core rules, or a campaign, through `Campaigns.createStandalone` or
 * `Campaigns.create` with the payload `campaignCreateFrom` builds for the form
 * too, or a Shared World, through `Groups.create` with the payload
 * `sharedWorldCreateFrom` builds for the form. The asker becomes the
 * campaign's creator, or the world's owner, exactly as by the form.
 *
 * The whole accept is one transaction, so an encounter whose roster fails
 * halfway leaves nothing behind — unlike the client-side compositions in
 * `apps/web`, which have no transaction across requests and say so.
 */

/** A proposal is one accept, and a second one is a conflict rather than a second row. */
const alreadyAccepted = new Conflict({
  message: "that is already in the campaign",
});

/** The same, for a character, a campaign or a Shared World kept from the account's own thread. */
const alreadyKept = new Conflict({
  message: "that is already kept",
});

/**
 * A character draft as the create payload both accepts write — **copied, not
 * computed.** `Ruleset.seedFor` ran when the proposal was made, so the row
 * carries exactly what the card the player pressed *Keep them* on said — the
 * same rule the roster follows, and the reason the accept can be read without
 * knowing any arithmetic. Each seeded number is an optional key on the
 * proposal, because one written before the seed existed simply has none and
 * falls to the column default.
 *
 * `visibility` and the live trio stay absent for the reason
 * `CharacterOwnCreate` has no field for them: a drafted character is unseated
 * and unhurt by column default rather than by a value this file chose.
 */
const ownCreateFrom = (
  proposal: Extract<HobProposal, { target: "character" }>,
): CharacterOwnCreate => ({
  name: proposal.name,
  ...(proposal.race === null ? {} : { race: proposal.race }),
  ...(proposal.subrace === undefined || proposal.subrace === null
    ? {}
    : { subrace: proposal.subrace }),
  ...(proposal.className === null ? {} : { className: proposal.className }),
  ...(proposal.level === undefined ? {} : { level: proposal.level }),
  ...(proposal.ac === undefined ? {} : { ac: proposal.ac }),
  ...(proposal.hpMax === undefined ? {} : { hpMax: proposal.hpMax }),
  sheet: proposal.sheet,
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

/**
 * An NPC sheet draft as the creator's PUT — **copied, not computed**, for the
 * reason {@link ownCreateFrom} gives. `expectedVersion` is the sheet the draft
 * said it replaces, so one edited by hand since the offer is the PUT's own
 * stale-version `Conflict`; a draft that replaces nothing sends none, so a
 * sheet written since is the PUT's "this NPC already has a sheet". A new
 * NPC's sheet replaces nothing.
 */
const npcSheetPutFrom = (
  draft: NonNullable<Extract<HobProposal, { target: "npc" }>["sheet"]>,
  replaces: { readonly version: number } | null,
): NpcSheetPut => ({
  ...(replaces === null ? {} : { expectedVersion: replaces.version }),
  level: draft.level,
  race: draft.race,
  subrace: draft.subrace,
  className: draft.className,
  ac: draft.ac,
  hpMax: draft.hpMax,
  cr: draft.cr,
  sheet: draft.sheet,
});

/**
 * A drafted NPC's prep as the creator's PATCH: only what Hob set, so an
 * unset field is absent rather than a `null` that would read as "cleared".
 * Empty when Hob set nothing, and then no prep row is written at all.
 */
const npcPrepFrom = (prep: Extract<HobProposal, { target: "npc" }>["prep"]): NpcPrepUpdate => ({
  ...(prep.attitude === null ? {} : { attitude: prep.attitude }),
  ...(prep.status === null ? {} : { status: prep.status }),
  ...(prep.whereabouts === null ? {} : { whereabouts: prep.whereabouts }),
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
    /**
     * The group-side yes: a chronicle line group Hob offered, kept by any
     * live member — the same people a hand-written entry is open to. One
     * transaction, one lock, one `Conflict` on the second tap, exactly as the
     * campaign accept; what it materialises through is `GroupHistory.create`
     * with the turn on it, so an accepted line is made by the same statement
     * a member's own is.
     */
    readonly acceptSharedWorld: (
      groupId: SharedWorldId,
      threadId: AssistantThreadId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<HobAccepted, NotFound | Conflict, CurrentActor>;
    /**
     * The yes for something drafted with no campaign: a turn of the actor's
     * own account-scoped thread, materialised with the turn on it — a
     * character through `Characters.createCore`, a campaign through
     * `Campaigns.create` or `createStandalone`, a Shared World through
     * `Groups.create`. Only those can live in such a thread; anything else is
     * refused rather than filed somewhere its card never named.
     */
    readonly acceptDraft: (
      threadId: AssistantThreadId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<HobAccepted, NotFound | Conflict, CurrentActor>;
  }
>()("Proposals") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const campaigns = yield* Campaigns;
      const groups = yield* Groups;
      const notes = yield* Notes;
      const beats = yield* Beats;
      const encounters = yield* Encounters;
      const characters = yield* Characters;
      const sharedWorldHistory = yield* GroupHistory;
      const sessions = yield* Sessions;
      const stories = yield* CampaignStories;
      const creators = yield* CampaignCreatorActors;
      const npcSheets = yield* NpcSheets;
      const npcs = yield* Npcs;
      const npcPreps = yield* NpcPreps;
      const prepItems = yield* PrepItems;
      const acts = yield* Acts;

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
                {
                  title: proposal.title,
                  body: proposal.body,
                  kind: proposal.kind,
                  ...(proposal.category === undefined ? {} : { category: proposal.category }),
                },
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

          case "nightSummary":
            // Through the DM's own `PATCH` statement, with the turn on it. The
            // night was bound when Hob offered the draft; `update` asks again
            // whether this actor may write it, so a night deleted since is the
            // ordinary `NotFound`. Keeping it replaces the night's summary.
            return Effect.map(
              sessions.update(campaignId, proposal.sessionId, { summary: proposal.text }, from),
              (session) => ({ accepted: "nightSummary" as const, session }),
            );

          case "night":
            // The night through the create a person's night takes, numbered
            // one past the highest the campaign has now, as *Start the night*
            // numbers one; the campaign does not point at it, so it is
            // planned rather than open, and nothing goes live. Its checklist
            // follows line by line through the checklist's own create, and
            // the act it starts through the creator's, behind the proof the
            // accept asks for again, all in the accept's transaction, so a
            // refused act keeps no night either. Nothing names `visibility`:
            // every row lands kept to the DM.
            return Effect.gen(function* () {
              const nights = yield* sessions.list(campaignId);
              const session = yield* sessions.create(
                campaignId,
                {
                  number: nights.reduce((highest, night) => Math.max(highest, night.number), 0) + 1,
                  ...(proposal.title === null ? {} : { title: proposal.title }),
                },
                from,
              );
              const prep = yield* Effect.forEach(proposal.prep, (label) =>
                prepItems.create(campaignId, session.id, { label }, from),
              );
              const actTitle = proposal.actTitle;
              const act =
                actTitle === null
                  ? null
                  : yield* Effect.flatMap(creators.of(campaignId), (creator) =>
                      acts.create(
                        creator,
                        { title: actTitle, firstSessionNumber: session.number },
                        from,
                      ),
                    );
              return { accepted: "night" as const, session, prep, act };
            });

          case "act":
            // The creator's own write, behind the proof, at a night the
            // campaign has; a night that has started an act since the offer
            // is `Acts.create`'s `Conflict`, and one deleted since its
            // `NotFound`.
            return Effect.gen(function* () {
              const creator = yield* creators.of(campaignId);
              const act = yield* acts.create(
                creator,
                { title: proposal.title, firstSessionNumber: proposal.firstSessionNumber },
                from,
              );
              return { accepted: "act" as const, act };
            });

          case "encounter":
            return Effect.map(
              encounters.create(
                campaignId,
                {
                  name: proposal.name,
                  tags: proposal.tags,
                  // The line the battle map is drawn from, which the card
                  // showed; the accept handler starts the draw after commit.
                  setting: proposal.setting,
                  // The kind and the prep the card showed, through the same
                  // create the form uses. A proposal from before Hob could
                  // offer them has none, and was a fight.
                  kind: proposal.kind,
                  tactics: proposal.tactics,
                  treasure: proposal.treasure,
                  challenge: proposal.challenge,
                  // The roster the card drew, made with the encounter by the
                  // same create the form's roster goes through. `ready` is not named: an
                  // accepted proposal is a draft until the DM says otherwise.
                  creatures: proposal.roster.map((line) => ({
                    creatureId: line.creatureId,
                    count: line.count,
                  })),
                },
                from,
              ),
              (encounter) => ({ accepted: "encounter" as const, encounter }),
            );

          case "character":
            return Effect.map(
              // `createOwn`, so `account_id` is the accepting credential's and
              // there is nowhere in a proposal to name anybody else.
              characters.createOwn(campaignId, ownCreateFrom(proposal), from),
              (character) => ({ accepted: "character" as const, character }),
            );

          case "campaignStory":
            // Replaces the campaign's story through the same upsert the
            // creator's own write uses; `accept` composes `campaignWritable`,
            // so nobody but the creator keeps one.
            return Effect.map(
              stories.accept(
                campaignId,
                {
                  text: proposal.text,
                  previously: proposal.previously,
                  afterSessionNumber: proposal.afterSessionNumber,
                },
                from,
              ),
              (story) => ({ accepted: "campaignStory" as const, story }),
            );

          case "npcSheet":
            // Through the creator's own PUT, behind the creator proof: only
            // the creator's toolkit offers one, into the campaign's own
            // thread, and the proof is asked again here so nothing but the
            // creator can keep it. The NPC was the creator's when Hob read
            // it; `put` walks it again, so one deleted since is `NotFound`.
            return Effect.gen(function* () {
              const creator = yield* creators.of(campaignId);
              const sheet = yield* npcSheets.put(
                creator,
                proposal.npcId,
                npcSheetPutFrom(proposal, proposal.replaces),
                from,
              );
              return { accepted: "npcSheet" as const, sheet };
            });

          case "npc":
            // Into the cast through the cast's own create, behind the creator
            // proof the accept asks for again, as a kept sheet's is. The prep
            // and the sheet follow in the same transaction through the
            // creator's own writes, so a refused sheet keeps no NPC either.
            // `visibility` is not named: the NPC joins the cast hidden from
            // the table. The handler starts the portrait after the commit.
            return Effect.gen(function* () {
              const creator = yield* creators.of(campaignId);
              const npc = yield* npcs.create(
                creator,
                {
                  name: proposal.name,
                  role: proposal.role,
                  persona: proposal.persona,
                  privateMaterial: proposal.privateMaterial,
                },
                from,
              );
              const prep = npcPrepFrom(proposal.prep);
              if (Object.keys(prep).length > 0) yield* npcPreps.update(creator, npc.id, prep);
              if (proposal.sheet !== null) {
                yield* npcSheets.put(creator, npc.id, npcSheetPutFrom(proposal.sheet, null), from);
              }
              return { accepted: "npc" as const, npc };
            });

          case "campaign":
            // Only the account's own panel offers one, into a thread no
            // campaign reaches; the account accept below is where it is kept.
            return Effect.fail(
              new Conflict({
                message: "that is a new campaign — keep it from your own Hob conversation",
              }),
            );

          case "sharedWorld":
            // The same: only the account's own panel offers a new world.
            return Effect.fail(
              new Conflict({
                message: "that is a new Shared World — keep it from your own Hob conversation",
              }),
            );

          case "sharedWorldHistory":
          case "sharedWorldSummary":
            // Only a group thread ever carries one — the group toolkit is the
            // only producer, and it writes into group threads alone — so this
            // arm is unreachable through the campaign accept. The refusal
            // stands anyway, because a `switch` that pretended the member does
            // not exist would silently mis-file the day that invariant moves.
            return Effect.fail(
              new Conflict({
                message: "that belongs to the Shared World Chronicle — accept it there",
              }),
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
                if (turn.acceptedAt !== null) return yield* alreadyAccepted;
                if (turn.discardedAt !== null) return yield* discardedConflict;

                const accepted = yield* materialise(campaignId, turn.proposal, {
                  assistantTurnId: turnId,
                });
                yield* markAccepted(sql, turnId, keptFrom(accepted));
                return accepted;
              }),
            ),
          ),

        acceptDraft: (threadId, turnId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const turn = yield* lockTurnForAccept(
                  sql,
                  "account",
                  actor.accountId,
                  threadId,
                  turnId,
                );
                if (turn.proposal === null) {
                  return yield* new NotFound({ resource: "proposal", id: turnId });
                }
                if (turn.acceptedAt !== null) return yield* alreadyKept;
                if (turn.discardedAt !== null) return yield* discardedConflict;
                const from = { assistantTurnId: turnId };
                const proposal = turn.proposal;
                const accepted: HobAccepted | undefined =
                  proposal.target === "character"
                    ? {
                        accepted: "character" as const,
                        character: yield* characters.createCore(ownCreateFrom(proposal), from),
                      }
                    : proposal.target === "campaign"
                      ? {
                          accepted: "campaign" as const,
                          // The world was one the asker could create in when
                          // Hob offered it; the ordinary create asks again, so
                          // a world left or archived since is its `NotFound`.
                          campaign:
                            proposal.world === null
                              ? yield* campaigns.createStandalone(
                                  campaignCreateFrom(proposal),
                                  from,
                                )
                              : yield* campaigns.create(
                                  proposal.world.id,
                                  campaignCreateFrom(proposal),
                                  from,
                                ),
                        }
                      : proposal.target === "sharedWorld"
                        ? {
                            accepted: "sharedWorld" as const,
                            // The asker founds it and owns it, as by the form.
                            sharedWorld: yield* groups.create(
                              sharedWorldCreateFrom(proposal),
                              from,
                            ),
                          }
                        : undefined;
                if (accepted === undefined) {
                  // Only the account's own toolkits write into these threads
                  // and they propose nothing else; the refusal is the same
                  // guard the two accepts above keep against each other's
                  // members.
                  return yield* new Conflict({
                    message: "that belongs to a campaign or a Shared World — accept it there",
                  });
                }
                yield* markAccepted(sql, turnId, keptFrom(accepted));
                return accepted;
              }),
            ),
          ),

        acceptSharedWorld: (groupId, threadId, turnId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const turn = yield* lockTurnForAccept(
                  sql,
                  "sharedWorld",
                  groupId,
                  threadId,
                  turnId,
                );
                if (turn.proposal === null) {
                  return yield* new NotFound({ resource: "proposal", id: turnId });
                }
                if (turn.acceptedAt !== null) return yield* alreadyAccepted;
                if (turn.discardedAt !== null) return yield* discardedConflict;
                if (
                  turn.proposal.target !== "sharedWorldHistory" &&
                  turn.proposal.target !== "sharedWorldSummary"
                ) {
                  // The mirror of the campaign arm's refusal: a campaign
                  // proposal reached through a group accept would write a row
                  // into a place its card never named.
                  return yield* new Conflict({
                    message: "that belongs to a campaign — accept it there",
                  });
                }
                const accepted =
                  turn.proposal.target === "sharedWorldHistory"
                    ? {
                        accepted: "sharedWorldHistory" as const,
                        entry: yield* sharedWorldHistory.create(
                          groupId,
                          {
                            body: turn.proposal.body,
                            ...(turn.proposal.title === null ? {} : { title: turn.proposal.title }),
                          },
                          { assistantTurnId: turnId },
                        ),
                      }
                    : {
                        accepted: "sharedWorldSummary" as const,
                        summary: yield* sharedWorldHistory.acceptSummary(
                          groupId,
                          turn.proposal.text,
                          turn.proposal.lastWorldSeq,
                          { assistantTurnId: turnId },
                        ),
                      };
                yield* markAccepted(sql, turnId, keptFrom(accepted));
                return accepted;
              }),
            ),
          ),
      };
    }),
  );
}
