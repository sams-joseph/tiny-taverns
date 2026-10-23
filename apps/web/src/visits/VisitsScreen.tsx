import type { CampaignId, LevelVisitSummary } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cardLinkClassName,
  EmptyState,
  Icon,
} from "@taverns/ui";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { sizeLine } from "../levels/size";
import { SaveFailure } from "../ui/form";
import { levelVisitsAtom, tableVisitWrites } from "./load";
import { OpenVisitDialog } from "./OpenVisitDialog";
import { ResetVisitDialog } from "./ResetVisitDialog";

/**
 * A table's levels: each of the creator's levels the party has been to, as
 * the dungeon was left (`LevelVisit.ts`), and the way to take the party to
 * another. The creator's alone, as every read behind it is.
 *
 * A card opens the visit's stage from its face (`VisitScreen.tsx`). Its own
 * buttons put the visit on the table or take it off (one visit is on the
 * table at a time, so putting one on takes the other off), and *Reset level*,
 * the visit's delete, which asks first.
 *
 * A fight holding a visit (`LevelVisitSummary.fight`) is named on its card
 * with the way to it, and the card offers only what the server would take:
 * no table change while any of the table's levels is held, and no reset while
 * the fight is live; a carried one may still be reset.
 */
export function VisitsScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [resetting, setResetting] = useState<LevelVisitSummary | undefined>();

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Levels"
      centred
      extra={levelVisitsAtom(campaignId)}
      subtitle={({ extra }) =>
        extra.length === 0
          ? undefined
          : `${String(extra.length)} ${extra.length === 1 ? "level" : "levels"} visited`
      }
      actions={() => (
        <Button variant="outline" size="sm" onClick={() => setOpening(true)}>
          <Icon name="plus" size={14} />
          Open a level
        </Button>
      )}
    >
      {({ extra }) => (
        <>
          {extra.length === 0 ? (
            <EmptyState icon="grid-3x3" title="The party has been nowhere yet">
              Open one of your levels to take the party there. It stays as they leave it.
            </EmptyState>
          ) : (
            <div className="@container">
              <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
                {extra.map((visit) => (
                  <VisitCard
                    key={visit.id}
                    campaignId={campaignId}
                    visit={visit}
                    others={extra}
                    onReset={() => setResetting(visit)}
                  />
                ))}
              </div>
            </div>
          )}
          {opening && (
            <OpenVisitDialog
              campaignId={campaignId}
              visited={extra}
              onClose={() => setOpening(false)}
              onOpened={(visit) => {
                setOpening(false);
                void navigate({
                  to: "/campaigns/$campaignId/levels/$visitId",
                  params: { campaignId, visitId: visit.id },
                });
              }}
            />
          )}
          {resetting !== undefined && (
            <ResetVisitDialog
              campaignId={campaignId}
              visit={resetting}
              onClose={() => setResetting(undefined)}
              onReset={() => setResetting(undefined)}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}

function VisitCard({
  campaignId,
  visit,
  others,
  onReset,
}: {
  readonly campaignId: CampaignId;
  readonly visit: LevelVisitSummary;
  readonly others: ReadonlyArray<LevelVisitSummary>;
  readonly onReset: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  // Putting this one on takes whichever was there off: both read again.
  const onTableNow = others.filter((other) => other.onTable).map((other) => other.id);
  const fight = visit.fight;
  /** Another of the table's levels a fight holds: the party is there until it ends. */
  const heldElsewhere = others.some((other) => other.id !== visit.id && other.fight !== null);
  const canTable = fight === null && !heldElsewhere;
  const canReset = fight === null || fight.carried;
  const toggle = () =>
    void submit(
      (client) =>
        visit.onTable
          ? client.levelVisits.takeOffTable({ params: { campaignId } })
          : client.levelVisits.putOnTable({
              params: { campaignId },
              payload: { visitId: visit.id },
            }),
      tableVisitWrites(campaignId, [visit.id, ...onTableNow]),
    );
  return (
    <Card linked className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <CardTitle>
              <Link
                to="/campaigns/$campaignId/levels/$visitId"
                params={{ campaignId, visitId: visit.id }}
                data-card-link
                className={cardLinkClassName}
              >
                {visit.name}
              </Link>
            </CardTitle>
            <p className="text-caption leading-body text-muted-foreground">{sizeLine(visit)}</p>
          </div>
          {visit.onTable && (
            <Badge variant="success" className="shrink-0">
              On the table
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2">
        {fight !== null && (
          <p
            data-slot="visit-card-fight"
            className="mb-0 flex items-center gap-1.5 text-body-s leading-body text-muted-foreground"
          >
            <Icon name="swords" size={13} className="shrink-0 text-danger" />
            <span>
              <Link
                to="/campaigns/$campaignId/sessions/$sessionId/runs/$runId"
                params={{ campaignId, sessionId: fight.sessionId, runId: fight.runId }}
                className="font-medium text-link hover:text-link-hover"
              >
                {fight.name}
              </Link>{" "}
              {fight.carried
                ? "was carried over here. Pick it up to go on."
                : "is being played here."}
            </span>
          </p>
        )}
        {(canTable || canReset) && (
          <div className="flex flex-wrap items-center gap-2">
            {canTable && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={toggle}>
                <Icon name={visit.onTable ? "eye-off" : "eye"} size={13} />
                {visit.onTable ? "Take off the table" : "Put on the table"}
              </Button>
            )}
            {canReset && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onReset}>
                <Icon name="undo-2" size={13} />
                Reset level
              </Button>
            )}
          </div>
        )}
        {visit.levelId === null && (
          <p className="mb-0 text-caption leading-body text-muted-foreground">
            Its level has been deleted from your Library; this copy stays as the party left it.
          </p>
        )}
        {failure !== undefined && <SaveFailure failure={failure} />}
      </CardContent>
    </Card>
  );
}
