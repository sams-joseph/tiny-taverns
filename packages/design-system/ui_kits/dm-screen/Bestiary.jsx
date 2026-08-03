const { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Toggle, Label,
  Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Icon } = window.TinyTavernsDesignSystem_a201fd;

const ENVS = ["Marsh", "Cave", "River", "Night"];

function Bestiary({ onRun }) {
  const d = window.TT_DATA;
  const [q, setQ] = React.useState("");
  const [env, setEnv] = React.useState(["Marsh"]);
  const [sort, setSort] = React.useState("CR");
  const list = d.bestiary.filter((m) =>
    m.name.toLowerCase().includes(q.toLowerCase()) && (env.length === 0 || m.env.some((e) => env.includes(e))));

  return (
    <>
      <TopBar title="Bestiary" subtitle={list.length + " creatures match what you're looking for"}>
        <Input placeholder="Search creatures" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200, height: 32 }} />
        <div style={{ width: 150 }}>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger style={{ height: 32 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CR">Sort: CR</SelectItem>
              <SelectItem value="Name">Sort: Name</SelectItem>
              <SelectItem value="Recent">Sort: Recent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--s-7)" }}>
          <Label style={{ color: "var(--text-faint)", marginRight: 4 }}>Environment</Label>
          {ENVS.map((e) => (
            <Toggle key={e} size="sm" pressed={env.includes(e)}
              onPressedChange={() => setEnv((cur) => cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e])}>{e}</Toggle>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "var(--s-6)" }}>
          {list.map((m) => (
            <Card key={m.name} onClick={onRun} style={{ cursor: "pointer" }}>
              <CardHeader>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <CardTitle style={{ flex: 1 }}>{m.name}</CardTitle>
                  {m.legendary ? <Badge variant="info">Legendary</Badge> : null}
                  <Badge>CR {m.cr}</Badge>
                </div>
                <CardDescription style={{ fontStyle: "italic", fontFamily: "var(--font-serif)" }}>{m.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 10, borderTop: "1px solid var(--border-hairline)", font: "var(--type-stat)", color: "var(--text-body)" }}>
                  <span>AC {m.ac}</span><span>{m.hp} hp</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 5 }}>{m.env.map((e) => <Badge key={e} variant="outline">{e}</Badge>)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {list.length === 0 ? (
          <Card tone="sunken">
            <CardContent style={{ padding: "var(--s-10)", textAlign: "center" }}>
              <Icon name="footprints" size={28} style={{ color: "var(--text-faint)" }} />
              <div style={{ marginTop: 12, font: "var(--type-title)", color: "var(--text-heading)" }}>Nothing lives here</div>
              <div style={{ marginTop: 8, font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>Loosen a filter, or add a creature of your own.</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <Button variant="secondary" size="sm">Add a creature</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

Object.assign(window, { Bestiary });
