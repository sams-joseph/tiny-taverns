const { Card, CardContent, Button, Badge, Input, Icon, Switch, Label,
  Toast, ToastTitle, ToastDescription, ToastClose,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } = window.TinyTavernsDesignSystem_a201fd;

const SEAT_META = {
  playing: { badge: "success", label: "Playing" },
  "no-character": { badge: "destructive", label: "No character" },
  invited: { badge: "secondary", label: "Invited" },
  open: { badge: "outline", label: "Open seat" },
};

function SeatRow({ s, onNudge, onAdd }) {
  const [hover, setHover] = React.useState(false);
  const m = SEAT_META[s.status];
  const empty = s.status === "open";
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px var(--pad-card)",
        borderTop: "1px solid var(--border-hairline)",
        background: hover && !empty ? "var(--surface-raised)" : "transparent",
        opacity: empty ? 0.6 : 1, transition: "var(--transition-control)" }}>
      <Seat initials={s.initials} tone={s.status === "playing" ? undefined : "muted"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ font: "var(--fw-semibold) var(--fs-body-s)/1.3 var(--font-sans)", color: empty ? "var(--text-faint)" : "var(--text-heading)" }}>
            {s.player || "Nobody yet"}
          </span>
          {s.you ? <Badge variant="outline">You</Badge> : null}
        </div>
        <div style={{ font: "var(--fw-regular) var(--fs-micro)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>
          {s.character || (s.status === "invited" ? "Invite sent, not opened" : s.status === "no-character" ? "Accepted, hasn't made a character" : "Share the link to fill it")}
        </div>
      </div>
      <Badge variant={m.badge}>{m.label}</Badge>
      <span style={{ display: "flex", gap: 6, opacity: hover ? 1 : 0, transition: "var(--transition-control)" }}>
        {s.status === "no-character" ? <Button variant="outline" size="sm" onClick={() => onAdd(s)}>Make one for them</Button> : null}
        {s.status === "invited" ? <Button variant="outline" size="sm" onClick={() => onNudge(s)}>Resend</Button> : null}
        {s.status === "playing" ? <Button variant="outline" size="sm">View sheet</Button> : null}
      </span>
    </div>
  );
}

function Party({ onChronicle }) {
  const p = window.TT_PLAYER;
  const [seats] = React.useState(p.seats);
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [approve, setApprove] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const [inviting, setInviting] = React.useState(false);

  const filled = seats.filter((s) => s.status === "playing").length;

  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <TopBar title="Party" subtitle={filled + " of " + seats.length + " seats have a character in them"}>
        <Button variant="secondary" size="sm" onClick={onChronicle}><Icon name="scroll-text" size={13} />Chronicle</Button>
        <Button size="sm" onClick={() => setInviting(true)}><Icon name="user-plus" size={13} />Invite a player</Button>
      </TopBar>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--pad-page)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr var(--aside-w)", gap: "var(--s-9)", alignItems: "start" }}>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px var(--pad-card)" }}>
              <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: ".08em", textTransform: "uppercase", lineHeight: 1, color: "var(--text-muted)" }}>Seats</span>
              <Button variant="outline" size="sm" onClick={() => setToast({ title: "Seat added", detail: "Six seats now. Share the link again." })}><Icon name="plus" size={12} />Seat</Button>
            </div>
            {seats.map((s) => (
              <SeatRow key={s.id} s={s}
                onNudge={(x) => setToast({ title: "Invite resent", detail: "Sent again to " + x.player + "." })}
                onAdd={() => setToast({ title: "Character started", detail: "Hob will draft one for Marta from your session notes." })} />
            ))}
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
            <SheetSection title="Join link">
              <div style={{ display: "flex", gap: 7 }}>
                <Input readOnly value={p.invite.link} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                <Button variant={copied ? "secondary" : "default"} size="sm" onClick={copy} style={{ minWidth: 72 }}>
                  <Icon name={copied ? "check" : "copy"} size={12} />{copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div style={{ marginTop: 9, font: "var(--fw-regular) var(--fs-micro)/1.5 var(--font-sans)", color: "var(--text-faint)" }}>
                Used {p.invite.uses} of {p.invite.max} · expires {p.invite.expires}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", marginTop: "var(--s-6)", paddingTop: "var(--s-6)", borderTop: "1px solid var(--border-hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch id="open" checked={open} onCheckedChange={setOpen} />
                  <Label htmlFor="open" style={{ textTransform: "none", font: "var(--fw-regular) var(--fs-body-s)/1.3 var(--font-sans)", cursor: "pointer" }}>Link accepts new players</Label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch id="approve" checked={approve} onCheckedChange={setApprove} />
                  <Label htmlFor="approve" style={{ textTransform: "none", font: "var(--fw-regular) var(--fs-body-s)/1.3 var(--font-sans)", cursor: "pointer" }}>I approve characters before they play</Label>
                </div>
              </div>
            </SheetSection>

            <SheetSection title="Needs you">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
                {[
                  { icon: "user-round-x", text: "Marta has a seat but no character. Session 13 is in four days.", tone: "var(--danger)" },
                  { icon: "mail", text: "Hal hasn't opened the invite you sent on the 3rd.", tone: "var(--text-faint)" },
                  { icon: "arrow-big-up-dash", text: "Sorrel Ash is level 1 and the party is level 5.", tone: "var(--accent-ink)" },
                ].map((n) => (
                  <div key={n.text} style={{ display: "flex", gap: 9 }}>
                    <Icon name={n.icon} size={14} style={{ color: n.tone, marginTop: 2 }} />
                    <span style={{ flex: 1, font: "var(--fw-regular) var(--fs-caption)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>{n.text}</span>
                  </div>
                ))}
              </div>
            </SheetSection>
          </div>
        </div>
      </div>

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent width={420}>
          <DialogHeader>
            <DialogTitle>Invite a player</DialogTitle>
            <DialogDescription>They claim a seat from the link, then bring a character to it. You approve it before session 13.</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", padding: "0 var(--pad-card)" }}>
            <div style={{ display: "flex", gap: 7 }}>
              <Input readOnly value={p.invite.link} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }} />
              <Button size="sm" onClick={copy} style={{ minWidth: 72 }}><Icon name={copied ? "check" : "copy"} size={12} />{copied ? "Copied" : "Copy"}</Button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, height: 1, background: "var(--border-hairline)" }} />
              <span style={{ font: "var(--fw-regular) var(--fs-micro)/1 var(--font-sans)", color: "var(--text-faint)" }}>or send it by email</span>
              <span style={{ flex: 1, height: 1, background: "var(--border-hairline)" }} />
            </div>
            <Input placeholder="name@example.com" />
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setInviting(false)}>Done</Button>
            <Button size="sm" onClick={() => { setInviting(false); setToast({ title: "Invite sent", detail: "They get a link that fills one seat." }); }}>Send invite</Button>
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

Object.assign(window, { Party });
