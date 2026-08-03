import React from "react";

/* shadcn/ui Switch: control only, checked + onCheckedChange.
   Modern skin: pill track, circular knob, smooth slide. */

export function Switch({ checked = false, onCheckedChange, disabled = false, style, id, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: 40,
        height: 22,
        padding: 0,
        background: checked ? "var(--accent)" : "var(--slate-700)",
        border: "1px solid transparent",
        borderRadius: "var(--r-pill)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--dur-fast) var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          background: "var(--slate-100)",
          borderRadius: "var(--r-circle)",
          boxShadow: "var(--shadow-1)",
          transition: "left var(--dur-fast) var(--ease-out)",
        }}
      />
    </button>
  );
}
