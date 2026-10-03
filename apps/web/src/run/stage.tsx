import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/**
 * Whether `main` is wide enough for the canvas: the same `@3xl` the tokens
 * take clicks from, asked of the stylesheet through a probe that is only
 * displayed past it, so there is one breakpoint and not a copy of it here.
 * `undefined` until the probe is measured, which is before the first paint.
 */
export function useStage(): { readonly probe: ReactNode; readonly wide: boolean | undefined } {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState<boolean>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const read = () => setWide(element.offsetWidth > 0);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {
    probe: (
      <div ref={ref} aria-hidden data-slot="run-stage-probe" className="hidden h-0 @3xl:block" />
    ),
    wide,
  };
}
