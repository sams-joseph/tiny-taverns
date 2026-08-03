const { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Label,
  Checkbox, Input, Tabs, TabsList, TabsTrigger, TabsContent, Icon } = window.TinyTavernsDesignSystem_a201fd;

function EncounterCard({ e, onRun }) {
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
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: "var(--fw-medium)", color: "var(--accent-ink)" }}>
            <Icon name="play" size={13} /> On the table now
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CampaignHome({ onRun }) {
  const d = window.TT_DATA;
  const [prep, setPrep] = React.useState(d.prep);
  const doneCount = prep.filter((p) => p.done).length;

  return (
    <>
      <TopBar title="The Salt Road" subtitle={"Session " + d.campaign.session + " · " + d.campaign.party}>
        <Input placeholder="Search" style={{ width: 170, height: 32 }} />
        <Button variant="secondary" size="sm">New encounter</Button>
        <Button size="sm" onClick={onRun}>Start session</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr var(--aside-w)", gap: "var(--s-9)", alignItems: "start" }}>
          <Tabs defaultValue="encounters">
            <TabsList style={{ marginBottom: "var(--s-7)" }}>
              <TabsTrigger value="encounters"><Icon name="swords" size={12} />Encounters</TabsTrigger>
              <TabsTrigger value="notes"><Icon name="scroll-text" size={12} />Notes</TabsTrigger>
              <TabsTrigger value="party"><Icon name="users" size={12} />Party</TabsTrigger>
            </TabsList>
            <TabsContent value="encounters">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: "var(--s-6)" }}>
                {d.encounters.map((e) => <EncounterCard key={e.id} e={e} onRun={onRun} />)}
              </div>
            </TabsContent>
            <TabsContent value="notes">
              <Card>
                <CardHeader><CardTitle>Read aloud at the water</CardTitle></CardHeader>
                <CardContent>
                  <p style={{ margin: 0, font: "var(--type-read-aloud)", color: "var(--slate-300)", maxWidth: "var(--measure)" }}>
                    The reeds are taller than you are and they are not moving, even though there is a wind.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="party">
              <Card>
                {["Ilse — Brannoc, half-orc paladin", "Kofi — Wren, tiefling bard", "Dara — Sister Pell, human cleric", "Marta — Ovid, gnome rogue"].map((p, i) => (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, height: "var(--row-h)", padding: "0 var(--pad-card)", borderTop: i ? "1px solid var(--border-hairline)" : "none", font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)", color: "var(--text-body)" }}>
                    <Icon name="user" size={15} style={{ color: "var(--text-faint)" }} />{p}
                  </div>
                ))}
              </Card>
            </TabsContent>
          </Tabs>
          <Card tone="sunken">
            <CardHeader>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <CardTitle>Before you sit down</CardTitle>
                <span style={{ font: "var(--type-stat)", color: "var(--text-muted)" }}>{doneCount}/{prep.length}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                {prep.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <Checkbox id={p.id} checked={p.done}
                      onCheckedChange={() => setPrep((cur) => cur.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} />
                    <Label htmlFor={p.id} style={{ textTransform: "none", font: "var(--fw-regular) var(--fs-body-s)/1.4 var(--font-sans)", cursor: "pointer" }}>{p.label}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { CampaignHome });
