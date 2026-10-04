import {
  IMAGE_ASPECT,
  IMAGE_KINDS_OF_SUBJECT,
  IMAGE_UPLOAD_TYPES,
  type ImageKindName,
  type ImageSubject,
  type ImageUploadApply,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@taverns/ui";
import { Result } from "effect";
import { useEffect, useRef, useState } from "react";
import type { Invalidation } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { CENTRED, type CropView, cropOf } from "./crop";
import { Cropper } from "./Cropper";
import { type PreparedPicture, preparePicture } from "./prepare";
import { removePictures, uploadPicture } from "./upload";

/**
 * The two dialogs behind a subject's picture actions (`usePictureActions`):
 * choosing and framing a file, and confirming a remove.
 */

/** What each kind's crop is called in the dialog. */
const KIND_LABEL: { readonly [K in ImageKindName]: string } = {
  character: "Portrait",
  characterBanner: "Banner",
  npc: "Portrait",
  npcBanner: "Banner",
  campaign: "Cover",
  sharedWorld: "Cover",
  battleMap: "Map",
};

/** What one file fills, said once at the top of the dialog. */
const FILLS: { readonly [S in ImageSubject]: string } = {
  character:
    "One picture fills both the square portrait and the wide banner on the party's cards. Frame each below.",
  npc: "One picture fills both the square portrait and the wide banner on the cast's cards. Frame each below.",
  campaign: "The cover heads the campaign's card and its overview. Frame it below.",
  sharedWorld: "The cover heads the Shared World's card and its page. Frame it below.",
  battleMap:
    "The whole picture goes under the grid, uncropped, and the grid is set across its width again.",
};

export interface PictureActionsInput {
  readonly subject: ImageSubject;
  readonly subjectId: string;
  /** Whether there is a picture to replace or remove now. */
  readonly hasPicture: boolean;
  /** The word for it on this screen: "picture", "cover", "portrait", "map". */
  readonly noun: string;
  /** Every read the picture is a field of. */
  readonly invalidates: Invalidation;
}

export function PictureUploadDialog({
  subject,
  subjectId,
  invalidates,
  title,
  onClose,
}: PictureActionsInput & { readonly title: string; readonly onClose: () => void }) {
  const kinds = IMAGE_KINDS_OF_SUBJECT[subject];
  const { busy, failure, submit } = useMutation();
  const chooser = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const [picture, setPicture] = useState<PreparedPicture>();
  const [views, setViews] = useState<Partial<Record<ImageKindName, CropView>>>({});

  // A preview URL holds the file in memory until it is revoked.
  useEffect(() => {
    if (picture === undefined) return;
    return () => URL.revokeObjectURL(picture.previewUrl);
  }, [picture]);

  const choose = async (file: File | undefined) => {
    if (file === undefined) return;
    setPreparing(true);
    setRefusal(undefined);
    const prepared = await preparePicture(file);
    setPreparing(false);
    if (typeof prepared === "string") {
      setRefusal(prepared);
      return;
    }
    setPicture(prepared);
    setViews({});
  };

  const save = async () => {
    if (picture === undefined) return;
    const [first, ...rest] = kinds.map((kind) => {
      const aspect = IMAGE_ASPECT[kind];
      return aspect === null
        ? { kind }
        : { kind, crop: cropOf(picture.size, aspect, views[kind] ?? CENTRED) };
    });
    if (first === undefined) return;
    const images: ImageUploadApply["images"] = [first, ...rest];
    const done = await submit(uploadPicture({ subject, subjectId, picture, images }), invalidates);
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{FILLS[subject]}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-gutter py-3">
          <input
            ref={chooser}
            type="file"
            accept={IMAGE_UPLOAD_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void choose(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          {picture !== undefined &&
            kinds.map((kind) => {
              const aspect = IMAGE_ASPECT[kind];
              return aspect === null ? (
                <img
                  key={kind}
                  src={picture.previewUrl}
                  alt=""
                  className="w-full rounded-control border border-hairline"
                />
              ) : (
                <Cropper
                  key={kind}
                  label={KIND_LABEL[kind]}
                  src={picture.previewUrl}
                  picture={picture.size}
                  aspect={aspect}
                  view={views[kind] ?? CENTRED}
                  onChange={(view) => setViews((current) => ({ ...current, [kind]: view }))}
                />
              );
            })}
          <div className="flex items-center gap-3">
            <Button
              variant={picture === undefined ? "default" : "secondary"}
              size="sm"
              disabled={busy || preparing}
              onClick={() => chooser.current?.click()}
            >
              <Icon name="image-plus" size={14} />
              {preparing
                ? "Opening…"
                : picture === undefined
                  ? "Choose a picture"
                  : "Choose another"}
            </Button>
            <span className="text-caption text-muted-foreground">PNG, JPEG or WebP</span>
          </div>
          {refusal !== undefined && (
            <p role="alert" className="text-body-s leading-body text-danger">
              {refusal}
            </p>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || picture === undefined} onClick={() => void save()}>
            {busy ? "Uploading…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemovePictureDialog({
  subject,
  subjectId,
  invalidates,
  noun,
  title,
  onClose,
}: PictureActionsInput & { readonly title: string; readonly onClose: () => void }) {
  const { busy, failure, submit } = useMutation();
  const remove = async () => {
    const done = await submit(removePictures({ subject, subjectId }), invalidates);
    if (Result.isSuccess(done)) onClose();
  };
  const both = IMAGE_KINDS_OF_SUBJECT[subject].length > 1;

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}?</DialogTitle>
          <DialogDescription>
            {both ? "The portrait and the banner go" : `The ${noun} goes`}, whether you uploaded it
            or Hob drew it. Hob will not draw another; you can upload one later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
