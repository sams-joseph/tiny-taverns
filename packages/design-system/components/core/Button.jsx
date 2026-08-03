import React, { useState } from "react";

/* shadcn/ui Button API. Modern skin: 1px border, 6px radius, soft shadow on the
   solid variants, subtle darken on hover, tiny inset on press. */

export const buttonSizes = {
  default: { height: 38, padding: "0 14px", fontSize: "var(--fs-label)" },
  sm: { height: 32, padding: "0 11px", fontSize: "var(--fs-label-s)" },
  lg: { height: 44, padding: "0 20px", fontSize: "15px" },
  icon: { height: 38, width: 38, padding: 0, fontSize: "var(--fs-label)" },
};

const VARIANTS = {
  default: { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "transparent", hover: "var(--accent-hover)", press: "var(--accent-press)", raised: true },
  secondary: { background: "var(--surface-raised)", color: "var(--text-body)", borderColor: "var(--border-strong)", hover: "var(--slate-700)", press: "var(--slate-800)", raised: true },
  destructive: { background: "var(--danger)", color: "var(--text-on-solid)", borderColor: "transparent", hover: "var(--danger-hover)", press: "var(--crimson-700)", raised: true },
  outline: { background: "transparent", color: "inherit", borderColor: "currentColor", hover: "rgba(166,179,192,.10)", press: "rgba(166,179,192,.16)" },
  ghost: { background: "transparent", color: "inherit", borderColor: "transparent", hover: "rgba(166,179,192,.10)", press: "rgba(166,179,192,.16)" },
  link: { background: "transparent", color: "var(--text-link)", borderColor: "transparent", hover: "transparent", press: "transparent", underline: true },
};

export function Button({ variant = "default", size = "default", disabled = false, style, children, ...rest }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const sz = buttonSizes[size] || buttonSizes.default;
  const v = VARIANTS[variant] || VARIANTS.default;
  const active = press && !disabled;

  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: sz.height,
        width: sz.width,
        padding: sz.padding,
        fontFamily: "var(--font-sans)",
        fontSize: sz.fontSize,
        fontWeight: "var(--fw-medium)",
        lineHeight: 1,
        letterSpacing: 0,
        textDecoration: v.underline ? "underline" : "none",
        textUnderlineOffset: 3,
        background: active ? v.press : hover && !disabled ? v.hover : v.background,
        color: v.color,
        border: "1px solid " + v.borderColor,
        borderRadius: "var(--r-control)",
        boxShadow: v.raised && !disabled ? (active ? "var(--shadow-inset-press)" : "var(--shadow-1)") : "none",
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
