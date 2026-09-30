import { createFileRoute } from "@tanstack/react-router";
import { LibraryScreen } from "../../../bestiary/LibraryScreen";

/**
 * The Library: where a monster is authored, and **the first route outside
 * `/characters` that names no campaign.**
 *
 * That is the model's shape rather than a routing preference. Since
 * `0015_library_creatures.ts` a creature can belong to an **account** and sit in
 * no campaign, and `libraryRowReadable` composes no campaign gate at all —
 * uniquely in this product — because there is no membership to check on a row no
 * campaign contains. So there is nothing for this URL to carry, and an account
 * at no table gets its Library rather than a 404: authoring is not an act inside
 * a campaign, so it cannot require one.
 *
 * No `remountDeps`: there is no id for a different one of to exist. What the
 * screen accumulates — the chip vocabulary, and whether the list is empty at all
 * — is about this account, which does not change under it.
 */
export const Route = createFileRoute("/_shell/library/")({
  component: LibraryScreen,
});
