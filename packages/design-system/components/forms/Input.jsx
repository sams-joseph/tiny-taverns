import React, { useState } from "react";

/* shadcn/ui Input: a BARE input. No label, no hint, no error, no icon slot —
   those are Label / FormDescription / FormMessage in shadcn, composed outside. */

export function Input({ mono = false, style, onFocus, onBlur, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      onFocus={(e) => { setFocus(true); if (onFocus) onFocus(e); }}
      onBlur={(e) => { setFocus(false); if (onBlur) onBlur(e); }}
      style={{
        display: "block",
        width: "100%",
        height: 38,
        padding: "0 11px",
        background: "var(--surface-card)",
        color: "var(--text-body)",
        border: "1px solid " + (focus ? "var(--accent)" : "var(--border-strong)"),
        borderRadius: "var(--r-control)",
        boxShadow: focus ? "var(--ring)" : "none",
        font: mono
          ? "var(--fw-medium) var(--fs-mono)/1 var(--font-mono)"
          : "var(--fw-regular) var(--fs-body-s)/1 var(--font-sans)",
        outline: "none",
        transition: "var(--transition-control)",
        ...style,
      }}
      {...rest}
    />
  );
}
