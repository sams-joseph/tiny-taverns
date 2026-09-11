# Internals

Architectural decisions and their reasons, constraints that span packages, and traps that are hard to discover from the source. `AGENTS.md` at the repo root is the short version every session reads; these pages are where it points.

Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the relevant file answers the question, leave it out. When a decision changes, rewrite the affected text in place; do not append a dated second account.

- [Glossary](glossary.md): the words the product and the code use, with the persistence names where they differ.
- [Visibility](visibility.md): the actor, SQL predicates, `NotFound`, the creator proof, the provenance tail, invitations as credentials, the three-owner rule.
- [Shared Worlds](shared-worlds.md): backing contexts, Shared Worlds, membership as eligibility, context moves, the Chronicle and Story So Far, Library shares.
- [Data model](data-model.md): columns versus the document, generated columns, composite and deferred keys, search, beats, the migration ledger, database tests.
- [Characters](characters.md): the character row and its seats, vitals write-through, what a player may write, the two creation paths and `sheetGrantsFor`, gear, actions and resources.
- [Corpora](corpora.md): the bundled 2014 corpora, the Library, import commands and order, point-of-use instancing, options and the other corpus tables.
- [Live session](live-session.md): write-through live state, the doorbell, the SSE reconnect contract, finishing and carrying a fight, the recap and its player projection, the player live table.
- [Hob](hob.md): tools not context, the round loop, proposals and the accept path, threads and toolkits per caller, configuration, diagnosing a model that will not call a tool, the NPC agent.
- [Server](server.md): Effect v4, module resolution, listener ordering, the contract package and its `dist`, pagination, authentication, env files.
- [Web data](web-data.md): reads as atoms, keys and invalidation, mutations, the credential seam, the runner's atoms and stream hook, test harness traps.
- [Web screens](web-screens.md): routing on a hash history, the shell and the creator/player relation, the signed-out gate, screen shape, authoring traps, the filter input standard, the Chronicle and sheet rules.
- [Design system](design-system.md): tokens as the source of truth, the read-only package, the Tailwind bridge, layering, motion, shadcn on Base UI.
