---
"@app/server": patch
---

Add integration tests for the campaign-scoped `npc_list` and `npc_get` RPC handlers. Locks down the cross-campaign and cross-user error paths in `packages/server/src/api/npcs-rpc-live.test.ts`, mirroring the chat-rpc-live test suite.
