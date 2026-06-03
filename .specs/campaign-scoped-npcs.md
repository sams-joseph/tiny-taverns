# Campaign-Scoped NPCs

## Parent

`.lalph/prd.yml` (id `#4`)

## Problem

NPCs are currently implemented as user-scoped records (`userId` only). The domain
model in `CONTEXT.md` and `docs/adr/0001-campaign-as-primary-boundary.md` says an
**NPC** exists within exactly one **Campaign** and that assistant context must not
leak across campaigns. Today an NPC created in one campaign would be visible in
any other campaign the same user opens, which is wrong.

The PRD also requires that NPC UI and APIs use the domain language: required
`name` and optional `description` (not `title`). NPC deletion is out of scope,
and pending **Campaign Update Proposals** are not in NPC lists (proposals are a
separate concern, addressed in a later PRD).

## Goals

- Every NPC belongs to exactly one **Campaign** (`campaignId` is required).
- Every NPC retains `userId` as the creator for provenance and ownership
  enforcement.
- NPC records use `name` (required) and `description` (optional).
- NPC UI lives inside a Campaign: list, create, view, edit at
  `/campaigns/$campaignId/npcs(/...)`.
- A user cannot see or fetch an NPC that lives in a Campaign they do not own
  (i.e. the `userId` of the Campaign).
- The AI assistant's `createNpc` / `fetchNpcs` tools operate on the active
  conversation's campaign (no longer user-scoped).
- Tests cover campaign scoping, required `name`, optional `description`,
  create / list / get / update, and ownership enforcement.

## Non-Goals

- NPC deletion (explicitly out of scope per PRD).
- The proposal-based write path (ADR `0002`). The existing `createNpc` tool
  continues to write NPCs directly for now; this is acceptable because this PRD
  is about scoping, not about write authority. A future PRD will replace the
  direct write with proposals.
- First-class Encounter or Combat tracking.
- Migrating historical NPC data. Any pre-existing rows are dropped by the
  migration (dev-only; no production data).

## Domain Alignment

| Concept          | Before                | After                                                            |
| ---------------- | --------------------- | ---------------------------------------------------------------- |
| Ownership        | `userId` (root)       | `userId` (creator) + `campaignId` (root)                         |
| Required fields  | `title`               | `name` (required), `description` (optional)                      |
| `NpcRpc.list`    | `npc_list`            | `npc_list` requires `campaignId`                                 |
| `NpcRpc.get`     | `npc_get`             | `npc_get` requires `campaignId`; rejected if not in that campaign |
| New `npc_create` | (none)                | `npc_create` requires `campaignId`, `name`, optional `description` |
| New `npc_update` | (none)                | `npc_update` requires `campaignId`, accepts `name`, `description` |

## Data Model

### Migration `0006_make_npcs_campaign_scoped.ts`

In a single migration, matching the style of
`0005_add_campaign_id_to_chats.ts`:

1. `TRUNCATE npcs;` (any pre-existing rows are dropped — see Non-Goals).
2. `ALTER TABLE npcs RENAME COLUMN title TO name;`
3. `ALTER TABLE npcs ADD COLUMN campaign_id UUID NOT NULL;`
4. `ALTER TABLE npcs ADD COLUMN description TEXT;`
5. `CREATE INDEX npcs_campaign_id_idx ON npcs (campaign_id);`

`npcs_user_id_idx` already exists from `0003_create_npcs.ts` and is left
as-is. The `TRUNCATE` must precede the `NOT NULL` constraint; otherwise
adding `NOT NULL` fails on any existing rows.

### `NpcModel` (`packages/server/src/db/npc-model.ts`)

```ts
export class NpcModel extends Model.Class<NpcModel>("NpcModel")({
  id: Model.Generated(Npc.NpcId),
  userId: Schema.String,                     // creator
  campaignId: Campaign.CampaignId,           // required root
  name: Schema.NonEmptyString,               // was: title
  description: Schema.NullOr(Schema.String), // optional
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
```

## Server

### Domain (`packages/domain/src/api/npc-rpc.ts`)

```ts
export const NpcId = /* unchanged, branded UUID */;

export class NpcNotFoundError extends Schema.TaggedErrorClass<NpcNotFoundError>()(
  "NpcNotFoundError",
  { id: NpcId, campaignId: CampaignId },
) {}

export class Npc extends Schema.Opaque<Npc>()(
  Schema.Struct({
    id: NpcId,
    campaignId: CampaignId,
    name: Schema.String,
    description: Schema.NullOr(Schema.String),
    createdAt: Schema.DateTimeUtcFromString,
    updatedAt: Schema.DateTimeUtcFromString,
  }),
) {}

export class NpcListRpc extends Rpc.make("npc_list", {
  payload: { campaignId: CampaignId, cursor: Schema.NullOr(Schema.DateTimeUtcFromString) },
  success: Schema.Struct({
    items: Schema.Array(Npc),
    hasMore: Schema.Boolean,
  }),
  error: CampaignNotFoundError,
}) {}

export class NpcGetRpc extends Rpc.make("npc_get", {
  payload: { campaignId: CampaignId, npcId: NpcId },
  success: Npc,
  error: Schema.Union([NpcNotFoundError, CampaignNotFoundError]),
}) {}

export class NpcCreateRpc extends Rpc.make("npc_create", {
  payload: {
    campaignId: CampaignId,
    name: Schema.NonEmptyString,
    description: Schema.UndefinedOr(Schema.String),
  },
  success: Npc,
  error: CampaignNotFoundError,
}) {}

export class NpcUpdateRpc extends Rpc.make("npc_update", {
  payload: {
    campaignId: CampaignId,
    npcId: NpcId,
    name: Schema.UndefinedOr(Schema.NonEmptyString),
    description: Schema.UndefinedOr(Schema.NullOr(Schema.String)),
  },
  success: Npc,
  error: Schema.Union([NpcNotFoundError, CampaignNotFoundError]),
}) {}

export class NpcRpc extends RpcGroup.make(
  NpcListRpc,
  NpcGetRpc,
  NpcCreateRpc,
  NpcUpdateRpc,
).middleware(AuthMiddleware) {}
```

Notes:

- `userId` is **not** exposed on the `Npc` schema. The DM does not need to see
  "who created this" in the API surface; it stays in the database for ownership
  enforcement.
- `NpcUpdateRpc` makes `name` and `description` independently patchable.
  Passing `description: null` clears the description; omitting the key leaves
  it unchanged.
- Errors reference `campaignId` (and `npcId` where relevant) so the client can
  tell which resource was missing.

### `NpcRepo` (`packages/server/src/db/npc-repo.ts`)

Adopt a hand-rolled `Context.Service` (matching the `ChatRepo` shape) so we can
take `campaignId` explicitly. Drop the generic `SqlModel.makeRepository`
`findById` / `insert` in favor of explicit queries that all enforce
`campaign_id` and `user_id`.

Surface:

```ts
export class NpcRepo extends Context.Service<NpcRepo, {
  readonly insert: (args: {
    readonly userId: string;
    readonly campaignId: CampaignId;
    readonly name: string;
    readonly description: string | null;
  }) => Effect.Effect<typeof NpcModel.Type>;

  readonly findById: (
    npcId: NpcId,
    userId: string,
    campaignId: CampaignId,
  ) => Effect.Effect<typeof NpcModel.Type, NpcNotFoundError>;

  readonly listByCampaign: (
    userId: string,
    campaignId: CampaignId,
    cursor: Option.Option<DateTime.Utc>,
  ) => Effect.Effect<{
    items: ReadonlyArray<typeof NpcModel.Type>;
    hasMore: boolean;
  }>;

  readonly update: (args: {
    readonly npcId: NpcId;
    readonly userId: string;
    readonly campaignId: CampaignId;
    readonly name?: string;
    readonly description?: string | null;
  }) => Effect.Effect<typeof NpcModel.Type, NpcNotFoundError>;
}>()("NpcRepo", { ... }) { ... }
```

`update` returns the row only if `(id, user_id, campaign_id)` all match. If no
row matches it fails with `NpcNotFoundError`. The `name` / `description`
parameters are individually optional, but a call with neither is a
programming error (the client should never send an empty patch) and is
treated as a defect via `Effect.die`. We do not invent a typed error for
this — per RULES.md, "Non actionable failures must not be exposed as typed
errors."

### `NpcRpcHandler` (`packages/server/src/api/npcs-rpc-live.ts`)

`CampaignRepo.findById` (from `SqlModel.makeRepository`) only takes a single
id argument and does not check ownership, so the handler must enforce
ownership itself. The simplest, consistent approach is to follow the
existing `campaigns-rpc-live.ts` pattern and pipe through `ensureOwnership`
after `findById`, mapping the resulting `Unauthorized` to
`CampaignNotFoundError` so we do not leak the existence of a foreign
campaign. (`ensureOwnership` is generalised to take an `entity` label so it
stops hard-coding `"NPC"`.)

Each handler:

1. Resolves `CurrentUser` from the auth middleware.
2. Calls `campaignRepo.findById(campaignId)` and pipes through
   `ensureOwnership(currentUser.id, "Campaign")`, mapping `Unauthorized` to
   `CampaignNotFoundError`.
3. For `npc_list` calls `npcRepo.listByCampaign(userId, campaignId, cursor)`.
4. For `npc_get` calls `npcRepo.findById(npcId, userId, campaignId)`.
5. For `npc_create` calls `npcRepo.insert({ userId, campaignId, name, description })`.
6. For `npc_update` calls `npcRepo.update({ npcId, userId, campaignId, name?, description? })`.

Errors are mapped to the `CampaignNotFoundError` / `NpcNotFoundError` union on
each RPC.

## AI Tooling

### `chat-toolkit.ts` (`packages/server/src/api/chat/chat-toolkit.ts`)

```ts
export const fetchNpcs = Tool.make("fetchNpcs", {
  description: "Fetch the NPCs that belong to the current Conversation's Campaign",
  failureMode: "return",
  parameters: Tool.EmptyParams,
  success: Schema.Array(Npc),
  failure: Schema.String,
  dependencies: [ChatMailbox, CurrentUser, CurrentCampaign], // see below
});

export const createNpc = Tool.make("createNpc", {
  description: "Create an NPC inside the current Conversation's Campaign",
  failureMode: "return",
  parameters: Schema.Struct({
    name: Schema.NonEmptyString,
    description: Schema.UndefinedOr(Schema.String),
  }),
  success: Npc,
  failure: Schema.String,
  dependencies: [ChatMailbox, CurrentUser, CurrentCampaign],
});
```

Add a `CurrentCampaign` service in a small new module
`packages/server/src/api/chat/current-campaign.ts`. The service value is a
`Campaign.CampaignId`. The service is provided in
`packages/server/src/api/chat/chat-run-manager.ts` alongside `CurrentUser`
and `NpcRepo`, derived from `payload.chat.campaignId`, because
`ChatProcessor.run` (and therefore the toolkit) executes inside
`ChatRunManager.startGeneration`, not inside `ChatRpcHandler`.

### `chat-toolkit-live.ts`

`fetchNpcs` becomes:

```ts
const campaignId = yield* CurrentCampaign;
yield* npcRepo.listByCampaign(currentUser.id, campaignId, Option.none());
```

`createNpc` becomes:

```ts
const campaignId = yield* CurrentCampaign;
yield* npcRepo.insert({
  userId: currentUser.id,
  campaignId,
  name: params.name,
  description: params.description ?? null,
});
```

The existing `ToolStart` / `ToolSuccess` / `ToolFailure` mailbox publishing
is preserved around these calls — only the data source changes.
`chat-toolkit-live.test.ts` already asserts on those events and should
continue to pass.

`fetchNpcs` success schema changes from `Schema.Array(Npc)` (which previously
exposed only `id, title, createdAt, updatedAt`) to `Schema.Array(Npc)` with
the new shape. `description` is added under the new `Npc` schema.

### Mock / test updates

`MockNpcRepo` in `chat-rpc-live.test.ts`, `chat-processor.test.ts`, and
`chat-toolkit-live.test.ts` must match the new repo surface
(`listByCampaign`, `update`, etc.) and return records that satisfy the new
`NpcModel` (including `campaignId` and `description`).

The test fixtures that currently build an NPC with `NpcId.make("npc-1")`
will no longer compile, because `NpcId` is a branded UUID and `"npc-1"` is
not a valid UUID. Replace those literals with a proper UUID, e.g.
`NpcId.make("00000000-0000-4000-8000-000000000001")`. The same applies to
any `ChatId.make("…")` or `CampaignId.make("…")` literals introduced in
the new test files.

## Client

### Routes

Remove:

- `packages/client/src/routes/npcs/index.tsx`
- `packages/client/src/routes/npcs/$npcId/index.tsx`
- `packages/client/src/routes/npcs/-lib/*`

Add under the campaign:

- `packages/client/src/routes/campaigns/$campaignId/npcs/index.tsx` — list +
  create form.
- `packages/client/src/routes/campaigns/$campaignId/npcs/$npcId.tsx` — view +
  inline edit.
- `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/*` — colocated
  `npcs-api.ts`, `npcs-atoms.ts`, `npc-list.tsx`, `npc-detail.tsx`.

After deleting the old routes, regenerate `packages/client/src/routeTree.gen.ts`
or run the existing generator (TanStack Router's `tsr generate` if configured,
otherwise the route tree is regenerated on first dev run).

### Sidebar (`packages/client/src/components/app-sidebar.tsx`)

Remove the top-level "NPCs" `SidebarMenuItem` and its `npcListAtom` import /
`useAtomValue` call. The NPCs overview card on the campaign page already
exists as a stub; update it to `Link to="/campaigns/$campaignId/npcs"`.

### API client (`-lib/npcs-api.ts`)

```ts
export class NpcApi extends Context.Service<NpcApi>()("@app/npcs/NpcApi", {
  make: Effect.gen(function*() {
    const rpc = yield* DomainRpcClient;
    return {
      npcList: (args: { campaignId: CampaignId; cursor: ... }) =>
        rpc.npc_list(args),
      npcGet: (args: { campaignId: CampaignId; npcId: NpcId }) =>
        rpc.npc_get(args),
      npcCreate: (args: { campaignId: CampaignId; name: string; description?: string }) =>
        rpc.npc_create(args),
      npcUpdate: (args: {
        campaignId: CampaignId;
        npcId: NpcId;
        name?: string;
        description?: string | null;
      }) => rpc.npc_update(args),
    };
  }),
}) { ... }
```

### Atoms (`-lib/npcs-atoms.ts`)

- `npcListFamily(campaignId: CampaignId)` — fetches `npc_list`.
- `npcDataFamily(campaignId: CampaignId, npcId: NpcId)` — fetches `npc_get`.
- `createNpcAtom` — wraps `npcCreate`, then refreshes `npcListFamily` for the
  active campaign.
- `updateNpcFamily(campaignId, npcId)` — wraps `npcUpdate`; on success it
  refreshes both the data family and the list family.

All use `npcsRuntime = Atom.runtime(NpcApi.layer)` like the current atoms.

### `npc-list.tsx` (list + create)

- Reads `npcListFamily(campaignId)`.
- Renders a `Form` (using `@base-ui/react` like `campaigns/index.tsx`) with
  `name` (required) and `description` (optional) inputs, calling
  `createNpcAtom`.
- After a successful create, refresh the list, reset the form, and navigate
  to the new NPC's detail route.
- Each row is a real `<Link>` to `/campaigns/$campaignId/npcs/$npcId`.
- Empty state: "No NPCs yet." Copy should use the word "name" (not "title").
- Loading uses `result.waiting`. Failure renders the real `Cause` (e.g.
  `Banner.CauseDetail` or the existing failure component pattern), not a
  generic "Failed to load NPCs" string, per
  `knowledge/rules/effect-atom.md`.
- The create form is wrapped with `useFormNavigationBlocker` per
  `RULES.md` so the DM is prompted before navigating away with a half-filled
  form. (For the short-lived create form we wire `isDirty` based on whether
  either input has a non-empty value.)
- Dashboard layout follows `knowledge/rules/dashboard-ui.md`.

### `npc-detail.tsx` (view + inline edit)

- Reads `npcDataFamily(campaignId, npcId)`.
- Two visual modes: view and edit. A button toggles between them. (No modal,
  no separate route — the "inline edit" answer.)
- View mode shows `name` and (if present) `description` as static text, plus
  a back link to the list.
- Edit mode is a `Form` with `name` (required) and `description` (optional,
  with an explicit "Clear" affordance to set it to `null`). Submit calls
  `updateNpcFamily(...)` and exits edit mode on success. Failures (e.g. the
  `name` was cleared) stay in edit mode and surface a message under the
  field using the same form-validation-message pattern as
  `knowledge/rules/form-validation-message.md`.
- The edit form opts into unsaved-change protection with
  `useFormNavigationBlocker` per `RULES.md`, so navigating away with dirty
  edits prompts the DM before discarding.
- Failure UI for `npcDataFamily` (e.g. network or `NpcNotFoundError`)
  renders the real `Cause` rather than a generic message, per
  `knowledge/rules/effect-atom.md`. We do not use toast notifications —
  inline failure messages follow `RULES.md` and
  `knowledge/rules/accessible-notifications-and-messages.md`.

## Tests

### Repo (`packages/server/src/db/npc-repo.test.ts`, new)

Integration tests against the existing `PgTest` + migration layer, mirroring
`chat-repo.test.ts`:

- `insert` returns the record with generated `id`, `createdAt`, `updatedAt`.
- `findById` succeeds with matching `userId` + `campaignId`.
- `findById` fails when `userId` does not match.
- `findById` fails when `campaignId` does not match.
- `findById` fails for non-existent ids.
- `listByCampaign` returns only NPCs in the requested campaign, ordered by
  `updatedAt desc`.
- `listByCampaign` does not return NPCs owned by a different user, even
  when the campaign id matches (defense in depth).
- `listByCampaign` returns an empty page when the campaign has no NPCs.
- `listByCampaign` cursor excludes items at or after the cursor.
- `update` changes only the supplied fields; missing fields are preserved.
- `update` returns the unchanged row when only `description` is patched,
  and vice versa.
- `update` fails with `NpcNotFoundError` when the row is outside the caller's
  campaign or owned by a different user.

### RPC handler (`packages/server/src/api/npcs-rpc-live.test.ts`, new)

- `npc_list` returns items for the given campaign.
- `npc_list` fails with `CampaignNotFoundError` for an unknown campaign.
- `npc_list` does not leak NPCs from a sibling campaign owned by the same
  user (this is the "NPCs from one Campaign never appear in another" check).
- `npc_get` succeeds for an NPC in the caller's campaign.
- `npc_get` fails with `NpcNotFoundError` when the NPC is in a different
  campaign.
- `npc_create` stores `name` and optional `description`, returns the new
  record.
- `npc_create` rejects an empty `name` with a schema-level validation
  failure (covers the PRD's "required name validation" criterion at the
  handler boundary).
- `npc_create` fails with `CampaignNotFoundError` for an unknown campaign.
- `npc_update` patches `name` and `description` and returns the new state.
- `npc_update` returns the unchanged row when only `description` is patched,
  and vice versa.
- `npc_update` fails with `NpcNotFoundError` for a wrong campaign.

Mock both `NpcRepo` and `CampaignRepo` to drive ownership paths.

### Tool handlers (`packages/server/src/api/chat/chat-toolkit-live.test.ts`)

- Update `MockNpcRepo` to the new surface.
- `createNpc` tool writes through to `NpcRepo.insert` with the
  `CurrentCampaign`'s id and the supplied `name` / `description`.
- `fetchNpcs` tool reads through `NpcRepo.listByCampaign` for the
  `CurrentCampaign`'s id.

### `ChatRpc` mock layer (`packages/server/src/api/chat/chat-rpc-live.test.ts`)

- The `MockNpcRepo` in this file must match the new repo shape so the test
  layer still composes.

## Implementation Plan

The work is split into **five atomic, independently-shippable PRs**. Each
PR is the smallest unit that leaves the tree in a green state (`pnpm check`
+ `pnpm test` both pass), and each PR is reviewable on its own. PRs must
land in order because later PRs depend on the schemas and types introduced
by earlier ones.

### PR 1 — Server data layer: model, migration, repo, and the chat-test mocks that depend on the old shape

This PR has to move the model, the migration, the repo, and the three
existing chat test mocks together, because `chat-processor.test.ts`,
`chat-rpc-live.test.ts`, and `chat-toolkit-live.test.ts` all build
`MockNpcRepo` returning the old `NpcModel` shape. They will not typecheck
the moment `NpcModel` is updated, regardless of whether the new repo is
ready.

1. Add migration `0006_make_npcs_campaign_scoped.ts` per the Migration
   section (TRUNCATE first, then `RENAME COLUMN`, then `ADD COLUMN
   campaign_id UUID NOT NULL`, then `ADD COLUMN description TEXT`, then
   the campaign-id index — leave the existing `npcs_user_id_idx` alone).
2. Update `NpcModel` to include `campaignId` (required `CampaignId`) and
   `description` (`Schema.NullOr(Schema.String)`), and rename `title` to
   `name`.
3. Rewrite `NpcRepo` as a hand-rolled `Context.Service` with `insert`,
   `findById`, `listByCampaign`, and `update`. Each query enforces
   `(user_id, campaign_id)`. The empty-patch case for `update` is a
   `Effect.die`, not a typed error.
4. Add `packages/server/src/db/npc-repo.test.ts` with the integration
   cases listed under Tests, including the cross-user isolation case and
   the "no NPCs" empty case.
5. Update `MockNpcRepo` in `chat-processor.test.ts`,
   `chat-rpc-live.test.ts`, and `chat-toolkit-live.test.ts` to the new
   surface and the new `NpcModel` shape. Replace any `NpcId.make("npc-1")`
   (and other non-UUID literals) with proper UUIDs so the branded
   `NpcId` schema accepts them.

**Verify**: `pnpm check` and `pnpm test` both pass.

### PR 2 — Server RPC: domain schema, handler, and handler tests

The handler (`NpcRpcHandler.of({...})`) implements the
`NpcRpc` group, so it cannot compile until the group is updated; the
group cannot be updated without the handler also being updated to use
the new payloads. The handler tests are additive on top, but live in
this PR so the PR is self-contained.

6. Update `packages/domain/src/api/npc-rpc.ts`: add `campaignId` /
   `description` to the `Npc` schema; add `NpcCreateRpc` and
   `NpcUpdateRpc`; update `NpcListRpc` and `NpcGetRpc` payloads to
   require `campaignId`; update the error unions.
7. Rewrite `NpcRpcHandler` in `packages/server/src/api/npcs-rpc-live.ts`
   to implement the four RPCs and route them through `NpcRepo` and
   `CampaignRepo`. Use the `findById → ensureOwnership` pattern from
   `campaigns-rpc-live.ts`, mapping `Unauthorized` to
   `CampaignNotFoundError` so foreign-campaign existence is not leaked.
8. Add `packages/server/src/api/npcs-rpc-live.test.ts` with the RPC
   handler cases listed under Tests, including the schema-level
   validation failure for an empty `name`.

**Verify**: `pnpm check` and `pnpm --filter @app/server test` both pass.

### PR 3 — Server AI toolkit: `CurrentCampaign` and updated tool handlers

`CurrentCampaign` must be provided wherever the toolkit is run, which is
`chat-run-manager.ts`, not `chat-rpc-live.ts`. This PR also updates the
toolkit tests' mocks because the new `Npc` schema flows through the tool
success types.

9. Add `packages/server/src/api/chat/current-campaign.ts` defining
   `CurrentCampaign` as a `Context.Service<…, Campaign.CampaignId>`.
10. Update `packages/server/src/api/chat/chat-toolkit.ts` to add
    `CurrentCampaign` to the `dependencies` of `fetchNpcs` and `createNpc`,
    and to widen the `createNpc` parameter struct to include
    `name` (required) and `description` (optional). Keep
    `failureMode: "return"`.
11. Update `packages/server/src/api/chat/chat-toolkit-live.ts` to read
    `CurrentCampaign` in both tool handlers and route to
    `npcRepo.listByCampaign` / `npcRepo.insert`. Preserve the existing
    `ToolStart` / `ToolSuccess` / `ToolFailure` mailbox publishing
    around each call.
12. Update `packages/server/src/api/chat/chat-run-manager.ts` to provide
    `CurrentCampaign` (derived from `payload.chat.campaignId`) alongside
    `CurrentUser` and `NpcRepo` when running the toolkit. Drop the
    `?? ""` defensive fallback on `payload.chat.campaignId` — the
    `ChatModel` makes it non-nullable, and the new code relies on that.
13. Add tool-handler tests in `chat-toolkit-live.test.ts` that drive
    `createNpc` and `fetchNpcs` through the new `CurrentCampaign` path,
    asserting that the repo receives the active campaign's id.

**Verify**: `pnpm check` and `pnpm --filter @app/server test` both pass.

### PR 4 — Client: atoms, new routes, route tree, sidebar, overview card

Removing the old `routes/npcs/**` tree breaks `app-sidebar.tsx`'s
`npcListAtom` import, and adding the new routes under
`routes/campaigns/$campaignId/npcs/**` needs `routeTree.gen.ts` to
include them. So the atoms, the new routes, the deletion, the route
tree, the sidebar, and the campaign-overview card link all ship
together.

14. Rewrite `packages/client/src/routes/npcs/-lib/npcs-api.ts` against
    the new `NpcApi` shape (`npcList({ campaignId, cursor })`,
    `npcGet({ campaignId, npcId })`, `npcCreate({ campaignId, name, description? })`,
    `npcUpdate({ campaignId, npcId, name?, description? })`).
15. Rewrite `packages/client/src/routes/npcs/-lib/npcs-atoms.ts` to
    expose `npcListFamily(campaignId)`, `npcDataFamily(campaignId, npcId)`,
    `createNpcAtom`, and `updateNpcFamily(campaignId, npcId)`. Drop the
    unused `preferencesRuntime` (it was a leftover from a previous
    experiment; no other code consumes it).
16. Add the new routes:
    - `packages/client/src/routes/campaigns/$campaignId/npcs/index.tsx`
      — list + create form.
    - `packages/client/src/routes/campaigns/$campaignId/npcs/$npcId.tsx`
      — view + inline edit.
    - `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/npc-list.tsx`
      — list UI, create `Form`, empty state, real-cause failure UI, and
      `useFormNavigationBlocker` on the create form.
    - `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/npc-detail.tsx`
      — view / edit toggle, `Form` with name (required) and description
      (optional, with a "Clear" affordance to send `null`), inline
      failure messages, and `useFormNavigationBlocker` on the edit form.
17. Delete the old `packages/client/src/routes/npcs/` tree.
18. Update `packages/client/src/routeTree.gen.ts` by hand: remove the
    `NpcsIndexRoute` and `NpcsNpcIdIndexRoute` registrations, and add
    the new `CampaignsCampaignIdNpcsIndexRoute` and
    `CampaignsCampaignIdNpcsNpcIdRoute` registrations (following the
    existing shape in the file). The project has no `tsr generate`
    script; the generator runs at dev time and would otherwise leave
    `pnpm check` happy but the routes unreachable.
19. Update `packages/client/src/components/app-sidebar.tsx`: drop the
    `npcListAtom` import, the `useAtomValue` call, and the "NPCs"
    `SidebarMenuItem` linking to `/npcs`.
20. Update `packages/client/src/routes/campaigns/-lib/campaign-page.tsx`
    to make the existing "NPCs" `OverviewCard` a real `<Link
    to="/campaigns/$campaignId/npcs" params={{ campaignId: … }}>` so the
    card becomes the entry point to the new route.

**Verify**: `pnpm check` and `pnpm --filter @app/client test` both pass.

### PR 5 — Manual end-to-end smoke (PR description, not a code PR)

This is a final manual checkpoint, not a code change. The PR description
for PR 4 (or the merge commit message) should include a smoke-test
checklist:

- Start the dev server.
- Open `/campaigns`, create a Campaign.
- Inside the Campaign, open NPCs, create one with `name` only, create
  one with `name` + `description`, edit one, clear its description.
- Create a second Campaign and confirm none of the first Campaign's
  NPCs appear in its NPC list or detail route.
- Send a chat message that triggers `createNpc` and confirm the NPC
  lands in the active Campaign's list and nowhere else.
- Run `pnpm test` and `pnpm check` one last time.

## Files Touched

### PR 1
- `packages/server/src/db/migrations/0006_make_npcs_campaign_scoped.ts` (new)
- `packages/server/src/db/npc-model.ts`
- `packages/server/src/db/npc-repo.ts`
- `packages/server/src/db/npc-repo.test.ts` (new)
- `packages/server/src/api/chat/chat-processor.test.ts` (mock shape only)
- `packages/server/src/api/chat/chat-rpc-live.test.ts` (mock shape only)
- `packages/server/src/api/chat/chat-toolkit-live.test.ts` (mock shape only)

### PR 2
- `packages/domain/src/api/npc-rpc.ts`
- `packages/server/src/api/npcs-rpc-live.ts`
- `packages/server/src/api/npcs-rpc-live.test.ts` (new)

### PR 3
- `packages/server/src/api/chat/current-campaign.ts` (new)
- `packages/server/src/api/chat/chat-toolkit.ts`
- `packages/server/src/api/chat/chat-toolkit-live.ts`
- `packages/server/src/api/chat/chat-run-manager.ts` (provides
  `CurrentCampaign`)
- `packages/server/src/api/chat/chat-toolkit-live.test.ts` (new tool tests)

### PR 4
- `packages/client/src/routes/npcs/-lib/npcs-api.ts` (rewrite)
- `packages/client/src/routes/npcs/-lib/npcs-atoms.ts` (rewrite)
- `packages/client/src/routes/campaigns/$campaignId/npcs/index.tsx` (new)
- `packages/client/src/routes/campaigns/$campaignId/npcs/$npcId.tsx` (new)
- `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/npc-list.tsx`
  (new)
- `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/npc-detail.tsx`
  (new)
- `packages/client/src/routes/npcs/**` (deleted)
- `packages/client/src/routeTree.gen.ts` (hand-edited)
- `packages/client/src/components/app-sidebar.tsx`
- `packages/client/src/routes/campaigns/-lib/campaign-page.tsx` (link from
  the NPCs overview card)
