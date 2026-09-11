# Shared Worlds

How campaigns relate to the container behind them: the hidden backing context every campaign has, the explicit Shared World a creator can opt into, campaign invitations, the atomic context moves (promote, connect, move, disconnect, archive), the Chronicle and Story So Far, and explicit Library sharing. Read this before touching `apps/server/src/repo/Groups.ts`, `GroupHistory.ts`, `Invites.ts`, `LibraryShares.ts` or anything under `/worlds`. The decision records live in `~/projects/firstmate/data/tav-group-architecture-plan/`.

## Two vocabularies, one table

`play_group` (`group` is a keyword) is the top-level container. Every campaign has one, as `campaign.group_id`; a Shared World is a `play_group` with `is_shared_world = true` (`0047_shared_worlds.ts`). A campaign created without naming a world (`campaigns.create`, including the gallery's live call) mints a hidden context that no screen navigates and no ordinary campaign work owns. `sharedWorlds.createCampaign` is only for a world the user explicitly picked.

Public contracts say `SharedWorld*`, `worldId`, `worldSeq`, `lastWorldSeq`, and a campaign calls its backing container `contextId` (`packages/api/src/Campaign.ts`). Persistence and repositories keep `group_*`, `Groups`, `GroupHistory`, `group_seq`, `last_group_seq`. This is not a compatibility layer: there were no deployed users at the cutover, so `/groups` neither routes nor redirects, and the only URL family in the app and the API is `/worlds` (`apps/web/src/routes.tsx`, `packages/api/src/Api.ts`).

The migration ledger was rewritten as a clean baseline (`0001_init.ts` in place). The migrator skips ids it has already applied, so an old development database silently keeps the old shape. Reset it: `pnpm db:reset`, or `pnpm -F server db:reset:fresh -- --force` against a Postgres the repo's Docker does not own. That is the product's one destructive command; nothing does DDL at startup.

## Ownership without a role column

There is no role column anywhere. Owner-ness is `play_group.owner_account_id`; creator-ness is `campaign.creator_account_id`, and the creator is the campaign's one DM. `apps/server/test/schema.test.ts` fails if `campaign_member.role` reappears. The creator proof is `CampaignCreatorActor` (`repo/CreatorActor.ts`), and it carries the campaign and its group, so a proof for one table cannot be spent on another. See [Visibility](visibility.md) for the gate itself.

Owner and creator are different authorities and stay that way: the owner governs the world (rename, archive, Library shares); the creator governs their table (invitations, context moves). `groups.test.ts` pins that neither can do the other's act.

## Membership is eligibility, not participation

A live `group_member` row lets an account read world surfaces and found campaigns. It grants nothing inside a campaign: content needs that campaign's own `campaign_member` row, and a seat needs `campaign_character`. Every "requires a live X" relationship is a foreign key rather than a check somebody remembers, using one idiom (`0001_init.ts`): the referenced side has `is_active generated always as (revoked_at is null) stored` in a unique key, the referencing side has a generated column that is `true` (or `nullif(<live>, false)` where the requirement is conditional), and the key is `deferrable initially deferred` so two rows can land in one transaction. The chain is owner → member, creator → member, creator → participant, participant → member, active seat → participant. Consequences: a revoked membership must retire its seats in the same transaction or the commit dies, and a failed deferred check is a defect, not a typed `SqlError` (see [Data model](data-model.md)).

`groupInScope` is membership plus credential scope. `groupReadable` adds `is_shared_world`, and `groupWritable` adds ownership (`repo/visibility.ts`). So every `/worlds` surface answers `NotFound` for a standalone campaign's backing context until it is promoted, while campaign reach continues through `groupInScope` and hides no campaign. Shared World Hob's conversation predicate uses the same explicit-world gate, so there is no thread bypass.

## Invitations are campaign-scoped

Invitation management is `/campaigns/:campaignId/invites` behind the creator proof; the contract is `CampaignInvite` (`packages/api/src/Invite.ts`) with `campaignId` required, and `group_invite.campaign_id` is non-null and cascades with the campaign. A creator mints, lists and revokes their table's invitations even when another account owns the world. There is no world-level invitation surface: `/worlds/:worldId/members` is `GET` only, and the member list has no invite or remove controls.

Redemption admits a `group_member` before the `campaign_member` because the eligibility key requires it (`Invites.redeem` calls `admitToGroup`); that is plumbing, not a second join decision. `group_invite.granted_campaign_membership` (`0046`) records whether redemption actually inserted or restored the seat, and revocation retires only that seat and its party joins. It never touches group membership, other campaign memberships, or a seat the invitee held before following the link. Preview and redemption stay token-scoped, name the campaign creator, and carry a `sharedWorld` reference only when the context is explicit.

## Context moves are one family of atomic transactions

All four live in `repo/Groups.ts` and `repo/Campaigns.ts`, each locking the campaign and both contexts `for update`, and each answering `NotFound` for the shapes it refuses (`groups.test.ts` enumerates them):

- **Promote** (`POST /campaigns/:id/shared-world`): needs the creator proof and ownership of the context; flips `is_shared_world` in place.
- **Connect** (`…/shared-world/connect`): standalone campaign to a world the creator owns. Restores destination eligibility for every live participant, repoints the campaign, cascades the denormalised context id through memberships, seats and invitations, then deletes the empty automatic context. Refused for an already-connected campaign or another owner's world.
- **Disconnect** (`…/shared-world/disconnect`): creates a fresh hidden context and admits every live participant. World ownership is irrelevant, so another owner's world cannot trap a table. Existing world membership is not revoked. Refused for a standalone campaign.
- **Move** (`…/shared-world/move`): one transaction, not a public disconnect plus connect; participants are admitted to the destination before anything cascades. The source need not be owned by the creator. Refused for a standalone source, the current world, another owner's destination, or an archived destination.

Invariants across all of them: campaign ids, content and Hob threads keep their ids; Chronicle entries stay in the world that admitted them with their campaign provenance (the `campaignId` on an entry is provenance, never a join); source Library shares stop being usable and destination shares become usable, while instances already minted stand.

Archiving (`DELETE /worlds/:worldId`) is owner-only and reversible. It succeeds only when the world holds no campaigns at all, archived ones included; otherwise `Conflict`. The archive transaction and campaign creation lock the same world row, so a table cannot race onto a retiring world. Only the world row changes; memberships, Chronicle, threads and shares remain. `GET /worlds/archived` is the owner's restoration shelf, and every active list and destination or share picker excludes archived worlds.

## The Chronicle

`group_history_entry` and `group_history_summary` (`0030_group_history.ts`) are the world's memory. An entry is a copy admitted on purpose, never a view: `GroupHistory.fromRecap` renders the played night to prose at share time under the creator's proof, and the row does not change when its source does and survives the campaign's deletion (`group-history.test.ts`). Entries are ordered by one sequence per world (`group_history_seq`, on the wire `worldSeq`), and they are never read back through a campaign.

At most one `accepted` summary exists per world (`group_history_one_current_summary`). `last_group_seq` records how far into the record the summary read, so staleness is arithmetic on `lastWorldSeq` against the newest `worldSeq`, not a flag anyone sets.

## Story So Far

World Hob refreshes the summary through two world-only tools (`assistant/toolkit.ts`): `readStorySoFarSources` returns the accepted summary plus entries after its marker, and `proposeStorySoFar` records the reader's exact `lastWorldSeq` in the proposal. The model and the accepting client never supply that boundary. Accepting a `sharedWorldSummary` proposal (`Proposals.acceptSharedWorld` → `GroupHistory.acceptSummary`) supersedes the prior accepted summary and inserts its replacement in one transaction under a lock on the world row. An entry admitted after the proposal therefore makes the new summary visibly stale rather than silently claimed as covered; unaccepted proposals are transcript only. `apps/web/src/shared-world/SharedWorldChronicle.tsx` renders the summary above the Chronicle and invalidates `reads.sharedWorldHistory(worldId)` on accept so text and staleness refresh together.

## Shared World Hob

`assistant_thread` has two scopes with an XOR check (`0031_group_threads.ts`): a campaign's or a world's, and the world thread is the world's one shared conversation (reach `sharedWorld` in `HobThreads`). World Hob knows every canonical event across the world: played nights keyed on `session.started_at`, beats verbatim, combat outcomes by name and round. It knows nothing unplayed: notes, planned encounters, prep lines and draft threads are creator-only until shared or realised in play. `apps/server/test/hob-group.test.ts` measures that at the provider wire with planted sentinels, asserting zero prep bytes in any captured request. Its tools are `searchSharedWorldHistory`, `readSharedWorldSummary`, `listSharedWorldCampaigns`, `proposeSharedWorldEntry` and the two above; the campaign DM toolkit borrows only the two read tools. Any member may accept the one proposal. The web screen binds its panel to `sharedWorldHob`, never to campaign Hob. See [Hob](hob.md).

## Library sharing is explicit

`group_library_share` (`0032`) lets an owner grant one of their own Library originals to a world; `groupSharedIntoCampaign` is then a disjunct of `usableInCampaign` and `copyableIntoCampaign`, so the original becomes pickable and instantiable at that world's tables (see [Corpora](corpora.md) for instancing). World membership alone never widens anyone's Library, `libraryRowReadable` is untouched, and only the original is offered, never instances made from it; `group-library.test.ts` pins both directions and that unshare leaves every instance standing.

The NPC Library share picker (`apps/web/src/cast/NpcLibraryScreen.tsx`) reads `sharedWorlds.list` and offers only rows with `isOwner`, matching `sharedWorldLibrary.share`'s authority. Deriving worlds from campaign memberships would leak standalone contexts, omit world-only owners, and offer the control to non-owning creators. `GET /me/campaigns` rows carry `sharedWorld: { id, name } | null` for the same reason: the null hides a standalone campaign's context.
