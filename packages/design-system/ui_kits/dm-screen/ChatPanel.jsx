const { Button, Badge, Icon } = window.TinyTavernsDesignSystem_a201fd;

/* Option A — the chosen chat surface. A 400px persistent right panel beside the
   prep UI. Composed from ChatParts.jsx; nothing restyled locally. */

const SEED = [
  { who: "user", text: "The party's heading into the reeds tonight. Give me something that isn't just more goblins." },
  { who: "hob", text: "Marsh, then. Four levels of five means I can push a bit harder than session 11.", aside: "You've used goblins in three of the last four sittings. I noticed." },
  { who: "artifact", kind: "encounter", title: "Song in the reeds", meta: "5 creatures · Adjusted XP 1,100", chips: ["Make it harder", "Swap the toad", "Add a twist"] },
];

const REPLIES = [
  [{ who: "hob", text: "Here. Read it slow — the joke lands better if you take your time." },
   { who: "artifact", kind: "readaloud", title: "Entering the reed maze", meta: "Read-aloud · 2 sentences", chips: ["Shorter", "More ominous"] }],
  [{ who: "hob", text: "He wants a courier, and he won't say who for. That's your hook." },
   { who: "artifact", kind: "npc", title: "Ubbo, the reed envoy", meta: "Bullywug · Neutral · Wants a courier", chips: ["Less friendly", "Give him a rival"] }],
  [{ who: "hob", text: "Difficult terrain, in short:" },
   { who: "artifact", kind: "rules", title: "Moving through reeds", meta: "Rules answer" }],
];

function ChatPanel({ onClose, onSave }) {
  const [msgs, setMsgs] = React.useState(SEED);
  const [saved, setSaved] = React.useState([]);
  const [turn, setTurn] = React.useState(0);
  const endRef = React.useRef(null);

  React.useEffect(() => {
    const el = endRef.current;
    if (el && el.parentNode) el.parentNode.scrollTop = el.parentNode.scrollHeight;
  }, [msgs]);

  const send = (text) => {
    setMsgs((m) => [...m, { who: "user", text }, { who: "thinking" }]);
    const reply = REPLIES[turn % REPLIES.length];
    setTurn((t) => t + 1);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.who !== "thinking").concat(reply)), 900);
  };

  const save = (m) => {
    setSaved((s) => [...s, m.title]);
    if (onSave) onSave(m);
  };

  return (
    <aside style={{ width: 400, flex: "0 0 auto", display: "flex", flexDirection: "column", minHeight: 0,
      background: "var(--surface-card)", borderLeft: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: "1px solid var(--border-hairline)" }}>
        <HobAvatar size={26} />
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <span style={{ font: "var(--fw-medium) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>Hob</span>
          <span style={{ font: "var(--fw-regular) var(--fs-micro)/1.3 var(--font-sans)", color: "var(--text-faint)" }}>Keeps the ledger behind the bar</span>
        </span>
        <Button size="sm" variant="ghost" aria-label="New thread" title="New thread"><Icon name="plus" size={14} /></Button>
        {onClose ? <Button size="sm" variant="ghost" aria-label="Close" title="Close" onClick={onClose}><Icon name="panel-right-close" size={14} /></Button> : null}
      </div>
      <ContextBar compact />
      <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {msgs.map((m, i) =>
          m.who === "user" ? <UserMsg key={i}>{m.text}</UserMsg>
          : m.who === "hob" ? <HobMsg key={i} aside={m.aside}>{m.text}</HobMsg>
          : m.who === "thinking" ? <Thinking key={i} />
          : <ArtifactCard key={i} kind={m.kind === "rules" ? "hooks" : m.kind} title={m.title} meta={m.meta} chips={m.chips}
              saved={saved.includes(m.title)}
              onSave={() => save(m)}
              onDiscard={() => setMsgs((cur) => cur.filter((x) => x !== m))}>
              {m.kind === "encounter" ? <EncounterBody />
                : m.kind === "readaloud" ? <ReadAloudBody />
                : m.kind === "npc" ? <NpcBody />
                : m.kind === "checklist" ? <ChecklistBody />
                : m.kind === "rules" ? <RulesBody /> : null}
            </ArtifactCard>
        )}
        <div ref={endRef} />
      </div>
      <Composer onSend={send} showCommands />
    </aside>
  );
}

function AskHobButton({ onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 9, height: 34, padding: "0 10px",
        background: hover ? "var(--surface-raised)" : "transparent",
        border: "1px solid var(--border-strong)", borderRadius: "var(--r-control)",
        color: "var(--text-body)", fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)",
        fontWeight: "var(--fw-medium)", lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap",
        transition: "var(--transition-control)" }}>
      <HobAvatar size={20} />Ask Hob
      <kbd style={{ padding: "2px 5px", borderRadius: 3, background: "var(--surface-sunken)",
        color: "var(--text-faint)", font: "var(--fw-medium) var(--fs-micro)/1.3 var(--font-mono)" }}>&#8984;K</kbd>
    </button>
  );
}

Object.assign(window, { ChatPanel, AskHobButton });
