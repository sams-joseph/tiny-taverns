import { RegistryProvider } from "@effect/atom-react";
import { render, screen } from "@testing-library/react";
import { Cause, Option, Schema } from "effect";
import { HttpClientError, HttpClientRequest } from "effect/unstable/http";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { describe, expect, it } from "vitest";
import { useApiAtom } from "./atoms";
import { failureFromCause } from "./failure";

/**
 * The adapter between an atom and the three states a screen renders.
 *
 * **The symptom this port exists to fix cannot be tested here, and that is
 * worth saying rather than papering over.** The blank re-render is a *frame*,
 * and jsdom renders no frames: measured with a `MutationObserver` over the
 * ported dialog, a write's whole request/response cycle completes in
 * microtasks before React's scheduler yields, so even the retiring hook — which
 * genuinely does throw the value away — produces exactly one DOM mutation and
 * never disconnects a row. A test asserting "the list stayed on screen" passes
 * on both idioms and pins nothing. Same blind spot as the motion and layering
 * scales; it is measured in a real browser instead.
 *
 * So what is pinned here is the *mechanism* underneath it: that a re-reading
 * atom maps to `ready` and not to `loading`, and that the failure taxonomy
 * reads a `Cause` correctly at both of its two doors.
 */

const registry = (ui: React.ReactNode) => render(<RegistryProvider>{ui}</RegistryProvider>);

function Probe({ atom }: { readonly atom: Atom.Atom<AsyncResult.AsyncResult<string, never>> }) {
  const [resource] = useApiAtom(atom);
  return (
    <span data-testid="state">
      {resource.state === "ready"
        ? `ready:${resource.value}:${resource.refreshing ? "refreshing" : "settled"}`
        : resource.state}
    </span>
  );
}

const stateOf = () => screen.getByTestId("state").textContent;

describe("an atom as a screen's three states", () => {
  it("keeps the value it has while it re-reads, rather than blanking", () => {
    // The whole point of the port, at the level jsdom can actually see it:
    // `AsyncResult` is stale-while-revalidate, so a refresh is a `Success` that
    // is `waiting` — never an `Initial`. The retiring hook has no such state.
    const refreshing = AsyncResult.success<string>("Ilse", { waiting: true });
    registry(<Probe atom={Atom.make(refreshing)} />);

    expect(stateOf()).toBe("ready:Ilse:refreshing");
  });

  it("is loading before anything has been read", () => {
    registry(<Probe atom={Atom.make(AsyncResult.initial<string>(true))} />);
    expect(stateOf()).toBe("loading");
  });

  it("is failed when the read failed", () => {
    const failed = AsyncResult.fail<string, string>("nope");
    registry(<Probe atom={Atom.make(failed as AsyncResult.AsyncResult<string, never>)} />);
    expect(stateOf()).toBe("failed");
  });

  /**
   * An interrupted read is not a failure, and the difference is a sentence a DM
   * reads. A refresh landing while one is in flight interrupts it, and
   * `Cause.squash` of an interrupt-only cause is the string *"All fibers
   * interrupted without error"* — which `classifyFailure` would name `unknown`
   * and `ui/states.tsx` would render as *"That did not work"*, under the heading
   * of a screen that is perfectly fine.
   */
  it("reads an interrupted refresh as still loading, not as a failure", () => {
    const interrupted = AsyncResult.failure<string, never>(Cause.interrupt(1));
    registry(<Probe atom={Atom.make(interrupted)} />);
    expect(stateOf()).toBe("loading");
  });

  it("keeps the value it had when the interrupted read had one", () => {
    // What a refresh over an existing value actually produces: a failure
    // carrying the last good success forward.
    const withPrevious = AsyncResult.failureWithPrevious<string, never>(Cause.interrupt(1), {
      previous: Option.some(AsyncResult.success<string>("Ilse")),
    });
    registry(<Probe atom={Atom.make(withPrevious)} />);
    expect(stateOf()).toBe("ready:Ilse:refreshing");
  });
});

/**
 * The rule every ported call site has to follow, and the reason it is safe to
 * state it as "key it on what the read closes over".
 *
 * An atom is identified by object identity, so `Atom.family` is what keeps a
 * component from building a fresh one on every render — which is an infinite
 * loop, not a wasted request. Whether a *record* key works at all rests on
 * Effect's `Equal`/`Hash` being structural for a plain object; it is, in v4,
 * and this is the pin, because the failure mode if a bump changed it is a
 * hanging screen rather than a type error.
 */
describe("Atom.family, as the port keys its reads", () => {
  it("gives one atom per key, for a record as well as for a string", () => {
    let built = 0;
    const family = Atom.family((key: { readonly campaignId: string; readonly q: string }) => {
      built += 1;
      return Atom.make(`${key.campaignId}/${key.q}`);
    });

    expect(family({ campaignId: "c1", q: "gob" })).toBe(family({ campaignId: "c1", q: "gob" }));
    expect(built).toBe(1);

    // A different key really is a different read.
    expect(family({ campaignId: "c1", q: "orc" })).not.toBe(family({ campaignId: "c1", q: "gob" }));
    expect(built).toBe(2);
  });
});

/**
 * `failureFromCause` is the whole of what the taxonomy needed to survive the
 * port, and its one non-obvious half is the defects.
 *
 * `AtomHttpApi` deliberately `Effect.die`s a `SchemaError` and an
 * `HttpClientError` so that only an endpoint's *declared* errors stay in the
 * atom's `E`. So the two failures a DM is most likely to see — a payload the
 * contract rejected before it left the browser, and a server that never
 * answered — arrive as **defects, not failures**. A classifier reading only the
 * typed failures would render both as "That did not work" with a stack frame
 * in it.
 */
describe("the failure taxonomy, over a Cause", () => {
  it("names a declared error, which arrives as a typed failure", () => {
    expect(failureFromCause(Cause.fail({ _tag: "Unauthorized" }))).toEqual({
      kind: "unauthorized",
    });
    expect(failureFromCause(Cause.fail({ _tag: "NotFound", resource: "campaign" }))).toEqual({
      kind: "missing",
      resource: "campaign",
    });
  });

  it("names a server that never answered, which arrives as a defect", () => {
    // The real shape: `HttpClientError` wraps a reason, and it is the reason's
    // own `_tag` that says the server never answered rather than said no.
    const transport = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: HttpClientRequest.get("/campaigns"),
        cause: new TypeError("Failed to fetch"),
      }),
    });
    expect(failureFromCause(Cause.die(transport))).toEqual({ kind: "unreachable" });
  });

  it("names a payload the contract rejected, which also arrives as a defect", () => {
    const issue = Schema.decodeUnknownExit(Schema.Struct({ name: Schema.String }))({ name: 1 });
    const error = issue._tag === "Failure" ? Cause.squash(issue.cause) : undefined;
    const failure = failureFromCause(Cause.die(error));
    expect(failure.kind).toBe("invalid");
  });

  it("does not lose an interrupt-only cause to the unknown arm", () => {
    // Not routed through here by `useApiAtom` — this is the reason it is not.
    expect(failureFromCause(Cause.interrupt(1)).kind).toBe("unknown");
  });
});
