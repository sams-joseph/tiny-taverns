import { Link, useParams } from "@tanstack/react-router";
import { BackLink, Loading } from "@taverns/ui";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { LibraryNav } from "../library/LibraryNav";
import { TopBar } from "../shell/TopBar";
import { libraryNpcAtom } from "./libraryLoad";
import { librarySheetTarget } from "./npcSheet";
import { NpcSheetPanel } from "./NpcSheetPanel";

/**
 * One Library NPC original's stats: the Cast's *Stats* tab over the owner's
 * endpoints (`librarySheetTarget`), so an original and a campaign NPC draw and
 * write one sheet the same way.
 *
 * **A page, not a dialog**, because the original's persona is edited in the
 * shelf's own dialog and the sheet's editors are dialogs too: opened from
 * inside it, they would be a modal over a modal. The shelf's cards open here.
 *
 * **Centred at the Overview's width**, as the NPC page's *Stats* tab is, under
 * the Library's header and its shelves, with the NPCs shelf lit.
 *
 * What is written here stays on the original: a copy into a campaign took the
 * sheet as it stood, and a later edit here does not move it.
 */
export function LibraryNpcScreen() {
  const { npcId } = useParams({ from: "/_shell/library/npcs/$npcId" });
  const [resource, reload] = useApiAtom(libraryNpcAtom(npcId));
  const source = resource.state === "ready" ? resource.value.source : undefined;

  return (
    <>
      <TopBar
        title="Library"
        {...(source !== undefined && {
          subtitle: source.role === "" ? source.name : `${source.name} · ${source.role}`,
        })}
        tabs={<LibraryNav />}
      >
        <BackLink render={<Link to="/library/npcs" />}>NPC sources</BackLink>
      </TopBar>
      <div className="@container mx-auto w-full max-w-overview">
        {resource.state === "loading" && <Loading label="Reading the NPC source…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}
        {resource.state === "ready" && (
          <NpcSheetPanel
            name={resource.value.source.name}
            sheet={resource.value.sheet}
            target={librarySheetTarget(npcId)}
          />
        )}
      </div>
    </>
  );
}
