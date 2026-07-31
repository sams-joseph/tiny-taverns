import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { Health, HealthLive } from "../src/Health";
import { healthHandler } from "../src/router";

describe("Health service", () => {
  it("reports an ok status with non-negative uptime", async () => {
    const status = await Effect.runPromise(
      Health.pipe(
        Effect.flatMap((health) => health.check),
        Effect.provide(HealthLive),
      ),
    );

    expect(status.status).toBe("ok");
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /health handler", () => {
  it("produces a 200 JSON response", async () => {
    const response = await Effect.runPromise(healthHandler.pipe(Effect.provide(HealthLive)));

    expect(response.status).toBe(200);
  });
});
