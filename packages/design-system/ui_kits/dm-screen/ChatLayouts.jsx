const { Button, Card, Badge, Icon, Input, Tabs, TabsList, TabsTrigger } = window.TinyTavernsDesignSystem_a201fd;

/* ================= Shared backdrop: the prep UI chat sits beside ================= */

function Rail({ active = "campaign" }) {
  const items = [["campaign", "book-open", "Campaign"], ["encounters", "swords", "Encounters"], ["bestiary", "footprints", "Bestiary"], ["notes", "scroll-text", "Notes"]];
  return (
    <nav style={{ width: 220, flex: "0 0 auto", display: "flex", flexDirection: "column",
      background: "var(--surface-card)", borderRight: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "16px 14px 14px" }}>
        <img src="../../assets/icon/mark-on-dark-256.png" alt="" width={30} height={30} style={{ borderRadius: "var(--r-sm)" }} />
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ font: "var(--fw-semibold) 17px/1.1 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>Tiny Taverns</span>
          <span style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-faint)" }}>The DM&rsquo;s side kick</span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        {items.map(([id, icon, label]) => (
          <span key={id} style={{ display: "flex", alignItems: "center", gap: 9, height: 36, padding: "0 10px",
            borderRadius: "var(--r-sm)", background: id === active ? "var(--surface-raised)" : "transparent",
            color: id === active ? "var(--text-heading)" : "var(--text-muted)",
            font: (id === active ? "var(--fw-medium)" : "var(--fw-regular)") + " var(--fs-body-s)/1 var(--font-sans)" }}>
            <Icon name={icon} size={16} style={{ color: id === active ? "var(--accent-ink)" : "inherit" }} />{label}
          </span>
        ))}
      </div>
      <div style={{ marginTop: "auto", padding: 14, borderTop: "1px solid var(--border-hairline)" }}>
        <div style={{ font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>The Salt Road</div>
        <Badge variant="secondary" style={{ marginTop: 5 }}>Session 12</Badge>
      </div>
    </nav>
  );
}

function PrepBackdrop({ dim, title = "Session 12 prep", saved = [] }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", opacity: dim ? 0.4 : 1,
      transition: "opacity var(--dur-base) var(--ease-out)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--border-hairline)" }}>
        <h2 style={{ flex: 1, font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{title}</h2>
        <Button size="sm" variant="secondary"><Icon name="plus" size={14} />New encounter</Button>
        <Button size="sm"><Icon name="play" size={14} />Start session</Button>
      </header>
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ font: "var(--fw-medium) var(--fs-micro)/1.4 var(--font-sans)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-faint)" }}>On the table tonight</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {[["Ambush in the reeds", "6 creatures · Hard", true], ["The ferryman's price", "2 creatures · Easy", false], ...saved].map(([n, m, live]) => (
            <Card key={n} style={{ padding: 14, borderColor: live ? "var(--accent)" : undefined }}>
              <div style={{ font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{n}</div>
              <div style={{ font: "var(--type-stat)", color: "var(--text-muted)", marginTop: 4 }}>{m}</div>
              {live ? <Badge style={{ marginTop: 9 }}>Live</Badge> : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= OPTION A — Co-pilot rail ================= */

function OptionA() {
  const [msgs, setMsgs] = React.useState([
    { who: "user", text: "The party's heading into the reeds tonight. Give me something that isn't just more goblins." },
    { who: "hob", text: "Marsh, then. Four levels of five means I can push a bit harder than session 11.", aside: "You've used goblins in three of the last four sittings. I noticed." },
    { who: "artifact", kind: "encounter", title: "Song in the reeds", meta: "5 creatures · Adjusted XP 1,100", chips: ["Make it harder", "Swap the toad", "Add a twist"] },
  ]);
  const [saved, setSaved] = React.useState([]);

  const send = (text) => {
    setMsgs((m) => [...m, { who: "user", text }, { who: "thinking" }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.who !== "thinking").concat([
      { who: "hob", text: "Here. Read it slow — the joke lands better if you take your time." },
      { who: "artifact", kind: "readaloud", title: "Entering the reed maze", meta: "Read-aloud · 2 sentences", chips: ["Shorter", "More ominous"] },
    ])), 900);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--surface-page)" }}>
      <Rail />
      <PrepBackdrop saved={saved} />
      <aside style={{ width: 400, flex: "0 0 auto", display: "flex", flexDirection: "column",
        background: "var(--surface-card)", borderLeft: "1px solid var(--border-hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderBottom: "1px solid var(--border-hairline)" }}>
          <HobAvatar size={26} />
          <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <span style={{ font: "var(--fw-medium) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>Hob</span>
            <span style={{ font: "var(--fw-regular) var(--fs-micro)/1.3 var(--font-sans)", color: "var(--text-faint)" }}>Keeps the ledger behind the bar</span>
          </span>
          <Button size="sm" variant="ghost" aria-label="New thread"><Icon name="plus" size={14} /></Button>
        </div>
        <ContextBar compact />
        <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {msgs.map((m, i) =>
            m.who === "user" ? <UserMsg key={i}>{m.text}</UserMsg>
            : m.who === "hob" ? <HobMsg key={i} aside={m.aside}>{m.text}</HobMsg>
            : m.who === "thinking" ? <Thinking key={i} />
            : <ArtifactCard key={i} kind={m.kind} title={m.title} meta={m.meta} chips={m.chips}
                saved={saved.some((s) => s[0] === m.title)}
                onSave={() => setSaved((s) => [...s, [m.title, m.meta, false]])}
                onDiscard={() => setMsgs((cur) => cur.filter((x) => x !== m))}>
                {m.kind === "encounter" ? <EncounterBody /> : m.kind === "readaloud" ? <ReadAloudBody /> : null}
              </ArtifactCard>
          )}
        </div>
        <Composer onSend={send} showCommands />
      </aside>
    </div>
  );
}

/* ================= OPTION B — Chat-first canvas ================= */

function OptionB() {
  const [started, setStarted] = React.useState(true);
  const [msgs, setMsgs] = React.useState([
    { who: "user", text: "Prep tonight from where session 11 left off." },
    { who: "hob", text: "They left the ferryman waiting and someone still has the crate. Four things I'd sort before you sit down:" },
    { who: "artifact", kind: "checklist", title: "Session 12 prep", meta: "4 items · 2 done", chips: ["Add a step", "Reorder"] },
    { who: "user", text: "/npc a frog envoy who wants a favour" },
    { who: "artifact", kind: "npc", title: "Ubbo, the reed envoy", meta: "Bullywug · Neutral · Wants a courier", chips: ["Less friendly", "Give him a rival"] },
  ]);
  const [tray, setTray] = React.useState([["Session 12 prep", "Prep list", "list-checks"], ["Ubbo, the reed envoy", "NPC", "user-round"]]);

  const send = () => {
    setMsgs((m) => [...m, { who: "thinking" }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.who !== "thinking").concat([
      { who: "hob", text: "Difficult terrain, in short:" },
      { who: "artifact", kind: "rules", title: "Moving through reeds", meta: "Rules answer" },
    ])), 900);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--surface-page)" }}>
      <Rail active="notes" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <ContextBar />
        <div style={{ flex: 1, overflow: "auto", padding: "24px 0" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {!started ? (
              <>
                <div style={{ textAlign: "center", padding: "32px 0 8px" }}>
                  <img src="../../assets/icon/mark-on-dark-256.png" alt="" width={44} height={44} style={{ borderRadius: "var(--r-md)" }} />
                  <h2 style={{ font: "var(--fw-semibold) var(--fs-display-m)/1.2 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)", marginTop: 12 }}>What are we building tonight?</h2>
                  <p style={{ font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-muted)", marginTop: 6 }}>
                    I have your party, your notes and the eleven sessions behind you.
                  </p>
                </div>
                <StarterGrid onPick={() => setStarted(true)} />
              </>
            ) : msgs.map((m, i) =>
              m.who === "user" ? <UserMsg key={i}>{m.text}</UserMsg>
              : m.who === "hob" ? <HobMsg key={i} aside={m.aside}>{m.text}</HobMsg>
              : m.who === "thinking" ? <Thinking key={i} />
              : <ArtifactCard key={i} kind={m.kind === "rules" ? "hooks" : m.kind} title={m.title} meta={m.meta} chips={m.chips}
                  saved={tray.some((t) => t[0] === m.title)}
                  onSave={() => setTray((t) => [...t, [m.title, m.meta, "sparkles"]])}
                  onDiscard={() => setMsgs((cur) => cur.filter((x) => x !== m))}>
                  {m.kind === "checklist" ? <ChecklistBody /> : m.kind === "npc" ? <NpcBody /> : m.kind === "rules" ? <RulesBody /> : <EncounterBody />}
                </ArtifactCard>
            )}
          </div>
        </div>
        <div style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
          <Composer onSend={send} placeholder="Tell me what you need, or type / for a command" showCommands />
        </div>
      </div>
      <aside style={{ width: 280, flex: "0 0 auto", display: "flex", flexDirection: "column",
        background: "var(--surface-card)", borderLeft: "1px solid var(--border-hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 14px", borderBottom: "1px solid var(--border-hairline)" }}>
          <span style={{ flex: 1, font: "var(--fw-medium) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>Tonight&rsquo;s session</span>
          <Badge variant="secondary">{tray.length}</Badge>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {tray.map((t) => (
            <div key={t[0]} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px",
              background: "var(--surface-raised)", border: "1px solid var(--border-hairline)", borderRadius: "var(--r-card)" }}>
              <Icon name={t[2]} size={14} style={{ color: "var(--accent-ink)", marginTop: 2 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "var(--fw-medium) var(--fs-caption)/1.35 var(--font-sans)", color: "var(--text-heading)" }}>{t[0]}</span>
                <span style={{ display: "block", font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-faint)" }}>{t[1]}</span>
              </span>
            </div>
          ))}
          <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34,
            border: "1px dashed var(--border-strong)", borderRadius: "var(--r-card)", background: "transparent",
            color: "var(--text-faint)", font: "var(--fw-regular) var(--fs-caption)/1 var(--font-sans)", cursor: "pointer" }}>
            <Icon name="plus" size={12} />Add by hand
          </button>
        </div>
        <div style={{ padding: 12, borderTop: "1px solid var(--border-hairline)" }}>
          <Button size="sm" style={{ width: "100%" }}><Icon name="play" size={14} />Start session</Button>
        </div>
      </aside>
    </div>
  );
}

/* ================= OPTION C — Summonable command bar ================= */

function OptionC() {
  const [open, setOpen] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div style={{ position: "relative", display: "flex", height: "100%", background: "var(--surface-page)" }}>
      <Rail active="encounters" />
      <PrepBackdrop dim={open} />
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ position: "absolute", right: 22, bottom: 22, display: "flex",
          alignItems: "center", gap: 8, height: 40, padding: "0 14px", borderRadius: "var(--r-pill)",
          background: "var(--surface-raised)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-3)",
          color: "var(--text-body)", font: "var(--fw-medium) var(--fs-body-s)/1 var(--font-sans)", cursor: "pointer" }}>
          <HobAvatar size={20} />Ask Hob
          <kbd style={{ padding: "2px 5px", borderRadius: 3, background: "var(--surface-sunken)", color: "var(--text-faint)", font: "var(--fw-medium) var(--fs-micro)/1.3 var(--font-mono)" }}>&#8984;K</kbd>
        </button>
      ) : (
        <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, display: "flex",
          alignItems: "flex-start", justifyContent: "center", paddingTop: 90, background: "var(--scrim)", backdropFilter: "blur(3px)", zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: "calc(100% - 140px)", display: "flex", flexDirection: "column",
            background: "var(--surface-card)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-panel)",
            boxShadow: "var(--shadow-3)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
              <HobAvatar size={24} />
              <input autoFocus placeholder="Ask Hob, or type / for a command"
                onKeyDown={(e) => { if (e.key === "Enter") setExpanded(true); }}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text-body)",
                  font: "var(--fw-regular) var(--fs-body-l)/1 var(--font-sans)" }} />
              <kbd style={{ padding: "2px 6px", borderRadius: 3, background: "var(--surface-sunken)", color: "var(--text-faint)", font: "var(--fw-medium) var(--fs-micro)/1.3 var(--font-mono)" }}>esc</kbd>
            </div>
            <ContextBar compact />
            {!expanded ? (
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ font: "var(--fw-medium) var(--fs-micro)/1.4 var(--font-sans)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-faint)" }}>Because you have an encounter open</div>
                <StarterGrid onPick={() => setExpanded(true)} columns={2} />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid var(--border-hairline)" }}>
                  {window.TT_CHAT.commands.map((c) => (
                    <span key={c} style={{ height: 24, display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "var(--r-xs)",
                      border: "1px solid var(--border-hairline)", color: "var(--text-faint)", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)" }}>{c}</span>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  <UserMsg>Something for the reeds that isn&rsquo;t goblins</UserMsg>
                  <HobMsg aside="Third time this month you've asked me that.">Marsh, harder than last week. Save it or send it straight to the table.</HobMsg>
                  <ArtifactCard kind="encounter" title="Song in the reeds" meta="5 creatures · Adjusted XP 1,100"
                    chips={["Make it harder", "Swap the toad"]} onSave={() => setOpen(false)} onDiscard={() => setExpanded(false)}>
                    <EncounterBody />
                  </ArtifactCard>
                </div>
                <Composer onSend={() => {}} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { OptionA, OptionB, OptionC, Rail, PrepBackdrop });
