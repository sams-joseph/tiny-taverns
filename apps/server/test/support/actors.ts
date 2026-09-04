import {
  Actor,
  type AccountId,
  type Campaign,
  type CampaignCharacterId,
  type CampaignCreate,
  type CampaignId,
  type Character,
  type CharacterOwnCreate,
  CurrentActor,
  type GroupId,
  type NotFound,
  type Visibility,
} from "@taverns/api";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../../src/Accounts.js";
import { Campaigns } from "../../src/repo/Campaigns.js";
import { Characters } from "../../src/repo/Characters.js";
import { type CampaignCreatorActor, CampaignCreatorActors } from "../../src/repo/CreatorActor.js";
import { Groups } from "../../src/repo/Groups.js";
import { Invites } from "../../src/repo/Invites.js";
import { Party } from "../../src/repo/Party.js";

/**
 * The actors every repository test needs, under the group architecture.
 *
 * A campaign lives in a group and its creator is its sole DM, so "a campaign
 * of the actor's own" is two acts now — found a group, create a campaign in it
 * — and `aCampaignBy` is that pair, the way most fixtures want it. A player is
 * what a player really is: **their own account**, admitted to the group and
 * seated at the campaign through a real invitation, with a credential scoped
 * to that campaign.
 */

/**
 * An account with an account-wide credential — what `token:issue` mints, and
 * what every request in the product carries today. It reaches every group and
 * campaign this account is a member of and nothing else.
 */
export const anAccount = (name: string): Effect.Effect<Actor, never, Accounts> =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    const issued = yield* accounts.issue(name);
    return new Actor({ accountId: issued.accountId, scope: { _tag: "account" } });
  }).pipe(Effect.orDie);

/**
 * The same account's credential, narrowed to one campaign.
 *
 * Scope and membership are two independent narrowings and both apply: this one
 * cannot reach past its campaign even where the account is a member of others.
 * Nothing mints such a credential over HTTP yet — the clause exists so that
 * whatever mints one first inherits it rather than needing an audit.
 */
export const scopedTo = (actor: Actor, campaignId: CampaignId): Actor =>
  new Actor({ accountId: actor.accountId, scope: { _tag: "campaign", campaignId } });

/** The same account's credential, narrowed to one group. */
export const scopedToGroup = (actor: Actor, groupId: GroupId): Actor =>
  new Actor({ accountId: actor.accountId, scope: { _tag: "group", groupId } });

/**
 * The same account's **account-wide** credential — what `aPlayerAt`'s scoped
 * one came from. For the assertions about what survives a revocation: the
 * scoped credential loses its reach with the membership, and the account-wide
 * one is how the person still reads what is theirs.
 */
export const accountWide = (actor: Actor): Actor =>
  new Actor({ accountId: actor.accountId, scope: { _tag: "account" } });

/**
 * A fresh group founded by this actor — who becomes its owner and first
 * member, through the shipped `Groups.create` path.
 */
export const aGroupBy = (actor: Actor, name: string): Effect.Effect<GroupId, never, Groups> =>
  Effect.gen(function* () {
    const groups = yield* Groups;
    const group = yield* Effect.provideService(groups.create({ name }), CurrentActor, actor);
    return group.id;
  }).pipe(Effect.orDie);

/**
 * A campaign of the actor's own, in a fresh group of their own — the shape
 * almost every fixture wants, and the group-model spelling of what
 * `campaigns.create(payload)` used to be. The actor founds the group, so they
 * are its owner as well as the campaign's creator, which is what a lone DM
 * running their own table is.
 */
export const aCampaignBy = (
  actor: Actor,
  payload: CampaignCreate,
): Effect.Effect<Campaign, never, Groups | Campaigns> =>
  Effect.gen(function* () {
    const campaigns = yield* Campaigns;
    const groupId = yield* aGroupBy(actor, `${payload.name} group`);
    return yield* Effect.provideService(campaigns.create(groupId, payload), CurrentActor, actor);
  }).pipe(Effect.orDie);

/** A character and the explicit party seat most fixtures want back. */
export interface SeatedCharacter {
  readonly character: Character;
  readonly seatId: CampaignCharacterId;
}

/**
 * A character seated at a campaign, through the shipped path: the **owner's**
 * `createOwn`, followed by the explicit `party.join` act. There is no DM-typed
 * character any more — a table's creator seats their own characters exactly as
 * a player does — so this is the one spelling every fixture uses, whoever the
 * owner is.
 *
 * The seat starts `dm` (the column default, fail-closed). Pass
 * `seatVisibility: "shared"` to have the campaign's **creator** share it
 * through the party PATCH, which is the only writer that column has — a
 * fixture that wrote it with SQL would be green against a state the product
 * cannot reach.
 */
export const aCharacterAt = (
  campaignId: CampaignId,
  owner: Actor,
  payload: CharacterOwnCreate,
  options?: { readonly seatVisibility?: Visibility },
): Effect.Effect<SeatedCharacter, never, Characters | Party | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const characters = yield* Characters;
    const party = yield* Party;
    const sql = yield* SqlClient.SqlClient;
    const character = yield* Effect.provideService(
      characters.createOwn(campaignId, payload),
      CurrentActor,
      owner,
    );
    const joined = yield* Effect.provideService(
      party.join(campaignId, { characterId: character.id }),
      CurrentActor,
      owner,
    );
    const seatId = joined.seat.id;
    if (options?.seatVisibility !== undefined && options.seatVisibility !== "dm") {
      const creators = yield* sql<{ readonly creator_account_id: AccountId }>`
        select campaign.creator_account_id from campaign where campaign.id = ${campaignId}
      `;
      const creator = new Actor({
        accountId: creators[0]!.creator_account_id,
        scope: { _tag: "account" },
      });
      yield* Effect.provideService(
        party.update(campaignId, seatId, { visibility: options.seatVisibility }),
        CurrentActor,
        creator,
      );
    }
    return { character, seatId };
  }).pipe(Effect.orDie);

/**
 * A player at somebody else's table — **minted by the product, through a real
 * invitation.**
 *
 * The group owner mints an invitation naming the campaign (`Invites.create`),
 * a fresh account redeems it (`Invites.redeem`), and the group membership and
 * campaign participation that result are the same rows a person following a
 * link gets. So every player in this suite exercises the shipped path rather
 * than a hand-built approximation of it, and a refusal that stops being true
 * of a *real* player fails somewhere instead of staying green against a state
 * nobody can reach.
 *
 * The owner is looked up rather than passed, so call sites did not have to
 * change when invitations moved to the group: a campaign's group has exactly
 * one owner, which is who may mint.
 *
 * The credential is scoped to the campaign, because that is what a player's
 * credential should be, and the tests assert both narrowings separately.
 */
export const aPlayerAt = (
  campaignId: CampaignId,
  name: string,
): Effect.Effect<Actor, never, Accounts | Invites | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const { owner, groupId } = yield* ownerOf(campaignId);
    const issued = yield* Effect.provideService(
      invites.create(groupId, { label: name, campaignId }),
      CurrentActor,
      owner,
    );
    const account = yield* anAccount(name);
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, account);
    return scopedTo(account, campaignId);
  }).pipe(Effect.orDie);

/**
 * An **existing** account admitted to a campaign — `aPlayerAt` for a person
 * who already exists, which is what "the same character at two tables" needs:
 * one account, two participations. Same shipped path (a campaign-naming
 * invitation, redeemed), and the same campaign-scoped credential back.
 */
export const admittedTo = (
  campaignId: CampaignId,
  account: Actor,
  label = "an existing member",
): Effect.Effect<Actor, never, Accounts | Invites | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const { owner, groupId } = yield* ownerOf(campaignId);
    const issued = yield* Effect.provideService(
      invites.create(groupId, { label, campaignId }),
      CurrentActor,
      owner,
    );
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, account);
    return scopedTo(account, campaignId);
  }).pipe(Effect.orDie);

/**
 * A live group member who does **not** participate in the campaign — the
 * boundary the participation decision draws, minted through a group-only
 * invitation so the path is the shipped one here too.
 */
export const aGroupMemberAt = (
  campaignId: CampaignId,
  name: string,
): Effect.Effect<Actor, never, Accounts | Invites | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const invites = yield* Invites;
    const { owner, groupId } = yield* ownerOf(campaignId);
    const issued = yield* Effect.provideService(
      invites.create(groupId, { label: name }),
      CurrentActor,
      owner,
    );
    const account = yield* anAccount(name);
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, account);
    return account;
  }).pipe(Effect.orDie);

/**
 * The campaign's group and that group's owner, as an actor — who a test has to
 * be in order to invite somebody. A fact lookup, not a reach path; the grep in
 * `membership.test.ts` governs `src`, which is where the rule matters.
 */
const ownerOf = (
  campaignId: CampaignId,
): Effect.Effect<
  { readonly owner: Actor; readonly groupId: GroupId },
  never,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly owner_account_id: AccountId;
      readonly group_id: GroupId;
    }>`
      select play_group.owner_account_id, campaign.group_id
      from campaign
      join play_group on play_group.id = campaign.group_id
      where campaign.id = ${campaignId}
    `;
    return {
      owner: new Actor({ accountId: rows[0]!.owner_account_id, scope: { _tag: "account" } }),
      groupId: rows[0]!.group_id,
    };
  }).pipe(Effect.orDie);

/**
 * The proof the creator-gated repositories require.
 *
 * There is deliberately no way to build one here by hand: this is a check the
 * product performs, and a test that forged it would be testing nothing. It
 * goes through `CampaignCreatorActors.of` like every caller in `src`, and a
 * test that expects a refusal asserts on this failing rather than on the read
 * that follows it.
 */
export const asDm = (
  actor: Actor,
  campaignId: CampaignId,
): Effect.Effect<CampaignCreatorActor, NotFound, CampaignCreatorActors> =>
  Effect.flatMap(CampaignCreatorActors, (creatorActors) =>
    Effect.provideService(creatorActors.of(campaignId), CurrentActor, actor),
  );

/**
 * `aCampaignBy` with the actor taken from the ambient `CurrentActor` — the
 * drop-in spelling for fixtures that already wrap their calls in a
 * `withActor(dm)(…)` provider, which is most of the suite.
 */
export const createCampaign = (
  payload: CampaignCreate,
): Effect.Effect<Campaign, never, Groups | Campaigns | CurrentActor> =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;
    return yield* aCampaignBy(actor, payload);
  });

/**
 * The HTTP spelling of `aCampaignBy`: found a group over the wire, then create
 * the campaign in it — for the endpoint-level suites, whose actor is a derived
 * client rather than an `Actor`. Structural on purpose: the derived client's
 * full type does not cross module boundaries well (TS7056), and these two
 * methods are all this needs.
 */
export const campaignVia = <EG, EC, RG, RC>(
  client: {
    readonly groups: {
      readonly create: (options: {
        readonly payload: { readonly name: string };
      }) => Effect.Effect<{ readonly id: GroupId }, EG, RG>;
      readonly createCampaign: (options: {
        readonly params: { readonly groupId: GroupId };
        readonly payload: CampaignCreate;
      }) => Effect.Effect<Campaign, EC, RC>;
    };
  },
  payload: CampaignCreate,
): Effect.Effect<Campaign, EG | EC, RG | RC> =>
  Effect.flatMap(client.groups.create({ payload: { name: `${payload.name} group` } }), (group) =>
    client.groups.createCampaign({ params: { groupId: group.id }, payload }),
  );
