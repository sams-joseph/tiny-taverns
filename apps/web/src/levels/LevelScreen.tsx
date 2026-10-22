import { Link, useParams } from "@tanstack/react-router";
import { LevelSave } from "@taverns/api";
import { BackLink, Loading } from "@taverns/ui";
import { Result, Schema } from "effect";
import { useCallback } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { type LevelDocument, LevelEditor, LevelSaveConflict } from "../level";
import { useFullscreen } from "../shell/slots";
import { libraryLevelAtom } from "./load";

const toSave = Schema.decodeUnknownSync(LevelSave);

/**
 * One of the owner's levels, open in the full-screen editor. The screen holds
 * the whole window (`useFullscreen`), so the shell draws no nav and the editor's
 * own bar carries the way back to the shelf.
 *
 * The editor saves the whole document with the `version` it was read at; a
 * stale one is a `Conflict`, which the editor shows as saved elsewhere, with
 * two ways out: load the saved level in place of its copy, or keep its copy
 * and save it over the saved one at the version it reads now. A save changes
 * the level and its card on the shelf.
 */
export function LevelScreen() {
  const { levelId } = useParams({ from: "/_shell/library/levels/$levelId" });
  const [resource, reload] = useApiAtom(libraryLevelAtom(levelId));
  const { busy, submit } = useMutation();
  const reading = useMutation();
  useFullscreen(resource.state === "ready");

  const save = useCallback(
    async (next: LevelDocument) => {
      // Decoding checks the document against the wire before it leaves, and
      // brands its ids; a document that fails is refused here as it would be there.
      const payload = toSave({
        name: next.name,
        description: next.description,
        columns: next.columns,
        rows: next.rows,
        feetPerCell: next.feetPerCell,
        ambient: next.ambient,
        floor: next.floor,
        walls: next.walls,
        props: next.props,
        lights: next.lights,
        regions: next.regions,
        version: next.version,
      });
      const done = await submit(
        (client) => client.libraryLevels.save({ params: { levelId }, payload }),
        [reads.libraryLevel(levelId), reads.libraryLevels],
      );
      if (Result.isFailure(done)) {
        // Saved elsewhere since it was read: the editor offers its two ways out.
        if (done.failure.kind === "conflict") throw new LevelSaveConflict(done.failure.message);
        throw new Error("The level was not saved.");
      }
      return { version: done.success.version };
    },
    [levelId, submit],
  );

  // The level as the server holds it now, for the editor's way out of a
  // conflict. A read: it changes nothing anybody else reads.
  const readLevel = reading.submit;
  const load = useCallback(async (): Promise<LevelDocument> => {
    const done = await readLevel(
      (client) => client.libraryLevels.findById({ params: { levelId } }),
      [],
    );
    if (Result.isFailure(done)) throw new Error("The saved level could not be read.");
    return done.success;
  }, [levelId, readLevel]);

  if (resource.state !== "ready") {
    return (
      <div className="@container mx-auto w-full max-w-overview">
        <BackLink render={<Link to="/library/levels" />}>Levels</BackLink>
        {resource.state === "loading" && <Loading label="Reading the level…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}
      </div>
    );
  }

  return (
    <LevelEditor
      key={resource.value.id}
      level={resource.value}
      onSave={save}
      onLoad={load}
      saving={busy}
      back={<BackLink render={<Link to="/library/levels" />}>Levels</BackLink>}
    />
  );
}
