import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { battleMap, campaignId, encounterId, installStubServer } from "./campaign.fixtures";

/**
 * *Adjust grid* on an encounter's page: the board previews the draft, the form
 * refuses what the wire would, Save writes the grid whole and Cancel puts the
 * saved grid back.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const mapPath = `/campaigns/${campaignId}/encounters/${encounterId}/map`;
const pagePath = `/campaigns/${campaignId}/encounters/${encounterId}`;

/** A 1536 × 1024 picture, the size Hob draws a map at. */
const drawn = {
  ...battleMap,
  image: {
    cardUrl: "/battle-map-images/2b1f2a1e-0000-4000-8000-000000000b01/card?e=1&s=c",
    fullUrl: "/battle-map-images/2b1f2a1e-0000-4000-8000-000000000b01/full?e=1&s=f",
    width: 1536,
    height: 1024,
  },
};

const columnLines = () =>
  document.querySelectorAll("[data-slot=battle-map-grid] [data-line=column]");
const rowLines = () => document.querySelectorAll("[data-slot=battle-map-grid] [data-line=row]");
const panel = () => screen.getByRole("group", { name: "Adjust grid" });

const openAdjust = async () => {
  await renderAt(pagePath);
  await userEvent.click(await screen.findByRole("button", { name: "Adjust grid" }));
  return panel();
};

const retype = async (label: string, value: string) => {
  const input = within(panel()).getByLabelText(label);
  await userEvent.clear(input);
  if (value !== "") await userEvent.type(input, value);
};

describe("adjusting an encounter's grid", () => {
  beforeEach(() => {
    server.routes.set(`GET ${mapPath}`, { status: 200, body: drawn });
  });

  it("resizes the square from squares across, and the overlay spans the picture", async () => {
    const adjust = await openAdjust();
    expect(within(adjust).getByText("64 px a square")).toBeInTheDocument();
    expect(columnLines()).toHaveLength(25);

    await retype("Squares across", "20");

    expect(within(adjust).getByText("76.8 px a square")).toBeInTheDocument();
    // 20 columns: 21 edges, the first at 0, the next one square along, the last
    // at the picture's right edge.
    expect(columnLines()).toHaveLength(21);
    expect(columnLines()[0]?.getAttribute("x1")).toBe("0");
    expect(columnLines()[1]?.getAttribute("x1")).toBe("76.8");
    expect(Number(columnLines()[20]?.getAttribute("x1"))).toBeCloseTo(1536, 6);
    // The rows follow: 13 whole squares of 76.8 fit down 1024.
    expect(rowLines()).toHaveLength(14);
    expect(screen.getByText("20 × 13 squares · 5 ft each · 100 × 65 ft")).toBeInTheDocument();
  });

  it("refuses an offset of a whole square or more, and a count the picture cannot hold", async () => {
    const adjust = await openAdjust();

    await retype("Move right (px)", "64");
    expect(within(adjust).getByRole("alert")).toHaveTextContent("From 0 to under 64, one square.");
    expect(within(adjust).getByRole("button", { name: "Save grid" })).toBeDisabled();

    await retype("Move right (px)", "12");
    expect(within(adjust).queryByRole("alert")).toBeNull();
    expect(columnLines()[0]?.getAttribute("x1")).toBe("12");

    // The most is what leaves an 8 px square after the offset: (1536 − 12) / 8.
    await retype("Squares across", "500");
    expect(within(adjust).getByRole("alert")).toHaveTextContent(
      "From 2 to 190 squares across this picture.",
    );
    expect(within(adjust).getByRole("button", { name: "Save grid" })).toBeDisabled();
    // The preview keeps the last grid that read cleanly.
    expect(columnLines()).toHaveLength(25);
  });

  it("nudges the grid a pixel at a time and wraps at the square's edge", async () => {
    const adjust = await openAdjust();
    await userEvent.click(within(adjust).getByRole("button", { name: "Move the grid left" }));
    expect(within(adjust).getByLabelText("Move right (px)")).toHaveValue(63);
    expect(columnLines()[0]?.getAttribute("x1")).toBe("63");

    await userEvent.click(within(adjust).getByRole("button", { name: "Move the grid down" }));
    expect(within(adjust).getByLabelText("Move down (px)")).toHaveValue(1);
    expect(rowLines()[0]?.getAttribute("y1")).toBe("1");
  });

  it("saves the grid whole and closes", async () => {
    server.routes.set(`PATCH ${mapPath}`, {
      status: 200,
      body: () => ({
        ...drawn,
        grid: "none",
        columns: 20,
        rows: 13,
        feetPerCell: 10,
        alignment: { cellPx: 76.8, offsetXPx: 0, offsetYPx: 0 },
      }),
    });
    const adjust = await openAdjust();

    await retype("Squares across", "20");
    await retype("Feet per square", "10");
    await userEvent.click(within(adjust).getByRole("switch"));
    await userEvent.click(within(adjust).getByRole("button", { name: "Save grid" }));

    const patch = server.calls.find((call) => call.method === "PATCH");
    expect(patch?.pathname).toBe(mapPath);
    expect(JSON.parse(patch?.body ?? "{}")).toEqual({
      grid: "none",
      columns: 20,
      rows: 13,
      feetPerCell: 10,
      alignment: { cellPx: 76.8, offsetXPx: 0, offsetYPx: 0 },
    });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Adjust grid" })).toBeNull());
  });

  it("cancels back to the saved grid, sending nothing", async () => {
    const adjust = await openAdjust();
    await retype("Squares across", "20");
    expect(columnLines()).toHaveLength(21);

    await userEvent.click(within(adjust).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("group", { name: "Adjust grid" })).toBeNull();
    expect(columnLines()).toHaveLength(25);
    expect(screen.getByText("24 × 16 squares · 5 ft each · 120 × 80 ft")).toBeInTheDocument();
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);

    // Opening it again starts from what is saved, not the abandoned draft.
    await userEvent.click(screen.getByRole("button", { name: "Adjust grid" }));
    expect(within(panel()).getByLabelText("Squares across")).toHaveValue(24);
  });

  it("keeps Run the page's one primary while adjusting", async () => {
    await openAdjust();
    const primaries = () =>
      [...document.querySelectorAll('[data-slot="button"]')].filter((button) =>
        button.classList.contains("bg-accent"),
      );
    await waitFor(() => expect(primaries().map((button) => button.textContent)).toEqual(["Run"]));
  });
});

describe("adjusting a blank board", () => {
  it("keeps the square's size and sets both counts", async () => {
    const adjust = await openAdjust();
    expect(within(adjust).queryByText("As many as fit down the picture.")).toBeNull();

    await retype("Squares across", "10");
    await retype("Squares down", "8");

    expect(within(adjust).getByText("64 px a square")).toBeInTheDocument();
    expect(columnLines()).toHaveLength(11);
    expect(rowLines()).toHaveLength(9);
    // A blank board is its own plane: 10 × 8 squares of 64.
    expect(document.querySelector("[data-slot=battle-map-grid]")?.getAttribute("viewBox")).toBe(
      "0 0 640 512",
    );
  });
});
