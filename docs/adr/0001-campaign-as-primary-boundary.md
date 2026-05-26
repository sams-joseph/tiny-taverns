# Campaign as Primary Boundary

Tiny Taverns uses **Campaign** as the primary domain boundary rather than making chats or user-level notebooks the root. A **Campaign** owns assistant conversations, campaign sessions, campaign notes, and NPCs so assistant context and campaign knowledge do not leak across unrelated tabletop games.

This intentionally moves the product away from the current chat-first and user-scoped NPC implementation. Chats become **Assistant Conversations** inside a campaign, NPCs are campaign-scoped, and first-class Encounter or Combat tracking is deferred until combat persistence becomes a concrete requirement.
