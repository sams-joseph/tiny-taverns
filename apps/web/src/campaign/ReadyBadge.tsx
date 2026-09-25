import type { EncounterPrep } from "@taverns/api";
import { Badge } from "@taverns/ui";

/**
 * Whether the DM has said an encounter is ready to run — *Ready* or *Draft*,
 * as the redesign badges it on the list, the preview and the Overview's rows.
 *
 * It is the DM's own word (`EncounterPrep.ready`, set by the builder's *Ready
 * to run*), never worked out from the roster, so it reads the creator's prep
 * and nothing else. With no prep row to read it draws nothing rather than a
 * guess. A played encounter says when it was played instead, which each caller
 * decides.
 */
export function ReadyBadge({ prep }: { readonly prep: Pick<EncounterPrep, "ready"> | undefined }) {
  if (prep === undefined) return null;
  return prep.ready ? (
    <Badge variant="success" className="shrink-0">
      Ready
    </Badge>
  ) : (
    <Badge variant="secondary" className="shrink-0">
      Draft
    </Badge>
  );
}
