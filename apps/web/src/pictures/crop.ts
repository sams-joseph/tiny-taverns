import type { ImageCrop } from "@taverns/api";

/**
 * The cropper's arithmetic, kept apart from the pointer so it can be tested
 * where there is no layout.
 *
 * A view is a zoom and the point of the picture at the frame's centre, both in
 * fractions of the upright picture. At zoom 1 the frame holds the largest
 * rectangle of the kind's aspect the picture has, exactly what a drawn
 * picture's cover crop would keep; zooming narrows it. Every function answers
 * a view clamped so the crop never leaves the picture, and the crop the server
 * is sent is computed from that view alone (`ImageCrop`: fractions of the
 * upright picture, which is what `renderUpload` cuts).
 */

export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

export interface CropView {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** How far in a crop may go: a quarter of the widest crop's width. */
export const MAX_ZOOM = 4;

export const CENTRED: CropView = { zoom: 1, centerX: 0.5, centerY: 0.5 };

/** The crop's width and height at `zoom`, as fractions of the picture. */
const spanOf = (picture: PictureSize, aspect: number, zoom: number) => {
  const pictureAspect = picture.width / picture.height;
  const widest =
    pictureAspect > aspect
      ? { width: aspect / pictureAspect, height: 1 }
      : { width: 1, height: pictureAspect / aspect };
  return { width: widest.width / zoom, height: widest.height / zoom };
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** `view`, with its zoom in range and its centre moved so the crop stays inside. */
export const clampView = (picture: PictureSize, aspect: number, view: CropView): CropView => {
  const zoom = clamp(view.zoom, 1, MAX_ZOOM);
  const span = spanOf(picture, aspect, zoom);
  return {
    zoom,
    centerX: clamp(view.centerX, span.width / 2, 1 - span.width / 2),
    centerY: clamp(view.centerY, span.height / 2, 1 - span.height / 2),
  };
};

/** The crop a view shows. */
export const cropOf = (picture: PictureSize, aspect: number, view: CropView): ImageCrop => {
  const clamped = clampView(picture, aspect, view);
  const span = spanOf(picture, aspect, clamped.zoom);
  return {
    x: clamped.centerX - span.width / 2,
    y: clamped.centerY - span.height / 2,
    width: span.width,
    height: span.height,
  };
};

/**
 * Drag the picture by a fraction of the frame's width and height: dragging
 * right moves the picture right, which shows more of its left.
 */
export const panBy = (
  picture: PictureSize,
  aspect: number,
  view: CropView,
  frameDx: number,
  frameDy: number,
): CropView => {
  const span = spanOf(picture, aspect, clampView(picture, aspect, view).zoom);
  return clampView(picture, aspect, {
    ...view,
    centerX: view.centerX - frameDx * span.width,
    centerY: view.centerY - frameDy * span.height,
  });
};

/** Zoom about the frame's centre. */
export const zoomTo = (picture: PictureSize, aspect: number, view: CropView, zoom: number) =>
  clampView(picture, aspect, { ...view, zoom });

/**
 * Where the picture sits in a frame showing `crop`, in percentages of the
 * frame, so the browser lays it out at any size with nothing measured.
 */
export const placementOf = (crop: ImageCrop) => ({
  width: `${100 / crop.width}%`,
  height: `${100 / crop.height}%`,
  left: `${(-crop.x / crop.width) * 100}%`,
  top: `${(-crop.y / crop.height) * 100}%`,
});
