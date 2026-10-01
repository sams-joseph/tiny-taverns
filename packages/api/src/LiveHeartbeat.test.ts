import { Effect, Stream } from "effect";
import { Sse } from "effect/encoding";
import { describe, expect, it } from "vitest";
import { PlayerLiveEvent } from "./PlayerLive.js";
import { LiveEvent } from "./SessionEvent.js";

/**
 * Both live streams' heartbeats, through the decoder the derived client builds
 * for `HttpApiSchema.StreamSse` (`Sse.decodeSchema`), from the bytes the server
 * writes: an event name and data, and deliberately no `id` line. The decoder
 * omits an absent `id` rather than reading it as `undefined`, so a schema that
 * requires the key refuses every heartbeat and the stream fails.
 */
const frames = (frame: string) => Stream.make(frame);

const live = (frame: string) =>
  Effect.runPromise(
    frames(frame).pipe(Stream.pipeThroughChannel(Sse.decodeSchema(LiveEvent)), Stream.runCollect),
  );

const player = (frame: string) =>
  Effect.runPromise(
    frames(frame).pipe(
      Stream.pipeThroughChannel(Sse.decodeSchema(PlayerLiveEvent)),
      Stream.runCollect,
    ),
  );

describe("a heartbeat on the wire", () => {
  it("reads on the creator's live stream, with no id", async () => {
    const [beat] = await live(
      `event: heartbeat\ndata: ${JSON.stringify({ _tag: "Heartbeat", seq: 7 })}\n\n`,
    );
    expect(beat?.event).toBe("heartbeat");
    expect(beat !== undefined && "id" in beat).toBe(false);
  });

  it("reads on the player's live stream, with no id", async () => {
    const [beat] = await player(
      `event: heartbeat\ndata: ${JSON.stringify({ _tag: "Heartbeat", seq: 7 })}\n\n`,
    );
    expect(beat?.event).toBe("heartbeat");
    expect(beat !== undefined && "id" in beat).toBe(false);
  });

  it("still carries the id of an event that has one", async () => {
    const [tick] = await player(
      `id: 12\nevent: tick\ndata: ${JSON.stringify({ tick: "session" })}\n\n`,
    );
    expect(tick).toEqual({ id: "12", event: "tick", data: { tick: "session" } });
  });
});
