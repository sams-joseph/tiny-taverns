import { Card, CardContent, Icon, SectionHeading } from "@taverns/ui";
import { useId, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard, describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { runBoardAtom, type RunPath } from "./load";

/**
 * The fight's board, under the initiative list: **the DM's alone, and closed
 * until they open it.** The runner is the creator's screen, so no player ever
 * reaches this; showing the map to the table is a later feature with a player
 * read of its own.
 *
 * Closed by default because the initiative list is what the DM is running and
 * the board is a reference beside it; a 3:2 picture the column's width would
 * push the list's neighbours down the page on every visit. Under the list
 * rather than in the aside, which is too narrow to read squares on.
 *
 * The board is the fight's own (`EncounterRunBoard`): its grid was copied when
 * the fight began, so it says nothing about the encounter's map as it stands.
 * A fight with no board — one whose encounter was gone before fights kept
 * boards — gets no band at all rather than an empty one.
 */
export function RunBoardBand({ path }: { readonly path: RunPath }) {
  const [resource, reload] = useApiAtom(runBoardAtom(path));
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);

  if (resource.state === "loading") return null;
  if (resource.state === "ready" && board === null) return null;

  return (
    <Card data-slot="run-board">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-3 px-card py-3 text-left"
      >
        <SectionHeading as="h3" size="label" className="flex-1">
          Map
        </SectionHeading>
        {board !== null && (
          <span className="text-caption leading-snug text-muted-foreground">
            {describeBoard(board)}
          </span>
        )}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} className="text-faint" />
      </button>
      {open && (
        <CardContent id={bodyId} className="flex flex-col gap-3">
          {resource.state === "failed" ? (
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          ) : (
            board !== null && (
              <>
                <BattleMapBoard map={board} />
                {board.mapId === null && (
                  <p className="text-body-s leading-body text-muted-foreground">
                    This fight's encounter was deleted, and its picture with it. The board keeps its
                    squares.
                  </p>
                )}
              </>
            )
          )}
        </CardContent>
      )}
    </Card>
  );
}
