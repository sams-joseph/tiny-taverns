const { Card, CardContent, Button, Badge, Input, Icon, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, Toast, ToastTitle, ToastDescription, ToastClose } = window.TinyTavernsDesignSystem_a201fd;

function CharacterCard({ c, onOpen, onAssign }) {
  const [hover, setHover] = React.useState(false);
  const unassigned = !c.campaign;
  return (
    <Card onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ boxShadow: hover ? "var(--shadow-3)" : "var(--shadow-2)", borderColor: hover ? "var(--border-strong)" : "var(--border-hairline)" }}>
      <CardContent style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Portrait name={c.name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "var(--fw-semibold) var(--fs-body-m)/1.2 var(--font-display)", color: "var(--text-heading)" }}>{c.name}</div>
            <div style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-muted)", marginTop: 3 }}>
              {c.ancestry} {c.cls} {c.level}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <StatPill label="HP" value={c.hp + "/" + c.max} />
          <StatPill label="AC" value={c.ac} />
          <StatPill label="Level" value={c.level} />
        </div>
        {unassigned ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
            <Icon name="unlink" size={13} style={{ color: "var(--text-faint)" }} />
            <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>Not in a campaign yet</span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="book-open" size={13} style={{ color: "var(--accent-ink)" }} />
            <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-body)" }}>{c.campaign}</span>
            <Badge variant="success">Playing</Badge>
          </div>
        )}
        <div style={{ display: "flex", gap: 7 }}>
          <Button size="sm" style={{ flex: 1 }} onClick={() => onOpen(c)}>Open sheet</Button>
          {unassigned ? <Button variant="secondary" size="sm" onClick={() => onAssign(c)}>Join a game</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* The card a player lands on from an invite link. Claiming a seat and attaching
   a character are one flow, not two, because a seat with nobody in it is not
   worth showing anybody. */
function JoinCard({ onJoin }) {
  const [code, setCode] = React.useState("");
  return (
    <Card tone="sunken" style={{ borderStyle: "dashed", borderColor: "var(--border-strong)" }}>
      <CardContent style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: "var(--s-5)", height: "100%", justifyContent: "center" }}>
        <Icon name="link" size={20} style={{ color: "var(--text-faint)" }} />
        <div>
          <div style={{ font: "var(--fw-semibold) var(--fs-body-m)/1.2 var(--font-display)", color: "var(--text-heading)" }}>Join a campaign</div>
          <p style={{ margin: "5px 0 0", font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
            Paste the link your DM sent, or the code at the end of it.
          </p>
        </div>
        <Input placeholder="salt-road-9F2K" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button size="sm" disabled={!code} onClick={() => onJoin(code)}>Claim a seat</Button>
      </CardContent>
    </Card>
  );
}

function MyCharacters({ onOpen, onCreate, onTable }) {
  const p = window.TT_PLAYER;
  const [joining, setJoining] = React.useState(null);
  const [attach, setAttach] = React.useState("ch2");
  const [toast, setToast] = React.useState(null);
  const live = true;

  return (
    <>
      <TopBar title="Your characters" subtitle={p.account.name + " · playing in " + p.account.plays + " campaigns"}>
        <Button size="sm" onClick={onCreate}><Icon name="sparkles" size={13} />New character</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        {live ? (
          <Card style={{ marginBottom: "var(--s-7)", borderColor: "var(--accent)" }}>
            <CardContent style={{ padding: "var(--pad-card)", display: "flex", alignItems: "center", gap: "var(--s-6)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: "var(--success)", flex: "0 0 auto" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--text-heading)" }}>The Salt Road is playing right now</div>
                <div style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>Session 12 · round 3 · Brannoc is up next</div>
              </div>
              <Button size="sm" onClick={onTable}><Icon name="swords" size={13} />Take your turn</Button>
            </CardContent>
          </Card>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "var(--s-6)", alignItems: "stretch" }}>
          {p.characters.map((c) => (
            <CharacterCard key={c.id} c={c} onOpen={onOpen} onAssign={(ch) => { setAttach(ch.id); setJoining("attach"); }} />
          ))}
          <JoinCard onJoin={() => setJoining("claim")} />
        </div>
      </div>

      <Dialog open={!!joining} onOpenChange={() => setJoining(null)}>
        <DialogContent width={420}>
          <DialogHeader>
            <DialogTitle>{joining === "claim" ? "The Salt Road" : "Which campaign?"}</DialogTitle>
            <DialogDescription>
              {joining === "claim"
                ? "Run by Fen Marek · 4 players · session 12. Take a seat, then bring a character to it."
                : "Sorrel Ash is level 1. The Salt Road party is level 5, so your DM may want to level her first."}
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 var(--pad-card)" }}>
            {p.characters.map((c) => (
              <button key={c.id} onClick={() => setAttach(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", cursor: "pointer", textAlign: "left",
                  background: attach === c.id ? "var(--accent-soft)" : "var(--surface-sunken)",
                  border: "1px solid " + (attach === c.id ? "var(--accent)" : "var(--border-hairline)") }}>
                <Seat initials={c.name.split(" ").map((w) => w[0]).join("")} tone={attach === c.id ? undefined : "muted"} />
                <span style={{ flex: 1, font: "var(--fw-semibold) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-heading)" }}>{c.name}</span>
                <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-muted)" }}>{c.cls} {c.level}</span>
              </button>
            ))}
            <button onClick={() => { setJoining(null); onCreate(); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", cursor: "pointer", textAlign: "left", background: "transparent", border: "1px dashed var(--border-strong)" }}>
              <Icon name="sparkles" size={15} style={{ color: "var(--text-faint)" }} />
              <span style={{ font: "var(--fw-regular) var(--fs-body-s)/1.2 var(--font-sans)", color: "var(--text-muted)" }}>Make a new one with Hob instead</span>
            </button>
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setJoining(null)}>Cancel</Button>
            <Button size="sm" onClick={() => { setJoining(null); setToast({ title: "Sent to your DM", detail: "Fen has to accept the character before session 13." }); }}>
              {joining === "claim" ? "Claim the seat" : "Send to the DM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast ? (
        <div style={{ position: "absolute", right: 24, bottom: 24, zIndex: 40, display: "flex" }}>
          <Toast variant="success"><ToastTitle>{toast.title}</ToastTitle><ToastDescription>{toast.detail}</ToastDescription></Toast>
          <ToastClose onClick={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}

Object.assign(window, { MyCharacters });
