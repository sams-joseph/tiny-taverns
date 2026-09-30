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
 *
 * **It renders signed out, and that is a security property.** It is the first
 * screen a stranger sees of this product: it previews an invitation before
 * there is anybody to accept it as. The signed-out gate (`routes/__root.tsx`)
 * would swallow it silently, since the homepage renders perfectly well over an
 * invitation, so the route exempts itself.
 */
export const Route = createFileRoute("/_standalone/join/$token")({
  params: tokenParam,
  staticData: { rendersSignedOut: true },
  component: JoinScreen,
  remountDeps: ({ params }) => params.token,
});
