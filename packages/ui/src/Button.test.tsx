import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Order ale</Button>);
    expect(screen.getByRole("button", { name: "Order ale" })).toBeInTheDocument();
  });

  it("invokes onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Pay tab</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Pay tab" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
