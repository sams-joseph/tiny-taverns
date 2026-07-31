import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis of the button. */
  variant?: "primary" | "secondary";
}

const baseStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "1px solid transparent",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const variantStyle = {
  primary: { background: "#4f46e5", color: "#ffffff" },
  secondary: { background: "#e5e7eb", color: "#111827" },
} as const;

/**
 * A minimal, themeable button used across Taverns apps.
 */
export function Button({ variant = "primary", style, children, ...rest }: ButtonProps) {
  return (
    <button style={{ ...baseStyle, ...variantStyle[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}
