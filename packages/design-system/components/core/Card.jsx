import React from "react";

/* shadcn/ui Card composition. Modern skin: 12px radius, 1px hairline, level-1 shadow. */

export function Card({ tone = "default", style, children, ...rest }) {
  const dark = tone === "panel";
  return (
    <div
      style={{
        position: "relative",
        background: tone === "sunken" ? "var(--surface-sunken)" : tone === "raised" ? "var(--surface-raised)" : "var(--surface-card)",
        color: "var(--text-body)",
        border: "1px solid " + (dark ? "var(--border-strong)" : "var(--border-hairline)"),
        borderRadius: "var(--r-card)",
        boxShadow: dark ? "var(--shadow-2)" : "var(--shadow-1)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ style, children, ...rest }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "var(--pad-card)", ...style }} {...rest}>{children}</div>;
}

export function CardTitle({ style, children, ...rest }) {
  return <div style={{ font: "var(--type-title)", letterSpacing: "var(--ls-tight)", color: "inherit", ...style }} {...rest}>{children}</div>;
}

export function CardDescription({ style, children, ...rest }) {
  return <div style={{ font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", opacity: 0.72, ...style }} {...rest}>{children}</div>;
}

export function CardContent({ style, children, ...rest }) {
  return <div style={{ padding: "0 var(--pad-card) var(--pad-card)", ...style }} {...rest}>{children}</div>;
}

export function CardFooter({ style, children, ...rest }) {
  return <div style={{ display: "flex", alignItems: "center", gap: "var(--s-5)", padding: "var(--s-5) var(--pad-card)", borderTop: "1px solid var(--border-hairline)", ...style }} {...rest}>{children}</div>;
}
