const { Card, CardContent, Badge, Button, Icon } = window.TinyTavernsDesignSystem_a201fd;

const sign = (n) => (n >= 0 ? "+" + n : String(n));

/* A titled block on the sheet. Everything on the sheet is one of these so the
   sheet reads as a single grid rather than a pile of cards. */
function SheetSection({ title, action, children, style }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px var(--pad-card)", borderBottom: "1px solid var(--border-hairline)" }}>
        <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: ".08em", textTransform: "uppercase", lineHeight: 1, color: "var(--text-muted)" }}>{title}</span>
        {action}
      </div>
      <CardContent style={{ padding: "var(--pad-card)" }}>{children}</CardContent>
    </Card>
  );
}

/* Ability score. The modifier is the number you actually use at the table, so
   it is the big one; the raw score sits under it. */
function AbilityBlock({ a, onRoll }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onRoll ? () => onRoll(a.key + " check", "1d20" + (a.mod >= 0 ? "+" + a.mod : a.mod)) : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px 8px",
        background: hover && onRoll ? "var(--surface-raised)" : "var(--surface-sunken)",
        border: "1px solid " + (hover && onRoll ? "var(--accent)" : "var(--border-hairline)"),
        borderRadius: "var(--r-md, 4px)", cursor: onRoll ? "pointer" : "default", transition: "var(--transition-control)" }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: "var(--fw-semibold)", letterSpacing: ".1em", lineHeight: 1, color: "var(--text-muted)" }}>{a.key}</span>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 26, lineHeight: 1.1, color: "var(--text-heading)" }}>{sign(a.mod)}</span>
      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--text-faint)" }}>{a.score}</span>
      {a.save !== undefined ? (
        <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: a.prof ? "var(--accent-ink)" : "var(--text-faint)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "var(--r-pill)", background: a.prof ? "var(--accent)" : "transparent", border: "1px solid " + (a.prof ? "var(--accent)" : "var(--border-strong)") }} />
          save {sign(a.save)}
        </span>
      ) : null}
    </button>
  );
}

/* Small labelled number — AC, speed, initiative, proficiency. */
function StatPill({ label, value, tone }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 19, lineHeight: 1.1, color: tone || "var(--text-heading)" }}>{value}</span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: "var(--fw-medium)", letterSpacing: ".06em", textTransform: "uppercase", lineHeight: 1, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function HpTrack({ hp, max, temp }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const fill = hp === 0 ? "var(--crimson-400)" : pct <= 34 ? "var(--danger)" : pct <= 67 ? "var(--accent)" : "var(--success)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 25, lineHeight: 1, color: "var(--text-heading)" }}>{hp}</span>
        <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>/ {max} hp</span>
        {temp ? <Badge variant="info">+{temp} temp</Badge> : null}
        <span style={{ marginLeft: "auto", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>Hit dice 3/5 d10</span>
      </div>
      <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: fill, transition: "width var(--dur-base) var(--ease-out)" }} />
      </div>
    </div>
  );
}

/* Death saves. Three up, three down — clickable because a player marks their
   own, and the DM sees the result. */
function DeathSaves({ value, onChange }) {
  const Row = ({ n, count, tone, label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 58, font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", gap: 5 }}>
        {[1, 2, 3].map((i) => (
          <button key={i} aria-label={label + " " + i} onClick={() => onChange(n, count === i ? i - 1 : i)}
            style={{ width: 15, height: 15, borderRadius: "var(--r-pill)", cursor: "pointer", padding: 0,
              background: i <= count ? tone : "transparent",
              border: "1px solid " + (i <= count ? tone : "var(--border-strong)") }} />
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <Row n="success" count={value.success} tone="var(--success)" label="Successes" />
      <Row n="fail" count={value.fail} tone="var(--danger)" label="Failures" />
    </div>
  );
}

/* Portrait. No art in the system, so this is a lettered plate with an upload
   affordance — honest about being a placeholder. */
function Portrait({ name, size = 84, onUpload }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div style={{ position: "relative", flex: "0 0 auto", width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--accent-soft)", border: "1px solid var(--border-strong)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: size * 0.38, lineHeight: 1, color: "var(--verdigris-300)" }}>{initials}</span>
      {onUpload ? (
        <Button variant="outline" size="icon" aria-label="Upload portrait" onClick={onUpload}
          style={{ position: "absolute", right: -9, bottom: -9, width: 26, height: 26, background: "var(--surface-card)" }}>
          <Icon name="image-plus" size={12} />
        </Button>
      ) : null}
    </div>
  );
}

/* Avatar for a person, not a character. */
function Seat({ initials, tone }) {
  return (
    <span style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: "var(--r-pill)",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: tone === "muted" ? "var(--surface-raised)" : "var(--accent-soft)",
      border: "1px solid " + (tone === "muted" ? "var(--border-hairline)" : "var(--accent)"),
      font: "var(--fw-semibold) 11px/1 var(--font-sans)",
      color: tone === "muted" ? "var(--text-faint)" : "var(--verdigris-300)" }}>{initials || "—"}</span>
  );
}

function KeyVal({ k, v }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ flex: "0 0 92px", font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-faint)" }}>{k}</span>
      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)" }}>{v}</span>
    </div>
  );
}

Object.assign(window, { SheetSection, AbilityBlock, StatPill, HpTrack, DeathSaves, Portrait, Seat, KeyVal, sign });
