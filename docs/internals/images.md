# Images: what Hob draws, once

Hob draws a picture of some of the things people make: a character's portrait, a campaign's cover and a Shared World's cover. All three follow the captain's rules for character portraits: drawn automatically once after creation, started only by the thing's owner, no redraw and no upload, one house style, and anyone who can see the thing sees its picture. The provider is chosen by environment variables, and files sit behind the provider-neutral storage adapter ([Storage](storage.md)).

NPCs are the next kind. Creatures, items and feats are deliberately not drawn.

## One capability, a table of kinds

A kind is one entry in `apps/server/src/images/kinds.ts`. The entry records only what differs between kinds: the record table, the storage root, the signing tag and route, the size requested, the WebP variants and the crop anchor. Everything else is shared across kinds:

- **The worker**, `images/HobImages.ts`. It has one `FiberSet`, one `Semaphore` of `PORTRAIT_CONCURRENCY`, and one 150 s job timeout. At boot and then every minute it sweeps stale `generating` rows of every kind to `interrupted` and drains the deletion outbox ([Server](server.md), _The background worker_).
- **The records**, `repo/Images.ts` (`ImageRecords`). `start`, `store`, `fail`, the sweep and `readyPrefix` take a kind. `OWNED_SUBJECT` is the per-kind statement that finds the subject for this actor and names the account to bill. A kind missing from it does not compile.
- **The signer**, `images/ImageUrls.ts`: one HMAC scheme and one bucketed expiry for every kind, with the kind's tag inside the signature ([Server](server.md), _The signed image routes_).
- **The daily budget.** `PORTRAIT_ACCOUNT_DAILY_LIMIT` and `PORTRAIT_DAILY_LIMIT` count rows across every kind's table together, under one advisory lock. A draw costs the same whatever it depicts, so a budget per kind would only multiply what one account can spend. Skipped and capped rows spend nothing.
- **The house style**, `packages/api/src/HouseStyle.ts`. One palette and one set of rules, framed two ways: `HOUSE_PORTRAIT_STYLE` for a bust on a plate and `HOUSE_COVER_STYLE` for a wide scene. Each kind has its own pure prompt builder in `packages/api`: `portraitPromptFor` (`Portrait.ts`), `campaignImagePromptFor` (`CampaignImage.ts`) and `sharedWorldImagePromptFor` (`SharedWorldImage.ts`). A cover reads only the subject's own member-visible words: a campaign's name and party name, a world's name. Each builder has a `…HasSubject` guard. A subject with nothing to draw from is recorded `failed/skipped`, and no request is sent.

The `PORTRAIT_*` environment variables keep the names they had when portraits were the only kind, and they govern every kind.

### A table per kind, not one polymorphic table

`character_portrait` (`0048`), `campaign_image` (`0049`) and `shared_world_image` (`0050`) have the same columns and shape checks and differ only in their subject. Each binds its subject with a non-null composite key: `(character_id, account_id)` references `character (id, account_id)`, `(campaign_id, account_id)` references `campaign (id, creator_account_id)`, and `(group_id, account_id)` references `play_group (id, owner_account_id)`. The key refuses an image of nothing, an image of two things, and an image billed to somebody who does not own its subject, and the subject's delete cascades exactly its own image. A single table would need a nullable column per kind, an exactly-one check and a `kind` column kept in step with them, and every new kind would widen a table that holds every existing row. Every table's deletion trigger runs the one function, `hob_image_enqueue_deletion`. Every table is in `NOT_CONTENT`: the subject answers who may see the picture.

### Adding a kind

1. Add a migration creating `<kind>_image` the way `0049_campaign_images.ts` does: a composite key to the subject and its owner, `unique` on the subject, the same shape checks, the three indexes, and the trigger on `hob_image_enqueue_deletion()`.
2. Add an entry to `IMAGE_KINDS`, with a new `tag` and `route`, and an entry to `OWNED_SUBJECT`.
3. Add a pure prompt builder and its `…HasSubject` guard to `packages/api`.
4. Add a `draw<Kind>` entry point on `HobImages`, and call it after the commit from every handler that makes the subject.
5. Add an endpoint to the `images` group in `packages/api/src/Api.ts` at the kind's route, and a handler line in `ImagesLive`.
6. Add image columns and a signer beside the subject's mapper, the way `campaignImageColumns` and `campaignImageSigner` sit beside `toCampaign`. Every read that maps the subject selects them. If the repository is also held bare by Hob, wire the handlers' copy as `Layer.fresh(…)` with `imageUrls` in `app.ts`.
7. Add the new table to `NOT_CONTENT` and to the table lists in `membership.test.ts` and `migrations.test.ts`.

## The trigger: after the create commits

Each kind's `draw…` is called by every handler that makes the subject, **after** its transaction commits. It is not called from inside the repository method, because the job must find a committed row, and Hob's accept wraps `createOwn` in a transaction of its own. The request does not wait. The subject comes back with `portraitPending` or `imagePending` set when a draw started. The call never fails: a picture is not worth failing a create for.

- **Characters**: the form's `POST /me/campaigns/:c/characters` and Hob's accept (`HobLive`).
- **Campaigns**: `POST /campaigns` and `POST /worlds/:worldId/campaigns`. No Hob path drafts a campaign. Only the creator can start the draw: `OWNED_SUBJECT.campaign` is `campaignWritable`, so a player, a Shared World member or a stranger starts nothing.
- **Shared Worlds**: `POST /worlds`, and `POST /campaigns/:campaignId/shared-world`, which promotes a standalone campaign's hidden context into a world. Connect, move and disconnect make no world, so they draw nothing. No Hob path makes a world. Only the owner can start the draw: `OWNED_SUBJECT.sharedWorld` is `groupWritable`, which also requires `is_shared_world`, so a member, a stranger, or the owner of a still-hidden context starts nothing.

A new way of making the subject must call its `draw…` too.

## Visibility is the subject's

The wire carries an image only as a field of its subject: `Character.portrait` / `portraitPending`, `Campaign.image` / `imagePending`, and `SharedWorld.image` / `imagePending`. Each image is minted as signed paths only inside a read whose own SQL already returned the subject.

- **Characters**: see [Characters](characters.md), _The portrait_. That page also covers the rows that only point at a character: combatants, the recap and the player table.
- **Campaigns**: every read that maps a `Campaign` selects `campaignImageColumns` beside it. These are `Campaigns` (list, findById, both creates, update, archive, restore, disconnect) and `Memberships.mine` (`GET /me/campaigns` and the archived shelf). `toCampaign` throws on a row without them. So a creator always sees the cover, a player sees it exactly when the campaign is `shared`, and a stranger sees nothing. **The Shared World directory card (`SharedWorldCampaignCard`) carries no cover.** A world member who does not play at a campaign sees its name there and not its content, and the cover is content. `campaign-images.test.ts` covers both sides.
- **Shared Worlds**: every read that maps a `SharedWorld` selects `sharedWorldImageColumns` beside it, and `toGroup` (`repo/Groups.ts`) throws on a row without them. These are `Groups` list, archived shelf, findById, create, promote, connect, move, update, archive and restore. A world's reads are `groupReadable` (every live member) or `groupWritable` (the owner), so every member sees the cover, whether or not they play at any of its tables, and a stranger sees nothing. **The name-only references to a world carry no cover**: the `{ id, name }` on a `GET /me/campaigns` row and the world's name on an invitation preview are pointers, and the preview's reader is not a member yet. That is the directory card's rule from the other side: a surface that only names a thing does not show its picture. `shared-world-images.test.ts` covers both sides.
- **Hob never holds a signed URL.** A signed URL is a bearer capability. The handlers' `Campaigns` and `Groups` are `Layer.fresh(…)` with the signer, and Hob's and the accept paths' copies stay bare, for the reason `Recap` is fresh ([Server](server.md), _The signed image routes_).

## The kinds' sizes

| Kind        | Asked for   | Variants (WebP)                                       | Crop anchor | Where it shows                                                                                                                    |
| ----------- | ----------- | ----------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| character   | `1024x1024` | `thumb` 160², `card` 640², `full` 1024²               | top         | plates on the card, sheet and list rows                                                                                           |
| campaign    | `1536x1024` | `card` 768 × 512, `full` 1536 × 1024 (the drawn size) | centre      | the head of a card on the campaign list (`card`), and a band above the creator's Overview and the player's campaign page (`full`) |
| sharedWorld | `1536x1024` | `card` 768 × 512, `full` 1536 × 1024 (the drawn size) | centre      | the head of a card on the Shared World list (`card`), and a band above the world's own screen (`full`)                            |

The original is always kept byte for byte beside the variants (`original.png`), so the provider's provenance credentials survive and sizes can be derived again later. Both OpenAI sizes are ones its image models accept. `sd-server` takes any size.

## Deleting and archiving

Deleting a subject cascades its image row. The row's trigger queues its `storage_prefix` in `storage_deletion` inside the deleting transaction, and the worker drains the queue. A draw stores its files only inside a transaction that holds the image row's lock, so a delete during a draw waits for the last put, and its queued deletion comes after that put. A failed or interrupted draw queues its prefix as well.

The product never deletes a campaign or a Shared World. It archives them, and archiving leaves the cover alone: an archived campaign or world keeps its cover on its archived shelf's reads, and restoring brings it back as it was. The one `play_group` delete the product makes removes a hidden context after its campaign connects elsewhere, and a hidden context never has a cover. If a campaign or world row is ever deleted, the cascade and the trigger clean up as described above.

## The web plates

Characters use `CharacterPortrait` ([Characters](characters.md), _The portrait_). Campaigns and Shared Worlds share one cover plate, `HobCover` (`apps/web/src/hob/HobCover.tsx`), because both kinds have the same variants. It has two shapes:

- `card`: the head of each card on the campaign list and on the Shared World list, bled to the card's edges.
- `band`: the top of the creator's Overview, of the player's campaign page, and of a Shared World's screen. It sits in the page, never in the sticky chrome rows.

The Shared World screen's campaign directory cards and the archived shelves show no cover.

Both shapes carry both sizes in `srcset`, with `sizes="auto, 100vw"`. The browser picks by the width it actually draws, so a wide card on a 2x screen loads the full size and a narrow band on a 1x screen loads the card size.

When there is no cover, the plate renders nothing, so the screen looks as it did before covers existed; there is no placeholder art. A URL that fails to load collapses the plate the same way. While `imagePending`, the plate holds a band on the sunken surface that says _Hob is drawing…_. Pending screens re-read through `useHobDrawingPolling` (`apps/web/src/hob/drawingPolling.ts`, the same hook the character screens use): every two seconds for up to three minutes. The Overview invalidates `reads.campaign` and `reads.myCampaigns`, and a Shared World's screen invalidates `reads.sharedWorld` and `reads.mySharedWorlds`, so the list is current when the owner goes back to it.
