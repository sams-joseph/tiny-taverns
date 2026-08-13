import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";

/* shadcn/ui Toast composition: Toast > ToastTitle/ToastDescription, plus
   ToastAction and ToastClose. Modern skin: dark rounded card with a filled
   variant glyph strip down the left edge. */

const VARIANTS = {
  default: { strip: "var(--accent)", icon: "info" },
  destructive: { strip: "var(--danger)", icon: "triangle-alert" },
  success: { strip: "var(--success)", icon: "check" },
  magic: { strip: "var(--magic)", icon: "sparkles" },
};

export function Toast({ variant = "default", style, children, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.default;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "stretch",
        width: 340,
        background: "var(--surface-raised)",
        color: "var(--text-on-dark)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-3)",
        overflow: "hidden",
        animation: "tt-toast-in var(--dur-base) var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      <style>{"@keyframes tt-toast-in{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}"}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, flex: "0 0 auto", background: v.strip, color: "var(--text-on-solid)" }}>
        <Icon name={v.icon} size={16} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px" }}>{children}</div>
    </div>
  );
}

export function ToastTitle({ style, children, ...rest }) {
  return <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)", fontWeight: "var(--fw-semibold)", lineHeight: 1.4, ...style }} {...rest}>{children}</span>;
}

export function ToastDescription({ style, children, ...rest }) {
  return <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.45 var(--font-sans)", color: "var(--text-on-dark-muted)", ...style }} {...rest}>{children}</span>;
}

export function ToastAction({ style, children, ...rest }) {
  return (
    <div style={{ display: "flex", gap: "var(--s-4)", marginTop: 6, ...style }} {...rest}>{children}</div>
  );
}

export function ToastClose({ onClick }) {
  return (
    <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onClick} style={{ width: 28, height: 28, color: "var(--text-on-dark-muted)", alignSelf: "flex-start" }}>
      <Icon name="x" size={12} />
    </Button>
  );
}
