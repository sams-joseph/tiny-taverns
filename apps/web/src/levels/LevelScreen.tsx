import { Link, useParams } from "@tanstack/react-router";
import { BackLink, Loading, SectionHeading } from "@taverns/ui";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { LibraryNav } from "../library/LibraryNav";
import { TopBar } from "../shell/TopBar";
import { libraryLevelAtom } from "./load";
import { partsLine, sizeLine } from "./size";

/**
 * One of the owner's levels: its name, what it is, its size and how much is
 * built on it. An ordinary page under the Library's header for now; the
 * full-screen editor takes this path over, so nothing here edits.
 */
export function LevelScreen() {
  const { levelId } = useParams({ from: "/_shell/library/levels/$levelId" });
  const [resource, reload] = useApiAtom(libraryLevelAtom(levelId));
  const level = resource.state === "ready" ? resource.value : undefined;

  return (
    <>
      <TopBar
        title="Library"
        {...(level !== undefined && { subtitle: level.name })}
        tabs={<LibraryNav />}
      >
        <BackLink render={<Link to="/library/levels" />}>Levels</BackLink>
      </TopBar>
      <div className="@container mx-auto w-full max-w-overview">
        {resource.state === "loading" && <Loading label="Reading the level…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}
        {level !== undefined && (
          <article aria-label={level.name} className="flex max-w-3xl flex-col gap-3">
            <SectionHeading as="h2">{level.name}</SectionHeading>
            {level.description !== null && (
              <p className="text-body leading-body text-foreground">{level.description}</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-s leading-body">
              <dt className="text-muted-foreground">Size</dt>
              <dd>{sizeLine(level)}</dd>
              <dt className="text-muted-foreground">On it</dt>
              <dd>
                {partsLine({
                  walls: level.walls.length,
                  props: level.props.length,
                  lights: level.lights.length,
                  regions: level.regions.length,
                })}
              </dd>
            </dl>
          </article>
        )}
      </div>
    </>
  );
}
