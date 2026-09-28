# Glossary

Shared vocabulary for the product and the code. Public contracts and the web use the product words; the database and repositories sometimes keep older persistence names, which are listed beside the product word where they differ. This is a vocabulary, not a feature index.

## People and reach

- **maintainer**: the person building Tiny Taverns. Older docs and decision records call them "the captain".
- **account**: one signed-in identity (`account`), reached by a hosted session (the browser) or a machine token (tests and scripts). It carries no role anywhere. `apps/server/src/Accounts.ts`.
- **actor**: `{ accountId, scope }` resolved by `Authorization` for one request. `scope` is the credential's reach (the whole account, one Shared World, or one campaign), never a role. `packages/api/src/Actor.ts`.
- **creator**: the account that created a campaign (`campaign.creator_account_id`) and is its sole DM. Creator-ness is a fact about a pair, proven per request by `CampaignCreatorActor` (`apps/server/src/repo/CreatorActor.ts`).
- **member / participant**: an account with a live `campaign_member` row, which is what reaches campaign content. Membership is participation at a table; eligibility for it comes from the backing context.
- **player**: a member of a campaign who is not its creator. The web derives `relation: "creator" | "player"` per campaign from `GET /me/campaigns`.
- **proof**: a branded value that a repository method takes instead of a campaign id, minted by one read. Today that is `CampaignCreatorActor`.

## Containers

- **campaign**: the table: encounters, notes, sessions, seats, threads. Every campaign has a hidden **backing context**.
- **backing context** (`contextId`): the `play_group` row behind a campaign. Ordinary campaign work never navigates or owns it; it exists so membership can chain owner → member → creator → participant → seat.
- **Shared World**: an explicit `play_group` (`is_shared_world = true`) that several campaigns can connect to. Public contracts say `SharedWorld*`, `worldId`, `worldSeq`; persistence still says `group_*`, `Groups`. There is no `/groups` URL. See [shared-worlds.md](shared-worlds.md).
- **world owner**: `play_group.owner_account_id`. Owns the Shared World, not the campaigns in it.
- **invitation**: a single-use, expiring credential minted by a campaign's creator that grants a campaign seat on redemption (`CampaignInvite`, persisted as `group_invite`). Not a way in by itself.
- **Chronicle**: the Shared World's history: entries admitted on purpose in one acceptance order (`group_history_entry`), plus the accepted **Story So Far** summary (`group_history_summary`). Also the name of the per-campaign screen that draws recaps.

## Play

- **session / night**: one evening of play (`session`). Opening a night is separate from putting a fight on the table. The campaign points at its current session; a finished session can never be current.
- **encounter**: a reusable template for a scene (`encounter`): name, **kind** (combat, social, challenge or hazard), tags and a roster. Its difficulty is computed from the roster and the seated party on every read, never stored. Hard-deleted; running it never changes it.
- **encounter prep**: an encounter's tactics, treasure, the DM's Ready and, for a challenge or a hazard, the numbers it is run by (`encounter_prep`, one per encounter, made with it; `EncounterPrep` on the wire). The creator's alone, read through `encounterPrep.*`. Not `prep_item`, which is a night's checklist.
- **battle map**: an encounter's board (`battle_map`, one per encounter, made with it): a square grid or none, a size in squares, feet per square and where the grid sits on the picture, plus the one picture Hob drew from its **setting** line. The creator's alone. `apps/server/src/repo/BattleMaps.ts`. A fight keeps its own copy of the grid, its **board** (`encounter_run_board`), which reaches the players' live table only while the DM has turned on _Share map_.
- **run / fight**: one encounter on the table during a session (`encounter_run`). Exactly one live run per session. A fight that outlives its night continues as a second run linked by `continued_from`. An encounter is played once: `start` refuses one that has any run, and continuing a carried fight or escalating a conversation is the same playthrough.
- **combatant**: a row in a run's initiative order, a snapshot of a character or creature at seed time. Hit points on a player character write through to the character.
- **doorbell**: the contentless fan-out `{ sessionId }` in `apps/server/src/live/LiveEvents.ts`. Clients re-read through the ordinary API when it rings; they never apply an event payload.
- **act**: a named run of a campaign's nights on the Chronicle (`campaign_act`, `CampaignAct` on the wire): a title and the number of the night it starts at, running to the night before the next act. The creator's to write; a player sees it once shared.
- **beat**: one line of prose the DM files against a night (`beat`). The non-combat half of the record.
- **recap**: a per-read assembly of a night from its runs, beats, notes and ticked prep. It has a DM shape and a narrower player shape on separate paths. The Chronicle reads every night at once through the same function (`GET …/chronicle`, `…/chronicle/player`). The one stored account of a night is the DM's own **summary** on the session (`Session.summary`), which Hob may draft and only the DM keeps; it is read above the recap, never instead of it.
- **story so far** (a campaign's): one `campaign_story` row per campaign, the story and the _Previously_ read to open the next night (`CampaignStory` on the wire). Hob drafts it (`proposeCampaignStory`) and the creator keeps it, or writes it by hand; it is the creator's until they share it. `afterSessionNumber` is the newest ended night it was written after, stamped by the server. Not the Shared World's **Story So Far**.
- **live table**: the player's projection of the fight in progress (`GET /campaigns/:c/table`), null when there is nothing a player may know.

## Characters and corpora

- **character**: account-owned, top-level, one copy of playable state (`character`). It has no `campaign_id`; campaign-scoped visibility lives on the seat. See [characters.md](characters.md).
- **seat**: a character's membership of a campaign's party (`campaign_character`): the join, display snapshots and campaign-scoped visibility. Never a state fork. There is no seat that exists before a character.
- **seat prep**: the DM's own **hook** and **secret** about the character in a seat (`campaign_character_prep`, written on first edit; `SeatPrep` on the wire). The creator's alone, read through `seatPrep.*`; never on `CampaignCharacter` or `Character`, which players read.
- **NPC prep**: the DM's attitude, status, whereabouts and first meeting for an NPC (`npc_prep`, written on first edit; `NpcPrep` on the wire, with the nights the NPC was at the table derived from its table chats). The creator's alone, read through `npcs.prepList`; never on `Npc` or `PlayerNpc`.
- **NPC sheet**: the character-style stats an NPC can carry (`npc_sheet`; `NpcSheet` on the wire): a character's identity columns plus an optional DM-set `cr` closed to the XP table's ratings, and a `SheetBody` document. The NPC is still not a `character` row. Its NPC's owner's alone: a campaign NPC's creator reads it through `npcs.sheets` / `npcs.sheet`, a Library original's owner through `library.npcSheets` / `npcSheet`, and a copy into a campaign takes the original's. Never on `Npc`, `PlayerNpc`, search or an NPC prompt.
- **sheet**: the `jsonb` document on the character row (`body`, `sheet` on the wire). Everything that nothing filters, sorts or seeds on lives there.
- **bundle**: the imported 2014 SRD and starter corpora: rows owned by nobody, `origin = 'system'`, written only by import commands.
- **core rules**: the bundle's shared rows alone (`coreRulesUsable`), the vocabulary of a character made with no campaign, and of any sheet whose character sits at no table (`characterVocabulary`).
- **Library**: an account's own originals of any copyable corpus (creatures, options, spells, equipment, magic items, feats, rule articles). Library rows are in no campaign.
- **instance**: the one campaign-owned copy the product still mints, inside `EncounterCreatures.create`, so a fight can track state. Enumerable by nothing and editable by nobody.
- **share**: an explicit grant of a Library original to a Shared World (`group_library_share`), which is how homebrew reaches a table's other members.
- **option**: a class, race (containing subraces) or background (`character_option`). The vocabulary the create form and Hob draft from.

## The assistant

- **Hob**: the assistant. Every fact it states arrives through a tool that is a shipped repository method. See [hob.md](hob.md).
- **thread / turn**: a saved conversation (`assistant_thread`, campaign or world scoped, optionally one account's own at a campaign, or one account's alone when drafting a character with no campaign) and its lines (`assistant_turn`).
- **proposal**: something Hob offered, stored on its turn. Not a row until a person accepts it. No create payload carries `origin`; accepted rows and the assistant's own turns are the only things that carry `'assistant'`.
- **toolkit**: the set of tools a model is shown for one request. There is a creator toolkit, a player drafting toolkit, a Shared World toolkit and an NPC toolkit; they are different sets, not one set narrowed.
- **NPC / Cast**: a campaign's structured non-player character (`npc`) and the screen that manages it. An NPC answers from its persona, explicit knowledge and approved memory, never from campaign-wide reads.
- **provenance**: the `origin` and `assistant_turn_id` columns every content table carries, plus pointer columns like `derived_from` and `equipmentId`. Provenance is never read through to grant reach.
