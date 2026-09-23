/**
 * An NPC's appearance line, labelled — the one visual field of the public
 * persona, drawn the same on the creator's page and wherever a player meets
 * the NPC. Nothing when none was written.
 */
export function NpcAppearance({ appearance }: { readonly appearance: string | undefined }) {
  if (appearance === undefined || appearance.trim() === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        Appearance
      </span>
      <p className="text-body-s leading-body text-foreground">{appearance}</p>
    </div>
  );
}
