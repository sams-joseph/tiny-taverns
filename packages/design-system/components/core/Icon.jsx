import React from "react";

/** Lucide 0.469.0 as CSS-masked glyphs so they inherit currentColor. */
export const ICON_BASE = "https://unpkg.com/lucide-static@0.469.0/icons/";

export function Icon({ name, size = 16, style, className, ...rest }) {
  const url = "url(" + ICON_BASE + name + ".svg)";
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
        backgroundColor: "currentColor",
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
      {...rest}
    />
  );
}
