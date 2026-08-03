const { Badge, Icon } = window.TinyTavernsDesignSystem_a201fd;

const NAV = [
  { id: "home", icon: "book-open", label: "Campaign" },
  { id: "run", icon: "swords", label: "Run" },
  { id: "bestiary", icon: "footprints", label: "Bestiary" },
];

function RailItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 44, padding: "0 10px",
        background: active ? "var(--surface-raised)" : hover ? "rgba(166,179,192,.07)" : "transparent",
        color: active ? "var(--text-on-dark)" : "var(--text-on-dark-muted)",
        border: "1px solid transparent",
        borderRadius: "var(--r-control)",
        fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)", fontWeight: "var(--fw-medium)", lineHeight: 1,
        cursor: "pointer", textAlign: "left",
        transition: "var(--transition-control)" }}>
      <Icon name={item.icon} size={17} style={{ color: active ? "var(--verdigris-300)" : "inherit" }} />
      {item.label}
    </button>
  );
}

function Rail({ screen, setScreen }) {
  const d = window.TT_DATA;
  return (
    <nav style={{ width: "var(--rail-w)", flex: "0 0 auto", display: "flex", flexDirection: "column",
      background: "var(--surface-panel)", borderRight: "1px solid var(--border-hairline)" }}>
      <div style={{ padding: "18px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="../../assets/icon/mark-on-dark-256.png" alt="" width="30" height="30" style={{ display: "block", flex: "0 0 auto" }} />
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 20, lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>
            Tiny Taverns
          </div>
        </div>
        <div style={{ marginTop: 6, marginLeft: 40, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: "var(--fw-regular)", lineHeight: 1.4, color: "var(--verdigris-300)" }}>
          The DM&rsquo;s side kick
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 10px" }}>
        {NAV.map((n) => <RailItem key={n.id} item={n} active={screen === n.id} onClick={() => setScreen(n.id)} />)}
      </div>
      <div style={{ marginTop: "auto", padding: 14, borderTop: "1px solid var(--border-hairline)" }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: "var(--fw-semibold)", lineHeight: 1.4, color: "var(--text-on-dark)" }}>The Salt Road</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Badge>Session {d.campaign.session}</Badge>
          <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.3 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>{d.campaign.players} players</span>
        </div>
      </div>
    </nav>
  );
}

function TopBar({ title, subtitle, children }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: "var(--gutter)", padding: "14px var(--pad-page)",
      borderBottom: "1px solid var(--border-hairline)", background: "var(--surface-card)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ font: "var(--fw-semibold) var(--fs-display-m)/1.15 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{title}</h2>
        {subtitle ? <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 5 }}>{subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
    </header>
  );
}

function AppShell({ screen, setScreen, children }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--surface-page)" }}>
      <Rail screen={screen} setScreen={setScreen} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>{children}</div>
    </div>
  );
}

Object.assign(window, { AppShell, TopBar, Rail });
