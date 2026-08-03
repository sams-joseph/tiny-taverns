const { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Label, Input, Icon } = window.TinyTavernsDesignSystem_a201fd;

const NAV = ["Features", "Bestiary", "Pricing", "Changelog"];

function Wordmark() {
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <img
        src="../../assets/icon/mark-on-dark-256.png"
        alt="" width="34" height="34" style={{ display: "block", flex: "0 0 auto", marginTop: -2 }}
      />
    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 21, lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>Tiny Taverns</span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: "var(--fw-regular)", lineHeight: 1.4, color: "var(--accent-ink)", marginTop: 3 }}>The DM&rsquo;s side kick</span>
    </span>
    </span>
  );
}

function SiteHeader() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: "var(--s-9)",
      padding: "14px var(--pad-page)", background: "rgba(10,14,19,.78)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border-hairline)" }}>
      <Wordmark />
      <nav style={{ display: "flex", gap: "var(--s-8)", marginLeft: "var(--s-8)" }}>
        {NAV.map((n) => <a key={n} href="#" style={{ font: "var(--fw-medium) var(--fs-body-s)/1 var(--font-sans)", color: "var(--text-body)", textDecoration: "none" }}>{n}</a>)}
      </nav>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <Button variant="ghost" size="sm">Sign in</Button>
        <Button size="sm">Start a campaign</Button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section style={{ position: "relative", padding: "var(--s-13) var(--pad-page) var(--s-12)", background: "var(--surface-page)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 90% at 22% 15%, rgba(23,121,140,.20), transparent 70%)" }} />
      <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: "var(--s-12)", alignItems: "center" }}>
        <div>
          <Badge>v2.4</Badge>
          <h1 style={{ font: "var(--fw-bold) var(--fs-display-xl)/1.02 var(--font-display)", letterSpacing: "var(--ls-display)", color: "var(--text-heading)", margin: "var(--s-6) 0 0" }}>
            Run the fight, not the spreadsheet
          </h1>
          <p style={{ font: "var(--fw-regular) var(--fs-body-l)/1.55 var(--font-sans)", color: "var(--slate-300)", margin: "var(--s-6) 0 0", maxWidth: "46ch" }}>
            Initiative, hit points, stat blocks and the thing you meant to say when they open the crate &mdash; all on one screen, all at the speed of the table.
          </p>
          <div style={{ display: "flex", gap: "var(--s-5)", marginTop: "var(--s-9)" }}>
            <Button size="lg">Start a campaign</Button>
            <Button size="lg" variant="outline" style={{ color: "var(--text-heading)" }}>Watch a session</Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "var(--s-7)", font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>
            <Icon name="check" size={14} style={{ color: "var(--success)" }} /> Free while your party is under five. No card, no upsell mid-combat.
          </div>
        </div>
        <Card tone="panel" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border-on-dark)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 16, lineHeight: 1.25, color: "var(--text-heading)" }}>Initiative</span>
            <Badge>Round 3</Badge>
          </div>
          {[["21","Brannoc","44/52",true],["19","Goblin Boss","21/21",false],["16","Wren","31/31",false],["14","Goblin Archer","4/7",false]].map(([i, n, hp, on]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 11, height: 42, padding: "0 14px",
              borderLeft: "3px solid " + (on ? "var(--accent)" : "transparent"), borderBottom: "1px solid var(--border-on-dark)",
              background: on ? "rgba(63,163,181,.10)" : "transparent" }}>
              <span style={{ font: "var(--fw-bold) var(--fs-mono-l)/1 var(--font-mono)", color: on ? "var(--accent)" : "var(--text-on-dark-muted)", width: 22, textAlign: "right" }}>{i}</span>
              <span style={{ flex: 1, font: "var(--fw-bold) var(--fs-body-s)/1 var(--font-sans)", color: "var(--text-on-dark)" }}>{n}</span>
              <span style={{ font: "var(--type-stat)", color: "var(--text-on-dark-muted)" }}>{hp}</span>
            </div>
          ))}
          <div style={{ padding: "12px 14px", background: "rgba(63,163,181,.10)", borderLeft: "3px solid var(--verdigris-300)" }}>
            <p style={{ margin: 0, font: "var(--type-read-aloud)", fontSize: "var(--fs-body-s)", color: "var(--slate-50)" }}>
              He is wearing three cloaks, none of them his.
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: "swords", title: "Initiative that keeps up", body: "Add a creature mid-fight, drop 5 damage with one tap, and the order re-sorts itself before anyone notices." },
  { icon: "scroll-text", title: "Stat blocks you can roll", body: "Every damage line is a button. Tap it, read the number, move on." },
  { icon: "footprints", title: "A bestiary that knows your marsh", body: "Filter by where the party actually is. Save your own creatures next to the official ones." },
  { icon: "eye-off", title: "A player view you control", body: "Share the map and the HP bars. Keep the hag's legendary actions to yourself." },
  { icon: "clock", title: "Prep in ten minutes", body: "A checklist per session, so the thing you meant to remember is on the screen when it matters." },
  { icon: "moon", title: "Dark at the table", body: "The live session runs on near-black so the screen doesn't light up the room." },
];

function Features() {
  return (
    <section style={{ padding: "var(--s-12) var(--pad-page)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-display-l)", lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)", maxWidth: "24ch", margin: 0 }}>Six things you stop doing by hand</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--s-6)", marginTop: "var(--s-9)" }}>
          {FEATURES.map((f) => (
            <Card key={f.title} style={{ display: "flex", flexDirection: "column", gap: 9, padding: "var(--pad-card)" }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "var(--accent-soft)", border: "1px solid var(--verdigris-600)", borderRadius: "var(--r-sm)", color: "var(--accent-ink)" }}>
                <Icon name={f.icon} size={19} />
              </span>
              <div style={{ font: "var(--type-title)", color: "var(--text-heading)" }}>{f.title}</div>
              <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-body-s)/1.55 var(--font-sans)", color: "var(--text-muted)" }}>{f.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Quote() {
  return (
    <section style={{ padding: "var(--s-11) var(--pad-page)", background: "var(--surface-sunken)", borderTop: "1px solid var(--border-hairline)", borderBottom: "1px solid var(--border-hairline)" }}>
      <blockquote style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <p style={{ margin: 0, font: "italic var(--fw-regular) 26px/1.45 var(--font-serif)", color: "var(--text-body)" }}>
          &ldquo;I ran a six-creature ambush without once saying &lsquo;hang on&rsquo;. That has never happened.&rdquo;
        </p>
        <footer style={{ marginTop: "var(--s-6)", font: "var(--fw-medium) var(--fs-body-s)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>
          Ilse M. &middot; running The Salt Road since 2021
        </footer>
      </blockquote>
    </section>
  );
}

const PLANS = [
  { name: "Hedge tavern", price: "Free", note: "Up to 4 players", feats: ["One campaign", "Full bestiary", "Initiative + dice tray"], cta: "Start here", variant: "secondary" },
  { name: "Roadhouse", price: "$5", note: "per month", feats: ["Unlimited campaigns", "Player view + map sharing", "Your own creatures", "Session prep checklists"], cta: "Take the room", variant: "default", featured: true },
  { name: "Guildhall", price: "$12", note: "per month", feats: ["Everything in Roadhouse", "Co-DM seats", "Shared bestiary", "Printable session sheets"], cta: "Talk to us", variant: "secondary" },
];

function Pricing() {
  return (
    <section style={{ padding: "var(--s-12) var(--pad-page)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-display-l)", lineHeight: 1.15, letterSpacing: "var(--ls-display)", color: "var(--text-heading)", textAlign: "center", margin: 0 }}>Pay when your table grows</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--s-6)", marginTop: "var(--s-9)", alignItems: "start" }}>
          {PLANS.map((p) => (
            <Card key={p.name} style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)", padding: "var(--pad-card)", ...(p.featured ? { borderColor: "var(--accent)", boxShadow: "var(--shadow-3)" } : null) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, font: "var(--type-title)", color: "var(--text-heading)" }}>{p.name}</span>
                {p.featured ? <Badge>Most tables</Badge> : null}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-semibold)", fontSize: 34, lineHeight: 1.1, letterSpacing: "var(--ls-display)", color: "var(--text-heading)" }}>{p.price}</span>
                <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-muted)" }}>{p.note}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: "var(--s-5)", borderTop: "1px solid var(--border-hairline)" }}>
                {p.feats.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 8, font: "var(--fw-regular) var(--fs-body-s)/1.45 var(--font-sans)", color: "var(--text-body)" }}>
                    <Icon name="check" size={15} style={{ color: "var(--success)", marginTop: 2 }} />{f}
                  </div>
                ))}
              </div>
              <Button variant={p.variant} style={{ marginTop: "auto", width: "100%" }}>{p.cta}</Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Signup() {
  const [sent, setSent] = React.useState(false);
  return (
    <section style={{ padding: "var(--s-12) var(--pad-page)", background: "var(--surface-page)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ font: "var(--fw-bold) var(--fs-display-l)/1.08 var(--font-display)", color: "var(--text-heading)" }}>Next session is Thursday</h2>
        <p style={{ font: "var(--fw-regular) var(--fs-body-l)/1.55 var(--font-sans)", color: "var(--slate-300)", marginTop: "var(--s-5)" }}>
          Set up a campaign in about four minutes. Bring your notes; we&rsquo;ll do the arithmetic.
        </p>
        {sent ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: "var(--s-8)", padding: "10px 16px", background: "var(--success-soft)", border: "1px solid var(--emerald-600)", borderRadius: "var(--r-sm)", color: "var(--success-ink)", font: "var(--fw-medium) var(--fs-body-s)/1 var(--font-sans)" }}>
            <Icon name="check" size={16} /> Check your email &mdash; the link is on its way.
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} style={{ display: "flex", gap: "var(--s-5)", justifyContent: "center", marginTop: "var(--s-8)" }}>
            <Input placeholder="you@table.example" style={{ width: 280 }} />
            <Button type="submit">Start a campaign</Button>
          </form>
        )}
      </div>
    </section>
  );
}

function SiteFooter() {
  const cols = [
    ["Product", ["Features", "Bestiary", "Player view", "Pricing"]],
    ["At the table", ["Getting started", "Keyboard shortcuts", "Import a monster", "Printable sheets"]],
    ["Elsewhere", ["Changelog", "Status", "Contact", "Privacy"]],
  ];
  return (
    <footer style={{ padding: "var(--s-10) var(--pad-page) var(--s-8)", background: "var(--surface-card)", borderTop: "1px solid var(--border-hairline)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.3fr repeat(3,1fr)", gap: "var(--s-9)" }}>
        <div><Wordmark /></div>
        {cols.map(([h, items]) => (
          <div key={h}>
            <div style={{ font: "var(--type-label)", color: "var(--verdigris-300)", marginBottom: 12 }}>{h}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {items.map((i) => <a key={i} href="#" style={{ font: "var(--fw-regular) var(--fs-body-s)/1.3 var(--font-sans)", color: "var(--slate-300)", textDecoration: "none" }}>{i}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1100, margin: "var(--s-9) auto 0", paddingTop: "var(--s-6)", borderTop: "1px solid var(--border-on-dark)", display: "flex", gap: 10, font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--text-on-dark-muted)" }}>
        <span>&copy; 2026 Tiny Taverns</span>
        <span style={{ marginLeft: "auto" }}>Made by people who were late to their own session.</span>
      </div>
    </footer>
  );
}

function Site() {
  return (
    <div style={{ background: "var(--surface-page)" }}>
      <SiteHeader /><Hero /><Features /><Quote /><Pricing /><Signup /><SiteFooter />
    </div>
  );
}

Object.assign(window, { Site });
