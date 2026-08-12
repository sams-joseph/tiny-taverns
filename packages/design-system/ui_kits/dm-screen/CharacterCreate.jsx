const { Card, CardContent, Button, Badge, Input, Icon, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Toast, ToastTitle, ToastDescription, ToastClose } = window.TinyTavernsDesignSystem_a201fd;

const STEPS = [
  { id: 1, label: "Describe them" },
  { id: 2, label: "Correct the draft" },
  { id: 3, label: "Find a table" },
];

function Stepper({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {STEPS.map((s, i) => {
        const done = step > s.id, now = step === s.id;
        return (
          <React.Fragment key={s.id}>
            {i ? <span style={{ width: 26, height: 1, background: done || now ? "var(--accent)" : "var(--border-hairline)" }} /> : null}
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 20, height: 20, borderRadius: "var(--r-pill)", display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "var(--accent)" : now ? "var(--accent-soft)" : "transparent",
                border: "1px solid " + (done || now ? "var(--accent)" : "var(--border-strong)"),
                font: "var(--fw-semibold) 10px/1 var(--font-sans)",
                color: done ? "var(--text-on-accent)" : now ? "var(--verdigris-300)" : "var(--text-faint)" }}>
                {done ? <Icon name="check" size={11} /> : s.id}
              </span>
              <span style={{ font: "var(--fw-medium) var(--fs-caption)/1 var(--font-sans)", color: now ? "var(--text-heading)" : "var(--text-faint)" }}>{s.label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* One editable field of the draft. Every field Hob filled in is editable in
   place — the draft is a starting point, not a result. */
function DraftField({ label, value, onChange, multiline, hint }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(value);
  const commit = () => { setEditing(false); onChange && onChange(val); };
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid var(--border-hairline)" }}>
      <span style={{ flex: "0 0 96px", paddingTop: 2, font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          multiline ? (
            <textarea autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} rows={5}
              style={{ width: "100%", padding: 9, background: "var(--surface-sunken)", border: "1px solid var(--accent)", color: "var(--text-body)", font: "var(--fw-regular) var(--fs-body-s)/1.6 var(--font-sans)", resize: "vertical" }} />
          ) : (
            <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()} style={{ height: 30 }} />
          )
        ) : (
          <button onClick={() => setEditing(true)}
            style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "text",
              font: "var(--fw-regular) var(--fs-body-s)/1.6 var(--font-sans)", color: "var(--text-body)", whiteSpace: "pre-wrap" }}>
            {val}
          </button>
        )}
        {hint ? <div style={{ marginTop: 4, font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-faint)" }}>{hint}</div> : null}
      </div>
    </div>
  );
}

function CharacterCreate({ onDone, onCancel }) {
  const p = window.TT_PLAYER;
  const d = p.draft;
  const [step, setStep] = React.useState(1);
  const [prose, setProse] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [abilities, setAbilities] = React.useState(d.abilities);
  const [skills, setSkills] = React.useState(d.skills);
  const [campaign, setCampaign] = React.useState("salt-road");
  const [toast, setToast] = React.useState(null);

  const draftIt = () => {
    setThinking(true);
    setTimeout(() => { setThinking(false); setStep(2); }, 1100);
  };

  const reroll = () => {
    setAbilities((cur) => cur.map((a) => {
      const score = 8 + Math.floor(Math.random() * 9);
      return { ...a, score, mod: Math.floor((score - 10) / 2) };
    }));
    setToast({ title: "Rolled again", detail: "4d6 drop lowest, six times. Hob assigned them to fit the description." });
  };

  return (
    <>
      <TopBar title="New character" subtitle="Tell Hob who they are. He drafts the numbers; you correct them.">
        <Stepper step={step} />
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      </TopBar>

      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>

        {step === 1 ? (
          <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <HobAvatar />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-body-m)/1.6 var(--font-sans)", color: "var(--text-body)" }}>
                  Who are they? A few sentences is plenty — where they're from, what they're good at, what they won't do.
                </p>
                <p style={{ margin: "8px 0 0", font: "italic var(--fw-regular) var(--fs-body-s)/1.6 var(--font-display)", color: "var(--text-faint)" }}>
                  Don't give me a class. I'd rather work it out from the person.
                </p>
              </div>
            </div>
            <textarea value={prose} onChange={(e) => setProse(e.target.value)} rows={7}
              placeholder="A wood elf who grew up in a river town, apprenticed to a herbalist who turned out to be feeding something in the cellar…"
              style={{ width: "100%", padding: "var(--pad-card)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)",
                color: "var(--text-body)", font: "var(--fw-regular) var(--fs-body-m)/1.7 var(--font-sans)", resize: "vertical" }} />
            <div>
              <div style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 9 }}>Or start from one of these</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {p.starters.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => setProse(s + ". ")}>{s}</Button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button size="sm" disabled={prose.trim().length < 12 || thinking} onClick={draftIt}>
                <Icon name="sparkles" size={13} />Have Hob draft the sheet
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStep(2)}>Fill it in myself</Button>
              {thinking ? <Thinking /> : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "var(--s-7)", alignItems: "start", maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
              <SheetSection title="Who they are">
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: "var(--s-5)" }}>
                  <Portrait name={d.name} size={64} onUpload={() => setToast({ title: "Portrait upload", detail: "Not wired in this kit." })} />
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{d.name}</div>
                    <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 3 }}>{d.ancestry} {d.cls} {d.level} · {d.subclass}</div>
                  </div>
                </div>
                <DraftField label="Name" value={d.name} />
                <DraftField label="Ancestry" value={d.ancestry} />
                <DraftField label="Class" value={d.cls} hint="Wisdom casting, and you said she watches everything." />
                <DraftField label="Subclass" value={d.subclass} />
                <DraftField label="Background" value={d.background} />
              </SheetSection>

              <SheetSection title="Abilities" action={<Button variant="outline" size="sm" onClick={reroll}><Icon name="dices" size={12} />Roll again</Button>}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 7 }}>
                  {abilities.map((a) => <AbilityBlock key={a.key} a={a} />)}
                </div>
                <div style={{ marginTop: 10, font: "var(--fw-regular) var(--fs-micro)/1.5 var(--font-sans)", color: "var(--text-faint)" }}>
                  Standard array, assigned to fit the description. Roll again for 4d6-drop-lowest, or drag a score onto another ability.
                </div>
              </SheetSection>

              <SheetSection title="Skills" action={<span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: skills.length === 4 ? "var(--text-faint)" : "var(--danger)" }}>{skills.length} of 4 picked</span>}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Nature", "Perception", "Medicine", "Survival", "Animal Handling", "Insight", "Arcana", "Religion", "Stealth", "Athletics"].map((k) => {
                    const on = skills.includes(k);
                    return (
                      <Button key={k} variant={on ? "default" : "outline"} size="sm"
                        onClick={() => setSkills((cur) => on ? cur.filter((x) => x !== k) : cur.length < 4 ? [...cur, k] : cur)}>
                        {on ? <Icon name="check" size={11} /> : null}{k}
                      </Button>
                    );
                  })}
                </div>
              </SheetSection>

              <SheetSection title="Starting kit">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {d.kit.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                </div>
              </SheetSection>

              <SheetSection title="Story">
                <DraftField label="Backstory" value={d.backstory} multiline />
                <DraftField label="Bond" value={d.traits.bond} />
                <DraftField label="Ideal" value={d.traits.ideal} />
                <DraftField label="Flaw" value={d.traits.flaw} />
              </SheetSection>

              <div style={{ display: "flex", gap: 9 }}>
                <Button variant="secondary" size="sm" onClick={() => setStep(1)}><Icon name="chevron-left" size={13} />Rewrite the description</Button>
                <Button size="sm" onClick={() => setStep(3)}>This is her<Icon name="chevron-right" size={13} /></Button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", position: "sticky", top: 0 }}>
              <SheetSection title="What Hob did">
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                  {d.why.map((w) => (
                    <div key={w} style={{ display: "flex", gap: 9 }}>
                      <Icon name="corner-down-right" size={13} style={{ color: "var(--accent-ink)", marginTop: 3 }} />
                      <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.6 var(--font-sans)", color: "var(--text-muted)" }}>{w}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: "var(--s-6) 0 0", paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)",
                  font: "italic var(--fw-regular) var(--fs-caption)/1.6 var(--font-display)", color: "var(--text-faint)" }}>
                  Every one of these is a guess. Change any of them and I'll redo the rest around it.
                </p>
              </SheetSection>
              <SheetSection title="Ask for a change">
                <Composer onSend={() => setToast({ title: "Hob is redrafting", detail: "Changed fields will highlight when he's done." })}
                  placeholder="Make her a ranger instead" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                  {["More Dexterity", "Make her older", "Darker backstory", "No spellcasting"].map((c) => (
                    <Button key={c} variant="outline" size="sm" onClick={() => setToast({ title: "Hob is redrafting", detail: c + "." })}>{c}</Button>
                  ))}
                </div>
              </SheetSection>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <HobAvatar />
              <p style={{ flex: 1, margin: 0, font: "var(--fw-regular) var(--fs-body-m)/1.6 var(--font-sans)", color: "var(--text-body)" }}>
                Sorrel's done. Where is she playing?
              </p>
            </div>
            <SheetSection title="Campaign">
              <Select value={campaign} onValueChange={setCampaign}>
                <SelectTrigger><SelectValue placeholder="Pick a campaign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="salt-road">The Salt Road — Fen Marek</SelectItem>
                  <SelectItem value="none">Nowhere yet, keep her in my roster</SelectItem>
                </SelectContent>
              </Select>
              {campaign === "salt-road" ? (
                <div style={{ display: "flex", gap: 9, marginTop: "var(--s-6)", padding: "10px 12px", background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
                  <Icon name="info" size={14} style={{ color: "var(--verdigris-300)", marginTop: 2 }} />
                  <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.6 var(--font-sans)", color: "var(--text-body)" }}>
                    Fen approves characters before they play. Sorrel is level 1 and the party is level 5 — he'll probably level her up.
                  </span>
                </div>
              ) : null}
            </SheetSection>
            <div style={{ display: "flex", gap: 9 }}>
              <Button variant="secondary" size="sm" onClick={() => setStep(2)}><Icon name="chevron-left" size={13} />Back to the draft</Button>
              <Button size="sm" onClick={onDone}>Save character</Button>
            </div>
          </div>
        ) : null}
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

Object.assign(window, { CharacterCreate });
