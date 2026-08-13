const { Card, CardContent, Button, Badge, Label, Switch, Icon,
  Tooltip, TooltipTrigger, TooltipContent,
  Toast, ToastTitle, ToastDescription, ToastClose,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } = window.TinyTavernsDesignSystem_a201fd;

const COND = { Hostile: "destructive", Concentrating: "magic", Prone: "info", Downed: "destructive", Legendary: "info" };

function HpBar({ hp, max }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const fill = hp === 0 ? "var(--crimson-400)" : pct <= 34 ? "var(--danger)" : pct <= 67 ? "var(--accent)" : "var(--success)";
  return (
    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7, width: 104 }}>
      <div style={{ flex: 1, height: 6, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: fill, transition: "width var(--dur-base) var(--ease-out)" }} />
      </div>
      <span style={{ minWidth: 44, textAlign: "right", font: "var(--type-stat)", color: hp === 0 ? "var(--crimson-200)" : "var(--text-on-dark)" }}>{hp}/{max}</span>
    </div>
  );
}

function InitRow({ c, active, onSelect, onDamage }) {
  const [hover, setHover] = React.useState(false);
  const down = c.hp === 0;
  return (
    <div onClick={onSelect} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 11, height: "var(--row-h)", padding: "0 10px",
        borderLeft: "3px solid " + (active ? "var(--accent)" : "transparent"),
        borderBottom: "1px solid var(--border-on-dark)",
        background: active ? "rgba(63,163,181,.14)" : hover ? "rgba(255,255,255,.04)" : "transparent",
        opacity: down ? 0.45 : 1, cursor: "pointer" }}>
      <span style={{ width: 24, textAlign: "right", font: "var(--fw-bold) var(--fs-mono-l)/1 var(--font-mono)", color: active ? "var(--peach-300)" : "var(--text-on-dark-muted)" }}>{c.init}</span>
      <Icon name={c.kind === "pc" ? "shield" : "skull"} size={15} style={{ color: c.kind === "pc" ? "var(--info)" : "var(--danger)" }} />
      <div style={{ flex: "1 1 auto", minWidth: 118 }}>
        <div style={{ font: "var(--fw-bold) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-on-dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: down ? "line-through" : "none" }}>{c.name}</div>
        <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.3 var(--font-sans)", color: "var(--text-on-dark-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>{c.conditions.map((k) => <Badge key={k} variant={COND[k] || "secondary"}>{k}</Badge>)}</div>
      <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", font: "var(--type-stat)", color: "var(--text-on-dark-muted)" }}>AC {c.ac}</span>
      <HpBar hp={c.hp} max={c.max} />
      <span style={{ opacity: hover ? 1 : 0 }}>
        <Button variant="outline" size="icon" aria-label="Apply 5 damage" onClick={(ev) => { ev.stopPropagation(); onDamage(c.id); }}
          style={{ width: 30, height: 30, color: "var(--text-on-dark-muted)" }}>
          <Icon name="minus" size={13} />
        </Button>
      </span>
    </div>
  );
}

function DiceTray({ rolls, onRoll }) {
  return (
    <Card tone="panel">
      <CardContent style={{ padding: "var(--pad-panel)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: "var(--fw-semibold)", lineHeight: 1.4, color: "var(--text-on-dark-muted)" }}>Dice tray</span>
          <Tooltip>
            <TooltipTrigger>
              <Button size="sm" onClick={() => onRoll("d20", "1d20")}><Icon name="dices" size={13} />d20</Button>
            </TooltipTrigger>
            <TooltipContent side="left" shortcut="R">Roll for the active creature</TooltipContent>
          </Tooltip>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["d4", "d6", "d8", "d10", "d12", "d100"].map((d) => (
            <Button key={d} variant="outline" size="sm" onClick={() => onRoll(d, "1" + d)}
              style={{ flex: 1, padding: 0, color: "var(--text-on-dark-muted)" }}>{d}</Button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {rolls.length === 0 ? (
            <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>Nothing rolled yet. Tap a die, or a damage line in the stat block.</span>
          ) : rolls.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--surface-panel-sunken)", border: "2px solid var(--border-on-dark)" }}>
              <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.3 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>{r.label}</span>
              <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--text-faint)" }}>{r.dice}</span>
              <span style={{ minWidth: 30, textAlign: "right", fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 19, color: "var(--peach-300)" }}>{r.total}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EncounterRunner({ onExit }) {
  const d = window.TT_DATA;
  const [combatants, setCombatants] = React.useState(d.initiative);
  const [turn, setTurn] = React.useState(1);
  const [round, setRound] = React.useState(3);
  const [rolls, setRolls] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [ending, setEnding] = React.useState(false);
  const [share, setShare] = React.useState(true);

  const roll = (label, dice) => {
    const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(dice) || [];
    const n = Number(m[1] || 1), sides = Number(m[2] || 20), bonus = Number(m[3] || 0);
    let total = bonus;
    for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
    setRolls((cur) => [{ id: Math.random(), label, dice, total }, ...cur].slice(0, 4));
  };

  const damage = (id) => {
    setCombatants((cur) => cur.map((c) => {
      if (c.id !== id) return c;
      const hp = Math.max(0, c.hp - 5);
      if (hp === 0 && c.hp > 0) setToast({ variant: "success", title: c.name + " downed", detail: "Still in initiative — remove them when you're ready." });
      return { ...c, hp, conditions: hp === 0 && !c.conditions.includes("Downed") ? [...c.conditions, "Downed"] : c.conditions };
    }));
  };

  const next = () => setTurn((t) => {
    const n = (t + 1) % combatants.length;
    if (n === 0) setRound((r) => r + 1);
    return n;
  });

  return (
    <>
      <TopBar title="Ambush in the reeds" subtitle={"Round " + round + " · " + combatants[turn].name + " is up"}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Switch id="share" checked={share} onCheckedChange={setShare} />
          <Label htmlFor="share">Share</Label>
        </span>
        <Tooltip>
          <TooltipTrigger><Button size="sm" onClick={next}>Next turn</Button></TooltipTrigger>
          <TooltipContent shortcut="SPACE">Advance initiative</TooltipContent>
        </Tooltip>
        <Button variant="destructive" size="sm" onClick={() => setEnding(true)}>End</Button>
      </TopBar>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 380px", gap: "var(--s-6)", padding: "var(--s-6) var(--pad-page)", background: "var(--surface-page)" }}>
        <Card tone="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px var(--pad-panel)", borderBottom: "1px solid var(--border-on-dark)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 17, lineHeight: 1.25, color: "var(--text-heading)" }}>Initiative</span>
            <Badge>ROUND {round}</Badge>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <Button variant="outline" size="icon" aria-label="Add combatant" style={{ width: 30, height: 30, color: "var(--text-on-dark-muted)" }}><Icon name="plus" size={13} /></Button>
              <Button variant="outline" size="icon" aria-label="Reroll initiative" style={{ width: 30, height: 30, color: "var(--text-on-dark-muted)" }}><Icon name="shuffle" size={13} /></Button>
              <Button variant={share ? "outline" : "default"} size="icon" aria-label="Hide from players" onClick={() => setShare(!share)} style={{ width: 30, height: 30, color: share ? "var(--text-on-dark-muted)" : undefined }}><Icon name="eye-off" size={13} /></Button>
            </span>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {combatants.map((c, i) => <InitRow key={c.id} c={c} active={i === turn} onSelect={() => setTurn(i)} onDamage={damage} />)}
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", minHeight: 0 }}>
          <StatBlock onRoll={roll} />
          <DiceTray rolls={rolls} onRoll={roll} />
        </div>
      </div>
      {toast ? (
        <div style={{ position: "absolute", right: 24, bottom: 24, zIndex: 40, display: "flex" }}>
          <Toast variant={toast.variant}>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.detail}</ToastDescription>
          </Toast>
          <ToastClose onClick={() => setToast(null)} />
        </div>
      ) : null}
      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent width={400}>
          <DialogHeader>
            <DialogTitle>End the session?</DialogTitle>
            <DialogDescription>Initiative order and hit points are saved to Session 12.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setEnding(false)}>Keep playing</Button>
            <Button variant="destructive" size="sm" onClick={() => { setEnding(false); onExit(); }}>End session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

Object.assign(window, { EncounterRunner });
