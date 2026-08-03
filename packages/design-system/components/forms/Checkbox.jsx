import React from "react";
import { Icon } from "../core/Icon.jsx";

/* shadcn/ui Checkbox: control only, checked + onCheckedChange. No label prop. */

export function Checkbox({ checked = false, onCheckedChange, disabled = false, style, id, ...rest }) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      disabled={disabled}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        width: 18,
        height: 18,
        padding: 0,
        background: checked ? "var(--accent)" : "var(--surface-card)",
        color: "var(--text-on-accent)",
        border: "1px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
        borderRadius: "var(--r-xs)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "var(--transition-control)",
        ...style,
      }}
      {...rest}
    >
      {checked === "indeterminate" ? <Icon name="minus" size={12} /> : checked ? <Icon name="check" size={12} /> : null}
    </button>
  );
}
