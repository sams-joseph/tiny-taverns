import React from "react";

/* shadcn/ui has a standalone Label — form controls never render their own. */
export function Label({ htmlFor, style, children, ...rest }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-label)",
        fontWeight: "var(--fw-medium)",
        lineHeight: 1.4,
        color: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </label>
  );
}
