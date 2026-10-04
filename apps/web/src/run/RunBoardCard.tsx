import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  SectionHeading,
  Toggle,
} from "@taverns/ui";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard } from "../campaign/BattleMapBoard";
import { AreaLayer } from "./BoardTools";
import { boardCaption, useRunBoard, type RunBoardProps } from "./runBoard";
import { RunTokens } from "./RunTokens";
import { TOKEN_NAMES, type TokenNames } from "./tokens";

/**
 * The fight's board: **open, and the DM's own.** The runner is the creator's
 * screen, so no player ever reaches this card; what the table sees of the map
 * is its own read, shown only while the header's *Share map* is on
 * (`PlayerLiveBoard`, drawn by `play/PlayerBoard.tsx`).
 *
 * The redesign puts it at the centre of the fight rather than in a band under
 * the list, so it is drawn open, as wide as its column (`RunLayout.tsx`), with
 * the fight's tokens on it (`RunTokens.tsx`). This card is the board below
 * `@3xl`; above it the same board is the canvas (`RunStage.tsx`), and the two
 * share everything but their frame (`runBoard.ts`).
 *
 * The board is the fight's own (`EncounterRunBoard`): its grid was copied when
 * the fight began, so it says nothing about the encounter's map as it stands.
 * A fight with no board — one whose encounter was gone before fights kept
 * boards — gets no card at all rather than an empty one, and the layout closes
 * the gap (the screen asks `hasBoard`, `load.ts`).
 *
 * *Grid* is the DM's view of it, not a write: it hides the lines on this screen
 * and nowhere else, and the squares still measure and still take a token.
 * *Names* is too: which tokens wear their name, kept on this browser
 * (`tokenNames.ts`).
 * *Hide from players* is a write (`EncounterRun.hostileTokensHidden`): every
 * token but the party's comes off the players' board at once, while their rows
 * stay in the players' order. It can be set before the map is shared, so a
 * fight can open with the monsters already hidden.
 *
 * The dock's tools are the canvas's (`BoardTools.tsx`); this card only draws an
 * area pinned there, as the players' board does.
 */
/**
 * The DM's board switches: *Grid* and *Names* (this screen's view) and *Hide
 * from players* (a write).
 */
export function BoardToggles({
  gridShown,
  setGrid,
  names,
  setNames,
  over,
  hostileTokensHidden,
  hiding,
  onHideHostile,
}: {
  readonly gridShown: boolean;
  readonly setGrid: (shown: boolean) => void;
  readonly names: TokenNames;
  readonly setNames: (names: TokenNames) => void;
  readonly over: boolean;
  readonly hostileTokensHidden: boolean;
  readonly hiding: boolean;
  readonly onHideHostile: (hidden: boolean) => void;
}) {
  return (
    <>
      <Toggle size="sm" pressed={gridShown} onPressedChange={(pressed) => setGrid(pressed)}>
        <Icon name="grid-3x3" size={13} />
        Grid
      </Toggle>
      <TokenNamesMenu names={names} onChange={setNames} />
      <Toggle
        size="sm"
        pressed={hostileTokensHidden}
        disabled={over || hiding}
        onPressedChange={(pressed) => onHideHostile(pressed)}
      >
        <Icon name="eye-off" size={13} />
        Hide from players
      </Toggle>
    </>
  );
}

const LABEL: Readonly<Record<TokenNames, string>> = {
  active: "Active and selected",
  all: "Every token",
  none: "None",
};

/** The board's *Names* menu (`useTokenNames`): the three choices, the current one checked. */
function TokenNamesMenu({
  names,
  onChange,
}: {
  readonly names: TokenNames;
  readonly onChange: (names: TokenNames) => void;
}) {
  const name = `Names on tokens — ${LABEL[names]}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name}
        title={name}
        render={<Button variant="ghost" size="sm" />}
      >
        Names
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuRadioGroup
          value={names}
          onValueChange={(next) => {
            const chosen = TOKEN_NAMES.find((option) => option === next);
            if (chosen !== undefined) onChange(chosen);
          }}
        >
          <DropdownMenuLabel>Names on tokens</DropdownMenuLabel>
          {TOKEN_NAMES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
              {LABEL[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RunBoardCard(props: RunBoardProps) {
  const { resource, reload, over, hostileTokensHidden, hiding, onHideHostile } = props;
  const { board, gridShown, setGrid, names, setNames, hint, withBoard } = useRunBoard(props, false);

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
          <>
            {/* The hint has a line of its own under the title and the toggles,
                so a longer one after a selection or a move never rewraps the
                header and slides the board out from under the pointer. */}
            <span
              role="status"
              className="order-last hidden min-w-0 basis-full text-body-s leading-snug text-muted-foreground @3xl:block"
            >
              {hint}
            </span>
            <span className="order-last min-w-0 basis-full text-body-s leading-snug text-muted-foreground @3xl:hidden">
              {over
                ? "Where everyone stood when it ended."
                : "Select from the initiative. Tokens move on a wider screen."}
            </span>
            <div className="ml-auto flex gap-1.5">
              <BoardToggles
                gridShown={gridShown}
                setGrid={setGrid}
                names={names}
                setNames={setNames}
                over={over}
                hostileTokensHidden={hostileTokensHidden}
                hiding={hiding}
                onHideHostile={onHideHostile}
              />
            </div>
          </>
        )}
      </div>
      {resource.state === "failed" ? (
        <div className="p-panel">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      ) : (
        board !== null &&
        withBoard !== undefined && (
          <>
            <BattleMapBoard map={{ ...board, grid: gridShown ? "square" : "none" }}>
              {board.area !== null && <AreaLayer board={board} area={board.area} state="pinned" />}
              <RunTokens {...withBoard} />
            </BattleMapBoard>
            <p className="mb-0 border-t border-hairline px-panel py-2.5 text-caption leading-body text-muted-foreground">
              {boardCaption(board)}
            </p>
          </>
        )
      )}
    </Card>
  );
}
