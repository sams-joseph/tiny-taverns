/* Campaign-scoped screens: the campaign home, encounters and notes. */
const { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Label,
  Checkbox, Input, Icon } = window.TinyTavernsDesignSystem_a201fd;

const CAMPAIGNS = [
  { id: "salt", name: "The Salt Road", session: 12, role: "DM", party: "The Gilded Spoon" },
  { id: "vault", name: "Vault of the Pale Sisters", session: 3, role: "Player", party: "Six Bad Ideas" },
];

/* Small utility cluster for the things that are NOT campaign-scoped. Keeping
   them visually separate from the nav is the whole point of the fix. */
function UtilityCluster({ children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: "var(--s-5)", marginLeft: "var(--s-5)", borderLeft: "1px solid var(--border-hairline)" }}>{children}</div>;
}

function UtilityButton({ icon, label, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} title={label} aria-label={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, cursor: "pointer",
        background: active ? "var(--accent-soft)" : hover ? "var(--surface-sunken)" : "transparent",
        border: "1px solid " + (active ? "var(--accent)" : "transparent"), borderRadius: "var(--r-md)",
        color: active ? "var(--peach-300)" : "var(--text-muted)", transition: "var(--transition-control)" }}>
      <Icon name={icon} size={16} />
    </button>
  );
}

function EncCard({ e, onRun }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Card onClick={onRun} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer", borderColor: e.active ? "var(--accent)" : "var(--border-hairline)",
        boxShadow: hover ? "var(--shadow-3)" : "var(--shadow-2)" }}>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <CardTitle style={{ flex: 1 }}>{e.name}</CardTitle>
          <Badge variant={e.cr === "Deadly" ? "destructive" : e.cr === "Medium" ? "default" : "success"}>{e.cr}</Badge>
        </div>
        <CardDescription>{e.count} {e.count === 1 ? "creature" : "creatures"}</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {e.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
        </div>
        {e.active ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, font: "var(--fw-medium) 12px/1 var(--font-sans)", color: "var(--accent-ink)" }}>
            <Icon name="play" size={13} /> On the table now
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PrepCard() {
  const [prep, setPrep] = React.useState(window.TT_DATA.prep);
  const done = prep.filter((p) => p.done).length;
  return (
    <Card tone="sunken">
      <CardHeader>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <CardTitle>Before you sit down</CardTitle>
          <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{done}/{prep.length}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          {prep.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Checkbox id={"np-" + p.id} checked={p.done}
                onCheckedChange={() => setPrep((cur) => cur.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} />
              <Label htmlFor={"np-" + p.id} style={{ textTransform: "none", font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", cursor: "pointer" }}>{p.label}</Label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PartyStrip({ onParty }) {
  const seats = window.TT_PLAYER.seats.filter((s) => s.character);
  const gaps = window.TT_PLAYER.seats.filter((s) => !s.character).length;
  return (
    <Card tone="sunken">
      <CardHeader>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <CardTitle>The Gilded Spoon</CardTitle>
          <button onClick={onParty} style={{ background: "none", border: "none", cursor: "pointer", font: "var(--fw-medium) 12px/1 var(--font-sans)", color: "var(--peach-300)" }}>Manage party</button>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {seats.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 24, height: 24, borderRadius: "var(--r-pill)", display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--surface-card)", border: "1px solid var(--border-hairline)", font: "var(--fw-semibold) 10px/1 var(--font-sans)", color: "var(--text-muted)" }}>{s.initials}</span>
              <span style={{ flex: 1, minWidth: 0, font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.character}</span>
              <span style={{ font: "var(--fw-regular) 11px/1.3 var(--font-sans)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>{s.player.split(" ")[0]}</span>
            </div>
          ))}
          {gaps ? <div style={{ font: "var(--fw-regular) 12px/1.3 var(--font-sans)", color: "var(--text-faint)", paddingTop: 2 }}>{gaps} seats without a character</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* The campaign home that was missing. Everything here answers "where were we
   and what happens when we sit down". */
function CampOverview({ onRun, onGo }) {
  const d = window.TT_DATA;
  const last = window.TT_CHRONICLE[0];
  const active = d.encounters.find((e) => e.active) || d.encounters[0];
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr var(--aside-w)", gap: "var(--s-9)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-7)", minWidth: 0 }}>
          <Card style={{ borderColor: "var(--accent)" }}>
            <CardHeader>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-6)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "var(--fw-semibold) 11px/1 var(--font-sans)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--peach-300)", marginBottom: 8 }}>Next session</div>
                  <CardTitle style={{ font: "var(--fw-semibold) var(--fs-display-s)/1.2 var(--font-display)" }}>Session 13 — Saturday, 22 August</CardTitle>
                  <CardDescription style={{ marginTop: 6 }}>Picking up on the east bank road, one sealed crate heavier.</CardDescription>
                </div>
                <Button onClick={onRun}><Icon name="play" size={14} />Start session</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", gap: "var(--s-6)", flexWrap: "wrap", paddingTop: 4 }}>
                {[["swords", active.name, "First encounter"], ["users", "4 of 6 seats filled", "Party"], ["scroll-text", last.threads.length + " open threads", "From session " + last.n]].map(([icon, val, lbl]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Icon name={icon} size={15} style={{ color: "var(--text-faint)" }} />
                    <span>
                      <span style={{ display: "block", font: "var(--fw-medium) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-body)" }}>{val}</span>
                      <span style={{ display: "block", font: "var(--fw-regular) 11px/1.3 var(--font-sans)", color: "var(--text-faint)" }}>{lbl}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div>
            <SectionHead title="Encounters on deck" action="All encounters" onAction={() => onGo("encounters")} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "var(--s-6)" }}>
              {d.encounters.map((e) => <EncCard key={e.id} e={e} onRun={onRun} />)}
            </div>
          </div>

          <div>
            <SectionHead title="Last time" action="Full chronicle" onAction={() => onGo("chronicle")} />
            <Card>
              <CardHeader>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <CardTitle style={{ flex: 1 }}>{last.title}</CardTitle>
                  <span style={{ font: "var(--type-stat)", color: "var(--text-faint)" }}>Session {last.n}</span>
                </div>
                <CardDescription>{last.date}</CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-body)/1.6 var(--font-display)", color: "var(--slate-300)", maxWidth: "var(--measure)", textWrap: "pretty" }}>
                  {last.summary.slice(0, 220)}…
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-7)" }}>
          <PrepCard />
          <PartyStrip onParty={() => onGo("party")} />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: "var(--s-5)" }}>
      <h3 style={{ margin: 0, font: "var(--fw-semibold) var(--fs-body)/1.2 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{title}</h3>
      {action ? <button onClick={onAction} style={{ background: "none", border: "none", cursor: "pointer", font: "var(--fw-medium) 12px/1 var(--font-sans)", color: "var(--peach-300)" }}>{action}</button> : null}
    </div>
  );
}

function CampEncounters({ onRun }) {
  const d = window.TT_DATA;
  return (
    <>
      <TopBar title="Encounters" subtitle={d.encounters.length + " built for The Salt Road"}>
        <Input placeholder="Search encounters" style={{ width: 180, height: 32 }} />
        <Button variant="secondary" size="sm"><Icon name="plus" size={13} />New encounter</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: "var(--s-6)" }}>
          {d.encounters.map((e) => <EncCard key={e.id} e={e} onRun={onRun} />)}
        </div>
      </div>
    </>
  );
}

const NOTES = [
  { title: "Read aloud at the water", body: "The reeds are taller than you are and they are not moving, even though there is a wind." },
  { title: "If they open the crate", body: "It is packed in wet straw and salt. Whatever is inside has been breathing." },
  { title: "The ferryman, if pressed", body: "He will not take coin. He will take a name, a memory, or a debt — in that order of preference." },
];

function CampNotes() {
  return (
    <>
      <TopBar title="Notes" subtitle="Read-aloud text, secrets and loose ends">
        <Button variant="secondary" size="sm"><Icon name="plus" size={13} />New note</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", maxWidth: 760 }}>
          {NOTES.map((n) => (
            <Card key={n.title}>
              <CardHeader><CardTitle>{n.title}</CardTitle></CardHeader>
              <CardContent>
                <p style={{ margin: 0, font: "var(--type-read-aloud)", color: "var(--slate-300)", maxWidth: "var(--measure)", textWrap: "pretty" }}>{n.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function Brand({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "0 0 auto" }}>
      <img src="../../assets/icon/mark-on-dark-256.png" alt="" width={compact ? 22 : 26} height={compact ? 22 : 26} style={{ display: "block" }} />
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: compact ? 15 : 17,
        lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)", whiteSpace: "nowrap" }}>Tiny Taverns</span>
    </div>
  );
}

/* The list of tables you sit at — the one screen that is above any campaign. */
function CampaignList({ onOpen }) {
  return (
    <>
      <TopBar title="Campaigns" subtitle="Two tables, one of them yours to run">
        <Button variant="secondary" size="sm"><Icon name="plus" size={13} />New campaign</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: "var(--s-6)", maxWidth: 900 }}>
          {CAMPAIGNS.map((c, i) => (
            <Card key={c.id} onClick={i === 0 ? onOpen : undefined} style={{ cursor: i === 0 ? "pointer" : "default" }}>
              <CardHeader>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <CardTitle style={{ flex: 1 }}>{c.name}</CardTitle>
                  <Badge variant={c.role === "DM" ? "default" : "outline"}>{c.role}</Badge>
                </div>
                <CardDescription>{c.party} · session {c.session}</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ font: "var(--fw-regular) 12px/1.4 var(--font-sans)", color: "var(--text-faint)" }}>
                  {i === 0 ? "Next session Saturday 22 August" : "Waiting on the DM to schedule"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { CAMPAIGNS, UtilityButton, EncCard, PrepCard, PartyStrip, SectionHead, CampOverview, CampEncounters, CampNotes, CampaignList, Brand });
