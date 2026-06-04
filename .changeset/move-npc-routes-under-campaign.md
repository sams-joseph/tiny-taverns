---
"@app/client": minor
---

Move NPC client routes from `/npcs` to `/campaigns/$campaignId/npcs`. The "NPCs" card on the campaign overview page is now a navigable link. The standalone `/npcs` routes and the sidebar NPCs link (already removed by the previous TIN-23 tsc-fix commit) stay removed.
