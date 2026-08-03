import React, { useState } from "react";

const SIZES = { default: 36, sm: 30, lg: 42 };

export function Toggle({ pressed = false, onPressedChange, size = "default", disabled = false, style, children, ...rest }) {
  const [hover, setHover] = useState(false);
  const h = SIZES[size] || SIZES.default;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange && onPressedChange(!pressed)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: h,
        padding: "0 12px",
        background: pressed ? "var(--accent-soft)" : hover && !disabled ? "var(--surface-raised)" : "var(--surface-card)",
        color: pressed ? "var(--accent-ink)" : "var(--text-body)",
        border: "1px solid " + (pressed ? "var(--accent)" : "var(--border-strong)"),
        borderRadius: "var(--r-tag)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label)",
        fontWeight: "var(--fw-medium)",
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "var(--transition-control)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
