/**
 * jsdom (25.x) ships no `PointerEvent`. Base UI's Checkbox, Switch and Toggle
 * construct one on click to distinguish pointer input from keyboard activation, so
 * without this every interaction test throws
 * `ownerWindow(...).PointerEvent is not a constructor` and the change handler never
 * runs. This is a gap in the test environment, not in the components — the same
 * code works in a real browser.
 *
 * A `MouseEvent` subclass is enough: Base UI only reads `pointerType`.
 */
class JsdomPointerEvent extends MouseEvent implements PointerEvent {
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly altitudeAngle: number;
  readonly azimuthAngle: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
    this.width = params.width ?? 1;
    this.height = params.height ?? 1;
    this.pressure = params.pressure ?? 0;
    this.tangentialPressure = params.tangentialPressure ?? 0;
    this.tiltX = params.tiltX ?? 0;
    this.tiltY = params.tiltY ?? 0;
    this.twist = params.twist ?? 0;
    this.altitudeAngle = params.altitudeAngle ?? 0;
    this.azimuthAngle = params.azimuthAngle ?? 0;
    this.pointerType = params.pointerType ?? "mouse";
    this.isPrimary = params.isPrimary ?? true;
  }

  getCoalescedEvents(): PointerEvent[] {
    return [];
  }

  getPredictedEvents(): PointerEvent[] {
    return [];
  }
}

if (typeof globalThis.PointerEvent === "undefined") {
  globalThis.PointerEvent = JsdomPointerEvent as unknown as typeof PointerEvent;
  if (typeof window !== "undefined") {
    window.PointerEvent = globalThis.PointerEvent;
  }
}

if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
