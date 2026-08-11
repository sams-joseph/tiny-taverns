const { Button, Card, Badge, Input, Icon, Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } = window.TinyTavernsDesignSystem_a201fd;

/* ---------- Shared chrome ---------- */

function HobAvatar({ size = 28 }) {
  return (
    <img src="../../assets/icon/mark-on-dark-256.png" alt="" width={size} height={size}
      style={{ flex: "0 0 auto", borderRadius: "var(--r-sm)", border: "1px solid var(--border-hairline)" }} />
  );
}

function ContextBar({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      padding: compact ? "8px 12px" : "10px 14px", borderBottom: "1px solid var(--border-hairline)",
      background: "var(--surface-sunken)" }}>
      <span style={{ font: "var(--fw-medium) var(--fs-micro)/1.4 var(--font-sans)", letterSpacing: "var(--ls-caps)",
        textTransform: "uppercase", color: "var(--text-faint)", marginRight: 2 }}>Knows</span>
      {window.TT_CHAT.context.map((c) => (
        <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px",
          borderRadius: "var(--r-pill)", border: "1px solid " + (c.live ? "var(--accent)" : "var(--border-strong)"),
          background: c.live ? "var(--accent-soft)" : "transparent",
          color: c.live ? "var(--accent-ink)" : "var(--text-muted)",
          font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)" }}>
          <Icon name={c.icon} size={11} />{c.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- Messages ---------- */

function UserMsg({ children }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", paddingLeft: 40 }}>
      <div style={{ padding: "9px 13px", borderRadius: "var(--r-card)", borderBottomRightRadius: "var(--r-xs)",
        background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
        font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)" }}>
        {children}
      </div>
    </div>
  );
}

function HobMsg({ children, aside }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <HobAvatar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8, paddingTop: 3 }}>
        {children ? (
          <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.55 var(--font-sans)", color: "var(--text-body)" }}>{children}</div>
        ) : null}
        {aside ? (
          <div style={{ font: "italic var(--fw-regular) var(--fs-caption)/1.5 var(--font-serif)", color: "var(--text-faint)" }}>{aside}</div>
        ) : null}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <HobAvatar />
      <span style={{ font: "italic var(--fw-regular) var(--fs-caption)/1.5 var(--font-serif)", color: "var(--text-faint)" }}>
        Hob is checking the ledger&hellip;
      </span>
    </div>
  );
}

/* ---------- Artifact card ---------- */

const KIND_META = {
  encounter: { icon: "swords", label: "Encounter", variant: "default" },
  creature: { icon: "footprints", label: "Creature", variant: "destructive" },
  readaloud: { icon: "scroll-text", label: "Read-aloud", variant: "info" },
  npc: { icon: "user-round", label: "NPC", variant: "magic" },
  checklist: { icon: "list-checks", label: "Prep list", variant: "success" },
  location: { icon: "map", label: "Location", variant: "info" },
  loot: { icon: "gem", label: "Loot", variant: "default" },
  hooks: { icon: "git-branch", label: "Hooks", variant: "secondary" },
};

function ArtifactCard({ kind, title, meta, chips = [], saved, onSave, onDiscard, children }) {
  const m = KIND_META[kind] || KIND_META.encounter;
  const [editing, setEditing] = React.useState(false);
  return (
    <Card tone="raised" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px var(--pad-card) 10px" }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
          flex: "0 0 auto", borderRadius: "var(--r-sm)", background: "var(--surface-sunken)",
          border: "1px solid var(--border-strong)", color: "var(--accent-ink)" }}>
          <Icon name={m.icon} size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {editing ? (
              <Input defaultValue={title} style={{ height: 28, maxWidth: 260 }} />
            ) : (
              <span onClick={() => setEditing(true)} title="Click to edit"
                style={{ font: "var(--type-title)", color: "var(--text-heading)", cursor: "text" }}>{title}</span>
            )}
            <Badge variant={m.variant} style={{ fontSize: "var(--fs-micro)" }}>{m.label}</Badge>
          </div>
          {meta ? (
            <div style={{ font: "var(--type-stat)", color: "var(--text-muted)", marginTop: 3 }}>{meta}</div>
          ) : null}
        </div>
        {saved ? <Badge variant="success">Saved</Badge> : null}
      </div>
      <div style={{ padding: "0 var(--pad-card) 12px" }}>{children}</div>
      {chips.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 var(--pad-card) 12px" }}>
          {chips.map((c) => (
            <button key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px",
              borderRadius: "var(--r-pill)", border: "1px dashed var(--border-strong)", background: "transparent",
              color: "var(--text-muted)", font: "var(--fw-regular) var(--fs-caption)/1 var(--font-sans)", cursor: "pointer" }}>
              <Icon name="wand-sparkles" size={11} />{c}
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px var(--pad-card)",
        borderTop: "1px solid var(--border-hairline)", background: "var(--surface-card)" }}>
        {saved ? (
          <>
            <Button size="sm" variant="secondary">Open it</Button>
            <span style={{ marginLeft: "auto", font: "var(--fw-regular) var(--fs-caption)/1 var(--font-sans)", color: "var(--text-faint)" }}>
              In tonight&rsquo;s session
            </span>
          </>
        ) : (
          <>
            <Button size="sm" onClick={onSave}>Save to session</Button>
            <Button size="sm" variant="ghost" onClick={onDiscard}>Discard</Button>
            <Button size="sm" variant="ghost" style={{ marginLeft: "auto" }}>Try again</Button>
          </>
        )}
      </div>
    </Card>
  );
}

/* ---------- Artifact bodies ---------- */

function StatRow({ children }) {
  return <div style={{ display: "flex", gap: 14, font: "var(--type-stat)", color: "var(--text-body)" }}>{children}</div>;
}

function EncounterBody() {
  const rows = [["3", "Bullywug Croaker", "CR 1/4", "11 hp"], ["1", "Will-o'-Wisp", "CR 2", "22 hp"], ["1", "Giant Toad", "CR 1", "39 hp"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map((r) => (
        <div key={r[1]} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
          background: "var(--surface-sunken)", borderRadius: "var(--r-sm)" }}>
          <span style={{ font: "var(--type-stat)", color: "var(--accent-ink)", width: 18 }}>&times;{r[0]}</span>
          <span style={{ flex: 1, font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{r[1]}</span>
          <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{r[2]}</span>
          <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{r[3]}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 14, paddingTop: 4, font: "var(--type-stat)", color: "var(--text-muted)" }}>
        <span>Adjusted XP 1,100</span><span style={{ color: "var(--accent-ink)" }}>Hard for 4 level-5s</span>
      </div>
    </div>
  );
}

function ReadAloudBody() {
  return (
    <blockquote style={{ margin: 0, padding: "11px 14px", background: "var(--surface-sunken)",
      borderLeft: "2px solid var(--accent)", borderRadius: "0 var(--r-sm) var(--r-sm) 0" }}>
      <p style={{ margin: 0, font: "var(--type-read-aloud)", fontSize: "var(--fs-body-s)", color: "var(--slate-200)" }}>
        The reeds close over the path behind you. Somewhere ahead a frog is singing, badly, in what is unmistakably a human key.
      </p>
    </blockquote>
  );
}

function NpcBody() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <StatRow><span>Bullywug envoy</span><span style={{ color: "var(--text-muted)" }}>Neutral</span></StatRow>
      <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)" }}>
        Wants the party to carry a complaint upriver. Will not say who to.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: "var(--surface-sunken)", borderRadius: "var(--r-sm)" }}>
        <Icon name="mic" size={13} style={{ color: "var(--magic-ink)" }} />
        <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.45 var(--font-sans)", color: "var(--text-muted)" }}>
          Voice: slow, wet consonants, ends every sentence like a question
        </span>
      </div>
    </div>
  );
}

function ChecklistBody() {
  const items = [["Decide what the ferryman wants", true], ["Reread session 11's last scene", true], ["Pick a name for the frog envoy", false], ["Sketch the reed maze", false]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map(([t, done]) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 9,
          font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", color: done ? "var(--text-faint)" : "var(--text-body)" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16,
            borderRadius: "var(--r-xs)", border: "1px solid " + (done ? "var(--accent)" : "var(--border-strong)"),
            background: done ? "var(--accent)" : "transparent", color: "var(--text-on-accent)" }}>
            {done ? <Icon name="check" size={11} /> : null}
          </span>
          <span style={{ textDecoration: done ? "line-through" : "none" }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function RulesBody() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.55 var(--font-sans)", color: "var(--text-body)" }}>
        Difficult terrain costs one extra foot of movement per foot moved. Marsh reeds count, so a 30-foot walk covers 15 feet.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-faint)" }}>
        <Icon name="book-open" size={12} />Nothing to save &mdash; this one&rsquo;s just an answer.
      </div>
    </div>
  );
}

/* ---------- Composer ---------- */

function Composer({ onSend, placeholder = "Ask Hob, or type / for a command", showCommands }) {
  const [val, setVal] = React.useState("");
  const slash = val.startsWith("/");
  const matches = window.TT_CHAT.commands.filter((c) => c.startsWith(val));
  return (
    <div style={{ position: "relative", padding: "12px 14px", borderTop: "1px solid var(--border-hairline)", background: "var(--surface-card)" }}>
      {slash && matches.length ? (
        <div style={{ position: "absolute", left: 14, right: 14, bottom: "calc(100% - 4px)", background: "var(--surface-raised)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-card)", boxShadow: "var(--shadow-3)", overflow: "hidden" }}>
          {matches.map((c, i) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
              background: i === 0 ? "var(--accent-soft)" : "transparent",
              font: "var(--type-stat)", color: i === 0 ? "var(--accent-ink)" : "var(--text-muted)" }}>
              <Icon name="slash" size={12} />{c}
            </div>
          ))}
        </div>
      ) : null}
      <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) { onSend(val); setVal(""); } }}
        style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 10px",
          background: "var(--surface-sunken)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-control)" }}>
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
            style={{ flex: 1, minWidth: 0, height: 36, border: "none", outline: "none", background: "transparent",
              color: "var(--text-body)", font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)" }} />
          <Icon name="paperclip" size={15} style={{ color: "var(--text-faint)" }} />
        </div>
        <Button size="icon" type="submit" aria-label="Send"><Icon name="arrow-up" size={16} /></Button>
      </form>
      {showCommands ? (
        <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
          {window.TT_CHAT.commands.slice(0, 5).map((c) => (
            <button key={c} onClick={() => setVal(c + " ")} style={{ height: 24, padding: "0 8px", borderRadius: "var(--r-xs)",
              border: "1px solid var(--border-hairline)", background: "transparent", color: "var(--text-faint)",
              font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", cursor: "pointer" }}>{c}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StarterGrid({ onPick, columns = 2 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(" + columns + ",1fr)", gap: 8 }}>
      {window.TT_CHAT.starters.map((s) => (
        <button key={s.title} onClick={() => onPick(s.title)}
          style={{ display: "flex", flexDirection: "column", gap: 4, padding: "11px 12px", textAlign: "left",
            background: "var(--surface-raised)", border: "1px solid var(--border-hairline)", borderRadius: "var(--r-card)",
            cursor: "pointer", transition: "var(--transition-control)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--accent-ink)" }}>
            <Icon name={s.icon} size={14} />
            <span style={{ font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{s.title}</span>
          </span>
          <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>{s.sub}</span>
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { HobAvatar, ContextBar, UserMsg, HobMsg, Thinking, ArtifactCard, EncounterBody, ReadAloudBody, NpcBody, ChecklistBody, RulesBody, Composer, StarterGrid, StatRow });
