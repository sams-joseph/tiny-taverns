import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cryptLevelId } from "../levels/levels.fixtures";
import { renderAt } from "../test/renderRoute";
import {
  bodyOf,
  campaignId,
  encounter,
  encounterId,
  encounterPrep,
  installStubServer,
  page,
  rosterRowId,
  sketch,
} from "./campaign.fixtures";

/**
 * *Where they wait*, on an encounter's page: the DM stands the roster's
 * creatures on squares of the encounter's level and paints its trigger area,
 * held to the server's own rule before the save, and saves the placement
 * whole through `encounters.place`.
 */

const server = installStubServer();

const pagePath = `/campaigns/${campaignId}/encounters/${encounterId}`;
const placePath = `${pagePath}/placement`;

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
  // The encounter on the crypt: six squares by four, an altar at (4, 2).
  server.routes.set(`GET /campaigns/${campaignId}/encounters`, {
    status: 200,
    body: page([{ ...encounter, levelId: cryptLevelId }, sketch]),
  });
  server.routes.set(`PUT ${placePath}`, { status: 200, body: encounterPrep });
});
afterEach(() => cleanup());

/** The level's surface as six squares of 100 by four of 100, so a press names a square. */
const surface = async () => {
  await screen.findByRole("heading", { name: "Where they wait" });
  const element = document.querySelector<HTMLElement>('[data-slot="placement-surface"]');
  if (element === null) throw new Error("no placement surface");
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0 }) as DOMRect;
  return element;
};

const pressSquare = (element: HTMLElement, column: number, row: number) =>
  fireEvent.pointerDown(element, { clientX: column * 100 + 50, clientY: row * 100 + 50 });

describe("placing an encounter on its level", () => {
  it("stands the picked creature on a square, and saves the placement whole", async () => {
    await renderAt(pagePath);
    const board = await surface();
    const waiting = screen.getByRole("region", { name: "Not placed" });
    expect(within(waiting).getAllByRole("button")).toHaveLength(6);

    // The first is picked: a press stands it, and the next is picked.
    pressSquare(board, 1, 0);
    pressSquare(board, 2, 3);
    expect(screen.getByRole("button", { name: "Goblin Boss 1, column 2, row 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Goblin Boss 2, column 3, row 4" })).toBeVisible();
    // Each marker wears the label its token will in the fight, numbered in its line.
    expect(
      screen.getByRole("button", { name: "Goblin Boss 1, column 2, row 1" }),
    ).toHaveTextContent(/^GB1$/);
    expect(
      screen.getByRole("button", { name: "Goblin Boss 2, column 3, row 4" }),
    ).toHaveTextContent(/^GB2$/);

    // The altar's square, and a taken one, are refused before the save.
    pressSquare(board, 4, 2);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing can stand on that square.");
    pressSquare(board, 1, 0);
    expect(screen.getByRole("status")).toHaveTextContent("Another creature already stands there.");

    // The trigger brush paints squares on, and off again.
    await userEvent.click(screen.getByRole("button", { name: "Trigger area" }));
    pressSquare(board, 0, 2);
    fireEvent.pointerUp(board);
    pressSquare(board, 1, 2);
    fireEvent.pointerUp(board);
    pressSquare(board, 1, 2);
    fireEvent.pointerUp(board);

    await userEvent.click(screen.getByRole("button", { name: "Save placement" }));
    await waitFor(() =>
      expect(bodyOf(server, "PUT", "/placement")).toEqual({
        spots: [
          { encounterCreatureId: rosterRowId, ordinal: 0, column: 1, row: 0 },
          { encounterCreatureId: rosterRowId, ordinal: 1, column: 2, row: 3 },
        ],
        trigger: [12],
      }),
    );
  });

  it("scrolls to itself when the page is opened at #placement, once it is drawn", async () => {
    const scrolled: Array<Element> = [];
    // jsdom has no `scrollIntoView`; the card skips it when it is missing.
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      await renderAt(`${pagePath}#placement`);
      await screen.findByRole("heading", { name: "Where they wait" });
      await waitFor(() => expect(scrolled).toEqual([document.getElementById("placement")]));
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("opens on the saved placement, and takes a creature off the level", async () => {
    server.routes.set(`GET ${pagePath}/prep`, {
      status: 200,
      body: {
        ...encounterPrep,
        placement: {
          spots: [{ encounterCreatureId: rosterRowId, ordinal: 2, column: 0, row: 3 }],
          trigger: [6, 7],
        },
      },
    });
    await renderAt(pagePath);
    await surface();
    const placed = screen.getByRole("region", { name: "On the level" });
    expect(within(placed).getByRole("button", { name: "Goblin Boss 3" })).toBeVisible();
    expect(document.querySelectorAll("[data-trigger]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save placement" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Take Goblin Boss 3 off the level" }));
    await userEvent.click(screen.getByRole("button", { name: "Save placement" }));
    await waitFor(() =>
      expect(bodyOf(server, "PUT", "/placement")).toEqual({ spots: [], trigger: [6, 7] }),
    );
  });

  it("is not offered on an encounter that has been played", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/encounters`, {
      status: 200,
      body: page([
        {
          ...encounter,
          levelId: cryptLevelId,
          lastPlayed: {
            runId: "7d5e9c1a-0000-4000-8000-000000000001",
            sessionId: "7d5e9c1a-0000-4000-8000-000000000002",
            sessionNumber: 3,
            endedAt: "2026-07-18T21:40:00.000Z",
            endedReason: "resolved",
          },
        },
        sketch,
      ]),
    });
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Where they wait" });
    expect(screen.getByText(/A placement is for a fight still to come/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save placement" })).toBeNull();
  });
});
