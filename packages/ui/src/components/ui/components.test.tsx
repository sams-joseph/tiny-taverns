import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackLink } from "./back-link";
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
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu";
import { Kbd } from "./kbd";
import { Label } from "./label";
import { SectionHeading } from "./section-heading";
import { PageHeader } from "./page-header";
import { EmptyState, FailureNotice, Loading } from "./states";
import { Switch } from "./switch";
import { navPillVariants, Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
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

describe("SectionHeading", () => {
  it("is an h2 at the section size unless told otherwise", () => {
    render(<SectionHeading>Encounters on deck</SectionHeading>);
    const heading = screen.getByRole("heading", { level: 2, name: "Encounters on deck" });
    expect(heading).toHaveClass("font-display", "text-body", "text-heading");
  });

  it("takes its level and its size separately", () => {
    render(
      <SectionHeading as="h3" size="display">
        Session 4
      </SectionHeading>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Session 4" })).toHaveClass(
      "text-display-s",
    );
  });

  it("sets an action on the heading's baseline, with the row taking className", () => {
    render(
      <SectionHeading className="mb-3" action={<a href="#all">All encounters</a>}>
        Encounters on deck
      </SectionHeading>,
    );
    const heading = screen.getByRole("heading", { name: "Encounters on deck" });
    const row = heading.parentElement;
    expect(row).toHaveClass("mb-3", "items-baseline");
    expect(heading).not.toHaveClass("mb-3");
    expect(row).toContainElement(screen.getByRole("link", { name: "All encounters" }));
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

describe("NavigationMenu", () => {
  function Nav() {
    return (
      <NavigationMenu aria-label="Sections">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger active>Campaigns</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#campaigns" active>
                Campaigns
              </NavigationMenuLink>
              <NavigationMenuLink href="#worlds">Shared Worlds</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Library</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#creatures">Creatures</NavigationMenuLink>
              <NavigationMenuLink href="#spells">Spells</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink variant="pill" href="#characters">
              Characters
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );
  }

  it("is a nav of disclosure buttons and links, not a menu", async () => {
    const user = userEvent.setup();
    render(<Nav />);

    const nav = screen.getByRole("navigation", { name: "Sections" });
    const campaigns = screen.getByRole("button", { name: "Campaigns" });
    expect(nav).toContainElement(campaigns);
    expect(campaigns).toHaveAttribute("aria-expanded", "false");
    expect(campaigns).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Library" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Characters" })).toHaveClass("rounded-pill");
    expect(screen.queryByRole("link", { name: "Shared Worlds" })).toBeNull();

    await user.click(campaigns);
    expect(campaigns).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("link", { name: "Shared Worlds" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Shared Worlds" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on ArrowDown, walks the panel with the arrows, and Escape returns focus", async () => {
    const user = userEvent.setup();
    render(<Nav />);

    const library = screen.getByRole("button", { name: "Library" });
    act(() => library.focus());
    await user.keyboard("{ArrowDown}");
    expect(library).toHaveAttribute("aria-expanded", "true");
    const creatures = await screen.findByRole("link", { name: "Creatures" });
    await waitFor(() => expect(creatures).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: "Spells" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(library).toHaveAttribute("aria-expanded", "false"));
    expect(library).toHaveFocus();
  });

  it("moves between the row's items with the arrows", async () => {
    const user = userEvent.setup();
    render(<Nav />);

    act(() => screen.getByRole("button", { name: "Campaigns" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Library" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("link", { name: "Characters" })).toHaveFocus();
  });

  it("closes the panel when one of its links is followed", async () => {
    const user = userEvent.setup();
    render(<Nav />);

    const campaigns = screen.getByRole("button", { name: "Campaigns" });
    await user.click(campaigns);
    await user.click(await screen.findByRole("link", { name: "Shared Worlds" }));
    await waitFor(() => expect(campaigns).toHaveAttribute("aria-expanded", "false"));
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

describe("navPillVariants", () => {
  it("draws each of the global row's states from one recipe", () => {
    expect(navPillVariants({ state: "here" })).toContain("bg-surface-sunken");
    expect(navPillVariants({ state: "on" })).toContain("bg-accent-soft");
    expect(navPillVariants({ state: "quiet" })).toContain("border-hairline");
    expect(navPillVariants()).toContain("border-transparent");
    for (const state of ["idle", "quiet", "here", "on"] as const) {
      expect(navPillVariants({ state })).toContain("rounded-pill");
    }
  });
});

describe("BackLink", () => {
  it("is a link named for where it goes, with the chevron drawn for it", () => {
    render(<BackLink href="/characters">Characters</BackLink>);
    const link = screen.getByRole("link", { name: "Characters" });
    expect(link.getAttribute("href")).toBe("/characters");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("renders into the caller's own link element", () => {
    render(
      <BackLink render={<a data-router="" href="/campaigns/1" />} title="Campaign home">
        Overview
      </BackLink>,
    );
    const link = screen.getByRole("link", { name: "Overview" });
    expect(link).toHaveAttribute("data-router");
    expect(link).toHaveAttribute("title", "Campaign home");
    expect(link).toHaveClass("text-muted-foreground");
  });
});

describe("Kbd", () => {
  it("is a kbd element in either tone", () => {
    render(
      <>
        <Kbd>K</Kbd>
        <Kbd tone="inverse">SPACE</Kbd>
      </>,
    );
    expect(screen.getByText("K").tagName).toBe("KBD");
    expect(screen.getByText("K")).toHaveClass("bg-surface-sunken");
    expect(screen.getByText("SPACE")).toHaveClass("text-slate-50");
  });
});

describe("PageHeader", () => {
  it("draws the title, subtitle and actions in one row, and tabs on their own", () => {
    render(
      <PageHeader
        title="The Salt Road"
        subtitle="Session 4"
        actions={<button type="button">Edit</button>}
        tabs={<a href="#notes">Notes</a>}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "The Salt Road" });
    expect(screen.getByText("Session 4")).toBeInTheDocument();

    const titleRow = heading.parentElement?.parentElement;
    const tabsRow = screen.getByRole("link", { name: "Notes" }).parentElement;
    expect(titleRow?.contains(screen.getByRole("button", { name: "Edit" }))).toBe(true);
    expect(titleRow?.contains(tabsRow ?? null)).toBe(false);
    expect(tabsRow?.parentElement).toBe(titleRow?.parentElement);
  });

  it("reserves the subtitle's line when there is none", () => {
    render(<PageHeader title="Characters" />);
    const cell = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(cell).toHaveClass("h-12");
    expect(document.querySelector("[data-slot=page-header-actions]")).toBeNull();
  });

  it("draws the same header in content without the bar's band or gutters", () => {
    render(
      <PageHeader
        placement="content"
        title="Cast"
        actions={<button type="button">New NPC</button>}
        tabs={<a href="#profile">Profile</a>}
      />,
    );
    const header = screen.getByRole("heading", { level: 1, name: "Cast" }).closest("header");
    expect(header).toHaveAttribute("data-slot", "page-heading");
    expect(header).not.toHaveClass("bg-surface-card");
    expect(header?.children[0]?.className).not.toMatch(/\bpx-page|\bh-19\b/);
    // The reserved lines and the wrap rule are the bar's, so siblings still line up.
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveClass("h-12");
    expect(header?.children[0]).toHaveClass("flex-wrap", "@4xl/app:flex-nowrap");
    // The tab strip draws its own hairline, since there is no band under it.
    expect(screen.getByRole("link", { name: "Profile" }).parentElement).toHaveClass(
      "h-10",
      "border-b",
      "@container",
    );
  });
});

describe("states", () => {
  it("announces a load as a status line", () => {
    render(<Loading label="Reading the bestiary…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Reading the bestiary…");
  });

  it("says what is empty and what to do next", () => {
    render(
      <EmptyState icon="footprints" title="No monsters yet">
        Add one.
      </EmptyState>,
    );
    expect(screen.getByText("No monsters yet")).toBeInTheDocument();
    expect(screen.getByText("Add one.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("alerts a failure by its title and offers a retry only when given one", async () => {
    const user = userEvent.setup();
    let retries = 0;
    const { rerender } = render(
      <FailureNotice icon="octagon-x" title="The server did not answer">
        Start it.
      </FailureNotice>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The server did not answer");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    rerender(
      <FailureNotice
        icon="octagon-x"
        title="The server did not answer"
        onRetry={() => (retries += 1)}
      >
        Start it.
      </FailureNotice>,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retries).toBe(1);
  });
});
