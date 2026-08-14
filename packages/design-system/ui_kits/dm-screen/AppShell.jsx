const { Badge, Button, Icon } = window.TinyTavernsDesignSystem_a201fd;

/* Navigation has two tiers, and the rule is legible from the shape:
   the thin top row is everything ABOVE a campaign (your campaign list, the
   shared monster library, your account), the second row exists only inside a
   campaign, is titled with the campaign name — which is also the way home —
   and holds the campaign-scoped screens. Nothing appears on both rows. */
const GLOBAL_DM = [
  { id: "campaigns", icon: "layers", label: "Campaigns" },
  { id: "bestiary", icon: "footprints", label: "Library" },
];
const GLOBAL_PLAYER = [
  { id: "campaigns", icon: "layers", label: "Campaigns" },
  { id: "characters", icon: "user", label: "Characters" },
];
const CAMP_DM = [
  { id: "home", label: "Overview" },
  { id: "encounters", label: "Encounters" },
  { id: "party", label: "Party" },
  { id: "notes", label: "Notes" },
  { id: "chronicle", label: "Chronicle" },
];
const CAMP_PLAYER = [
  { id: "sheet", label: "My character" },
  { id: "table", label: "At the table" },
  { id: "chronicle", label: "Chronicle" },
];
const GLOBAL = { dm: GLOBAL_DM, player: GLOBAL_PLAYER };
const CAMP = { dm: CAMP_DM, player: CAMP_PLAYER };

/* Screens that sit above any campaign — they never light up the campaign row. */
const GLOBAL_SCREENS = ["campaigns", "bestiary", "characters", "create"];

function GlobalItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", cursor: "pointer",
        background: active || hover ? "var(--surface-sunken)" : "transparent",
        border: "1px solid " + (active ? "var(--border-hairline)" : "transparent"), borderRadius: "var(--r-pill)",
        color: active ? "var(--text-heading)" : "var(--text-muted)",
        font: "var(--fw-medium) 12px/1 var(--font-sans)", whiteSpace: "nowrap", transition: "var(--transition-control)" }}>
      <Icon name={item.icon} size={13} style={{ color: active ? "var(--peach-300)" : "inherit" }} />{item.label}
    </button>
  );
}

/* Campaign row items carry the 2px accent underline the system uses for Tabs. */
function CampItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", height: 46, padding: "0 13px", border: "none",
        borderBottom: "2px solid " + (active ? "var(--accent)" : "transparent"), marginBottom: -1, background: "transparent",
        color: active ? "var(--text-heading)" : hover ? "var(--text-body)" : "var(--text-muted)",
        font: (active ? "var(--fw-semibold)" : "var(--fw-medium)") + " var(--fs-label)/1 var(--font-sans)",
        cursor: "pointer", whiteSpace: "nowrap", transition: "var(--transition-control)" }}>{item.label}</button>
  );
}

/* Most DMs also play in somebody else's game, so the role is a switch and not
   an account. It swaps both rows and the whole content area. */
function RoleSwitch({ role, setRole }) {
  return (
    <div style={{ display: "flex", padding: 2, gap: 2, background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", borderRadius: "var(--r-pill)" }}>
      {[["dm", "crown", "DM"], ["player", "user", "Player"]].map(([id, icon, label]) => {
        const on = role === id;
        return (
          <button key={id} onClick={() => setRole(id)} aria-pressed={on}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px", cursor: "pointer",
              borderRadius: "var(--r-pill)", border: "none",
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--text-on-accent)" : "var(--text-muted)",
              font: "var(--fw-semibold) 12px/1 var(--font-sans)", transition: "var(--transition-control)" }}>
            <Icon name={icon} size={13} />{label}
          </button>
        );
      })}
    </div>
  );
}

function TopNav({ screen, setScreen, role, setRole, onAskHob, chatOpen }) {
  const d = window.TT_DATA;
  const p = window.TT_PLAYER;
  const player = role === "player";
  const inCampaign = GLOBAL_SCREENS.indexOf(screen) === -1;
  const home = player ? "sheet" : "home";
  return (
    <div style={{ flex: "0 0 auto", background: "var(--surface-card)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-6)", height: 44, padding: "0 var(--pad-page)",
        borderBottom: inCampaign ? "1px solid var(--border-hairline)" : "none" }}>
        <Brand compact />
        <nav style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "var(--s-4)" }}>
          {GLOBAL[role].map((n) => (
            <GlobalItem key={n.id} item={n}
              active={screen === n.id || (n.id === "characters" && screen === "create")}
              onClick={() => setScreen(n.id)} />
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          {onAskHob ? (
            <button onClick={onAskHob} title="Ask Hob" aria-label="Ask Hob"
              style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", cursor: "pointer",
                background: chatOpen ? "var(--accent-soft)" : "transparent",
                border: "1px solid " + (chatOpen ? "var(--accent)" : "var(--border-hairline)"), borderRadius: "var(--r-pill)",
                color: chatOpen ? "var(--peach-300)" : "var(--text-muted)",
                font: "var(--fw-medium) 12px/1 var(--font-sans)", transition: "var(--transition-control)" }}>
              <Icon name="sparkles" size={13} />Ask Hob
            </button>
          ) : null}
          {setRole ? <RoleSwitch role={role} setRole={setRole} /> : null}
          {p ? (
            <span title={p.account.name} style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "var(--r-pill)",
              display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)",
              border: "1px solid var(--accent)", font: "var(--fw-semibold) 10px/1 var(--font-sans)", color: "var(--peach-300)" }}>
              {p.account.initials}
            </span>
          ) : null}
        </div>
      </div>
      {inCampaign ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-5)", height: 46, padding: "0 var(--pad-page)" }}>
          <button onClick={() => setScreen(home)} title="Campaign home"
            style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, flex: "0 0 auto" }}>
            <Icon name="chevron-left" size={15} style={{ color: "var(--text-faint)" }} />
            <span style={{ font: "var(--fw-semibold) 14px/1 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)", whiteSpace: "nowrap" }}>{d.campaign.name}</span>
          </button>
          <Badge variant="secondary">Session {d.campaign.session}</Badge>
          <nav style={{ display: "flex", alignItems: "stretch", height: 46, marginLeft: "var(--s-4)" }}>
            {CAMP[role].map((n) => <CampItem key={n.id} item={n} active={screen === n.id} onClick={() => setScreen(n.id)} />)}
          </nav>
          {!player ? (
            <div style={{ marginLeft: "auto", flex: "0 0 auto" }}>
              <Button size="sm" onClick={() => setScreen("run")}><Icon name="play" size={13} />Start session</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TopBar({ title, subtitle, children }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: "var(--gutter)", padding: "14px var(--pad-page)",
      borderBottom: "1px solid var(--border-hairline)", background: "var(--surface-card)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{title}</h2>
        {subtitle ? <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>{children}</div>
    </header>
  );
}

/* The chat panel sits inline beside the content on a wide screen. Under 1020px
   there isn't room for content + a 400px panel, so it becomes an overlay. */
const CHAT_INLINE_MIN = 1020;

function AppShell({ screen, setScreen, role = "dm", setRole, children }) {
  const [chat, setChat] = React.useState(true);
  const [wide, setWide] = React.useState(() => window.innerWidth >= CHAT_INLINE_MIN);

  React.useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= CHAT_INLINE_MIN);
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setChat((c) => !c); }
      if (e.key === "Escape") setChat(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); };
  }, []);

  const panel = chat ? <ChatPanel onClose={() => setChat(false)} /> : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface-page)" }}>
      <TopNav screen={screen} setScreen={setScreen} role={role} setRole={setRole}
        chatOpen={chat} onAskHob={() => setChat((c) => !c)} />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
          {children}
          {!wide && chat ? (
            <>
              <div onClick={() => setChat(false)} style={{ position: "absolute", inset: 0, background: "var(--scrim)", zIndex: 30 }} />
              <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex", zIndex: 31, boxShadow: "var(--shadow-3)" }}>{panel}</div>
            </>
          ) : null}
        </div>
        {wide ? panel : null}
      </div>
    </div>
  );
}

Object.assign(window, { AppShell, TopBar, TopNav, RoleSwitch, GLOBAL_DM, GLOBAL_PLAYER, CAMP_DM, CAMP_PLAYER, GLOBAL_SCREENS });
