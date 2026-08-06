import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./Gallery";

/** Finds the specimen card wrapping a given label. */
function specimen(label: string) {
  const heading = screen.getByText(label);
  const card = heading.closest("div")?.parentElement;
  if (!card) throw new Error(`No specimen found for ${label}`);
  return card;
}

describe("Gallery", () => {
  it("renders the wordmark and every section", () => {
    render(<Gallery route={{ screen: "gallery" }} />);

    expect(screen.getByText("Tiny Taverns")).toBeInTheDocument();
    for (const heading of ["Foundations", "Core", "Forms", "Navigation", "Feedback"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("shows every Button variant and size", () => {
    render(<Gallery route={{ screen: "gallery" }} />);

    expect(within(specimen("Button — variants")).getAllByRole("button")).toHaveLength(6);
    // three sized buttons plus two icon buttons
    expect(within(specimen("Button — sizes")).getAllByRole("button")).toHaveLength(5);
  });

  it("shows every Badge variant", () => {
    render(<Gallery route={{ screen: "gallery" }} />);

    const badges = specimen("Badge — variants").querySelectorAll("[data-slot='badge']");
    expect(badges).toHaveLength(7);
  });

  it("drives the Toggle filter row through onPressedChange", async () => {
    const user = userEvent.setup();
    render(<Gallery route={{ screen: "gallery" }} />);

    expect(screen.getByText("Filtering by Marsh.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ruin" }));
    expect(screen.getByText("Filtering by Marsh, Ruin.")).toBeInTheDocument();
  });

  it("switches tab panels", async () => {
    const user = userEvent.setup();
    render(<Gallery route={{ screen: "gallery" }} />);

    expect(screen.getByText(/Six goblins are hiding in the reeds/)).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByText(/The wagon driver knows the shortcut/)).toBeVisible();
  });

  it("opens a dialog and closes it again", async () => {
    const user = userEvent.setup();
    render(<Gallery route={{ screen: "gallery" }} />);

    const trigger = within(specimen("Dialog")).getByRole("button", { name: "End session" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("End the session?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByText("End the session?")).not.toBeInTheDocument();
  });

  it("raises a toast with the variant the caller asked for", async () => {
    const user = userEvent.setup();
    render(<Gallery route={{ screen: "gallery" }} />);

    await user.click(screen.getByRole("button", { name: "Show success" }));
    expect(await screen.findByText("Brannoc made the save")).toBeInTheDocument();
  });
});
