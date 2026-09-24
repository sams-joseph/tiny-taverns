import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  type IconName,
} from "@taverns/ui";

export interface ActionsMenuItem {
  readonly label: string;
  readonly icon: IconName;
  readonly onSelect: () => void;
  /** Drawn in the danger colour: a delete, never an ordinary command. */
  readonly destructive?: boolean;
}

/**
 * An overflow button and the commands behind it: the owner's archive and delete
 * on a Shared World card, and the campaign's own acts on its Overview.
 *
 * The trigger is a `button`, so inside a `<Card linked>` it is lifted above the
 * card's link overlay by the card's own rule and pressing it opens the menu
 * rather than the card. The menu portals to `document.body`, so an item is
 * never inside the card either. Every item opens a confirmation; nothing here
 * writes.
 */
export function ActionsMenu({
  label,
  items,
}: {
  /** The accessible name of the trigger, naming what the commands act on. */
  readonly label: string;
  readonly items: ReadonlyArray<ActionsMenuItem>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        render={<Button variant="ghost" size="icon" className="size-control-sm" />}
      >
        <Icon name="ellipsis" size={16} className="pointer-events-none" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onClick={item.onSelect}
            className={item.destructive === true ? "text-danger" : undefined}
          >
            <Icon name={item.icon} size={14} className="pointer-events-none" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
