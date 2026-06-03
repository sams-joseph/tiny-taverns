# NPCs belong to Campaigns

## Summary

Make `NPC` campaign-scoped per the resolved domain rule in `CONTEXT.md:20-21`. Today an NPC is owned by a user (`packages/server/src/db/npc-model.ts:7`) and the NPC list page, the NPC detail page, and the AI `createNpc` / `fetchNpcs` tools all operate on the entire user-scoped set. The `Chat` entity was already migrated to live inside a `Campaign` (`packages/server/src/db/migrations/0005_add_campaign_id_to_chats.ts` and `packages/server/src/db/chat-repo.ts`); this work applies the same boundary to `NPC`.

After the change, every NPC belongs to exactly one `Campaign`. The NPC list page moves from `/npcs` to `/campaigns/$campaignId/npcs`; the AI toolkit is given the active chat's `campaignId` and writes NPCs there; and the database requires `campaign_id NOT NULL` on `npcs`.

## Domain language

| Term | Where it lives | Definition |
| --- | --- | --- |
| **Campaign** | `CONTEXT.md:7-9` | Bounded tabletop game world. Owns NPCs. |
| **NPC** | `CONTEXT.md:19-21` | A narrative non-player character that exists within exactly one Campaign. |
| **Assistant Conversation** | `CONTEXT.md:12-14` | Focused exchange with the assistant inside a Campaign. NPCs are only ever created from inside one. |
| **Chat** (current implementation term) | `CONTEXT.md:71` | Current implementation term for an Assistant Conversation. |

Per `CONTEXT.md:72`, the flagged ambiguity "NPCs are currently implemented as user-scoped, but the resolved domain rule is campaign-scoped" is the one this work closes.

## Resolved design decisions

- **Migration**: drop existing user-scoped NPC rows. Add `campaign_id UUID NOT NULL` plus an index in the same migration that recreates the table. No backfill. Clean break, no orphan data.
- **Public NPC create surface**: none. NPCs are created only via the `createNpc` AI tool, which the run manager already gates on the active chat's campaign. No `npc_create` RPC, no UI "Create NPC" form. The only way an NPC enters the system today is via the AI `createNpc` tool, which is only reachable from inside a chat that has already been `chat_create`-d.
- **URL structure**: NPCs are nested under their owning campaign.
  - `/campaigns/$campaignId/npcs` (list)
  - `/campaigns/$campaignId/npcs/$npcId` (detail)
  - The standalone `/npcs` and `/npcs/$npcId` routes are removed along with the sidebar link.
- **NPC RPCs**: every `NpcRpc` payload takes `campaignId`, matching the `ChatRpc` shape (`packages/domain/src/api/chat-rpc.ts:132-194`). NPCs cannot be read or listed across campaigns.
- **AI tool context**: a new `ChatRunContext` service carries the active chat's `campaignId` to the `fetchNpcs` and `createNpc` tool handlers. `CurrentUser` stays in the tool dependencies and is still yielded in the handler bodies — the run has both pieces of context, the tool needs both. (The earlier draft of this spec contradicted itself on this point; this is the correct, final shape.)

## Functional requirements

### Database

1. Migration `0006_add_campaign_id_to_npcs`:
   - `DROP TABLE npcs;` (clears all rows; `campaign_id` is added `NOT NULL` in the same step).
   - `CREATE TABLE npcs` with columns `id UUID PK`, `user_id TEXT NOT NULL`, `campaign_id UUID NOT NULL`, `title TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
   - `CREATE INDEX npcs_user_id_idx ON npcs (user_id);`
   - `CREATE INDEX npcs_campaign_id_idx ON npcs (campaign_id);`
   - **No** foreign key constraint to `campaigns(id)`. The codebase does not declare FKs for any other relationship; match that style. (See `0004_create_campaigns.ts:8-15` and `0001_create_chats.ts:8-16`.)
   - Do **not** add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — follow the existing migrations (`0001_create_chats.ts:9`, `0003_create_npcs.ts:9`, `0004_create_campaigns.ts:9`) and rely on the database already having `pgcrypto` enabled.
2. `NpcModel` (`packages/server/src/db/npc-model.ts`) gains `campaignId: Campaign.CampaignId`. The generated `id` column and the `userId` column stay.

### Repository

3. `NpcRepo` (`packages/server/src/db/npc-repo.ts`) gets:
   - A custom `findById(npcId, userId, campaignId)` query that fails with `NoSuchElementError` when no row matches `id = $1 AND user_id = $2 AND campaign_id = $3`.
   - `fetch(userId, campaignId, cursor)` that includes `campaign_id = $campaignId` alongside `user_id = $userId` in its `WHERE` clause, and the cursor predicate.
   - `insert({ userId, campaignId, title })` requires the campaign id. `NpcModel.insert.make({ userId, campaignId, title })` works once requirement 2 lands; no new insert method is required.
   - The repo stops spreading `...repo` and only exposes `insert`, `findById`, `fetch` (and `delete` only if a caller is found that needs it — none currently do, and `chat-processor.test.ts:43`, `chat-toolkit-live.test.ts:45`, `chat-run-manager.test.ts:82-83`, `chat-rpc-live.test.ts:119` currently mock a `delete` that has no real implementation in the repo, so the mocks will go away in the same change).
4. `ensureOwnership` (`packages/server/src/lib/ensureOwnership.ts`) is not removed; other call sites still use it.

### Domain RPC

5. `packages/domain/src/api/npc-rpc.ts`:
   - Move `NpcId` to `packages/domain/src/api/ids.ts` (consistent with `CampaignId`, `ChatId`, `RunId` in `packages/domain/src/api/ids.ts:1-19`).
   - Re-export `NpcId` from `npc-rpc.ts` for backwards-compatible imports inside the package (mirroring `chat-rpc.ts:10`: `export { ChatId, RunId } from "./ids.js";`).
   - Add `campaignId: CampaignId` to the `Npc` schema struct.
   - `NpcListRpc.payload` becomes `{ campaignId: CampaignId, cursor: Schema.NullOr(Schema.DateTimeUtcFromString) }`.
   - `NpcGetRpc.payload` becomes `{ campaignId: CampaignId, npcId: NpcId }`.

### Server RPC handler

6. `packages/server/src/api/npcs-rpc-live.ts`:
   - Inject `CampaignRepo` alongside `NpcRepo`.
   - `npc_list` resolves the campaign with `campaignRepo.findById(payload.campaignId).pipe(Effect.flatMap(ensureOwnership(currentUser.id)), Effect.mapError(() => new Campaign.CampaignNotFoundError({ id: payload.campaignId })))` — this matches the existing pattern at `campaigns-rpc-live.ts:49-61` because the real `CampaignRepo.findById` from `SqlModel.makeRepository` is single-arg. The pre-existing call sites in `chat-rpc-live.ts:33, 77, 89` that pass `(id, userId)` are already type-broken against the real signature and are **out of scope for this spec** — leave them alone.
   - `npc_list` then calls `npcRepo.fetch(currentUser.id, payload.campaignId, cursor)`.
   - `npc_get` calls the new `npcRepo.findById(payload.npcId, currentUser.id, payload.campaignId)`, mapping the empty-result to `NpcNotFoundError`. The existing `ensureOwnership` call inside this handler goes away — the SQL filter covers both user and campaign boundaries.
   - Provide `CampaignRepo.layer` in `NpcRpcLive` alongside `NpcRepo.layer`.

### AI toolkit

7. `packages/server/src/api/chat/chat-toolkit.ts`:
   - Declare `ChatRunContext` next to `ChatMailbox` in the same file. Use the same class shape as `CurrentUser` (`packages/domain/src/auth.ts:17-21`):

     ```ts
     export class ChatRunContext extends Context.Service<ChatRunContext, {
       readonly campaignId: CampaignId;
     }>()("ChatRunContext") {}
     ```
   - Add `ChatRunContext` to the `dependencies` of `fetchNpcs` and `createNpc`. **Keep `CurrentUser` in the dependencies** — the handlers still need `currentUser.id` to populate `user_id` on the NPC row. The new dependency is additive, not a replacement.
   - Refresh tool descriptions:
     - `fetchNpcs`: "Fetch the list of NPCs in the active Campaign."
     - `createNpc`: "Create a new NPC in the active Campaign. Returns the new NPC."

8. `packages/server/src/api/chat/chat-toolkit-live.ts`:
   - `fetchNpcs` yields both `ChatRunContext` and `CurrentUser`, calls `npcRepo.fetch(currentUser.id, ctx.campaignId, Option.none())`.
   - `createNpc` yields both `ChatRunContext` and `CurrentUser`, inserts with `userId: currentUser.id, campaignId: ctx.campaignId`.
   - The `ChatToolkitLive` `Layer.Layer<...>` type signature **does not change** — the new dependency is provided at the call site (next bullet), not lifted into the layer. The signature stays `Layer.Layer<Tool.HandlersFor<Toolkit.Tools<typeof ChatToolkit>>, never, NpcRepo>`.

9. `packages/server/src/api/chat/chat-run-manager.ts`:
   - At the `processor.run` call site (`packages/server/src/api/chat/chat-run-manager.ts:107-116`), add `Effect.provideService(ChatRunContext, { campaignId: payload.chat.campaignId })` next to the existing `Effect.provideService(ChatMailbox, mailbox)`, `Effect.provideService(CurrentUser, payload.currentUser)`, and `Effect.provideService(NpcRepo, npcRepo)`.
   - While the file is open, clean up the dead `?? ""` fallback on `payload.chat.campaignId` at line 97 — `ChatModel.campaignId` (`packages/server/src/db/chat-model.ts:10`) is `CampaignId` and is not nullable, so the fallback is unreachable.

### Client

10. Delete `packages/client/src/routes/npcs/` (both route files and the `-lib` directory) and remove the `npcListAtom` import + NPCs link from `packages/client/src/components/app-sidebar.tsx`. `packages/client/src/components/app-nav.tsx` does not reference NPCs and needs no change.
11. Add new client routes:
    - `packages/client/src/routes/campaigns/$campaignId/npcs/index.tsx`:
      - `createFileRoute("/campaigns/$campaignId/npcs/")` (trailing slash, index style — mirrors `packages/client/src/routes/npcs/index.tsx:5`).
    - `packages/client/src/routes/campaigns/$campaignId/npcs/$npcId.tsx`:
      - `createFileRoute("/campaigns/$campaignId/npcs/$npcId")` (no trailing slash, non-index style — mirrors `packages/client/src/routes/campaigns/$campaignId/conversations/$chatId.tsx:16-19`).
    - Page-specific code lives in colocated `-lib` directories, matching the `chat-page.tsx` convention (`packages/client/src/routes/campaigns/$campaignId/conversations/-lib/chat-page.tsx:11-70`).
12. New client files under `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/`:
    - `npcs-api.ts` — `NpcApi` with `npcList({ campaignId, cursor })` and `npcGet({ campaignId, npcId })`.
    - `npcs-atoms.ts` — `npcListFamily(campaignId)` (with `Atom.refreshOnWindowFocus` preserved from the existing atom at `packages/client/src/routes/npcs/-lib/npcs-atoms.ts:21`) and `npcDataFamily({ campaignId, npcId })`. Reuses the `BrowserKeyValueStore` runtime pattern from `chat-atoms.ts:20-23`.
    - `npc-list.tsx` — list view that links each NPC to `/campaigns/$campaignId/npcs/$npcId`. Preserves the existing `useEffect → refreshNpcList` behavior (the "TODO" comment at `packages/client/src/routes/npcs/-lib/npc-list.tsx:14` is a pre-existing known issue, not addressed here).
    - `npc-detail.tsx` — detail view; port the simple `npc.value.title` render from `packages/client/src/routes/npcs/$npcId/index.tsx:28-34`.
13. `packages/client/src/routes/campaigns/-lib/campaign-page.tsx`:
    - Add `Link` to the existing `@tanstack/react-router` import line (currently `createFileRoute, Outlet, useNavigate` at line 5).
    - Convert the "NPCs" `OverviewCard` (`packages/client/src/routes/campaigns/-lib/campaign-page.tsx:168-172`) to render its `<CardTitle>` / `<CardDescription>` inside a real `<Link to="/campaigns/$campaignId/npcs" params={{ campaignId }}>` so it is navigable. **Do not** touch the other `OverviewCard`s in this change — keeping scope tight. The "Conversations" card and others remain inert cards until a follow-up.
14. Regenerate `packages/client/src/routeTree.gen.ts`:
    - The `tsr` TanStack Router generator regenerates this file when the dev server boots. Concretely: run `pnpm dev:client` once, wait for the route tree to be written, then stop the server. Commit the regenerated `routeTree.gen.ts` alongside the new route files.
    - The old `/npcs` entries in `routeTree.gen.ts` (lines 13, 15, 24, 34, 55, 65, 72, 74, 82, 84, 90, 92, 98, 100, 122-128, 136-142) are removed automatically when the corresponding route files are deleted.

## Non-goals

- No `npc_create` RPC, no UI "Create NPC" button. Per the resolved decision, NPC creation remains AI-only for this iteration. A future change can add manual creation once `Campaign Update Proposals` are wired up.
- No `npc_update`, `npc_delete`, or cross-campaign read RPCs. The new schema and RPC shape actively prevent those.
- No FK constraint from `npcs.campaign_id` to `campaigns.id`. Other relations don't use FKs in this codebase, and adding one here would be inconsistent.
- No changes to `Campaign` or `Chat` entities. The boundary moves onto `NPC` only.
- No changes to `Campaign Update Proposals`. Even though `CONTEXT.md:27-29` defines that flow, the work in this spec is the prerequisite scoping change; proposal wiring remains a separate iteration.
- No fix for the pre-existing type-incorrect `campaignRepo.findById(id, userId)` call sites in `chat-rpc-live.ts:33, 77, 89`. They are out of scope; the new `npc_list` handler uses the correct `ensureOwnership` pattern.

## Implementation plan

The plan is intentionally collapsed so every unit ships green (`pnpm check` + `pnpm test`). The naive per-file slicing fails typecheck mid-edit because the model, repo, RPC, handler, and toolkit are tightly coupled. The unit boundaries below respect those coupling points.

### Unit 1 — Move `NpcId` to `ids.ts` and re-export it

- Add `NpcId` to `packages/domain/src/api/ids.ts` using the existing UUID brand pattern (`Schema.String.pipe(Schema.check(Schema.isUUID(undefined)), Schema.brand("NpcId"))`).
- In `packages/domain/src/api/npc-rpc.ts`, replace the local `NpcId` definition with `export { NpcId } from "./ids.js";`.
- Every first-party caller (`npc-model.ts:1`, `chat-toolkit.ts:2`, `npcs-rpc-live.ts:3`, the four chat test files, and the four `npcs/*` client files) imports `NpcId` from `@app/domain/api/npc-rpc`, so the re-export keeps them green. No other import paths change in this unit.
- Verify: `pnpm check`, `pnpm test`.

### Unit 2 — DB model + repo + RPC payloads + handler + AI toolkit + test mock updates (one PR)

The pieces below are inseparable from a typecheck perspective: the model change forces the repo signature change, which forces the RPC payload change, which forces the handler change, which forces the toolkit handler change, which forces the test mock changes. Do them together. Internally, commit them as three smaller commits in this order so the diff stays reviewable: (a) DB layer, (b) RPC layer, (c) AI toolkit. Each commit leaves the working tree green.

**Commit A — DB layer**
- Add `packages/server/src/db/migrations/0006_add_campaign_id_to_npcs.ts` per requirement 1.
- Add `campaignId: Campaign.CampaignId` to `packages/server/src/db/npc-model.ts`.
- Update `packages/server/src/db/npc-repo.ts` per requirement 3: custom `findById(npcId, userId, campaignId)`, updated `fetch(userId, campaignId, cursor)`, `insert` unchanged in shape but now requires `campaignId` via the model, no `...repo` spread.
- Verify after this commit: `pnpm check` (the toolkit handler and tests will fail until commit C, so this commit cannot be the only one — but the migration + repo diffs alone compile if the handler call sites are stubbed).

**Commit B — RPC layer**
- Update `packages/domain/src/api/npc-rpc.ts` per requirement 5.
- Update `packages/server/src/api/npcs-rpc-live.ts` per requirement 6.
- Verify after this commit: `pnpm check` and `pnpm test` are both green; the chat toolkit tests will not yet be updated, but their mocks' `MockNpcRepo` already accepts arbitrary signatures via `Layer.mock`, so they continue to typecheck as long as they don't try to access the new `delete` mock. (See commit C for the mock cleanup.)

**Commit C — AI toolkit + test mock updates**
- Update `packages/server/src/api/chat/chat-toolkit.ts` per requirement 7 (add `ChatRunContext`, add it to dependencies, keep `CurrentUser`, refresh tool descriptions).
- Update `packages/server/src/api/chat/chat-toolkit-live.ts` per requirement 8 (yield `ChatRunContext` and `CurrentUser` in both handlers, pass `ctx.campaignId` to repo calls, do **not** change the `Layer.Layer<...>` signature).
- Update `packages/server/src/api/chat/chat-run-manager.ts` per requirement 9: add the `Effect.provideService(ChatRunContext, { campaignId: payload.chat.campaignId })` at the `processor.run` call site; clean up the dead `?? ""` on `payload.chat.campaignId` at line 97.
- Update test mocks in lockstep:
  - `packages/server/src/api/chat/chat-toolkit-live.test.ts`:
    - Update `MockNpcRepo.insert` to read `campaignId` from the input and return it on the response.
    - Update `MockNpcRepo.fetch` to take `(userId, campaignId, cursor)`.
    - Update `MockNpcRepo.findById` to take `(npcId, userId, campaignId)`.
    - **Remove** the `delete: () => Effect.void` mock at line 45 (the underlying `NpcRepo` no longer exposes `delete`).
    - Provide a `ChatRunContext` service in the test layer built from the existing `CampaignId` constant.
  - `packages/server/src/api/chat/chat-processor.test.ts`:
    - Update `MockNpcRepo.insert` (line 34-42) to accept `campaignId` in the input and return it; **remove** the stale `description` field that does not exist on `NpcModel`.
    - Update `MockNpcRepo.findById` to take `(npcId, userId, campaignId)`.
    - Remove the `delete: () => Effect.succeed(undefined)` mock at line 43.
    - Provide a `ChatRunContext` service in the test layer.
  - `packages/server/src/api/chat/chat-run-manager.test.ts`:
    - Update `MockNpcRepo.insert` (line 66-73) to accept `campaignId` in the input and return it.
    - Update `MockNpcRepo.fetch` to take `(userId, campaignId, cursor)`.
    - Update `MockNpcRepo.findById` to take `(npcId, userId, campaignId)`.
    - Remove the `delete: () => Effect.void` mock at line 82-83.
    - This test exercises the run manager (which provides `ChatRunContext` at the `processor.run` call site), so no extra `ChatRunContext` provision is needed at this layer.
  - `packages/server/src/api/chat/chat-rpc-live.test.ts`:
    - Update `MockNpcRepo.insert` (line 103-110) to accept `campaignId` in the input and return it.
    - Update `MockNpcRepo.fetch` to take `(userId, campaignId, cursor)`.
    - Update `MockNpcRepo.findById` to take `(npcId, userId, campaignId)`.
    - Remove the `delete: () => Effect.void` mock at line 119.
    - No `ChatRunContext` provision is needed at this layer — it goes through the run manager.
  - **Add a regression test** in `chat-toolkit-live.test.ts` that calls the `createNpc` tool handler with a known `ChatRunContext` and asserts the `NpcRepo.insert` mock received that `campaignId`. This is the only test that proves the spec's title is true; without it the change would be untested at the boundary that matters.
- Verify after this commit: `pnpm check`, `pnpm test` (all four chat test files + the new regression test).

### Unit 3 — `NpcRepo` integration tests

- New `packages/server/src/db/npc-repo.test.ts` mirroring the `ChatRepo` integration test style (`packages/server/src/db/chat-repo.test.ts:1-333`):
  - `insert` persists `campaignId` and returns it on the row.
  - `findById` returns the row when `(id, userId, campaignId)` all match.
  - `findById` fails when `campaignId` does not match.
  - `findById` fails when `userId` does not match.
  - `findById` fails for a non-existent id.
  - `fetch` returns only NPCs whose `campaignId` matches.
  - `fetch` does not return NPCs from other users even within the same campaign (this single test covers the user scoping in the SQL `WHERE` clause).
  - `fetch` cursor pagination excludes items at or after the cursor (mirrors `chat-repo.test.ts:156-183`).
- The `pg-test` harness in `chat-repo.test.ts:13-23` applies the `0006_*` migration automatically via `Migrator.fromGlob`.
- Verify: `pnpm test` for the new file.

### Unit 4 — `NpcRpc` integration tests

- New `packages/server/src/api/npcs-rpc-live.test.ts` mirroring the `ChatRpc` test style (`packages/server/src/api/chat/chat-rpc-live.test.ts:191-447`):
  - `npc_list` returns only NPCs in the requested campaign.
  - `npc_list` fails with `CampaignNotFoundError` when the campaign is unknown to the user (use the `ensureOwnership` flow by returning a different `userId` from the mock).
  - `npc_get` returns the NPC when the id is in the campaign.
  - `npc_get` returns `NpcNotFoundError` when the id belongs to another campaign.
- The mock for `CampaignRepo` returns a `CampaignModel` matching the actual schema (`id`, `userId`, `title`, `createdAt`, `updatedAt`) — do **not** propagate the stale `defaultChatId` field seen in `chat-rpc-live.test.ts:122-134` and `campaigns-rpc-live.test.ts:32`.
- Verify: `pnpm test`.

### Unit 5 — Client restructure (api + atoms + new routes + deleted routes + regen)

This unit combines the api/atom update with the route move because the new `-lib` files reference each other, the old `-lib` files are imported by the old route files, and `routeTree.gen.ts` must be regenerated in the same change. The new files cannot land first (the route files would import from a directory that does not yet exist), and the old files cannot be deleted first (the route files would dangle).

- Delete `packages/client/src/routes/npcs/index.tsx`, `packages/client/src/routes/npcs/$npcId/index.tsx`, and the `packages/client/src/routes/npcs/-lib/` directory.
- Create the new client files under `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/` per requirement 12:
  - `npcs-api.ts` (new `NpcApi` with `npcList({ campaignId, cursor })` and `npcGet({ campaignId, npcId })`).
  - `npcs-atoms.ts` (`npcListFamily(campaignId)` and `npcDataFamily({ campaignId, npcId })`).
  - `npc-list.tsx` (list view; preserves `Atom.refreshOnWindowFocus` and the `useEffect → refreshNpcList` behavior).
  - `npc-detail.tsx` (detail view; ports the simple `npc.value.title` render from the old `routes/npcs/$npcId/index.tsx:28-34`).
- Create the new route files per requirement 11:
  - `packages/client/src/routes/campaigns/$campaignId/npcs/index.tsx` using `createFileRoute("/campaigns/$campaignId/npcs/")`.
  - `packages/client/src/routes/campaigns/$campaignId/npcs/$npcId.tsx` using `createFileRoute("/campaigns/$campaignId/npcs/$npcId")`.
- Update `packages/client/src/components/app-sidebar.tsx`: remove the `npcListAtom` import (line 20) and the NPCs `<Link>` block (lines 67-75).
- Update `packages/client/src/routes/campaigns/-lib/campaign-page.tsx` per requirement 13: add `Link` to the `@tanstack/react-router` import on line 5, wrap the "NPCs" `OverviewCard` in a `<Link to="/campaigns/$campaignId/npcs" params={{ campaignId: campaign.value.id }}>`. **Do not** touch the other `OverviewCard`s.
- Regenerate `packages/client/src/routeTree.gen.ts` per requirement 14: run `pnpm dev:client` once, let the generator rewrite the file, stop the server, commit the regenerated file. Old `/npcs` paths in the file are removed automatically.
- Verify: `pnpm check`, `pnpm test`.

### Unit 6 — Final validation

- `pnpm check` (dprint, oxlint, tsc -b).
- `pnpm test` (vitest run).
- Manually exercise the local dev path: create a campaign, ask the AI to create an NPC inside a chat, then visit `/campaigns/$campaignId/npcs` and confirm the NPC is listed. The dev scripts are `pnpm dev:server` + `pnpm dev:client`.

## Open follow-ups (out of scope, called out so we don't lose them)

- `npc_create` RPC + UI form, gated on `Campaign Update Proposals` (CONTEXT.md:27-29). Future iteration.
- A "delete NPC" RPC and matching UI affordance. Not requested; only added when Campaign Update Proposals are wired.
- Cross-campaign NPC browser (e.g., for shared NPCs across campaigns). The resolved rule says "must not leak across campaigns" (CONTEXT.md:51), so this is a non-goal forever unless the domain model changes.
- NPC fields beyond `title` (description, stats, secrets). Tracked separately; out of scope here.
- Making the other `OverviewCard`s on the campaign overview page (`Conversations`, `Campaign Notes`, `Pending Updates`) navigable. Tracked separately; out of scope here.
- Fixing the pre-existing type-incorrect `campaignRepo.findById(id, userId)` call sites in `chat-rpc-live.ts:33, 77, 89`. Tracked separately; out of scope here.
- Improving the `// TODO: There has to be a better way to do this.` pattern at `packages/client/src/routes/npcs/-lib/npc-list.tsx:14`. Tracked separately; the existing behavior is preserved verbatim in the new `npc-list.tsx`.
