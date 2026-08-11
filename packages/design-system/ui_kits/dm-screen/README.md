# UI kit — DM screen (the app)

The Tiny Taverns app: a laptop-sized tool a DM keeps open next to the table.
Three surfaces, wired click-through in `index.html`.

| File | Surface |
| --- | --- |
| `AppShell.jsx` | 56px top nav (mark, wordmark, nav, campaign, Ask Hob) + per-screen `TopBar` |
| `CampaignHome.jsx` | Light prep view: encounter cards, notes, party, prep checklist |
| `EncounterRunner.jsx` | Dark live view: initiative list, dice tray, toast, end-session dialog |
| `StatBlock.jsx` | Dark stat-block panel with rollable damage lines |
| `Bestiary.jsx` | Browse view: search, environment filter tags, empty state |
| `ChatPanel.jsx` | **The Hob chat panel (Option A).** 400px, persistent, mounted by `AppShell`. |
| `ChatParts.jsx` | Chat building blocks — messages, artifact cards, composer, context bar |
| `chat-data.js` | Chat fixtures on `window.TT_CHAT` |
| `data.js` | All fixture content on `window.TT_DATA` |

**Try:** Campaign → *Start session* → hover an initiative row and hit the minus to
apply 5 damage (watch the HP bar and toast) → *Next turn* → *End* → dialog → back home.

**Navigation is a top bar, not a rail.** One 56px row: mark + wordmark, three nav
items, then campaign name, session badge and the Ask Hob button pushed right. The
active item uses the same 2px accent underline as `Tabs`, so navigation reads
identically at both levels. A per-screen `TopBar` sits below it with the page
title and its actions. Dropping the 260px rail gave that width back to the
content, which is why the chat panel's inline threshold is now 1020px rather than
1180px.

**The two-mode rule.** Prep and browsing are light cool mist; the live session is
dark (`--slate-950` field, `--surface-panel` cards) so a lit screen doesn't blind the
table. Components carry `onDark` for this.

Everything visual comes from the published primitives — no kit-local restyling of
Button, Card, Badge, Tag, Input, Select, Checkbox, Switch, Tabs, Dialog, Toast or Tooltip.


---

## Chat prep — three layout options (`chat-prep.html`)

How a DM talks to the app to build content between sessions. Open
`chat-prep.html` and switch A / B / C in the top bar. All three share the same
parts (`ChatParts.jsx`) and fixtures (`chat-data.js`) — only the layout differs.

| | Option A — Co-pilot rail | Option B — Chat-first canvas | Option C — Summonable bar |
| --- | --- | --- | --- |
| Chat is | A 400px right panel | The main column | A ⌘K overlay |
| Prep UI | Always visible beside it | Reduced to a 280px tray | Full screen, dimmed behind |
| Best when | You're editing and want a second pair of hands | You start from nothing and talk your way to a session | You know exactly what you want and want it gone after |
| Weakness | Cramped artifact cards; two things competing for attention | The library you already built is out of sight | No conversation history in view; poor for iterating |
| Mobile | Panel becomes a bottom sheet | Works as-is; already single-column | Works as-is; already an overlay |

**Decision: A ships.** It is now the real chat surface in `index.html` —
`ChatPanel.jsx`, mounted by `AppShell`. `chat-prep.html` is kept as the record of
what B and C looked like.

B and C aren't dead, they're deferred:
- **C's ⌘K** was kept as the *opener* for A — ⌘K toggles the panel, Esc closes it,
  and the rail has an "Ask Hob" button with the shortcut on it. You get C's reach
  without C's loss of history.
- **B** stays the better empty state. When a campaign has no content yet, A's panel
  has nothing to sit beside; that's the moment to borrow B's centred starter grid.
  Not built yet.

### Parts

| Export | What |
| --- | --- |
| `ContextBar` | The "Knows" strip — campaign, party, open encounter, history, custom creatures. The open encounter is accented; context is **shown, not asked for**. |
| `UserMsg` / `HobMsg` / `Thinking` | Message rows. Hob gets the app mark as an avatar. |
| `ArtifactCard` | The core interaction: a generated result with a kind badge, an **editable title** (click it), **quick-action chips**, and Save to session / Discard / Try again. Switches to a "Saved" state with Open it. |
| `EncounterBody`, `ReadAloudBody`, `NpcBody`, `ChecklistBody`, `RulesBody` | Per-kind bodies. Rules answers deliberately have **no save action** — "Nothing to save, this one's just an answer." |
| `Composer` | Input with slash-command autocomplete (type `/`) and command chips. |
| `StarterGrid` | Prompt starter cards for the empty state. |

### Three ways to refine, on purpose

All three of your options are wired, because they serve different moments:
**keep talking** ("make it harder") for judgement calls, **quick-action chips** for
the predictable 80% (Make it harder / Swap the toad / Shorter / More ominous), and
**click the title to edit inline** for when you just want to rename the thing.

### The persona question

You asked for an in-world barkeep, and our voice rule says plain and dry. Both
hold, split by channel:

- **UI text stays plain.** Buttons say "Save to session", "Discard", "Try again".
  No barkeep voice on a control, ever.
- **Hob's replies are terse and practical**, one or two sentences: *"Marsh, then.
  Four levels of five means I can push a bit harder than session 11."*
- **The persona lives in one place: a dry aside**, set in italic Alegreya at
  `--text-faint` below the reply — *"You've used goblins in three of the last four
  sittings. I noticed."* It is skippable by design, and it's the only decorative
  writing in the app besides read-aloud text.

If Hob ever needs to say something operational ("that creature isn't in your
bestiary"), he says it plainly and drops the character.

### Open questions

- **Does Hob write to the session directly, or only propose?** Currently
  everything is propose-then-Save. Direct writes would be faster but need undo.
- **Mid-session use.** You said the DM may have this open while playing. Option C
  is the only one that works one-handed on a phone at the table; A and B both need
  a mobile treatment I haven't designed yet.
- **Rules answers** currently cite nothing. If they should cite a source, that's a
  visible component change.

### How the panel behaves in the shell

- **Open by default**, because a DM who opened the app to prep is going to talk to Hob.
- **⌘K / Ctrl-K toggles**, **Esc closes**. The rail's "Ask Hob" button carries the
  shortcut so it's discoverable without a tooltip.
- **Inline above 1020px**, where content + panel (400) both fit.
  **Below that it becomes an overlay** over the content with a scrim, rather than
  squeezing the prep UI into an unusable column. `CHAT_INLINE_MIN` in
  `AppShell.jsx` is the one number to change.
- Saved artifacts call `onSave`, which is where a real build would write into the
  session — right now it only flips the card to its Saved state.
