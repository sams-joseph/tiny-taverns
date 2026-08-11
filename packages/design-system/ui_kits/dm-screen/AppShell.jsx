const { Badge, Icon } = window.TinyTavernsDesignSystem_a201fd;

const NAV = [
  { id: "home", icon: "book-open", label: "Campaign" },
  { id: "run", icon: "swords", label: "Run" },
  { id: "bestiary", icon: "footprints", label: "Bestiary" },
  { id: "chronicle", icon: "scroll-text", label: "Chronicle" },
];

/* Top nav. Active item carries the 2px accent underline the system already uses
   for Tabs, so navigation reads the same way everywhere. */
function NavItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, height: 56, padding: "0 14px",
        border: "none", borderBottom: "2px solid " + (active ? "var(--accent)" : "transparent"),
        marginBottom: -1, background: "transparent",
        color: active ? "var(--text-heading)" : hover ? "var(--text-body)" : "var(--text-muted)",
        fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)",
        fontWeight: active ? "var(--fw-semibold)" : "var(--fw-medium)", lineHeight: 1,
        cursor: "pointer", whiteSpace: "nowrap", transition: "var(--transition-control)" }}>
      <Icon name={item.icon} size={16} style={{ color: active ? "var(--verdigris-300)" : "inherit" }} />
      {item.label}
    </button>
  );
}

function TopNav({ screen, setScreen, onAskHob }) {
  const d = window.TT_DATA;
  return (
    <header style={{ display: "flex", alignItems: "center", gap: "var(--s-8)", flex: "0 0 auto",
      height: 56, padding: "0 var(--pad-page)", background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "0 0 auto" }}>
        <img src="../../assets/icon/mark-on-dark-256.png" alt="" width="26" height="26" style={{ display: "block" }} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 17,
          lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)", whiteSpace: "nowrap" }}>
          Tiny Taverns
        </span>
      </div>
      <nav style={{ display: "flex", alignItems: "stretch", height: 56 }}>
        {NAV.map((n) => <NavItem key={n.id} item={n} active={screen === n.id} onClick={() => setScreen(n.id)} />)}
      </nav>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--s-6)", flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: "var(--fw-semibold)",
            lineHeight: 1.4, color: "var(--text-body)", whiteSpace: "nowrap" }}>The Salt Road</span>
          <Badge variant="secondary">Session {d.campaign.session}</Badge>
        </div>
        {onAskHob ? <AskHobButton onClick={onAskHob} /> : null}
      </div>
    </header>
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
   there isn't room for content + a 400px panel, so it becomes an overlay rather
   than squeezing the content. Lower than the old rail threshold because losing
   the 260px rail gave the content that width back. */
const CHAT_INLINE_MIN = 1020;

function AppShell({ screen, setScreen, children }) {
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
      <TopNav screen={screen} setScreen={setScreen} onAskHob={() => setChat((c) => !c)} />
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

Object.assign(window, { AppShell, TopBar, TopNav });
