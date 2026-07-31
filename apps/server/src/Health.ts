import { Context, Effect, Layer } from "effect";

/** Payload returned by the health check. */
export interface HealthStatus {
  readonly status: "ok";
  readonly uptime: number;
}

/**
 * Service that reports the liveness of the server. Modeled as an Effect service
 * so routes depend on the capability, not a concrete implementation.
 */
export class Health extends Context.Tag("Health")<
  Health,
  {
    readonly check: Effect.Effect<HealthStatus>;
  }
>() {}

/** Live implementation backed by the process uptime. */
export const HealthLive = Layer.succeed(
  Health,
  Health.of({
    check: Effect.sync(() => ({ status: "ok", uptime: process.uptime() })),
  }),
);
