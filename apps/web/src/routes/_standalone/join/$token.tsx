import { createFileRoute } from "@tanstack/react-router";
import { tokenParam } from "../../-params";
import { JoinScreen } from "../../../join/JoinScreen";

/**
 * Following an invitation, before there is anybody to follow it as.
 *
 * The token is a path segment, and so reaches access logs — accepted, see
 * `router.ts`. The page reads it here and puts it in a `POST` body.
 *
 * It names no campaign, because the holder does not know which one it is yet —
 * that is what the page is for. Remounted on the token: a second invitation
 * opened in the same tab is a different invitation, and neither its preview nor
 * the "you are in" panel from the first should survive into it.
 */
export const Route = createFileRoute("/_standalone/join/$token")({
  params: tokenParam,
  component: JoinScreen,
  remountDeps: ({ params }) => params.token,
});
