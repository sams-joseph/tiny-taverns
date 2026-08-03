import { Context, Effect, Layer } from "effect";

/** Payload returned by the health check. */
export interface HealthStatus {
  readonly status: "ok";
  readonly uptime: number;
}

/**
 * Service that reports the liveness of the server. Modeled as an Effect service
 * so routes depend on the capability, not a concrete implementation.
 *
 * `Context.Service` is v4's single way to declare a service (it replaces v3's
 * `Context.Tag` / `Context.GenericTag` / `Effect.Tag` / `Effect.Service`). The
 * class itself is the context key, so `yield* Health` still yields the shape.
 */
export class Health extends Context.Service<
  Health,
  {
    readonly check: Effect.Effect<HealthStatus>;
  }
>()("Health") {
  /**
   * Live implementation backed by the process uptime. v4 names the primary
   * layer of a service `layer` rather than v3's `Live`/`Default` suffix.
   */
  static readonly layer = Layer.succeed(this, {
    check: Effect.sync((): HealthStatus => ({ status: "ok", uptime: process.uptime() })),
  });
}
