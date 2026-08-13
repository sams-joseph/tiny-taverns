const { Card, CardContent, Button, Badge, Icon, Toast, ToastTitle, ToastDescription, ToastClose } = window.TinyTavernsDesignSystem_a201fd;

/* The player's view of a live encounter. Dark, like the DM's runner, because it
   is the same table. Deliberately narrower than the DM's: no monster hit
   points, no initiative editing — only what the DM shares plus your own turn. */

function OrderRow({ c, active }) {
  const you = c.kind === "you";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: "var(--row-h)", padding: "0 10px",
      borderLeft: "3px solid " + (active ? "var(--accent)" : "transparent"),
      borderBottom: "1px solid var(--border-on-dark)",
      background: active ? "rgba(63,163,181,.14)" : "transparent", opacity: c.down ? 0.4 : 1 }}>
      <span style={{ width: 22, textAlign: "right", font: "var(--fw-bold) var(--fs-mono-l)/1 var(--font-mono)", color: active ? "var(--peach-300)" : "var(--text-on-dark-muted)" }}>{c.init}</span>
      <Icon name={c.kind === "npc" ? "skull" : "shield"} size={14} style={{ color: c.kind === "npc" ? "var(--danger)" : you ? "var(--accent)" : "var(--info)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: (you ? "var(--fw-bold)" : "var(--fw-medium)") + " var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-on-dark)", textDecoration: c.down ? "line-through" : "none" }}>{c.name}</div>
        <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.3 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>{c.sub}</div>
      </div>
    </div>
  );
}

function PlayerTable({ onLeave }) {
  const p = window.TT_PLAYER;
  const t = p.table;
  const s = p.sheet;
  const [turnIndex, setTurnIndex] = React.useState(0);
  const [hp, setHp] = React.useState(s.hp);
  const [rolls, setRolls] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [ended, setEnded] = React.useState(false);
  const yours = t.order[turnIndex] && t.order[turnIndex].kind === "you";

  const roll = (label, dice) => {
    const m = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(dice);
    if (!m) return;
    const n = Number(m[1]), sides = Number(m[2]);
    const bonus = m[3] ? (m[3] === "-" ? -Number(m[4]) : Number(m[4])) : 0;
    let total = bonus;
    for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
    setRolls((cur) => [{ id: Math.random(), label, dice, total }, ...cur].slice(0, 6));
    setToast({ title: label + " — " + total, detail: "Fen sees this in his dice tray." });
  };

  return (
    <>
      <TopBar title={t.encounter} subtitle={"Round " + t.round + " · " + (yours ? "it's your turn" : t.order[turnIndex].name + " is up")}>
        <Badge variant={yours ? "success" : "secondary"}>{yours ? "Your turn" : "Waiting"}</Badge>
        <Button variant="secondary" size="sm" onClick={onLeave}>Leave the table</Button>
      </TopBar>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "270px 1fr 300px", gap: "var(--s-6)", padding: "var(--s-6) var(--pad-page)", background: "var(--surface-page)" }}>

        <Card tone="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px var(--pad-panel)", borderBottom: "1px solid var(--border-on-dark)" }}>
            <span style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 16, lineHeight: 1.2, color: "var(--text-heading)" }}>Order</span>
            <Badge>ROUND {t.round}</Badge>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {t.order.map((c, i) => <OrderRow key={c.id} c={c} active={i === turnIndex} />)}
          </div>
          <div style={{ padding: "10px var(--pad-panel)", borderTop: "1px solid var(--border-on-dark)", font: "var(--fw-regular) var(--fs-micro)/1.5 var(--font-sans)", color: "var(--text-faint)" }}>
            Your DM decides what you can see here. Enemy hit points are hidden.
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", minHeight: 0 }}>
          <Card tone="panel" style={{ borderColor: yours ? "var(--accent)" : "var(--border-on-dark)" }}>
            <CardContent style={{ padding: "var(--pad-panel)", display: "flex", alignItems: "center", gap: "var(--s-6)" }}>
              <Portrait name={s.name} size={54} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{s.name}</div>
                <div style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-on-dark-muted)", marginTop: 2 }}>{s.tagline}</div>
              </div>
              <div style={{ flex: "0 0 200px" }}><HpTrack hp={hp} max={s.hpMax} temp={0} /></div>
              <div style={{ display: "flex", gap: 5, flex: "0 0 auto" }}>
                <StatPill label="AC" value={s.ac} />
                <StatPill label="Init" value={sign(s.initiative)} />
              </div>
            </CardContent>
          </Card>

          <Card tone="panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px var(--pad-panel)", borderBottom: "1px solid var(--border-on-dark)" }}>
              <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-on-dark-muted)" }}>
                {yours ? "Take your turn" : "When it comes round"}
              </span>
              <Button variant="outline" size="sm" onClick={() => roll("Initiative", "1d20+1")} style={{ color: "var(--text-on-dark-muted)" }}><Icon name="dices" size={12} />d20</Button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-panel)", display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {s.attacks.map((a) => (
                  <button key={a.name} onClick={() => roll(a.name, a.dice)} disabled={!yours}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "11px 12px", textAlign: "left",
                      background: "var(--surface-panel-sunken)", border: "1px solid " + (yours ? "var(--border-on-dark)" : "var(--border-hairline)"),
                      cursor: yours ? "pointer" : "not-allowed", opacity: yours ? 1 : 0.5, transition: "var(--transition-control)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
                      <span style={{ flex: 1, font: "var(--fw-semibold) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-on-dark)" }}>{a.name}</span>
                      <span style={{ font: "var(--type-stat)", color: "var(--accent-ink)" }}>{a.hit}</span>
                    </span>
                    <span style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>{a.dice} {a.kind}{a.note ? " · " + a.note : ""}</span>
                  </button>
                ))}
              </div>
              <div>
                <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>Other things you can do</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[["Lay on Hands", "heart-pulse"], ["Dash", "wind"], ["Dodge", "shield-half"], ["Help", "hand-helping"], ["Hide", "eye-off"], ["Cast a spell", "sparkles"]].map(([label, icon]) => (
                    <Button key={label} variant="outline" size="sm" disabled={!yours} onClick={() => setToast({ title: label, detail: "Told Fen. He'll ask you for a roll if he needs one." })}
                      style={{ color: "var(--text-on-dark-muted)" }}><Icon name={icon} size={12} />{label}</Button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 9, marginTop: "auto", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-on-dark)" }}>
                <Button variant="outline" size="sm" onClick={() => setHp((h) => Math.max(0, h - 5))} style={{ color: "var(--text-on-dark-muted)" }}><Icon name="minus" size={12} />Take 5</Button>
                <Button variant="outline" size="sm" onClick={() => setHp((h) => Math.min(s.hpMax, h + 5))} style={{ color: "var(--text-on-dark-muted)" }}><Icon name="plus" size={12} />Heal 5</Button>
                <Button size="sm" disabled={!yours} style={{ marginLeft: "auto" }}
                  onClick={() => { setTurnIndex((i) => (i + 1) % t.order.length); setToast({ title: "Turn passed", detail: "Fen's initiative moved on." }); }}>
                  End my turn<Icon name="chevron-right" size={13} />
                </Button>
                {!yours ? <Button variant="secondary" size="sm" style={{ marginLeft: "auto" }} onClick={() => setTurnIndex(0)}>Jump to my turn</Button> : null}
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", minHeight: 0 }}>
          <Card tone="panel">
            <CardContent style={{ padding: "var(--pad-panel)" }}>
              <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 9 }}>Read aloud</div>
              <p style={{ margin: 0, font: "var(--type-read-aloud)", color: "var(--slate-300)" }}>{t.readAloud}</p>
            </CardContent>
          </Card>
          <Card tone="panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px var(--pad-panel)", borderBottom: "1px solid var(--border-on-dark)", font: "var(--fw-semibold) 11px/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-on-dark-muted)" }}>What happened</div>
            <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-panel)", display: "flex", flexDirection: "column", gap: 8 }}>
              {rolls.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--surface-panel-sunken)", border: "1px solid var(--border-on-dark)" }}>
                  <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.3 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>You · {r.label}</span>
                  <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--text-faint)" }}>{r.dice}</span>
                  <span style={{ minWidth: 28, textAlign: "right", fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 18, color: "var(--peach-300)" }}>{r.total}</span>
                </div>
              ))}
              {t.log.map((l, i) => (
                <div key={i} style={{ font: "var(--fw-regular) var(--fs-caption)/1.6 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>
                  <span style={{ color: "var(--text-on-dark)", fontWeight: "var(--fw-semibold)" }}>{l.who}</span> {l.text}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {toast ? (
        <div style={{ position: "absolute", right: 24, bottom: 24, zIndex: 40, display: "flex" }}>
          <Toast><ToastTitle>{toast.title}</ToastTitle><ToastDescription>{toast.detail}</ToastDescription></Toast>
          <ToastClose onClick={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

Object.assign(window, { PlayerTable });
