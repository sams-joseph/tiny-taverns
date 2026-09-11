# Web screens

Routing, the shell, the signed-out gate, the shape every screen copies, the authoring and filter conventions, and the traps in the Chronicle, the character sheet and the Hob panel. Read this before adding a route, a screen, a dialog or a filter box. Reads and writes are [Web data](web-data.md); tokens, layering and motion are [Design system](design-system.md).

## Routing: a hash history, and why

`apps/web/src/routes.tsx` is the whole route table and the one `createRouter`. It runs on `createHashHistory`, and that is not negotiable: `#/join/<token>` carries the invitation secret, and a browser never sends the fragment in a request line, a redirect or a `Referer`. A query string or path segment would put the token in every access log on the way. One route needing that is enough for the whole app.

- A bad id is a bad link, not a crash. Every branded id decodes in `params.parse`, which returns `false` for anything the product did not mint; the router rejects that candidate and keeps matching, and every legible level has a `$` splat child, so a truncated run link lands on its campaign. Do not throw: a throw becomes a `PathParamError` and a rendered apology.
- `remountDeps` is set on every route whose params name a different thing so nothing loaded for one survives into another. The campaign index deliberately has none; it is what everything else falls back to.
- A rendered `href` is `/#/…`. Imperative links go through `router.history.createHref(router.buildLocation(…).publicHref)` resolved against `location.href`. `buildLocation(…).href` is the route as the router sees it (`/join/<token>`); pasted after an origin it puts the secret in the path. `campaign/InviteDialog.tsx` is the one caller; `campaign/invites.test.tsx` pins both hosting shapes.
- `Link` spreads `aria-current="page"` on any prefix match and `activeProps={{}}` does not stop it. Nav items pass `activeOptions={{ exact: true }}` so the bar's own section rule decides what is lit (`navLinkProps` in `shell/AppShell.tsx`).
- In-page anchors are `<Link to="…" hash="…">`, never `href="#foo"`: under a hash history a bare fragment replaces the whole route. `scrollRestoration: true` performs the scroll.

Testing: `src/test/renderRoute.tsx`'s `renderAt(path)` renders the real tree at a real URL on a real hash history, a fresh router and `RegistryProvider` per render, and must be awaited because the first match resolves inside a `Suspense`. Screens are not mountable on their own. `shell/AppShell.test.tsx` enumerates `Record<RouteIds<typeof routeTree>, string | undefined>`, so a new route does not compile until it has a URL, splats included.

## The shell: two rows, one section

`shell/AppShell.tsx` draws a global row and a campaign row that exists exactly when the route names a campaign. Neither is sticky or on the layering scale; they sit above the scrolling column. The per-screen `TopBar` is sticky at `z-chrome` inside it, and `main` is a `@container`.

- "Nothing appears on both rows" is one value: `useSection()` in `shell/location.ts` answers a single `Section` and both rows ask it, so being inside a campaign and no global item being lit are the same fact.
- The campaign row wears `tabsTriggerVariants` (exported from `@taverns/ui` for this; do not copy the recipe); the global row is pills. An underline says which part of this campaign you are reading.
- Each row is its own `@container`: each runs out of room at a different width, and the question is whether this row fits.
- The campaign name gives way whole (`hidden` under the row's `@3xl`) and the chevron keeps `min-w-4` as a floor so the way home survives; its `aria-label` carries the name plus "home" for the state where the name is not drawn.
- The shell builds the way home from the route; a screen supplies `campaignName`, `campaignBadge` and `campaignActions` and nothing else. A screen composing its own row silently loses the badge and the action, which is why `campaign/campaignRow.test.tsx` reads the destinations out of the rendered row and visits each.

There is no global mode. Chrome derives from `useCampaignRelation` (`creator` or `player`, off the `GET /me/campaigns` row the campaign frame already holds), so one campaign URL renders creator chrome to its creator and participant chrome to a player. While the relation is unsettled the campaign row draws no items; a failed read falls back to `creator`, because a stranger seeing creator chrome over a `NotFound` discloses nothing while a player seeing it would. Ask Hob is absent for a player (`AskHobSlot`) because the docked panel's verbs are creator writes. A player's campaign row is the screens with player projections: Overview, Table, Chronicle.

## The signed-out gate and the sign-out marker

`marketing/SignedOutGate.tsx` is the root route's component. The gate is "no credential of any kind", not "no hosted session": hosted sign-in is opt-in and usually unconfigured in development, so a gate keyed on it alone would show the homepage to every developer. `useCredentialPresence` in `auth/credential.ts` answers `present | absent | unknown`; a configured provider reports `signedIn: false` while still deciding, and `unknown` renders neither page (an empty page-coloured frame) rather than flashing the homepage over the app. It cannot hang: a pasted machine token settles it without the vendor. The presence hook subscribes to the machine token with `useSyncExternalStore`, because `localStorage` fires no event for a write in its own tab and pasting a token changes which page the app is.

Signing out of the hosted provider forgets the machine token; there is no opt-out. `useSignOutForgetsMachineToken` cannot be keyed on `signedIn` being false (that is every load, before the vendor answers) and cannot be an in-memory ref (a hosted sign-out is a navigation, so a fresh instance never sees the transition). It arms `taverns.hosted-seen` in `localStorage` when a settled session is observed and spends it on the clear. Four guards, pinned in `auth/signOut.test.tsx`: `configured` returns first (a keyless build never touches storage), `loading` returns early, only a settled `signedIn === true` arms, and disarming is part of the clear so a marker cannot eat the next pasted token. It is a `useLayoutEffect` so the app never paints a frame over a dead credential. The vendor offers no sign-out seam that covers `<UserButton />`, which is how this app signs out; do not go looking for one.

Two routes are exempt, checked before the credential so neither waits on a vendor: `/join/$token`, which previews an invitation before anyone has an account, and `/gallery`, which holds the Server panel where the only credential a keyless build has is pasted. `renderAt` pastes a machine token by default because every screen sits behind the gate; pass `"none"` only for tests about the gate. `SignInSurface` checks `publishableKey()` as well as `configured`, because the vendor's chrome may only mount where the vendor's provider did.

## The shape every screen copies

- One `Resource` per screen with three states, and as many atoms underneath as writes want to refresh independently ([Web data](web-data.md)).
- Every campaign destination wears `campaign/CampaignChrome.tsx`: the name, the way home, the badge and the start/finish acts are facts about the campaign. A screen needing more passes an `extra` atom, combined with the view through `AsyncResult.all`, rather than opening a second resource; `CampaignChromeSlots` has no `reload`. A resource that re-runs per keystroke (the Chronicle's search) stays its own so it cannot blank the frame.
- `CampaignAct` computes the campaign's button once, asking the session and the run separately: a live run, no session, or a night open with nothing on the table. `view.run` is undefined in the last case too, which is what a two-way branch gets wrong. Opening and finishing a night go through `session/start.ts` and `session/finish.ts`; see [Live session](live-session.md).
- Do not render a field the API does not have; a stubbed `0` is worse than an absent line. Layout that depends on a column's width uses a container query, never a viewport breakpoint; there is none left in `apps/web/src`.
- `Button` rendering an `<a>` needs `nativeButton={false}`; the accessible role stays `button`, so a test finds a button and reads its `href`.
- jsdom here has no `localStorage` at all. Readers tolerate `undefined` (`storage()` in `auth/credential.ts`); a test that needs one installs it.
- Archiving is one column and the archived shelf is a second URL, not a query parameter. `apps/web` never re-filters `archivedAt`; the affordances are read off the membership's `relation`.

## Forms and authoring traps

`ui/form.tsx` and `campaign/EncounterDialog.tsx` are the worked examples. A form that writes two tables composes one `Effect`. Validate in the form as well as the contract: a payload the schema rejects never leaves the browser and arrives as the `invalid` tag, whose message is for whoever wrote the schema.

- `SaveFailure` renders in the `DialogFooter`, never at the end of the body: the body scrolls and a line below the fold is one nobody sees.
- `VisibilityField` is the only place a `dm`/`shared` control is written; off is `dm` and the payload says so. A child row the DM is not asked about omits the field so the column default applies.
- `Select.Value` renders the value, not a label; every `SelectValue` takes a function. Base UI's `Switch` puts its `id` on the hidden input, so drive the `role="switch"` span. A headless browser opens `Select` only by keyboard (ArrowDown, walk `[data-highlighted]`, Enter).
- `render()`'s return type is not nameable from an exported signature (TS2742 under pnpm's isolated layout); annotate shared helpers `: void`.
- Fixtures in `campaign/campaign.fixtures.tsx` are the JSON the server sends, never a `Partial<>`, so a renamed field fails a test rather than rendering `undefined`. `installStubServer()` is called once per file at module scope, for the `Context.Reference` reason in [Web data](web-data.md).
- A dialog is portalled to the body: a test whose `afterEach` wipes the body must call RTL's `cleanup()` first or React unmounts into nothing.

## Tabs, and the filter input standard

Tabs go on their own row below the header (`TopBar`'s `tabs` slot) and a tab's actions live inside its content, never beside the tabs. The campaign and global rows are navigation tiers, not tabs. `FilterBar`'s `actions` slot (`library/filters.tsx`) is the one in-content placement for a tab's write verb.

Every search/filter surface draws one control, `FilterInput` in `packages/ui/src/components/ui/filter-input.tsx`, over the grammar in `filter-input-model.ts` (separately tested). Free text is the search; a filter is a condition (facet, operator, values) drawn as a segmented pill, never a `key:value` token. Operators come from the facet's shape: enum `is`/`is any of`, plus `is none of` only where the facet declares `not: true`; range `is`/`is at least`/`is at most`/`is between`; a boolean flips its value. Match all/any (`matchToggle`) renders only where the consumer honours OR (the client-filtered Encounters screen); a server-paged corpus can only AND its clauses, and a toggle or a `not` there would narrow a page and call it the list.

The box is one line and content-sized (`w-fit`, a `field-sizing-content` input), growing up to the consumer's `max-w-*` (`FilterBox` sets `max-w-3xl`). The component sets no `max-w-*` of its own: `tw-theme.ts`'s merge config knows only the named container scale, so a component default and a consumer's class would both survive `tailwind-merge` and source order would pick the winner. At the limit the oldest pills collect into a `+N filters` popover chip; `visiblePillCount` fits against the box's computed `max-width`, never its `clientWidth`, and the input's `min-w-30` must equal `PILL_LAYOUT.inputReserve`. The combobox underneath is a Base UI port, not shadcn's `command` (that is `cmdk`, which is Radix; the lockfile stays Radix-free).

Consumers use `useFilterQuery` in `library/query.ts` for the value, the debounced `q`, and the `valuesOf`/`flagOf`/`rangeOf` readers. In jsdom the box is `getByRole("combobox", { name: "Search …" })`, a typed commit is `type:bea{Enter}`, and an open suggestion popup holds the accessibility tree: press Escape before reaching for anything outside it.

## The Chronicle: the round that lies

A carried fight is two runs, and `RecapRunLink` carries the other run's round at each end. Two `Int`s that mean different things, so swapping them compiles and reads plausibly. `chronicle/fight.ts` is the only place the sentences are worded:

| sentence                                             | round                        |
| ---------------------------------------------------- | ---------------------------- |
| "Paused at round N when the night ended"             | `run.round`, its own, frozen |
| "Session M picked it up, and it has reached round K" | `continuedInto.round`        |
| "Resumed from round N of session M"                  | `continuedFrom.round`        |

`fight.test.ts` uses a fixture where the two numbers differ (paused at 4, since reached 7); with equal numbers the assertion holds whichever the screen picked. The state comes from `run.endedReason`, never from `endedAt`, and `fightStory` is shared by the DM's and the player's Chronicle so there is one chance to get it right.

Three more rules: the spine loads and the recaps do not (`RecapBody` mounts only while its card is open, because a list must not cost one recap per night); a search answer carries its own `q` (`SearchAnswer.q`), because the box is debounced and a count beside the current text describes the wrong search; and the excerpt is plain text rendered as spans by `search.ts`'s `segments`, never as markup.

## The character sheet screen

`characters/sheet.ts` is the pure half and is separately tested, because everything decided in it is wrong silently. `sheetSections(sheet, writable)` decides what is drawn: a section appears when the document fills it or when there is somewhere to write, and the spine lists exactly the drawn ones. Sections nothing on the sheet can create stay content-driven, which is what keeps `writable` meaning something. Controls exist only where a write exists; `CharacterSheetScreen.test.tsx` enumerates every pressable thing.

- The spine and the narrow rail are one `nav` restyled by width, never two, or every section is in the accessibility tree twice. A press pins its section until the reader scrolls by hand. The rail is told from the spine by flex direction, not position, because a stuck element reports its stuck `offsetTop`.
- Keeping your place across a write is two layers: `useApiAtom` holds the last value through a refresh so the scroller never unmounts, and the lit section and last `scrollTop` are held above the resource anyway. Any screen that both re-reads and holds view state has this trap; the old tabbed sheet threw the reader back to the first tab on every save.
- The screen owns its scroller (`fill`) because the sticky columns and the scroll-spy need a top edge that is the screen's, not the shell's `TopBar`, whose height is neither a token nor constant.
- Repeated visible labels need a disambiguating `aria-label`: `Edit ${what}` on section edit buttons, `${label} score` on the six score inputs. Ids are slugified (`SkillsDialog`), because `Sleight of Hand` is a valid label and an invalid selector.

## The Hob panel surface

`hob/useHobPanel.ts` owns open state, `inline`, and the ⌘K/Esc handlers; `HOB_INLINE_MIN` is 1020 and `inline` is `!useIsMobile(HOB_INLINE_MIN)`, so there is one media query. Above it the panel is a 400px sidebar beside the content; below it a scrimmed overlay at `z-scrim`/`z-dialog`. The shell's seam is two props, `onAskHob` and `panel`, and every product screen passes `useHobPanel({ initialOpen: false })`: nothing is requested until the panel opens.

- `HobRegion` (`hob/HobDock.tsx`) is the positioned row the overlay portals into, published through `HobRegionContext`. Never wrap `Hob` in a second `HobRegion` and never restate its classes: a second positioned ancestor sizes the overlay to itself, and a portal to `<body>` scrims the app's own bar.
- The 400px is `--panel-chat-w` in `packages/ui/src/local-tokens.css`, bridged as `--spacing-chat-panel`; three elements need the same measurement.
- A flex column that scrolls shrinks its children: artifact cards carry `shrink-0`. A fixed-size `<img>` in a flex row stretches regardless, because preflight's `img { height: auto }` beats the attribute; `HobAvatar` states its height in CSS.
- Omit an optional key rather than sending `undefined`: `{ threadId: undefined }` reaches the server as `null`, which `Schema.optional` refuses.
