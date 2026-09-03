import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardDescription, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Icon } from "./icon";
import { Input } from "./input";
import { Label } from "./label";
import { Switch } from "./switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Toggle } from "./toggle";

describe("Button", () => {
  it("renders a real button and fires onClick", async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(<Button onClick={() => (clicks += 1)}>Roll initiative</Button>);

    const button = screen.getByRole("button", { name: "Roll initiative" });
    await user.click(button);
    expect(clicks).toBe(1);
  });

  it("takes its height from the design system's control token, not a px literal", () => {
    render(<Button>Roll initiative</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-control");
  });

  it("carries the destructive variant's danger fill", () => {
    render(<Button variant="destructive">End session</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-danger");
  });

  it("keeps both its ink and its type size — they must not merge away each other", () => {
    render(<Button>Roll initiative</Button>);
    // A tailwind-merge config that cannot tell `text-<colour>` from `text-<size>`
    // silently drops one of these, and the button renders slate body text.
    expect(screen.getByRole("button")).toHaveClass("text-on-accent", "text-label");
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(
      <Button disabled onClick={() => (clicks += 1)}>
        Waiting
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(clicks).toBe(0);
  });
});

describe("Badge", () => {
  it("renders the semantic variants this product added", () => {
    render(<Badge variant="magic">Concentrating</Badge>);
    expect(screen.getByText("Concentrating")).toHaveClass("bg-magic-soft");
  });
});

describe("Card", () => {
  it("composes the shadcn way and marks its tone", () => {
    render(
      <Card tone="panel">
        <CardHeader>
          <CardTitle>Goblin ambush</CardTitle>
          <CardDescription>Six creatures</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByText("Goblin ambush")).toBeInTheDocument();
    expect(screen.getByText("Six creatures")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='card']")).toHaveAttribute("data-tone", "panel");
  });
});

describe("Icon", () => {
  it("renders a Lucide glyph that inherits currentColor", () => {
    const { container } = render(<Icon name="dice-5" size={18} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("stroke", "currentColor");
  });
});

describe("Label and Input", () => {
  it("associates a standalone label with a control that renders none of its own", () => {
    render(
      <>
        <Label htmlFor="damage">Damage</Label>
        <Input id="damage" mono defaultValue="2d6+3" />
      </>,
    );
    const input = screen.getByLabelText("Damage");
    expect(input).toHaveValue("2d6+3");
    expect(input).toHaveClass("font-mono");
  });
});

describe("Checkbox", () => {
  it("reports state through onCheckedChange", async () => {
    const user = userEvent.setup();
    const seen: boolean[] = [];
    render(<Checkbox aria-label="Reread" onCheckedChange={(next) => seen.push(Boolean(next))} />);

    await user.click(screen.getByRole("checkbox", { name: "Reread" }));
    expect(seen).toEqual([true]);
  });
});

describe("Switch", () => {
  it("reports state through onCheckedChange", async () => {
    const user = userEvent.setup();
    const seen: boolean[] = [];
    render(<Switch aria-label="Share" onCheckedChange={(next) => seen.push(Boolean(next))} />);

    await user.click(screen.getByRole("switch", { name: "Share" }));
    expect(seen).toEqual([true]);
  });
});

describe("Toggle", () => {
  it("reports pressed state through onPressedChange", async () => {
    const user = userEvent.setup();
    const seen: boolean[] = [];
    render(
      <Toggle size="sm" onPressedChange={(next) => seen.push(next)}>
        Marsh
      </Toggle>,
    );

    await user.click(screen.getByRole("button", { name: "Marsh" }));
    expect(seen).toEqual([true]);
  });
});

describe("DropdownMenu", () => {
  it("opens on the trigger, runs an item, and closes", async () => {
    const user = userEvent.setup();
    let ran = false;
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => {
              ran = true;
            }}
          >
            Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    expect(ran).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks the active radio row and a pick moves the group's value", async () => {
    const user = userEvent.setup();
    const seen = { current: "name" };
    function Harness() {
      const [order, setOrder] = React.useState("name");
      seen.current = order;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger>Sort</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={order}
              onValueChange={(value) => setOrder(value as string)}
            >
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="recent">Recent</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Sort" }));
    expect(await screen.findByRole("menuitemradio", { name: "Name" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Recent" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Recent" }));
    expect(seen.current).toBe("recent");
  });
});

describe("Tabs", () => {
  it("switches panels on click", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="combat">
        <TabsList>
          <TabsTrigger value="combat">Combat</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="combat">Six goblins in the reeds</TabsContent>
        <TabsContent value="notes">The wagon driver knows the shortcut</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText("Six goblins in the reeds")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByText("The wagon driver knows the shortcut")).toBeVisible();
  });
});
