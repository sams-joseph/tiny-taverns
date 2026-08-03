import React, { createContext, useContext, useState } from "react";

/* shadcn/ui Tabs composition: Tabs > TabsList > TabsTrigger, plus TabsContent.
   Modern skin: an underline bar — the active trigger is semibold with a 2px
   accent rule. The only navigation pattern in the app. */

const Ctx = createContext(null);

export function Tabs({ value, defaultValue, onValueChange, style, children }) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value !== undefined ? value : internal;
  const pick = (v) => { setInternal(v); if (onValueChange) onValueChange(v); };
  return (
    <Ctx.Provider value={{ value: current, pick }}>
      <div style={style}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ style, children, ...rest }) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        borderBottom: "1px solid var(--border-hairline)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, style, children, ...rest }) {
  const ctx = useContext(Ctx);
  const [hover, setHover] = useState(false);
  const on = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => ctx.pick(value)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 36,
        padding: "0 12px",
        marginBottom: -1,
        background: "transparent",
        color: on ? "var(--text-heading)" : hover ? "var(--text-body)" : "var(--text-muted)",
        border: "none",
        borderBottom: "2px solid " + (on ? "var(--accent)" : "transparent"),
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label)",
        fontWeight: on ? "var(--fw-semibold)" : "var(--fw-medium)",
        lineHeight: 1,
        cursor: "pointer",
        transition: "var(--transition-control)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, style, children, ...rest }) {
  const ctx = useContext(Ctx);
  if (ctx.value !== value) return null;
  return <div role="tabpanel" style={style} {...rest}>{children}</div>;
}
