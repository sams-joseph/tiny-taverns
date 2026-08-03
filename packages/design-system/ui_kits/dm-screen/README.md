# UI kit — DM screen (the app)

The Tiny Taverns app: a laptop-sized tool a DM keeps open next to the table.
Three surfaces, wired click-through in `index.html`.

| File | Surface |
| --- | --- |
| `AppShell.jsx` | 260px dark rail (wordmark, nav, campaign footer) + `TopBar` |
| `CampaignHome.jsx` | Light prep view: encounter cards, notes, party, prep checklist |
| `EncounterRunner.jsx` | Dark live view: initiative list, dice tray, toast, end-session dialog |
| `StatBlock.jsx` | Dark stat-block panel with rollable damage lines |
| `Bestiary.jsx` | Light browse view: search, environment filter tags, empty state |
| `data.js` | All fixture content on `window.TT_DATA` |

**Try:** Campaign → *Start session* → hover an initiative row and hit the minus to
apply 5 damage (watch the HP bar and toast) → *Next turn* → *End* → dialog → back home.

**The two-mode rule.** Prep and browsing are light cool mist; the live session is
dark (`--slate-950` field, `--surface-panel` cards) so a lit screen doesn't blind the
table. Components carry `onDark` for this.

Everything visual comes from the published primitives — no kit-local restyling of
Button, Card, Badge, Tag, Input, Select, Checkbox, Switch, Tabs, Dialog, Toast or Tooltip.
