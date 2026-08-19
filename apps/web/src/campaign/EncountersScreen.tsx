import type { Encounter } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Button, Icon, Input } from "@taverns/ui";
import { useState } from "react";
import { EmptyState } from "../ui/states";
import { CampaignChrome } from "./CampaignChrome";
import { EncounterCard } from "./EncounterCard";
import { EncounterDialog } from "./EncounterDialog";
import { matches } from "./load";

/**
 * Every encounter built for this table — `CampaignScreens.jsx`'s
 * `CampEncounters`.
 *
 * It was the campaign screen's first tab; the sixth delivery gives it a row of
 * its own and therefore a URL of its own. What that buys is not layout: an
 * encounter list is a thing a DM leaves open, links somebody to, and reloads
 * into mid-prep, and a `useState` tab was none of those.
 *
 * **The search term and the open dialog live here, above `CampaignChrome`**,
 * because the box that sets one is in the top bar and the grid that reads it is
 * the body — two slots of one screen. Held in either slot they would be two
 * copies of one answer; held here they are one, and the frame stays a frame.
 *
 * The filter is client-side over what the frame already loaded: `encounters.list`
 * takes no query, so a round trip per keystroke would buy a filter the browser
 * can do on a list this size. Its counterpart on the Chronicle is the server's
 * because full text over a stat block is not something a browser has.
 */
export function EncountersScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ readonly encounter: Encounter | undefined }>();

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Encounters"
      subtitle={({ view }) =>
        `${String(view.encounters.length)} ${
          view.encounters.length === 1 ? "encounter" : "encounters"
        } built for ${view.campaign.name}`
      }
      actions={() => (
        <>
          <Input
            aria-label="Search encounters"
            placeholder="Search encounters"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-control-sm w-44"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing({ encounter: undefined })}
          >
            <Icon name="plus" size={14} />
            New encounter
          </Button>
        </>
      )}
    >
      {({ view, run }) => {
        const shown = view.encounters.filter((encounter) =>
          matches(search, encounter.name, ...encounter.tags),
        );

        // Counted over every note, not the filtered encounters: a card's own
        // count should not move because the DM typed in the search box.
        const noteCounts = new Map<string, number>();
        for (const note of view.notes) {
          if (note.attachedTo !== null) {
            noteCounts.set(note.attachedTo.id, (noteCounts.get(note.attachedTo.id) ?? 0) + 1);
          }
        }

        return (
          <>
            {/* The container is the content column, so the grid turns over on
                the width it actually has — which changes when the Hob panel
                takes 400px out of it without the window moving. `@lg` and
                `@3xl` are where `auto-fill minmax(250px, 1fr)` turns over: two
                cards need 516px, three need 782px. */}
            <div className="@container">
              {view.encounters.length === 0 ? (
                <EmptyState icon="swords" title="No encounters yet">
                  Nothing is waiting for the party. Write one with{" "}
                  <span className="text-heading">New encounter</span> above and it lands here, ready
                  to run.
                </EmptyState>
              ) : shown.length === 0 ? (
                <EmptyState icon="search" title="Nothing matches">
                  Nothing here answers to &ldquo;{search.trim()}&rdquo;. Loosen the search, or clear
                  it.
                </EmptyState>
              ) : (
                <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {shown.map((encounter) => (
                    <EncounterCard
                      key={encounter.id}
                      encounter={encounter}
                      noteCount={noteCounts.get(encounter.id) ?? 0}
                      running={view.run?.encounterId === encounter.id}
                      onEdit={() => setEditing({ encounter })}
                      onRun={() => run(encounter.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Keyed on what is being edited, so opening the dialog on a second
                row builds a fresh form rather than showing the first's fields. */}
            {editing !== undefined && (
              <EncounterDialog
                key={editing.encounter?.id ?? "new-encounter"}
                campaignId={view.campaign.id}
                encounter={editing.encounter}
                onClose={() => setEditing(undefined)}
                onSaved={() => setEditing(undefined)}
              />
            )}
          </>
        );
      }}
    </CampaignChrome>
  );
}
