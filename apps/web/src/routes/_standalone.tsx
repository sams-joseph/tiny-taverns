import { createFileRoute } from "@tanstack/react-router";
import { StandaloneLayout } from "../shell/ShellLayout";

/**
 * The route outside it, in the same shell without the Hob panel. See
 * `StandaloneLayout` for why it is outside; the signed-out gate's exemption of
 * it is the join route's own `staticData` and does not care which layout it is
 * in.
 */
export const Route = createFileRoute("/_standalone")({
  component: StandaloneLayout,
});
