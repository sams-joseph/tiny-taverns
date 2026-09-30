import { createRootRoute } from "@tanstack/react-router";
import { SignedOutGate } from "../marketing/SignedOutGate";

/**
 * The root, which renders the gate rather than a bare `<Outlet />`.
 *
 * **The marketing homepage is the signed-out view of the app**, so "is there a
 * credential?" is asked once, above every match, instead of by each screen. It
 * has to be *inside* the router rather than around it, because two routes are
 * exempt and one of those exemptions is a security property — see
 * `marketing/SignedOutGate.tsx`, which is where the whole of it is written
 * down, including why `/join/<token>` may never be swallowed by it.
 */
export const Route = createRootRoute({
  component: SignedOutGate,
});
