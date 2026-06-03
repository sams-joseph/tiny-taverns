# Specifications

This directory holds feature specifications for Tiny Taverns. Each spec
describes the problem, the goals, the design, and a small, atomic
implementation plan.

## Index

- [`campaign-scoped-npcs.md`](./campaign-scoped-npcs.md) — Move NPCs from
  user-scoped to campaign-scoped. Every NPC belongs to exactly one
  **Campaign** (and retains its `userId` as the creator). NPCs use required
  `name` and optional `description`, and the UI moves under
  `/campaigns/$campaignId/npcs` with create / list / view / edit (no delete).
