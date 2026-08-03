import type { ReactNode } from "react";

/**
 * Gallery furniture. Deliberately thin — everything with a design opinion should
 * be coming from @taverns/ui, not from here.
 */

export function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-8 flex-col gap-gutter">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-display-m leading-tight font-semibold tracking-display text-heading">
          {title}
        </h2>
        <p className="max-w-measure text-body-s leading-body text-muted-foreground">{blurb}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Specimen({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface-card p-card shadow-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-label font-medium text-heading">{label}</span>
        {note ? (
          <span className="font-mono text-micro leading-tight text-faint">{note}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-3">{children}</div>;
}

export function Field({ children }: { children: ReactNode }) {
  return <div className="grid w-full max-w-72 gap-1.5">{children}</div>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <span className="text-caption leading-body text-faint">{children}</span>;
}
