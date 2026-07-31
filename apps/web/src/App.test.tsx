import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

describe("App", () => {
  it("renders the heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Taverns" })).toBeInTheDocument();
  });

  it("increments the counter when the shared Button is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("count")).toHaveTextContent("Tabs opened: 0");
    await user.click(screen.getByRole("button", { name: "Open a tab" }));
    expect(screen.getByTestId("count")).toHaveTextContent("Tabs opened: 1");
  });
});
