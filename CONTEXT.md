# Tiny Taverns

Tiny Taverns is a dungeon master's sidekick for managing campaign knowledge and assisting during play.

## Language

**Campaign**:
A bounded tabletop game world that owns the play history, notes, NPCs, and play assistance for one ongoing game.
_Avoid_: Workspace, notebook, global chat

**Assistant Conversation**:
A focused exchange with the assistant inside a Campaign.
_Avoid_: Global chat, campaign

**Campaign Session**:
One planned or completed play sitting within a Campaign, with an optional canonical recap of what happened.
_Avoid_: Chat, note, recap

**NPC**:
A narrative non-player character that exists within exactly one Campaign.
_Avoid_: Global character, user-level NPC

**Campaign Note**:
A piece of written campaign knowledge that belongs to a Campaign.
_Avoid_: Global note, memory, lore entry

**Campaign Update Proposal**:
A suggested change to campaign knowledge that must be confirmed by the DM before it becomes durable.
_Avoid_: Automatic memory, direct assistant write

## Relationships

- A **Campaign** is the primary boundary for campaign-specific knowledge and assistance.
- A **Campaign** owns many **Assistant Conversations**.
- Every **Assistant Conversation** belongs to exactly one **Campaign**.
- A **Campaign** owns many **Campaign Sessions**.
- A **Campaign Session** belongs to exactly one **Campaign**.
- A **Campaign Session** may have linked **Campaign Notes** for prep, raw notes, and detailed records.
- A **Campaign** owns many **NPCs**.
- Every **NPC** belongs to exactly one **Campaign**.
- A **Campaign** owns many **Campaign Notes**.
- A **Campaign Note** may relate to a **Campaign Session**, an **NPC**, or other campaign concepts.
- An **Assistant Conversation** may use relevant **Campaign Notes**, **Campaign Sessions**, and **NPCs** from its **Campaign**.
- An **Assistant Conversation** is working material until the DM confirms changes to **Campaign Notes**, **Campaign Sessions**, or **NPCs**.
- An **Assistant Conversation** may contain **Campaign Update Proposals** for the DM to confirm or reject.
- Confirmed campaign knowledge may retain provenance back to the **Campaign Update Proposal** and **Assistant Conversation** that produced it.

## Example Dialogue

> **Dev:** "Should an NPC created in one campaign appear when the assistant answers questions in another campaign?"
> **Domain expert:** "No — NPCs belong to a **Campaign**, and campaign context must not leak across campaigns."
>
> **Dev:** "If I prep a session, run combat in chat, and write a recap afterward, are those three different sessions?"
> **Domain expert:** "No — they can all relate to the same **Campaign Session**."
>
> **Dev:** "Does every note need to be attached to a specific session?"
> **Domain expert:** "No — a **Campaign Note** can describe cross-session knowledge like house rules, factions, locations, or unresolved mysteries."
>
> **Dev:** "Can the assistant use notes from another campaign if they seem relevant?"
> **Domain expert:** "No — assistant context is scoped to the current **Campaign**."
>
> **Dev:** "If I brainstorm a villain twist in an assistant conversation, is it automatically campaign history?"
> **Domain expert:** "No — an **Assistant Conversation** is working material until the DM confirms what becomes campaign knowledge."
>
> **Dev:** "If the assistant suggests adding an NPC, is that NPC saved immediately?"
> **Domain expert:** "No — the assistant creates a **Campaign Update Proposal**, and the DM confirms it before the NPC becomes campaign knowledge."

## Flagged Ambiguities

- "Chat" is currently implemented as the main interaction surface, but the resolved domain boundary is **Campaign**.
- "Chat" is the current implementation term for **Assistant Conversation**.
- NPCs are currently implemented as user-scoped, but the resolved domain rule is campaign-scoped.
- Combat assistance is expected, but first-class Encounter or Combat tracking is deferred; for now, combat support happens through **Assistant Conversations** and confirmed campaign updates.
