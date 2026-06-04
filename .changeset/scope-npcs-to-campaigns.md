---
"@app/server": minor
"@app/domain": minor
---

Scope NPCs to Campaigns end-to-end. The `npc` entity now requires a `campaignId` at the DB, repo, RPC, and AI-toolkit layers (matching the Chat boundary). Adds a `ChatRunContext` service that the run manager provides to the chat processor so `createNpc` / `fetchNpcs` write into the active chat's campaign. Resolves the flagged ambiguity in `CONTEXT.md:72` that NPCs were implemented as user-scoped.
