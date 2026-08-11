const { Card, CardContent, Button, Badge, Toggle, Input, Icon } = window.TinyTavernsDesignSystem_a201fd;

/* A recap is two documents in one: the paragraph you read to the table, and the
   scaffolding underneath it that only the DM needs. Read-aloud mode drops the
   second document rather than restyling it. */
function Facet({ icon, label, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, font: "var(--fw-semibold) var(--fs-label-s)/1 var(--font-sans)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-faint)" }}>
        <Icon name={icon} size={12} />{label}
      </div>
      {children}
    </div>
  );
}

function Lines({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((t) => (
        <div key={t} style={{ display: "flex", gap: 8, font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-body)" }}>
          <span style={{ color: "var(--text-faint)", flex: "0 0 auto" }}>—</span><span>{t}</span>
        </div>
      ))}
    </div>
  );
}

function SessionEntry({ s, open, onToggle, readAloud, latest }) {
  const dotSize = latest ? 13 : 9;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "var(--s-6)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16 }}>
        <div style={{ width: dotSize, height: dotSize, marginTop: 21, borderRadius: "var(--r-circle)",
          background: latest ? "var(--accent)" : "var(--slate-700)",
          border: latest ? "none" : "1px solid var(--border-strong)",
          boxShadow: latest ? "0 0 0 4px var(--accent-soft)" : "none", flex: "0 0 auto" }} />
        <div style={{ flex: 1, width: 1, background: "var(--border-hairline)", marginTop: 8 }} />
      </div>
      <div style={{ paddingBottom: "var(--s-8)" }}>
        <Card style={{ borderColor: latest ? "var(--border-strong)" : "var(--border-hairline)" }}>
          <button onClick={onToggle} style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-5)", width: "100%",
            padding: "var(--pad-card)", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ font: "var(--type-stat)", color: "var(--accent-ink)" }}>Session {s.n}</span>
                <span style={{ color: "var(--border-strong)" }}>·</span>
                <span style={{ font: "var(--fw-regular) var(--fs-label)/1 var(--font-sans)", color: "var(--text-muted)" }}>{s.date}</span>
                {!readAloud && s.status === "draft" ? <Badge variant="magic"><Icon name="sparkles" size={10} />Hob's draft</Badge> : null}
              </div>
              <h3 style={{ margin: 0, font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{s.title}</h3>
              {!open ? (
                <p style={{ margin: "8px 0 0", font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-muted)",
                  maxWidth: "var(--measure)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.summary}</p>
              ) : null}
            </div>
            <Icon name={open ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--text-faint)", marginTop: 4 }} />
          </button>
          {open ? (
            <CardContent style={{ paddingTop: 0 }}>
              <p style={{ margin: 0, font: readAloud ? "var(--fw-regular) var(--fs-body-l)/1.7 var(--font-serif)" : "var(--type-read-aloud)",
                color: readAloud ? "var(--text-heading)" : "var(--slate-300)", maxWidth: "var(--measure)" }}>{s.summary}</p>

              {s.quote ? (
                <figure style={{ margin: "var(--s-7) 0 0", paddingLeft: "var(--s-6)", borderLeft: "2px solid var(--accent)", maxWidth: "var(--measure)" }}>
                  <blockquote style={{ margin: 0, font: "var(--fw-regular) var(--fs-body)/1.5 var(--font-serif)", fontStyle: "italic", color: "var(--text-heading)" }}>“{s.quote.text}”</blockquote>
                  <figcaption style={{ marginTop: 6, font: "var(--fw-medium) var(--fs-label-s)/1 var(--font-sans)", color: "var(--text-faint)" }}>{s.quote.who}</figcaption>
                </figure>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "var(--s-7)",
                marginTop: "var(--s-8)", paddingTop: "var(--s-7)", borderTop: "1px solid var(--border-hairline)" }}>
                <Facet icon="users" label="Who you met">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {s.npcs.map((n) => (
                      <div key={n.name}>
                        <div style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>{n.name}</div>
                        <div style={{ font: "var(--fw-regular) var(--fs-label)/1.45 var(--font-sans)", color: "var(--text-muted)" }}>{n.note}</div>
                      </div>
                    ))}
                  </div>
                </Facet>
                <Facet icon="map-pin" label="Where you went">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.locations.map((l) => <Badge key={l} variant="outline">{l}</Badge>)}
                  </div>
                </Facet>
                <Facet icon="coins" label="What you carried out">
                  <Lines items={s.loot} />
                </Facet>
                <Facet icon="scale" label="What you decided">
                  <Lines items={s.decisions} />
                </Facet>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-6)", flexWrap: "wrap", marginTop: "var(--s-7)",
                padding: "10px var(--s-6)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", borderRadius: "var(--r-card)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--type-stat)", color: "var(--text-body)" }}>
                  <Icon name="trending-up" size={13} style={{ color: "var(--verdigris-300)" }} />{s.xp.gained.toLocaleString()} XP
                </span>
                {s.xp.levelUps.map((l) => <Badge key={l} variant="success"><Icon name="chevrons-up" size={10} />{l}</Badge>)}
                {s.xp.levelUps.length === 0 ? <span style={{ font: "var(--fw-regular) var(--fs-label)/1 var(--font-sans)", color: "var(--text-faint)" }}>No level ups</span> : null}
              </div>

              {!readAloud ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "var(--s-7)", marginTop: "var(--s-7)" }}>
                  <Facet icon="help-circle" label="Still open">
                    <Lines items={s.threads} />
                  </Facet>
                  {s.combat.length ? (
                    <Facet icon="swords" label="At the table">
                      <Lines items={s.combat} />
                    </Facet>
                  ) : null}
                </div>
              ) : null}

              {!readAloud ? (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-5)", flexWrap: "wrap", marginTop: "var(--s-8)", paddingTop: "var(--s-6)", borderTop: "1px solid var(--border-hairline)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, font: "var(--fw-regular) var(--fs-label)/1.4 var(--font-sans)", color: "var(--text-faint)" }}>
                    <Icon name="sparkles" size={12} />
                    {s.status === "draft" ? "Hob wrote this from your session notes. Nothing is saved to the chronicle until you keep it." : "Drafted by Hob, edited by you · " + s.words + " words"}
                  </span>
                  {s.status === "draft" ? (
                    <>
                      <Button variant="ghost" size="sm"><Icon name="refresh-cw" size={13} />Redraft</Button>
                      <Button variant="secondary" size="sm"><Icon name="pencil" size={13} />Edit</Button>
                      <Button size="sm"><Icon name="check" size={13} />Keep it</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm"><Icon name="pencil" size={13} />Edit</Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Chronicle() {
  const d = window.TT_DATA;
  const sessions = window.TT_CHRONICLE;
  const [openId, setOpenId] = React.useState(sessions[0].id);
  const [readAloud, setReadAloud] = React.useState(false);
  const [q, setQ] = React.useState("");
  const list = sessions.filter((s) => (s.title + " " + s.summary + " " + s.npcs.map((n) => n.name).join(" ")).toLowerCase().includes(q.toLowerCase()));
  const threads = sessions.flatMap((s) => s.threads.map((t) => ({ t, n: s.n })));

  return (
    <>
      <TopBar title="Chronicle" subtitle={sessions.length + " recaps · The Salt Road began 8 March 2026"}>
        <Input placeholder="Search recaps" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 190, height: 32 }} />
        <Toggle size="sm" pressed={readAloud} onPressedChange={setReadAloud}><Icon name="megaphone" size={13} />Read aloud</Toggle>
        <Button size="sm"><Icon name="sparkles" size={13} />Recap session {d.campaign.session}</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: readAloud ? "1fr" : "1fr var(--aside-w)", gap: "var(--s-9)", alignItems: "start" }}>
          <div style={{ maxWidth: readAloud ? 820 : "none", margin: readAloud ? "0 auto" : 0 }}>
            {list.map((s, i) => (
              <SessionEntry key={s.id} s={s} latest={i === 0 && !q} readAloud={readAloud}
                open={openId === s.id} onToggle={() => setOpenId((cur) => cur === s.id ? null : s.id)} />
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "var(--s-6)" }}>
              <div style={{ display: "flex", justifyContent: "center", width: 16 }}>
                <Icon name="flag" size={13} style={{ color: "var(--text-faint)", marginTop: 4 }} />
              </div>
              <div style={{ font: "var(--fw-regular) var(--fs-label)/1.4 var(--font-sans)", color: "var(--text-faint)", paddingTop: 5 }}>
                Sessions 1–8 are in the old notebook. Import them whenever you like.
              </div>
            </div>
          </div>

          {!readAloud ? (
            <Card tone="sunken" style={{ position: "sticky", top: 0 }}>
              <CardContent>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: "var(--s-6)" }}>
                  <span style={{ font: "var(--type-title)", color: "var(--text-heading)" }}>Threads still open</span>
                  <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{threads.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                  {threads.map((x) => (
                    <div key={x.t} style={{ display: "flex", gap: 8 }}>
                      <span style={{ font: "var(--type-stat)", color: "var(--text-faint)", flex: "0 0 auto", paddingTop: 2 }}>S{x.n}</span>
                      <span style={{ font: "var(--fw-regular) var(--fs-body-s)/1.45 var(--font-sans)", color: "var(--text-body)" }}>{x.t}</span>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" size="sm" style={{ width: "100%", marginTop: "var(--s-7)" }}>
                  <Icon name="sparkles" size={13} />Ask Hob what to pay off
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Chronicle });
