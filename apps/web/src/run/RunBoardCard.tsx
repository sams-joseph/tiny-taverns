import type { EncounterRunBoard } from "@taverns/api";
import { Card, Icon, SectionHeading } from "@taverns/ui";
import type { Resource } from "../api/failure";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard, describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";

/**
 * The fight's board: **open, and the DM's alone.** The runner is the creator's
 * screen, so no player ever reaches this; showing the map to the table is a
 * later feature with a player read of its own.
 *
 * The redesign puts it at the centre of the fight rather than in a band under
 * the list, so it is drawn open, as wide as its column (`RunLayout.tsx`).
 *
 * The board is the fight's own (`EncounterRunBoard`): its grid was copied when
 * the fight began, so it says nothing about the encounter's map as it stands.
 * A fight with no board — one whose encounter was gone before fights kept
 * boards — gets no card at all rather than an empty one, and the layout closes
 * the gap (the screen asks `hasBoard`, `load.ts`).
 */
export function RunBoardCard({
  resource,
  reload,
}: {
  readonly resource: Resource<EncounterRunBoard | null>;
  readonly reload: () => void;
}) {
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);

  if (resource.state === "loading") return null;
  if (resource.state === "ready" && board === null) return null;

  return (
    <Card aria-label="Battle map" role="region" data-slot="run-board" className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Battle map
        </SectionHeading>
        {board !== null && (
          <span className="text-body-s leading-snug text-muted-foreground">
            {describeBoard(board)}
          </span>
        )}
      </div>
      {resource.state === "failed" ? (
        <div className="p-panel">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      ) : (
        board !== null && (
          <>
            <BattleMapBoard map={board} />
            {board.mapId === null && (
              <p className="mb-0 px-panel py-2.5 text-body-s leading-body text-muted-foreground">
                This fight's encounter was deleted, and its picture with it. The board keeps its
                squares.
              </p>
            )}
          </>
        )
      )}
    </Card>
  );
}
