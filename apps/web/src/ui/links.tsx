import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  type IconName,
} from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * The chip and the *Link…* menu a row's links are drawn with, wherever one
 * thing is linked to others: a note's *Linked* footer (`NoteLinks`) and an
 * NPC's *Shows up in* (`NpcLinks`). One implementation, so the two cannot
 * drift apart in how a link looks, opens or is removed.
 */

/**
 * One chip: the drawing's 30px outline tag. Its name is a link to what it
 * names (`children`, the router `Link` wearing `linkChipClassName` around
 * `LinkChipFace`); the × is a separate button beside it, never inside the
 * link, so pressing it removes and does not navigate.
 */
export function LinkChip({
  title,
  label,
  onRemove,
  busy = false,
  children,
}: {
  readonly title?: string;
  /** What the × says it removes. */
  readonly label: string;
  /** Absent for a chip nobody removes here: a note's attachment, a night at the table. */
  readonly onRemove?: () => void;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-slot="link-chip"
      title={title}
      className="inline-flex h-control-sm max-w-full items-stretch rounded-sm border border-strong text-label leading-none font-medium text-foreground"
    >
      {children}
      {onRemove !== undefined && (
        <button
          type="button"
          aria-label={`Unlink ${label}`}
          disabled={busy}
          onClick={onRemove}
          className="flex cursor-pointer items-center rounded-sm border-0 bg-transparent px-1.5 text-muted-foreground transition-control outline-none hover:bg-surface-raised hover:text-foreground focus-visible:ring-focus disabled:cursor-default disabled:opacity-50"
        >
          <Icon name="x" size={13} className="pointer-events-none" />
        </button>
      )}
    </span>
  );
}

export const linkChipClassName =
  "flex min-w-0 items-center gap-1.5 rounded-sm px-2.5 text-inherit no-underline transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus";

export function LinkChipFace({ icon, label }: { readonly icon: IconName; readonly label: string }) {
  return (
    <>
      <Icon name={icon} size={13} className="pointer-events-none shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </>
  );
}

export interface LinkMenuGroup {
  readonly label: string;
  readonly icon: IconName;
  readonly items: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly onSelect: () => void;
  }>;
}

/**
 * *Link…*: what could be linked and is not yet, a group per kind. A group
 * with nothing left in it is not drawn, and with nothing left anywhere the
 * menu is disabled rather than opening empty.
 */
export function LinkMenu({
  groups,
  busy,
}: {
  readonly groups: ReadonlyArray<LinkMenuGroup>;
  readonly busy: boolean;
}) {
  const offered = groups.filter((group) => group.items.length > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy || offered.length === 0}
        render={<Button variant="outline" size="sm" className="h-control-sm" />}
      >
        <Icon name="link" size={13} className="pointer-events-none" />
        Link…
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {offered.map((group) => (
          <DropdownMenuGroup key={group.label}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem key={item.key} onClick={item.onSelect}>
                <Icon name={group.icon} size={14} className="pointer-events-none" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
