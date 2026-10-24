import { afterEach, describe, expect, it, vi } from "vitest";
import type { LevelRenderer } from "../level/renderer";
import { claimRenderer, claimView, drop, parkRenderer, parkView, stageKey } from "./stageHandoff";

/**
 * The stage handed between screens over one dungeon (`stageHandoff.ts`): what
 * is parked under a key is taken up under the same key and nowhere else, at
 * most once, and what nobody takes up is disposed rather than leaked.
 */

const aRenderer = () => {
  const renderer = { park: vi.fn(), dispose: vi.fn() };
  return { renderer, as: renderer as unknown as LevelRenderer };
};

const hall = stageKey.visit("hall");
const plane = { width: 640, height: 480 };
const view = { x: 12, y: -30, zoom: 1.5 };

afterEach(() => {
  drop();
  vi.useRealTimers();
});

describe("handing the stage over", () => {
  it("hands a parked renderer, stopped, to the next stage over the same dungeon, once", () => {
    const { renderer, as } = aRenderer();
    parkRenderer(hall, as);
    expect(renderer.park).toHaveBeenCalledTimes(1);
    expect(claimRenderer(stageKey.visit("cellar"))).toBeUndefined();
    expect(claimRenderer(hall)).toBe(as);
    expect(claimRenderer(hall)).toBeUndefined();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("disposes what another dungeon's stage parks over, and what nobody takes up in time", () => {
    vi.useFakeTimers();
    const first = aRenderer();
    parkRenderer(hall, first.as);
    const second = aRenderer();
    parkRenderer(stageKey.visit("cellar"), second.as);
    expect(first.renderer.dispose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(second.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(claimRenderer(stageKey.visit("cellar"))).toBeUndefined();
  });

  it("opens the next canvas where the camera was, only over a plane of the same size", () => {
    parkView(hall, plane, view);
    expect(claimView(hall, { width: 320, height: 480 })).toBeUndefined();
    expect(claimView(hall, plane)).toEqual(view);
    expect(claimView(hall, plane)).toBeUndefined();
  });

  it("keeps the renderer and the view of one dungeon together in the slot", () => {
    const { renderer, as } = aRenderer();
    parkView(hall, plane, view);
    parkRenderer(hall, as);
    expect(claimView(hall, plane)).toEqual(view);
    expect(claimRenderer(hall)).toBe(as);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });
});
