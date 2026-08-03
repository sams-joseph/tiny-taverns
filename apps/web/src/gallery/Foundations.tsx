import { Section, Specimen } from "./Layout";
import { BLURBS, NOTES } from "./specs";

/**
 * The tokens themselves. If the ramps, faces, radii and shadows below look right,
 * the bridge from packages/design-system/tokens into Tailwind's theme is working —
 * which is what everything else in the gallery rests on.
 */

const RAMPS = [
  {
    name: "Slate — every neutral carries a blue cast",
    steps: [
      { label: "950", className: "bg-slate-950" },
      { label: "900", className: "bg-slate-900" },
      { label: "800", className: "bg-slate-800" },
      { label: "700", className: "bg-slate-700" },
      { label: "600", className: "bg-slate-600" },
      { label: "500", className: "bg-slate-500" },
      { label: "400", className: "bg-slate-400" },
      { label: "300", className: "bg-slate-300" },
      { label: "200", className: "bg-slate-200" },
      { label: "100", className: "bg-slate-100" },
      { label: "50", className: "bg-slate-50" },
    ],
  },
  {
    name: "Verdigris — the only colour that carries an action",
    steps: [
      { label: "700", className: "bg-verdigris-700" },
      { label: "600", className: "bg-verdigris-600" },
      { label: "500", className: "bg-verdigris-500" },
      { label: "400", className: "bg-verdigris-400" },
      { label: "300", className: "bg-verdigris-300" },
      { label: "200", className: "bg-verdigris-200" },
      { label: "100", className: "bg-verdigris-100" },
    ],
  },
  {
    name: "Crimson — damage, hostile, destructive",
    steps: [
      { label: "700", className: "bg-crimson-700" },
      { label: "600", className: "bg-crimson-600" },
      { label: "500", className: "bg-crimson-500" },
      { label: "400", className: "bg-crimson-400" },
      { label: "200", className: "bg-crimson-200" },
      { label: "100", className: "bg-crimson-100" },
    ],
  },
  {
    name: "Emerald — healing, saved, success",
    steps: [
      { label: "700", className: "bg-emerald-700" },
      { label: "600", className: "bg-emerald-600" },
      { label: "500", className: "bg-emerald-500" },
      { label: "400", className: "bg-emerald-400" },
      { label: "200", className: "bg-emerald-200" },
      { label: "100", className: "bg-emerald-100" },
    ],
  },
  {
    name: "Violet — magic, concentration. Flat, never a gradient",
    steps: [
      { label: "700", className: "bg-violet-700" },
      { label: "600", className: "bg-violet-600" },
      { label: "500", className: "bg-violet-500" },
      { label: "400", className: "bg-violet-400" },
      { label: "200", className: "bg-violet-200" },
      { label: "100", className: "bg-violet-100" },
    ],
  },
  {
    name: "Azure — rules reference, cold",
    steps: [
      { label: "700", className: "bg-azure-700" },
      { label: "600", className: "bg-azure-600" },
      { label: "500", className: "bg-azure-500" },
      { label: "400", className: "bg-azure-400" },
      { label: "200", className: "bg-azure-200" },
      { label: "100", className: "bg-azure-100" },
    ],
  },
];

const SURFACES = [
  { label: "sunken", className: "bg-surface-sunken" },
  { label: "page", className: "bg-surface-page" },
  { label: "card", className: "bg-surface-card" },
  { label: "raised", className: "bg-surface-raised" },
];

const RADII = [
  { label: "xs · badges", className: "rounded-xs" },
  { label: "control · 6", className: "rounded-control" },
  { label: "md · popovers", className: "rounded-md" },
  { label: "card · 12", className: "rounded-card" },
  { label: "dialog · 14", className: "rounded-dialog" },
  { label: "tag · pill", className: "rounded-tag" },
];

const SHADOWS = [
  { label: "shadow-1 · cards, buttons", className: "shadow-1" },
  { label: "shadow-2 · hover, raised", className: "shadow-2" },
  { label: "shadow-3 · dialogs, popovers", className: "shadow-3" },
  { label: "shadow-dark · panels", className: "shadow-dark" },
];

export function Foundations() {
  return (
    <Section id="foundations" title="Foundations" blurb={BLURBS.foundations}>
      {RAMPS.map((ramp) => (
        <Specimen key={ramp.name} label={ramp.name}>
          <div className="flex w-full flex-wrap gap-0.5">
            {ramp.steps.map((step) => (
              <div key={step.label} className="flex flex-col items-center gap-1">
                <div
                  className={`size-12 rounded-xs border border-hairline ${step.className}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-micro text-faint">{step.label}</span>
              </div>
            ))}
          </div>
        </Specimen>
      ))}

      <Specimen label="Surface stack" note={NOTES.surfaces}>
        <div className="flex w-full flex-wrap gap-3">
          {SURFACES.map((surface) => (
            <div
              key={surface.label}
              className={`flex h-20 flex-1 basis-40 items-end rounded-card border border-hairline p-3 ${surface.className}`}
            >
              <span className="font-mono text-micro text-muted-foreground">{surface.label}</span>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen label="Type — one sans, differentiated by weight and size">
        <div className="flex w-full flex-col gap-3">
          <p className="font-display text-display-xl leading-tight font-semibold tracking-display text-heading">
            Run the fight
          </p>
          <p className="font-display text-display-l leading-tight font-semibold tracking-display text-heading">
            Six goblins in the reeds
          </p>
          <p className="font-display text-display-m leading-snug font-semibold tracking-display text-heading">
            Goblin ambush
          </p>
          <p className="font-display text-title leading-snug font-semibold tracking-tight text-heading">
            Session 12 · the marsh road
          </p>
          <p className="max-w-measure text-body leading-body">
            Instrument Sans carries the whole interface. There is no display face fighting it —
            hierarchy is weight and size, and only two other families appear, each for a job the
            sans cannot do.
          </p>
          <p className="max-w-measure font-serif text-body-l leading-loose italic">
            The reeds are taller than you are and they are not moving, even though there is a wind.
          </p>
          <p className="font-mono text-mono-l font-medium">2d6+3 · 21/21 hp · AC 15 · CR 1/4</p>
          <p className="text-label font-medium">Label · 13px medium sentence case</p>
          <p className="text-caption text-muted-foreground">Caption · 12.5px, muted</p>
        </div>
      </Specimen>

      <Specimen label="Radii" note={NOTES.radii}>
        <div className="flex w-full flex-wrap gap-4">
          {RADII.map((radius) => (
            <div key={radius.label} className="flex flex-col items-center gap-1.5">
              <div
                className={`size-16 border border-strong bg-surface-raised ${radius.className}`}
                aria-hidden="true"
              />
              <span className="font-mono text-micro text-faint">{radius.label}</span>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen label="Elevation" note={NOTES.elevation}>
        <div className="flex w-full flex-wrap gap-6 rounded-card bg-surface-page p-6">
          {SHADOWS.map((shadow) => (
            <div key={shadow.label} className="flex flex-col items-center gap-2">
              <div
                className={`size-20 rounded-card border border-hairline bg-surface-card ${shadow.className}`}
                aria-hidden="true"
              />
              <span className="font-mono text-micro text-faint">{shadow.label}</span>
            </div>
          ))}
        </div>
      </Specimen>
    </Section>
  );
}
