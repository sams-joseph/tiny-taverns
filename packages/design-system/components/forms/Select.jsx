import React, { createContext, useContext, useState } from "react";
import { Icon } from "../core/Icon.jsx";

/* shadcn/ui Select composition: Select > SelectTrigger > SelectValue, and
   SelectContent > SelectItem. Driven by value/onValueChange, NOT an options array. */

const Ctx = createContext(null);

export function Select({ value, defaultValue, onValueChange, children }) {
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const current = value !== undefined ? value : internal;
  const pick = (v) => {
    setInternal(v);
    setOpen(false);
    if (onValueChange) onValueChange(v);
  };
  return (
    <Ctx.Provider value={{ value: current, pick, open, setOpen }}>
      <div style={{ position: "relative" }}>{children}</div>
    </Ctx.Provider>
  );
}

export function SelectTrigger({ style, children, ...rest }) {
  const ctx = useContext(Ctx);
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        height: 38,
        padding: "0 11px",
        background: "var(--surface-card)",
        color: "var(--text-body)",
        border: "1px solid " + (ctx.open ? "var(--accent)" : "var(--border-strong)"),
        borderRadius: "var(--r-control)",
        boxShadow: ctx.open ? "var(--ring)" : "none",
        font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)",
        cursor: "pointer",
        textAlign: "left",
        ...style,
      }}
      {...rest}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      <Icon name="chevron-down" size={14} />
    </button>
  );
}

export function SelectValue({ placeholder }) {
  const ctx = useContext(Ctx);
  return <React.Fragment>{ctx.value || placeholder || ""}</React.Fragment>;
}

export function SelectContent({ style, children }) {
  const ctx = useContext(Ctx);
  if (!ctx.open) return null;
  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        right: 0,
        zIndex: 40,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-3)",
        maxHeight: 220,
        overflow: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SelectItem({ value, style, children, ...rest }) {
  const ctx = useContext(Ctx);
  const [hover, setHover] = useState(false);
  const on = ctx.value === value;
  return (
    <div
      role="option"
      aria-selected={on}
      onClick={() => ctx.pick(value)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        height: 34,
        padding: "0 11px",
        margin: "0 4px",
        borderRadius: "var(--r-xs)",
        background: on ? "var(--accent-soft)" : hover ? "var(--slate-700)" : "transparent",
        color: on ? "var(--accent-ink)" : "var(--text-body)",
        font: "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)",
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children === undefined ? value : children}
    </div>
  );
}
