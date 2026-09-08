import type { Npc } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
} from "@taverns/ui";
import { describeNpc, hasPrivateMaterial, initialsOf } from "./persona";

/**
 * Two letters in a square — the NPC's face until a portrait control is drawn.
 *
 * Not a Hob mark and not an `<img>`: the report is explicit that the rehearsal
 * is branded as the NPC and never as Hob, and a stubbed portrait upload is the
 * kind of control this product refuses. Initials are honest and need no asset.
 */
export function NpcAvatar({
  name,
  size = "sm",
}: {
  readonly name: string;
  readonly size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={
        size === "lg"
          ? "flex size-11 shrink-0 items-center justify-center rounded-control border border-strong bg-surface-raised font-display text-body font-semibold text-heading"
          : "flex size-7 shrink-0 items-center justify-center rounded-sm border border-strong bg-surface-raised font-display text-micro font-semibold text-heading"
      }
    >
      {initialsOf(name)}
    </span>
  );
}

export function NpcCard({ npc, onEdit }: { readonly npc: Npc; readonly onEdit: () => void }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <NpcAvatar name={npc.name} />
          <div className="min-w-0 flex-1">
            <CardTitle>
              <Link
                to="/campaigns/$campaignId/cast/$npcId"
                params={{ campaignId: npc.campaignId, npcId: npc.id }}
                className="hover:underline"
              >
                {npc.name}
              </Link>
            </CardTitle>
            {npc.role !== "" && (
              <p className="text-caption leading-body text-muted-foreground">{npc.role}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-7 shrink-0"
            aria-label={`Edit ${npc.name}`}
            onClick={onEdit}
          >
            <Icon name="pencil" size={14} />
          </Button>
        </div>
        <CardDescription className="line-clamp-3">{describeNpc(npc)}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-1.5">
        {/* Every row is `dm` in this slice, so the exception worth marking is
            the material even a later shared row would keep back. */}
        {hasPrivateMaterial(npc) && (
          <Badge variant="outline">
            <Icon name="lock" size={11} />
            Private material
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          nativeButton={false}
          render={
            <Link
              to="/campaigns/$campaignId/cast/$npcId"
              params={{ campaignId: npc.campaignId, npcId: npc.id }}
            />
          }
        >
          <Icon name="mic" size={13} />
          Rehearse
        </Button>
      </CardContent>
    </Card>
  );
}
