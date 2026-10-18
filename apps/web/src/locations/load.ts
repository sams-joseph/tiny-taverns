import type { CampaignId, LocationId, SharedWorldId } from "@taverns/api";
import type { CampaignLocation, PartyMove } from "@taverns/api";
import { AsyncResult, Atom } from "effect/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The places' reads, as atoms. Every read but the shelf's also answers
 * `libraryLocations`: an owner's edit or delete on the shelf moves every table
 * and world the place is in, and the shelf's write cannot name those by id.
 */

/** The owner's own places, on the Library's Locations shelf. */
export const libraryLocationsAtom = apiAtom(
  (client) => client.libraryLocations.list(),
  [reads.libraryLocations],
);

/** Where one of the owner's places is in use, for the delete confirmation. */
export const locationAppearancesAtom = Atom.family((locationId: LocationId) =>
  apiAtom(
    (client) => client.libraryLocations.appearances({ params: { locationId } }),
    [reads.libraryLocations],
  ),
);

/** The places at a table, as its creator arranges them. */
export const campaignLocationsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.locations.list({ params: { campaignId } }),
    [reads.locations(campaignId), reads.libraryLocations],
  ),
);

/** The places a table has revealed, as a player is told them. */
export const playerLocationsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.playerLocations.list({ params: { campaignId } }),
    [reads.locations(campaignId), reads.libraryLocations],
  ),
);

/** A Shared World's atlas. */
export const worldLocationsAtom = Atom.family((worldId: SharedWorldId) =>
  apiAtom(
    (client) => client.sharedWorldLocations.list({ params: { worldId } }),
    [reads.worldLocations(worldId), reads.libraryLocations],
  ),
);

/** The party's travel log, newest first, as the table's creator reads it. */
export const partyTravelAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.partyTravel.list({ params: { campaignId } }),
    [reads.partyTravel(campaignId)],
  ),
);

/** The same log, as a player at the table is told it. */
export const playerPartyTravelAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.playerPartyTravel.list({ params: { campaignId } }),
    [reads.partyTravel(campaignId)],
  ),
);

/** What a table's creator sees on its Locations screen: the places and where the party has been. */
export interface TableAtlas {
  readonly places: ReadonlyArray<CampaignLocation>;
  /** Newest first: the first is where the party is. */
  readonly moves: ReadonlyArray<PartyMove>;
}

/** The creator's places and travel log as one value with three states. */
export const tableAtlasAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<TableAtlas, unknown> =>
      combine(
        get,
        AsyncResult.all({
          places: get(campaignLocationsAtom(campaignId)),
          moves: get(partyTravelAtom(campaignId)),
        }),
      ),
    (refresh) => {
      refresh(campaignLocationsAtom(campaignId));
      refresh(partyTravelAtom(campaignId));
    },
  ),
);
