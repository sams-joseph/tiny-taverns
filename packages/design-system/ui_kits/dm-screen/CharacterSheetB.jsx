const { Card, CardContent, Button, Badge, Icon, Toast, ToastTitle, ToastDescription, ToastClose } = window.TinyTavernsDesignSystem_a201fd;

/* Variant B — one continuous sheet, no tabs. Wide: sticky vitals rail, scrolling document,
   sticky section spine. Narrow: the same single surface, with the rail collapsing into a
   compact vitals header and the spine becoming a sticky scrolling chip row. */

const B_NARROW = 900;

function useNarrow(bp) {
  const forced = typeof document !== "undefined" && document.body.dataset.narrow === "1";
  const [n, setN] = React.useState(() => forced || window.innerWidth < bp);
  React.useEffect(() => {
    if (forced) return;
    const on = () => setN(window.innerWidth < bp);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [bp, forced]);
  return n;
}

const B_SECTIONS = [
  { id: "abilities", label: "Abilities & skills", short: "Abilities", icon: "hexagon" },
  { id: "actions", label: "Actions", short: "Actions", icon: "swords" },
  { id: "magic", label: "Spellcasting", short: "Spells", icon: "sparkles" },
  { id: "features", label: "Features", short: "Features", icon: "scroll-text" },
  { id: "gear", label: "Gear & coin", short: "Gear", icon: "backpack" },
  { id: "story", label: "Story", short: "Story", icon: "book-open" },
  { id: "log", label: "Log", short: "Log", icon: "history" },
];

function Spine({ active, onGo }) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {B_SECTIONS.map((it) => (
        <button key={it.id} onClick={() => onGo(it.id)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", cursor: "pointer", textAlign: "left", background: active === it.id ? "var(--surface-raised)" : "transparent", border: "1px solid " + (active === it.id ? "var(--border-hairline)" : "transparent"), transition: "var(--transition-control)" }}>
          <Icon name={it.icon} size={12} style={{ color: active === it.id ? "var(--accent-ink)" : "var(--text-faint)" }} />
          <span style={{ font: (active === it.id ? "var(--fw-semibold)" : "var(--fw-regular)") + " var(--fs-caption)/1 var(--font-sans)", color: active === it.id ? "var(--text-heading)" : "var(--text-muted)" }}>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* Narrow: the spine flattens into a horizontal rail that stays put while the sheet scrolls. */
function SpineRail({ active, onGo }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.querySelector('[data-on="1"]');
    if (el && ref.current) ref.current.scrollTo({ left: Math.max(0, el.offsetLeft - 40), behavior: "smooth" });
  }, [active]);
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 5, margin: "0 calc(var(--pad-page) * -1)", padding: "0 var(--pad-page)", background: "var(--surface-page)", borderBottom: "1px solid var(--border-hairline)" }}>
      <div ref={ref} style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0", scrollbarWidth: "none" }}>
        {B_SECTIONS.map((it) => (
          <button key={it.id} data-on={active === it.id ? "1" : "0"} onClick={() => onGo(it.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto", minHeight: 34, padding: "0 12px", cursor: "pointer", borderRadius: "var(--r-pill)", background: active === it.id ? "var(--accent-soft)" : "var(--surface-sunken)", border: "1px solid " + (active === it.id ? "var(--accent)" : "var(--border-hairline)"), transition: "var(--transition-control)" }}>
            <Icon name={it.icon} size={12} style={{ color: active === it.id ? "var(--peach-300)" : "var(--text-faint)" }} />
            <span style={{ font: "var(--fw-medium) var(--fs-caption)/1 var(--font-sans)", color: active === it.id ? "var(--peach-300)" : "var(--text-muted)" }}>{it.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BSkill({ s }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 27 }}>
      <span style={{ width: 5, height: 5, borderRadius: "var(--r-pill)", flex: "0 0 auto", background: s.prof ? "var(--accent)" : "transparent", border: "1px solid " + (s.prof ? "var(--accent)" : "var(--border-strong)") }} />
      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1.2 var(--font-sans)", color: s.prof ? "var(--text-body)" : "var(--text-muted)" }}>{s.name}</span>
      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.ability}</span>
      <span style={{ minWidth: 24, textAlign: "right", font: "var(--type-stat)", color: s.prof ? "var(--accent-ink)" : "var(--text-muted)" }}>{sign(s.bonus)}</span>
    </div>
  );
}

function BAttack({ a, onRoll, narrow }) {
  const [h, setH] = React.useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: narrow ? "10px 11px" : "9px 10px", background: h ? "var(--surface-raised)" : "var(--surface-sunken)", border: "1px solid var(--border-hairline)", transition: "var(--transition-control)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>{a.name}</div>
        <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>{a.kind}{a.note ? " · " + a.note : ""}</div>
      </div>
      <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{a.hit}</span>
      <Button variant={h ? "default" : "outline"} size={narrow ? "default" : "sm"} onClick={() => onRoll(a.name, a.dice)} style={{ minWidth: 78, minHeight: narrow ? 44 : undefined }}><Icon name="dices" size={12} />{a.dice}</Button>
    </div>
  );
}

function BSpell({ s, onToggle, narrow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minHeight: narrow ? 40 : 29 }}>
      <button onClick={onToggle} aria-label={"Prepare " + s.name}
        style={{ width: narrow ? 22 : 12, height: narrow ? 22 : 12, flex: "0 0 auto", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none" }}>
        <span style={{ width: 12, height: 12, background: s.prepared ? "var(--magic)" : "transparent", border: "1px solid " + (s.prepared ? "var(--magic)" : "var(--border-strong)") }} />
      </button>
      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1.2 var(--font-sans)", color: s.prepared ? "var(--text-body)" : "var(--text-muted)" }}>{s.name}</span>
      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.note}</span>
      <Badge variant="outline">L{s.level}</Badge>
    </div>
  );
}

function BSlots({ slots, onSpend, narrow }) {
  const d = narrow ? 18 : 13;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: narrow ? "12px 20px" : "10px 18px" }}>
      {slots.map((sl) => (
        <div key={sl.level} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)" }}>L{sl.level}</span>
          <div style={{ display: "flex", gap: narrow ? 7 : 4 }}>
            {Array.from({ length: sl.total }).map((_, i) => (
              <button key={i} aria-label={"Slot " + (i + 1)} onClick={() => onSpend(sl.level, i)}
                style={{ width: d, height: d, cursor: "pointer", padding: 0, transform: "rotate(45deg)", background: i < sl.used ? "transparent" : "var(--magic)", border: "1px solid " + (i < sl.used ? "var(--border-strong)" : "var(--magic)") }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CharacterSheetB({ onTable, onBack }) {
  const s = window.TT_PLAYER.sheet;
  const narrow = useNarrow(B_NARROW);
  const [rolls, setRolls] = React.useState([]);
  const [deaths, setDeaths] = React.useState(s.deathSaves);
  const [spells, setSpells] = React.useState(s.spellcasting.known);
  const [slots, setSlots] = React.useState(s.spellcasting.slots);
  const [toast, setToast] = React.useState(null);
  const [active, setActive] = React.useState("abilities");
  const [vitalsOpen, setVitalsOpen] = React.useState(false);
  const scroller = React.useRef(null);
  const refs = React.useRef({});

  const roll = (label, dice) => {
    const m = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(dice);
    if (!m) return;
    const n = Number(m[1]), sides = Number(m[2]);
    const bonus = m[3] ? (m[3] === "-" ? -Number(m[4]) : Number(m[4])) : 0;
    let total = bonus;
    for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
    setRolls((cur) => [{ id: Math.random(), label, dice, total }, ...cur].slice(0, 6));
    setToast({ title: label + " — " + total, detail: "Sent to your DM's dice tray." });
  };

  const go = (id) => {
    const el = refs.current[id], sc = scroller.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - (narrow ? 58 : 12), behavior: "smooth" });
    setActive(id);
  };

  const onScroll = () => {
    const sc = scroller.current; if (!sc) return;
    let cur = B_SECTIONS[0].id;
    for (const sec of B_SECTIONS) { const el = refs.current[sec.id]; if (el && el.offsetTop - (narrow ? 100 : 60) <= sc.scrollTop) cur = sec.id; }
    setActive(cur);
  };

  const Sec = ({ id, title, action, children }) => (
    <div ref={(el) => { refs.current[id] = el; }}>
      <SheetSection title={title} action={action}>{children}</SheetSection>
    </div>
  );

  const xpPct = Math.round((s.xp / s.xpNext) * 100);
  const two = narrow ? "minmax(0,1fr)" : "1fr 1fr";

  const rollLog = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-faint)" }}>Your rolls</span>
        {rolls.length ? <button onClick={() => setRolls([])} style={{ background: "none", border: "none", cursor: "pointer", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)" }}>Clear</button> : null}
      </div>
      {rolls.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rolls.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "var(--fw-regular) var(--fs-micro)/1.3 var(--font-sans)", color: "var(--text-muted)" }}>{r.label}</span>
              <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--text-faint)" }}>{r.dice}</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 16, color: "var(--peach-300)" }}>{r.total}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-micro)/1.5 var(--font-sans)", color: "var(--text-faint)" }}>Rolls you make land here and in your DM's tray.</p>
      )}
    </div>
  );

  /* Wide: a full identity card in the left rail. Narrow: a two-line summary that expands. */
  const vitals = narrow ? (
    <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hairline)" }}>
      <button onClick={() => setVitalsOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: 11, cursor: "pointer", background: "transparent", border: "none", textAlign: "left" }}>
        <Portrait name={s.name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.2 var(--font-display)", color: "var(--text-heading)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 17, lineHeight: 1, color: "var(--healing)" }}>{s.hp}</span>
            <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>/ {s.hpMax} hp</span>
            <span style={{ width: 1, height: 11, background: "var(--border-hairline)" }} />
            <span style={{ font: "var(--type-stat)", color: "var(--text-body)" }}>AC {s.ac}</span>
            <span style={{ font: "var(--type-stat)", color: "var(--text-body)" }}>{sign(s.initiative)} init</span>
          </div>
        </div>
        <Icon name={vitalsOpen ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--text-faint)" }} />
      </button>
      {vitalsOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", padding: "0 11px 13px" }}>
          <HpTrack hp={s.hp} max={s.hpMax} temp={s.temp} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
            <StatPill label="AC" value={s.ac} />
            <StatPill label="Init" value={sign(s.initiative)} />
            <StatPill label="Speed" value={s.speed} />
            <StatPill label="Prof" value={sign(s.proficiency)} tone="var(--accent-ink)" />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)", marginBottom: 5 }}>
              <span>Level {s.level || 5}</span><span>{s.xp.toLocaleString()} / {s.xpNext.toLocaleString()} xp</span>
            </div>
            <div style={{ height: 4, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
              <div style={{ width: xpPct + "%", height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
          <div style={{ paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
            <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>Death saves</div>
            <DeathSaves value={deaths} onChange={(k, v) => setDeaths((d) => ({ ...d, [k]: v }))} />
          </div>
        </div>
      ) : null}
    </div>
  ) : (
    <div style={{ position: "sticky", top: 0 }}>
      <Card>
        <CardContent style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Portrait name={s.name} size={60} onUpload={() => setToast({ title: "Portrait upload", detail: "Not wired in this kit." })} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "var(--fw-semibold) var(--fs-body-m)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{s.name}</div>
              <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 3 }}>{s.background} · {s.alignment}</div>
            </div>
          </div>
          <HpTrack hp={s.hp} max={s.hpMax} temp={s.temp} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 5 }}>
            <StatPill label="AC" value={s.ac} />
            <StatPill label="Init" value={sign(s.initiative)} />
            <StatPill label="Speed" value={s.speed} />
            <StatPill label="Prof" value={sign(s.proficiency)} tone="var(--accent-ink)" />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)", marginBottom: 5 }}>
              <span>Level {s.level || 5}</span><span>{s.xp.toLocaleString()} / {s.xpNext.toLocaleString()} xp</span>
            </div>
            <div style={{ height: 4, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
              <div style={{ width: xpPct + "%", height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
          <div style={{ paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
            <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>Death saves</div>
            <DeathSaves value={deaths} onChange={(k, v) => setDeaths((d) => ({ ...d, [k]: v }))} />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", minWidth: 0 }}>
      <Sec id="abilities" title="Abilities & skills" action={narrow ? null : <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>Click an ability to roll a check</span>}>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(3,1fr)" : "repeat(6,1fr)", gap: 7 }}>
          {s.abilities.map((a) => <AbilityBlock key={a.key} a={a} onRoll={roll} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(auto-fit,minmax(168px,1fr))", columnGap: "var(--s-6)", marginTop: "var(--s-6)", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
          {s.skills.map((k) => <BSkill key={k.name} s={k} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "var(--s-6)", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
          {s.proficiencies.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
        </div>
      </Sec>

      <Sec id="actions" title="Actions">
        <div style={{ display: "grid", gridTemplateColumns: two, gap: 7 }}>
          {s.attacks.map((a) => <BAttack key={a.name} a={a} onRoll={roll} narrow={narrow} />)}
        </div>
      </Sec>

      <Sec id="magic" title="Spellcasting" action={<span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{narrow ? "save " + s.spellcasting.save : s.spellcasting.ability + " · save " + s.spellcasting.save + " · atk " + s.spellcasting.attack}</span>}>
        <div style={{ paddingBottom: "var(--s-5)", marginBottom: "var(--s-5)", borderBottom: "1px solid var(--border-hairline)" }}>
          <BSlots slots={slots} narrow={narrow} onSpend={(lvl, i) => setSlots((cur) => cur.map((x) => x.level === lvl ? { ...x, used: i < x.used ? i : i + 1 } : x))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: two, columnGap: "var(--s-6)" }}>
          {spells.map((sp, i) => <BSpell key={sp.name} s={sp} narrow={narrow} onToggle={() => setSpells((cur) => cur.map((x, j) => j === i ? { ...x, prepared: !x.prepared } : x))} />)}
        </div>
      </Sec>

      <Sec id="features" title="Features & traits">
        <div style={{ display: "grid", gridTemplateColumns: two, gap: "var(--s-6)" }}>
          {s.features.map((f) => (
            <div key={f.name}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{f.name}</span>
                {f.note ? <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--accent-ink)" }}>{f.note}</span> : null}
              </div>
              <p style={{ margin: "3px 0 0", font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>{f.text}</p>
            </div>
          ))}
        </div>
      </Sec>

      <Sec id="gear" title="Gear & coin" action={<Button variant="outline" size="sm"><Icon name="plus" size={12} />Add</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 168px", gap: "var(--s-6)", alignItems: "start" }}>
          <div>
            {s.inventory.map((it, i) => (
              <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: narrow ? 40 : 32, borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
                <Icon name={it.equipped ? "shield" : "package"} size={14} style={{ color: it.equipped ? "var(--accent-ink)" : "var(--text-faint)" }} />
                <span style={{ flex: 1, minWidth: 0, font: "var(--fw-regular) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-body)" }}>{it.name}</span>
                {it.note ? <Badge variant="outline">{it.note}</Badge> : null}
                <span style={{ minWidth: 24, textAlign: "right", font: "var(--type-stat)", color: "var(--text-muted)" }}>×{it.qty}</span>
                {narrow ? null : <span style={{ minWidth: 40, textAlign: "right", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{it.weight} lb</span>}
              </div>
            ))}
          </div>
          <div style={{ display: narrow ? "grid" : "flex", gridTemplateColumns: "repeat(5,1fr)", flexDirection: "column", gap: 6, padding: "var(--s-5)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
            {Object.entries(s.currency).map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: narrow ? "column" : "row", alignItems: narrow ? "center" : "center", gap: narrow ? 3 : 8 }}>
                <span style={{ flex: narrow ? undefined : 1, font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: v ? "var(--text-muted)" : "var(--text-faint)" }}>{k}</span>
                <span style={{ font: "var(--type-stat)", color: v ? "var(--text-heading)" : "var(--text-faint)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </Sec>

      <Sec id="story" title="Story" action={<Button variant="outline" size="sm"><Icon name="pencil" size={12} />Edit</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) 240px", gap: "var(--s-6)", alignItems: "start" }}>
          <div>
            {s.backstory.split("\n\n").map((para, i) => (
              <p key={i} style={{ margin: i ? "var(--s-5) 0 0" : 0, font: "var(--type-read-aloud)", color: "var(--slate-300)" }}>{para}</p>
            ))}
            <div style={{ marginTop: "var(--s-6)", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
              {s.journal.map((j) => (
                <div key={j.session}>
                  <Badge variant="secondary">Session {j.session}</Badge>
                  <p style={{ margin: "6px 0 0", font: "var(--fw-regular) var(--fs-body-s)/1.6 var(--font-sans)", color: "var(--text-muted)" }}>{j.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", padding: "var(--s-5)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
            <KeyVal k="Personality" v={s.traits.personality} />
            <KeyVal k="Ideal" v={s.traits.ideal} />
            <KeyVal k="Bond" v={s.traits.bond} />
            <KeyVal k="Flaw" v={s.traits.flaw} />
          </div>
        </div>
      </Sec>

      <Sec id="log" title="Level ups">
        {s.levelUps.map((l, i) => (
          <div key={l.level} style={{ display: "flex", gap: 14, padding: "12px 0", borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
            <div style={{ flex: "0 0 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 21, lineHeight: 1, color: "var(--peach-300)" }}>{l.level}</span>
              <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>level</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Badge variant="outline">Session {l.session}</Badge>
              <p style={{ margin: "6px 0 0", font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)" }}>{l.note}</p>
            </div>
          </div>
        ))}
      </Sec>

      {narrow ? <div style={{ paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>{rollLog}</div> : null}
    </div>
  );

  return (
    <>
      <TopBar title={s.name} subtitle={narrow ? null : s.tagline}>
        {narrow ? null : <Badge variant="secondary">{s.campaign}</Badge>}
        <Button variant="secondary" size="sm" onClick={onBack}><Icon name="chevron-left" size={13} />{narrow ? "" : "Characters"}</Button>
        <Button size="sm" onClick={onTable}><Icon name="swords" size={13} />{narrow ? "Table" : "Go to the table"}</Button>
      </TopBar>
      <div ref={scroller} onScroll={onScroll} style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        {narrow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", minWidth: 0 }}>
            {vitals}
            <SpineRail active={active} onGo={go} />
            {body}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "252px minmax(0,1fr) 186px", gap: "var(--s-6)", alignItems: "start", minWidth: 0 }}>
            {vitals}
            {body}
            <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
              <Spine active={active} onGo={go} />
              <div style={{ paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>{rollLog}</div>
            </div>
          </div>
        )}
      </div>
      {toast ? (
        <div style={{ position: "absolute", right: narrow ? 12 : 24, bottom: narrow ? 12 : 24, left: narrow ? 12 : undefined, zIndex: 40, display: "flex" }}>
          <Toast><ToastTitle>{toast.title}</ToastTitle><ToastDescription>{toast.detail}</ToastDescription></Toast>
          <ToastClose onClick={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

Object.assign(window, { CharacterSheetB });
