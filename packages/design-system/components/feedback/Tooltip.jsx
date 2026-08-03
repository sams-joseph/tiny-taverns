import React, { createContext, useContext, useState } from "react";

/* shadcn/ui Tooltip composition: TooltipProvider > Tooltip > TooltipTrigger +
   TooltipContent. Modern skin: dark rounded label, 6px radius, no arrow. */

const Ctx = createContext(null);

export function TooltipProvider({ children }) {
  return <React.Fragment>{children}</React.Fragment>;
}

export function Tooltip({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen }}>
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ position: "relative", display: "inline-flex" }}
      >
        {children}
      </span>
    </Ctx.Provider>
  );
}

export function TooltipTrigger({ children }) {
  return <React.Fragment>{children}</React.Fragment>;
}

const SIDES = {
  top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
};

export function TooltipContent({ side = "top", shortcut, style, children, ...rest }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.open) return null;
  return (
    <span
      role="tooltip"
      style={{
        position: "absolute",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        maxWidth: 240,
        padding: "6px 9px",
        background: "var(--slate-700)",
        color: "var(--slate-50)",
        border: "1px solid var(--slate-600)",
        borderRadius: "var(--r-sm)",
        boxShadow: "var(--shadow-2)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label-s)",
        fontWeight: "var(--fw-medium)",
        lineHeight: 1.45,
        whiteSpace: shortcut ? "nowrap" : "normal",
        pointerEvents: "none",
        ...SIDES[side],
        ...style,
      }}
      {...rest}
    >
      {children}
      {shortcut ? (
        <kbd style={{ padding: "1px 5px", background: "rgba(255,255,255,.16)", color: "var(--slate-50)", borderRadius: "var(--r-xs)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-micro)", lineHeight: 1.2 }}>
          {shortcut}
        </kbd>
      ) : null}
    </span>
  );
}
