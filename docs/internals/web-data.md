# Web data: reads, writes, the credential seam, and the runner

How `apps/web` reads and writes: the atom read path, the invalidation vocabulary, `useMutation`, how a credential reaches a request, the runner's live state and stream hook, and the test harness traps. For anyone adding a screen, a write, or a live surface. Routing, the shell and form layout are in [Web screens](web-screens.md); the server side of the stream is in [Live session](live-session.md).

## Reads are atoms

`apps/web/src/api/atoms.ts` is the one way a screen reads. `apiAtom(use, answers)` wraps an endpoint call in an `AsyncResult` atom over `@effect/atom-react`; `useApiAtom` turns it into the three-state `Resource` that `ui/states.tsx` renders. There is no hook-and-`useState` idiom to copy, and none may be introduced.

**Build the atom with `Atom.family` at module scope, keyed on what the read closes over.** An atom is identified by object identity, so one built inside a component is a new atom every render and the symptom is an infinite render loop. A family also shares the read: two components naming one key make one request. Record keys work because Effect's `Equal`/`Hash` are structural for plain objects and arrays; `api/atoms.test.tsx` pins it because a regression would hang a screen rather than fail a type. Keep keys to primitives: a function or class instance in a key is hashed every render and puts the loop back.

**The atom service class is module-local and must stay so.** `AtomHttpApi.Service` over the whole `TavernsApi` produces a type `tsc` cannot serialise across a module boundary (TS7056), and the annotation it asks for is not writable. `atoms.ts` exports only the narrow things built from it.

**`useApiAtom` memoises its `Resource` on the `AsyncResult`.** `toResource` allocates; without the memo a screen's `useEffect(…, [resource])` re-runs every render, and one that sets state to a fresh value (`bestiary/corpus.ts`'s `setExtra([])`) is an infinite loop.

## Failures, defects and interrupts

`api/failure.ts` is the only taxonomy (`unauthorized`, `missing`, `conflict`, `unavailable`, `rate-limited`, `invalid`, `unreachable`, `unknown`), matched on `_tag`, never a status code. `runApi` in `api/client.ts` rejects and is for the Server panel's buttons; everything else uses `runApiResult`, because a rejected promise throws away the typed error the contract declared.

- **`AtomHttpApi` turns a `SchemaError` and an `HttpClientError` into defects** (`catchErrors` in its source), so `invalid` and `unreachable` arrive as `Die`, not `Fail`. `failureFromCause` uses `Cause.squash`, which reads both; a classifier over `Cause.failures` alone renders the two commonest failures as "unknown".
- **An interrupted read is loading, not a failure.** `toResource` checks `Cause.hasInterruptsOnly` and maps it to `loading`, or back to the previous value.
- A `Failure` with a `previousSuccess` still renders `failed` in `useApiAtom`; the runner makes a different call (below).

## The credential seam

A token is fetched immediately before each call and never held, because hosted session tokens live 60 seconds. `auth/credential.ts`'s `credentialFrom` is the single statement of which credential wins (hosted session, then the machine token in `localStorage`), used by both the `useCredential` hook and the module-level `fetchCredential`.

The atom client layer is built outside React, so `auth/credential.ts` publishes the **`HostedSession`**, never a token; a slot holding a token would be the held credential the rule forbids. `api/atoms.ts` resolves a credential per request in `HttpClient.mapRequestEffect`, so one load mints as many tokens as it makes calls; `campaign/CampaignScreen.test.tsx` counts mints against requests rather than a literal.

- **`HostedSessionScope` (`auth/AuthProvider.tsx`) publishes during render.** An atom's first read happens while a component renders, so a publish in any effect is too late. The value is derived, so publishing every render is idempotent.
- **The slot defaults to `NO_HOSTED_SESSION`, the same value `HostedSessionContext` defaults to**, so with no provider both readers resolve the machine token and agree.
- **A fixture for a screen that reads through atoms wraps in `HostedSessionScope`, not the raw `HostedSessionContext`**, or React and the atom layer disagree about who is signed in. (`ServerPanel.test.tsx` and `SignedOutGate.test.tsx` use the raw context; neither reads through an atom.)

## Keys: writes name what they changed

`api/keys.ts` is the whole vocabulary a write has for what it changed and a read for what it answers. `Atom.withReactivity` registers an atom's refresh against its keys; `useInvalidate` fires them, and `Mutation.submit` is its only caller. Three things are structural:

- **`apiAtom` and `submit` take the key list as a required argument.** `[]` is a visible answer, not a silence.
- **Keys are functions over ids** (`reads.notes(campaignId)`), scoped by the owning id, so a write at one campaign cannot refresh another's; `api/invalidation.test.tsx` pins that, and that a refused write refreshes nothing.
- **`CampaignChromeSlots` has no `reload`.** The one read-everything-again left is the frame's _Try again_, spelled as `campaignViewKeys`.

**The rule for a new write: ask what it changes that is not in its own response.** The instances in the product: a roster line moves `Encounter.creatureCount` (computed per read), so it names `reads.encounters`; a note's attachment moves a count on an encounter card, so a note write refreshes the notes; a player's own sheet moves the party list at every seat (`characters/write.ts`'s `ownCharacterWrites`); a combatant's `conditions` is written through to the character (`run/load.ts`'s `combatantWrites` names `reads.party`). Prefer over-naming: a key nobody listens on costs nothing.

Four facts the library does not advertise:

- **`Atom.withReactivity` and the invalidator must resolve one `Reactivity` instance.** They do because `Atom.runtime` memoises `Reactivity.layer` in the default memo map `AtomHttpApi.Service` also builds from. A bump splitting them would compile and every write would silently stop refreshing reads; `api/invalidation.test.tsx` asserts it.
- **A derived atom cannot be refreshed**: `registry.refresh` re-runs its read against the same cached parts. Invalidate the parts' keys, or give `Atom.readable` its second argument, a refresh callback naming the parts (`party/load.ts`, `run/load.ts`).
- **`AsyncResult.all` alone blanks a screen when a key changes**, since a never-read part is `Initial`. `combine` in `atoms.ts` keeps the last whole while a part assembles; a failure still passes through.
- **`AtomHttpApi`'s own `mutation` is not used.** It is one atom per endpoint, so it cannot express a save touching two tables and would share busy state between dialogs.

## Writes: `useMutation`

`api/mutation.ts` is the write side. A read runs because its inputs changed; a write runs because somebody clicked, so the `Effect` is handed to `submit` at call time and no memoisation applies. Backwards is how a form saves on every render.

- `submit` resolves a `Result`, not `A | undefined`: a `delete` succeeds with `void`, and a dialog must not close on a failure it never noticed.
- **Invalidation fires only on success.**
- A form that writes two tables composes one `Effect` into one `submit` (`campaign/EncounterDialog.tsx`). There is no transaction across requests; a mid-way failure leaves the first write standing, which is the honest outcome.
- **Only a single boolean is optimistic.** The prep tick (`campaign/PrepChecklist.tsx`) moves before the round trip, reverts on failure, bypasses `submit` and names no reads, because a refresh would fight the answer it already rendered. Everything that changes a list's shape waits, then names the resource.
- Busy, failure and the awaited promise stay React state: form state is not shared, and two writes through one atom would resolve to each other's answer.

## The campaign view: several atoms, one value

`campaign/load.ts` splits a read only where a write wants to refresh part of it: `campaignViewAtom` is eight atoms (five campaign-keyed, three night-keyed on the session id) assembled in one `Atom.readable` through `combine`, so a destination renders three states while adding a checklist line refreshes the checklist alone. `combine` is what stops the screen blanking when a night opens and three atoms keyed on a new session id come into being. Most screens are one atom over one composed `Effect`, because every write on them changes all of it.

## The runner

`run/load.ts` cuts the fight along what a hit changes: `runFrameAtom` (campaign, night, stat blocks; read once), `liveStateAtom` (run, combatants, Hob's audit rows; refreshed by the doorbell), and `runViewAtom`, derived from both with a refresh callback naming both.

**`liveStateAtom` is the product's only writable read** (`writableApiAtom`). The runner learns what it just did from its own write's answer, which keeps it usable with the connection down; before the atom was writable that answer lived in a second `useState` copy of the fight, and two copies could disagree. The write is the whole `AsyncResult`, because `useAtomSet` treats a function argument as a functional update: `set((current) => AsyncResult.map(current, edit))`, which carries the edit into a failure's previous success too.

**A failure with a previous success is a staleness banner, not an error card.** `runViewAtom` contributes the previous success; a failure with none is the first load failing.

Three things stay in React in `run/state.ts`:

- **The doorbell's coalescer.** `useAtomRefresh` interrupts the read in flight and starts another, so six events in one chunk would be six abandoned round trips. `refresh` collapses them to one plus one queued, over `AsyncResult.waiting`.
- **The retry on a failed re-read** (500 ms doubling to 5 s). An atom does not retry, and an established stream keeps delivering while a new `fetch` cannot leave. **The counter is raised once per distinct `AsyncResult`, not per effect run**: `main.tsx` mounts in `StrictMode`, which runs effects twice in development, so a bare `+= 1` climbs backoff at double speed. Any ref counter incremented from an effect has this trap.
- **The pending map** of this browser's unanswered writes: form state, and an optimistic value must not outlive the mount.

`Atom.optimistic` does not fit: it settles by refreshing the source atom (an extra re-read per hit, a failing one with the stream down) and has no per-row pending flag.

**Hit points are optimistic; the turn marker is not.** Damage renders the pending absolute value, not a delta on the server's row (a delta double-counts between the server applying the hit and the response landing); only the runner's own last response clears it, and a failure clears it with nothing to replace it plus a toast. This is sound because the endpoint takes a **delta**, so a hit computed from a stale row still applies the right amount. Whose turn it is gets read aloud, so it waits. Every write uses its own answer; the doorbell keeps a second tab honest. `run/optimistic.test.tsx` pins the rules.

### The connection stays a hook

`run/stream.ts`'s `useLiveStream` must not be turned into an atom. `Atom.make` over a `Stream` keeps `Arr.lastNonEmpty` of each pulled chunk, so three rows arriving together (a reconnect replay) reach an atom as one, and every event is a log row; `stream.test.ts`'s last test pins it. A refresh is also how an atom reopens, and its read starts from the top, so the cursor would reset.

- The cursor lives in a `useRef` and every attempt opens with `?since=<cursor>` (a plain `fetch` does not resend `Last-Event-ID`). Heartbeats carry no `id` and must not move it.
- `onReconnected` fires on every connection after the first, so the rows are re-read too; resuming the log alone leaves a client that missed a re-read quietly behind.
- `SILENCE_MS` (45 s) is paired with the server's `LIVE_HEARTBEAT_SECONDS` (default 20); a heartbeat above 45 s makes every healthy connection reconnect on a timer.
- The loop uses `Effect.result`, never `Effect.exit`, so React's cleanup interrupt unwinds it rather than being retried; `Effect.catchDefect` turns defects into failures so one cannot leave the screen silently stale. `strikes` grows only for attempts that heard nothing, so a long-lived connection restarts backoff from the top (`[250 ms … 30 s]`).
- The event's `payload` is never applied; the screen re-reads the rows.

## Test harness traps

`@effect/atom-react`'s `RegistryContext` defaults to a **module-level** registry, so atoms read with no provider share one cache across every test in a file and across files in one worker: the second test passes on the first test's data, silently and green. `Atom.family` memoises atoms globally by key, which is what lets the leak reach that far. `test/renderRoute.tsx` and `main.tsx` both render an explicit `RegistryProvider`. Expect `defaultIdleTTL` of 400 ms and a delayed registry dispose on provider unmount.

## Measuring the live surface

jsdom sees none of this. Over CDP, `Network.emulateNetworkConditions {offline: true}` blocks new requests but does not kill an established socket: right for a failing re-read, wrong for the silence watchdog. For that, `SIGSTOP` the server; the socket stays open and heartbeats stop, which is a sleeping peer. Chromium reports the CORS preflight as a second `requestWillBeSent` for the same URL, so two `/events?since=0` lines are one connection.
