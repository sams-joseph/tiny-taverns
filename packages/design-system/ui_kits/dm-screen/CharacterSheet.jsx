const { Card, CardContent, Button, Badge, Input, Icon, Tabs, TabsList, TabsTrigger, TabsContent,
  Toast, ToastTitle, ToastDescription, ToastClose } = window.TinyTavernsDesignSystem_a201fd;

function SkillRow({ s }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
      <span style={{ width: 6, height: 6, borderRadius: "var(--r-pill)", flex: "0 0 auto",
        background: s.prof ? "var(--accent)" : "transparent", border: "1px solid " + (s.prof ? "var(--accent)" : "var(--border-strong)") }} />
      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)", color: s.prof ? "var(--text-body)" : "var(--text-muted)" }}>{s.name}</span>
      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.ability}</span>
      <span style={{ minWidth: 26, textAlign: "right", font: "var(--type-stat)", color: s.prof ? "var(--accent-ink)" : "var(--text-muted)" }}>{sign(s.bonus)}</span>
    </div>
  );
}

function AttackRow({ a, onRoll }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: hover ? "var(--surface-raised)" : "var(--surface-sunken)", border: "1px solid var(--border-hairline)", transition: "var(--transition-control)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>{a.name}</div>
        <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>{a.kind}{a.note ? " · " + a.note : ""}</div>
      </div>
      <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{a.hit}</span>
      <Button variant={hover ? "default" : "outline"} size="sm" onClick={() => onRoll(a.name, a.dice)} style={{ minWidth: 74 }}>
        <Icon name="dices" size={12} />{a.dice}
      </Button>
    </div>
  );
}

function SpellRow({ s, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, height: 30 }}>
      <button onClick={onToggle} aria-label={"Prepare " + s.name}
        style={{ width: 13, height: 13, flex: "0 0 auto", cursor: "pointer", padding: 0,
          background: s.prepared ? "var(--magic)" : "transparent",
          border: "1px solid " + (s.prepared ? "var(--magic)" : "var(--border-strong)") }} />
      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)", color: s.prepared ? "var(--text-body)" : "var(--text-muted)" }}>{s.name}</span>
      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.note}</span>
      <Badge variant="outline">L{s.level}</Badge>
    </div>
  );
}

function SlotTrack({ slot, onSpend }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 48, font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)" }}>Level {slot.level}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: slot.total }).map((_, i) => (
          <button key={i} aria-label={"Slot " + (i + 1)} onClick={() => onSpend(slot.level, i)}
            style={{ width: 14, height: 14, cursor: "pointer", padding: 0, transform: "rotate(45deg)",
              background: i < slot.used ? "transparent" : "var(--magic)",
              border: "1px solid " + (i < slot.used ? "var(--border-strong)" : "var(--magic)") }} />
        ))}
      </div>
    </div>
  );
}

function CharacterSheet({ onTable, onBack }) {
  const p = window.TT_PLAYER;
  const s = p.sheet;
  const [rolls, setRolls] = React.useState([]);
  const [deaths, setDeaths] = React.useState(s.deathSaves);
  const [spells, setSpells] = React.useState(s.spellcasting.known);
  const [slots, setSlots] = React.useState(s.spellcasting.slots);
  const [toast, setToast] = React.useState(null);

  const roll = (label, dice) => {
    const m = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(dice);
    if (!m) return;
    const n = Number(m[1]), sides = Number(m[2]);
    const bonus = m[3] ? (m[3] === "-" ? -Number(m[4]) : Number(m[4])) : 0;
    let total = bonus;
    for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
    setRolls((cur) => [{ id: Math.random(), label, dice, total }, ...cur].slice(0, 5));
    setToast({ title: label + " — " + total, detail: "Sent to your DM's dice tray." });
  };

  const xpPct = Math.round((s.xp / s.xpNext) * 100);

  return (
    <>
      <TopBar title={s.name} subtitle={s.tagline}>
        <Badge variant="secondary">{s.campaign}</Badge>
        <Button variant="secondary" size="sm" onClick={onBack}><Icon name="chevron-left" size={13} />Characters</Button>
        <Button size="sm" onClick={onTable}><Icon name="swords" size={13} />Go to the table</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "var(--s-6)", alignItems: "start" }}>

          {/* Identity column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", position: "sticky", top: 0 }}>
            <Card>
              <CardContent style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Portrait name={s.name} size={64} onUpload={() => setToast({ title: "Portrait upload", detail: "Not wired in this kit." })} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "var(--fw-semibold) var(--fs-body-m)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{s.name}</div>
                    <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 3 }}>{s.background} · {s.alignment}</div>
                  </div>
                </div>
                <HpTrack hp={s.hp} max={s.hpMax} temp={s.temp} />
                <div style={{ display: "flex", gap: 5 }}>
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
              </CardContent>
            </Card>
            <SheetSection title="Death saves">
              <DeathSaves value={deaths} onChange={(k, v) => setDeaths((d) => ({ ...d, [k]: v }))} />
              <div style={{ marginTop: 9, font: "var(--fw-regular) var(--fs-micro)/1.5 var(--font-sans)", color: "var(--text-faint)" }}>
                Marks here show on your DM's initiative row straight away.
              </div>
            </SheetSection>
            {rolls.length ? (
              <SheetSection title="Your rolls" action={<Button variant="outline" size="sm" onClick={() => setRolls([])}>Clear</Button>}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {rolls.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
                      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.3 var(--font-sans)", color: "var(--text-muted)" }}>{r.label}</span>
                      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-mono)", color: "var(--text-faint)" }}>{r.dice}</span>
                      <span style={{ minWidth: 28, textAlign: "right", fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 18, color: "var(--verdigris-300)" }}>{r.total}</span>
                    </div>
                  ))}
                </div>
              </SheetSection>
            ) : null}
          </div>

          {/* Sheet body */}
          <Tabs defaultValue="stats">
            <TabsList style={{ marginBottom: "var(--s-6)" }}>
              <TabsTrigger value="stats"><Icon name="hexagon" size={12} />Stats</TabsTrigger>
              <TabsTrigger value="actions"><Icon name="swords" size={12} />Actions</TabsTrigger>
              <TabsTrigger value="gear"><Icon name="backpack" size={12} />Gear</TabsTrigger>
              <TabsTrigger value="story"><Icon name="scroll-text" size={12} />Story</TabsTrigger>
              <TabsTrigger value="log"><Icon name="history" size={12} />Log</TabsTrigger>
            </TabsList>

            <TabsContent value="stats">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
                <SheetSection title="Abilities" action={<span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>Click to roll a check</span>}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 7 }}>
                    {s.abilities.map((a) => <AbilityBlock key={a.key} a={a} onRoll={roll} />)}
                  </div>
                </SheetSection>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-6)", alignItems: "start" }}>
                  <SheetSection title="Skills">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "var(--s-6)" }}>
                      {s.skills.map((k) => <SkillRow key={k.name} s={k} />)}
                    </div>
                  </SheetSection>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
                    <SheetSection title="Proficiencies & languages">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {s.proficiencies.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                      </div>
                    </SheetSection>
                    <SheetSection title="Features & traits">
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                        {s.features.map((f) => (
                          <div key={f.name}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                              <span style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{f.name}</span>
                              {f.note ? <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--accent-ink)" }}>{f.note}</span> : null}
                            </div>
                            <p style={{ margin: "3px 0 0", font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-muted)", maxWidth: "var(--measure)" }}>{f.text}</p>
                          </div>
                        ))}
                      </div>
                    </SheetSection>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="actions">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-6)", alignItems: "start" }}>
                <SheetSection title="Attacks">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {s.attacks.map((a) => <AttackRow key={a.name} a={a} onRoll={roll} />)}
                  </div>
                </SheetSection>
                <SheetSection title="Spellcasting"
                  action={<span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.spellcasting.ability} · save {s.spellcasting.save} · atk {s.spellcasting.attack}</span>}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingBottom: "var(--s-5)", marginBottom: "var(--s-5)", borderBottom: "1px solid var(--border-hairline)" }}>
                    {slots.map((sl) => (
                      <SlotTrack key={sl.level} slot={sl}
                        onSpend={(lvl, i) => setSlots((cur) => cur.map((x) => x.level === lvl ? { ...x, used: i < x.used ? i : i + 1 } : x))} />
                    ))}
                  </div>
                  {spells.map((sp, i) => (
                    <SpellRow key={sp.name} s={sp}
                      onToggle={() => setSpells((cur) => cur.map((x, j) => j === i ? { ...x, prepared: !x.prepared } : x))} />
                  ))}
                </SheetSection>
              </div>
            </TabsContent>

            <TabsContent value="gear">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "var(--s-6)", alignItems: "start" }}>
                <SheetSection title="Carried" action={<Button variant="outline" size="sm"><Icon name="plus" size={12} />Add</Button>}>
                  {s.inventory.map((it, i) => (
                    <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10, height: 32, borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
                      <Icon name={it.equipped ? "shield" : "package"} size={14} style={{ color: it.equipped ? "var(--accent-ink)" : "var(--text-faint)" }} />
                      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)", color: "var(--text-body)" }}>{it.name}</span>
                      {it.note ? <Badge variant="outline">{it.note}</Badge> : null}
                      <span style={{ minWidth: 24, textAlign: "right", font: "var(--type-stat)", color: "var(--text-muted)" }}>×{it.qty}</span>
                      <span style={{ minWidth: 40, textAlign: "right", font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>{it.weight} lb</span>
                    </div>
                  ))}
                </SheetSection>
                <SheetSection title="Coin">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {Object.entries(s.currency).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: v ? "var(--text-muted)" : "var(--text-faint)" }}>{k}</span>
                        <span style={{ font: "var(--type-stat)", color: v ? "var(--text-heading)" : "var(--text-faint)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </SheetSection>
              </div>
            </TabsContent>

            <TabsContent value="story">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--s-6)", alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
                  <SheetSection title="Backstory" action={<Button variant="outline" size="sm"><Icon name="pencil" size={12} />Edit</Button>}>
                    {s.backstory.split("\n\n").map((para, i) => (
                      <p key={i} style={{ margin: i ? "var(--s-5) 0 0" : 0, font: "var(--type-read-aloud)", color: "var(--slate-300)", maxWidth: "var(--measure)" }}>{para}</p>
                    ))}
                  </SheetSection>
                  <SheetSection title="Journal" action={<Button variant="outline" size="sm"><Icon name="plus" size={12} />Entry</Button>}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
                      {s.journal.map((j) => (
                        <div key={j.session}>
                          <Badge variant="secondary">Session {j.session}</Badge>
                          <p style={{ margin: "6px 0 0", font: "var(--fw-regular) var(--fs-body-s)/1.6 var(--font-sans)", color: "var(--text-muted)", maxWidth: "var(--measure)" }}>{j.text}</p>
                        </div>
                      ))}
                    </div>
                  </SheetSection>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
                  <SheetSection title="Bonds, ideals, flaws">
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                      <KeyVal k="Personality" v={s.traits.personality} />
                      <KeyVal k="Ideal" v={s.traits.ideal} />
                      <KeyVal k="Bond" v={s.traits.bond} />
                      <KeyVal k="Flaw" v={s.traits.flaw} />
                    </div>
                  </SheetSection>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="log">
              <SheetSection title="Level ups">
                {s.levelUps.map((l, i) => (
                  <div key={l.level} style={{ display: "flex", gap: 14, padding: "12px 0", borderTop: i ? "1px solid var(--border-hairline)" : "none" }}>
                    <div style={{ flex: "0 0 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 21, lineHeight: 1, color: "var(--verdigris-300)" }}>{l.level}</span>
                      <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>level</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Badge variant="outline">Session {l.session}</Badge>
                      <p style={{ margin: "6px 0 0", font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)", maxWidth: "var(--measure)" }}>{l.note}</p>
                    </div>
                  </div>
                ))}
              </SheetSection>
            </TabsContent>
          </Tabs>
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

Object.assign(window, { CharacterSheet });
