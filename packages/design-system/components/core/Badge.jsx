import React from "react";

/* shadcn/ui Badge API. Modern skin: soft tinted fills with matching ink, 4px radius,
   sentence case. Solid fills are reserved for `default` and `destructive`. */

const VARIANTS = {
  default: { background: "var(--accent)", color: "var(--text-on-accent)", border: "transparent" },
  secondary: { background: "var(--surface-raised)", color: "var(--slate-300)", border: "transparent" },
  destructive: { background: "var(--danger)", color: "var(--text-on-solid)", border: "transparent" },
  outline: { background: "transparent", color: "var(--text-muted)", border: "var(--border-strong)" },
  success: { background: "var(--success-soft)", color: "var(--success-ink)", border: "transparent" },
  magic: { background: "var(--magic-soft)", color: "var(--magic-ink)", border: "transparent" },
  info: { background: "var(--info-soft)", color: "var(--info-ink)", border: "transparent" },
};

export function Badge({ variant = "default", style, children, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        background: v.background,
        color: v.color,
        border: "1px solid " + v.border,
        borderRadius: "var(--r-xs)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label-s)",
        fontWeight: "var(--fw-medium)",
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
