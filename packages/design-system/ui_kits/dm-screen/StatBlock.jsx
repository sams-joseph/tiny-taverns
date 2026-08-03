const { Card, CardHeader, CardTitle, CardContent, Badge, Button, Icon } = window.TinyTavernsDesignSystem_a201fd;

function AbilityCell({ label, score, mod }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "6px 0", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", borderRadius: "var(--r-sm)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: "var(--fw-medium)", lineHeight: 1.4, letterSpacing: "var(--ls-caps)", color: "var(--text-on-dark-muted)" }}>{label}</div>
      <div style={{ font: "var(--fw-medium) var(--fs-mono-l)/1.3 var(--font-mono)", color: "var(--text-on-dark)" }}>{score}</div>
      <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--verdigris-300)" }}>{mod}</div>
    </div>
  );
}

function StatLine({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ minWidth: 54, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: "var(--fw-medium)", lineHeight: 1.5, color: "var(--text-on-dark-muted)" }}>{label}</span>
      <span style={{ font: "var(--type-stat)", color: "var(--text-on-dark)" }}>{value}</span>
    </div>
  );
}

function StatBlock({ onRoll }) {
  const s = window.TT_DATA.statblock;
  return (
    <Card tone="panel" style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <CardTitle style={{ flex: 1, color: "var(--text-heading)" }}>{s.name}</CardTitle>
          <Badge variant="destructive">Hostile</Badge>
        </div>
        <div style={{ font: "italic var(--fw-regular) var(--fs-body-s)/1.4 var(--font-serif)", color: "var(--text-on-dark-muted)" }}>{s.meta}</div>
      </CardHeader>
      <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
          <StatLine label="AC" value={s.ac} /><StatLine label="HP" value={s.hp} /><StatLine label="SPEED" value={s.speed} /><StatLine label="CR" value={s.cr} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>{s.abilities.map(([l, sc, m]) => <AbilityCell key={l} label={l} score={sc} mod={m} />)}</div>
        <div style={{ padding: "11px 13px", background: "rgba(63,163,181,.10)", borderLeft: "3px solid var(--verdigris-300)", borderRadius: "0 var(--r-sm) var(--r-sm) 0" }}>
          <div style={{ marginBottom: 7, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: "var(--fw-semibold)", lineHeight: 1.4, color: "var(--verdigris-300)" }}>Read aloud</div>
          <p style={{ margin: 0, font: "var(--type-read-aloud)", fontSize: "var(--fs-body-s)", color: "var(--slate-50)" }}>{s.readAloud}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
          {s.traits.map((t) => (
            <div key={t.name}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: "var(--fw-semibold)", lineHeight: 1.35, color: "var(--text-heading)" }}>{t.name}</span>
                {t.dice ? (
                  <Button variant="outline" size="sm" onClick={() => onRoll(t.name, t.dice)} style={{ color: "var(--verdigris-300)" }}>
                    <Icon name="dices" size={13} />{t.dice}
                  </Button>
                ) : null}
              </div>
              <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>{t.text}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

Object.assign(window, { StatBlock });
