---
"@app/client": patch
---

Fix the NPC detail error-state copy in `packages/client/src/routes/campaigns/$campaignId/npcs/-lib/npc-detail.tsx` from "Failed to load Campaign" to "Failed to load NPC". This was a pre-existing copy/paste bug carried forward from the old `/npcs/$npcId` route.
