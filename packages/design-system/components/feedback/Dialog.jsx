import React from "react";
import { Button } from "../core/Button.jsx";
import { Icon } from "../core/Icon.jsx";

/* shadcn/ui Dialog composition: Dialog(open,onOpenChange) > DialogContent >
   DialogHeader > DialogTitle/DialogDescription, then DialogFooter.
   Modern skin: 14px radius, hairline border, level-3 shadow, blurred scrim,
   and it fades up 6px on enter. */

export function Dialog({ open = false, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div
      onClick={() => onOpenChange && onOpenChange(false)}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--s-8)",
        background: "var(--scrim)",
        backdropFilter: "blur(3px)",
      }}
    >
      {children}
    </div>
  );
}

export function DialogContent({ width = 460, style, children, ...rest }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(ev) => ev.stopPropagation()}
      style={{
        width,
        maxWidth: "100%",
        background: "var(--surface-card)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-dialog)",
        boxShadow: "var(--shadow-3)",
        animation: "tt-dialog-in var(--dur-base) var(--ease-out)",
        ...style,
      }}
      {...rest}
    >
      <style>{"@keyframes tt-dialog-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}"}</style>
      {children}
    </div>
  );
}

export function DialogHeader({ style, children, ...rest }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "var(--s-7) var(--s-7) var(--s-5)", ...style }} {...rest}>{children}</div>;
}

export function DialogTitle({ style, children, ...rest }) {
  return <h3 style={{ margin: 0, font: "var(--type-title)", color: "var(--text-heading)", ...style }} {...rest}>{children}</h3>;
}

export function DialogDescription({ style, children, ...rest }) {
  return <p style={{ margin: 0, font: "var(--fw-regular) var(--fs-body-s)/1.5 var(--font-sans)", color: "var(--text-muted)", ...style }} {...rest}>{children}</p>;
}

export function DialogFooter({ style, children, ...rest }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-5)", padding: "var(--s-5) var(--s-7) var(--s-7)", borderTop: "1px solid var(--border-hairline)", background: "var(--surface-sunken)", borderRadius: "0 0 var(--r-dialog) var(--r-dialog)", ...style }} {...rest}>
      {children}
    </div>
  );
}

export function DialogClose({ onClick }) {
  return (
    <Button variant="ghost" size="icon" aria-label="Close" onClick={onClick} style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32 }}>
      <Icon name="x" size={14} />
    </Button>
  );
}
