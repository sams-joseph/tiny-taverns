import type { EncounterDifficulty } from "@taverns/api";
import { Badge } from "@taverns/ui";

/**
 * The computed difficulty band, coloured (`EncounterDifficulty.ts` — the DMG
 * method over the roster's XP and the seated party, never the DM's pick).
 *
 * The prototype maps three (`CampaignHome.jsx:13`): Deadly destructive, Medium
 * default, Easy success. `Hard` completes the band and needs a step between
 * Medium and Deadly — so it takes the *soft* half of the same crimson family
 * Deadly fills solid, which is what the `--danger-soft` / `--danger-ink` pair
 * exists for. `Trivial`, below Easy, is the quiet neutral. Read down the grid
 * it escalates neutral → soft success → accent → soft danger → solid danger.
 *
 * Unrated is its own thing rather than a missing badge: an encounter the rule
 * cannot rate yet is information, and `describeDifficulty` says why.
 */
export function DifficultyBadge({ difficulty }: { readonly difficulty: EncounterDifficulty }) {
  if (difficulty._tag === "unrated") {
    return <Badge variant="outline">Unrated</Badge>;
  }
  switch (difficulty.band) {
    case "Trivial":
      return <Badge variant="secondary">Trivial</Badge>;
    case "Easy":
      return <Badge variant="success">Easy</Badge>;
    case "Medium":
      return <Badge>Medium</Badge>;
    case "Hard":
      return (
        <Badge variant="outline" className="border-transparent bg-danger-soft text-danger-ink">
          Hard
        </Badge>
      );
    default:
      return <Badge variant="destructive">Deadly</Badge>;
  }
}
