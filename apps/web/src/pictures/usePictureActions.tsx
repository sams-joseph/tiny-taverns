import { Button, Icon } from "@taverns/ui";
import { useState, type ReactNode } from "react";
import type { ActionsMenuItem } from "../ui/ActionsMenu";
import {
  type PictureActionsInput,
  PictureUploadDialog,
  RemovePictureDialog,
} from "./PictureDialogs";

/**
 * Upload, replace and remove a subject's own picture, for its owner.
 *
 * The one way a screen offers them: menu items for a screen whose commands sit
 * in an `ActionsMenu`, buttons for one whose commands are buttons, and the
 * dialogs either opens, so every screen asks the same questions and writes
 * through the same two calls. The screen says what the write changes
 * (`invalidates`), because only the screen knows which of its reads carry the
 * picture.
 */
export function usePictureActions(input: PictureActionsInput): {
  readonly items: ReadonlyArray<ActionsMenuItem>;
  readonly buttons: ReactNode;
  readonly dialogs: ReactNode;
} {
  const [open, setOpen] = useState<"upload" | "remove">();
  const uploadLabel = `${input.hasPicture ? "Replace" : "Upload"} ${input.noun}`;
  const removeLabel = `Remove ${input.noun}`;

  const items: Array<ActionsMenuItem> = [
    { label: uploadLabel, icon: "image-plus", onSelect: () => setOpen("upload") },
  ];
  if (input.hasPicture) {
    items.push({
      label: removeLabel,
      icon: "trash-2",
      onSelect: () => setOpen("remove"),
      destructive: true,
    });
  }

  const buttons = (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen("upload")}>
        <Icon name="image-plus" size={14} />
        {uploadLabel}
      </Button>
      {input.hasPicture && (
        <Button variant="ghost" size="sm" onClick={() => setOpen("remove")}>
          <Icon name="trash-2" size={14} />
          {removeLabel}
        </Button>
      )}
    </>
  );

  const close = () => setOpen(undefined);
  const dialogs =
    open === "upload" ? (
      <PictureUploadDialog {...input} title={uploadLabel} onClose={close} />
    ) : open === "remove" ? (
      <RemovePictureDialog {...input} title={removeLabel} onClose={close} />
    ) : null;

  return { items, buttons, dialogs };
}
