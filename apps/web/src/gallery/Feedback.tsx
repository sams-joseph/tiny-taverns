import { useState } from "react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Icon,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  createToastManager,
  type ToastVariant,
} from "@taverns/ui";

import { Section, Specimen } from "./Layout";
import { BLURBS, NOTES } from "./specs";

/**
 * The gallery drives its own toast manager so this page cannot fight an app-level
 * one, and raises the limit to four so every variant can be seen at once. The
 * shipped default is one at a time, bottom-right, as the system specifies.
 */
const galleryToasts = createToastManager();

const TOASTS: { variant: ToastVariant; title: string; description: string }[] = [
  {
    variant: "default",
    title: "Initiative rolled",
    description: "Eight combatants, ordered highest first.",
  },
  {
    variant: "destructive",
    title: "Goblin scout downed",
    description: "Removed from initiative.",
  },
  {
    variant: "success",
    title: "Brannoc made the save",
    description: "No damage, concentration holds.",
  },
  {
    variant: "magic",
    title: "Hex is concentrating",
    description: "Ends if the hag takes damage.",
  },
];

export function Feedback() {
  const [open, setOpen] = useState(false);

  return (
    <Section id="feedback" title="Feedback" blurb={BLURBS.feedback}>
      <Specimen label="Dialog" note={NOTES.dialog}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="destructive">End session</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>End the session?</DialogTitle>
              <DialogDescription>
                Initiative and hit points are saved to Session 12.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" size="sm" />}>
                Keep playing
              </DialogClose>
              <Button variant="destructive" size="sm" onClick={() => setOpen(false)}>
                End session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger render={<Button variant="secondary">Open a plain dialog</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a creature</DialogTitle>
              <DialogDescription>
                It joins the bestiary for this campaign only. You can promote it later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" size="sm" />}>Cancel</DialogClose>
              <DialogClose render={<Button size="sm" />}>Add it</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen label="Toast — variants" note={NOTES.toast}>
        {TOASTS.map((entry) => (
          <Button
            key={entry.variant}
            variant="secondary"
            size="sm"
            onClick={() =>
              galleryToasts.add({
                title: entry.title,
                description: entry.description,
                type: entry.variant,
              })
            }
          >
            Show {entry.variant}
          </Button>
        ))}
        <Button
          size="sm"
          onClick={() =>
            TOASTS.forEach((entry) => galleryToasts.add({ ...entry, type: entry.variant }))
          }
        >
          Show all four
        </Button>
      </Specimen>

      <Specimen label="Tooltip" note={NOTES.tooltip}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" aria-label="Next turn">
                  <Icon name="chevron-right" size={18} />
                </Button>
              }
            />
            <TooltipContent shortcut="SPACE">Next turn</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon" variant="secondary" aria-label="Roll a d20">
                  <Icon name="dices" size={18} />
                </Button>
              }
            />
            <TooltipContent shortcut="R">Roll a d20</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost">No shortcut</Button>} />
            <TooltipContent side="bottom">Hidden from players until you reveal it</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Specimen>

      <Toaster toastManager={galleryToasts} limit={4} />
    </Section>
  );
}
