import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  campaign,
  campaignId,
  cazril,
  drawnNpcBanner,
  drawnNpcPortrait,
  installStubServer,
  mintingSession,
  npcId,
  playerCazril,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { NpcAvatar } from "./NpcAvatar";
import { TEST_SESSION } from "../test/session";

/**
 * An NPC's plate: initials always, Hob's portrait over them when there is one,
 * and the initials again whenever the picture cannot be shown — on the cast,
 * the NPC's page, the player's page and the conversations. jsdom loads no
 * image, so `load` and `error` are fired by hand; what a browser draws is not
 * measurable here and is not asserted.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const thumb = apiUrl(drawnNpcPortrait.thumbUrl);

/** Every NPC plate on the page that shows the portrait. */
const drawnPlates = () =>
  [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") === thumb);

describe("NpcAvatar", () => {
  it("draws the initials and no image when there is no portrait", () => {
    const { container } = render(<NpcAvatar name="Marta Vell" image={null} />);
    expect(container.textContent).toBe("MV");
    expect(container.querySelector("img")).toBeNull();
  });

  it("lays the thumb over the initials, lazily and decoratively, at both sizes", () => {
    for (const size of ["sm", "lg"] as const) {
      const { container } = render(
        <NpcAvatar name="Marta Vell" image={drawnNpcPortrait} size={size} />,
      );
      const img = container.querySelector("img")!;
      expect(container.textContent).toBe("MV");
      expect(img.getAttribute("src")).toBe(thumb);
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.hasAttribute("height")).toBe(false);
      expect(img.className).toContain("size-full");
      expect(img.className).toContain("object-top");
      cleanup();
    }
  });

  it("fills a portrait band with the banner, over the initials", () => {
    const { container } = render(
      <NpcAvatar name="Marta Vell" image={drawnNpcPortrait} banner={drawnNpcBanner} size="band" />,
    );
    expect(container.textContent).toBe("MV");
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(apiUrl(drawnNpcBanner.cardUrl));
    expect(img.getAttribute("srcset")).toBe(
      `${apiUrl(drawnNpcBanner.cardUrl)} 768w, ${apiUrl(drawnNpcBanner.fullUrl)} 1536w`,
    );
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("object-center");
    // It fills the band it is laid in rather than drawing a plate of its own.
    expect(container.firstElementChild!.className).toContain("absolute inset-0");
  });

  it("falls back to the square's card size in a band with no banner", () => {
    const { container } = render(
      <NpcAvatar name="Marta Vell" image={drawnNpcPortrait} banner={null} size="band" />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(apiUrl(drawnNpcPortrait.cardUrl));
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.className).toContain("object-top");
  });

  it("keeps the square on the plates, banner or not", () => {
    for (const size of ["sm", "lg"] as const) {
      const { container } = render(
        <NpcAvatar
          name="Marta Vell"
          image={drawnNpcPortrait}
          banner={drawnNpcBanner}
          size={size}
        />,
      );
      expect(container.querySelector("img")!.getAttribute("src")).toBe(thumb);
      cleanup();
    }
  });

  it("stays transparent until it loads, and falls back to the initials when it fails", () => {
    const { container, rerender } = render(<NpcAvatar name="Marta" image={drawnNpcPortrait} />);
    const img = container.querySelector("img")!;
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(container.querySelector("img")!.className).toContain("opacity-100");

    rerender(
      <NpcAvatar
        name="Marta"
        image={{ ...drawnNpcPortrait, thumbUrl: "/npc-images/x/thumb?e=2&s=u" }}
      />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("MA");
  });
});

const renderCreator = async (path: string): Promise<void> => {
  await renderAt(path, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));
};

describe("the cast", () => {
  it("heads an NPC's card with its portrait, at the card size", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, image: drawnNpcPortrait }],
    });
    await renderCreator(`/campaigns/${campaignId}/cast`);
    const card = (await screen.findByRole("link", { name: "Cazril" })).closest("li")!;
    expect(within(card).getByText("CA")).toBeInTheDocument();
    expect(card.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnNpcPortrait.cardUrl));
  });

  it("heads an NPC's card with its banner when there is one, and its row mark stays square", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, image: drawnNpcPortrait, banner: drawnNpcBanner }],
    });
    await renderCreator(`/campaigns/${campaignId}/cast`);
    const card = (await screen.findByRole("link", { name: "Cazril" })).closest("li")!;
    expect([...card.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([
      apiUrl(drawnNpcBanner.cardUrl),
    ]);
  });

  it("heads the NPC drawer with the banner, and with the square when there is none", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, image: drawnNpcPortrait, banner: drawnNpcBanner }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, image: drawnNpcPortrait, banner: drawnNpcBanner },
    });
    await renderCreator(`/campaigns/${campaignId}/cast?npc=${npcId}`);
    const drawer = await screen.findByRole("dialog", { name: "Cazril" });
    await waitFor(() =>
      expect(drawer.querySelector("img")?.getAttribute("src")).toBe(apiUrl(drawnNpcBanner.cardUrl)),
    );
    cleanup();

    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, image: drawnNpcPortrait }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, image: drawnNpcPortrait },
    });
    await renderCreator(`/campaigns/${campaignId}/cast?npc=${npcId}`);
    const plain = await screen.findByRole("dialog", { name: "Cazril" });
    await waitFor(() =>
      expect(plain.querySelector("img")?.getAttribute("src")).toBe(
        apiUrl(drawnNpcPortrait.cardUrl),
      ),
    );
  });

  it("says Hob is drawing on the card, and re-reads the cast until the portrait lands", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, imagePending: true }],
    });
    await renderCreator(`/campaigns/${campaignId}/cast`);
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, image: drawnNpcPortrait }],
    });
    // The card's band loads the card size, not the thumb.
    const card = apiUrl(drawnNpcPortrait.cardUrl);
    await waitFor(
      () =>
        expect(
          [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") === card),
        ).toHaveLength(1),
      { timeout: 15_000 },
    );
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
  }, 30_000);
});

describe("an NPC's page", () => {
  it("puts the portrait on the heading and on every reply in the rehearsal", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, image: drawnNpcPortrait },
    });
    await renderCreator(`/campaigns/${campaignId}/cast/${npcId}`);
    await screen.findByRole("heading", { name: "Cazril", level: 2 });
    await waitFor(() => expect(drawnPlates().length).toBeGreaterThanOrEqual(1));
  });

  it("says Hob is drawing, and re-reads the NPC until the portrait lands", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, imagePending: true },
    });
    await renderCreator(`/campaigns/${campaignId}/cast/${npcId}`);
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");

    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, {
      status: 200,
      body: { ...cazril, image: drawnNpcPortrait },
    });
    await waitFor(() => expect(drawnPlates().length).toBeGreaterThanOrEqual(1), {
      timeout: 15_000,
    });
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
  }, 30_000);

  it("draws the initials with no portrait exactly as before", async () => {
    await renderCreator(`/campaigns/${campaignId}/cast/${npcId}`);
    await screen.findByRole("heading", { name: "Cazril", level: 2 });
    expect(document.querySelectorAll("img[src*='/npc-images/']")).toHaveLength(0);
    expect(screen.queryByText(/Hob is drawing/)).toBeNull();
  });

  it("names each NPC on the follow-up queue with its portrait", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/follow-up`, {
      status: 200,
      body: {
        campaignId,
        proposalCount: 0,
        awarenessCount: 1,
        items: [
          {
            itemKind: "awareness",
            npc: {
              id: npcId,
              name: "Cazril",
              role: "the ferryman",
              archivedAt: null,
              image: drawnNpcPortrait,
            },
            candidate: {
              id: "2b1f2a1e-0000-4000-8000-00000000c201",
              campaignId,
              npcId,
              kind: "knowledge",
              body: "The ford floods at the new moon.",
              sourceKind: "note",
              sourceId: null,
              sourceLabel: "Prep note",
              sourceExcerpt: "Floods at the new moon.",
              rationale: "He works the ford.",
              version: 1,
              state: "pending",
              decidedByAccountId: null,
              decidedAt: null,
              rejectionReason: null,
              acceptedKnowledgeFactId: null,
              acceptedMemoryId: null,
              visibility: "dm",
              origin: "assistant",
              assistantTurnId: null,
              createdAt: cazril.createdAt,
              updatedAt: cazril.updatedAt,
            },
          },
        ],
      },
    });
    await renderCreator(`/campaigns/${campaignId}/cast/follow-up`);
    await screen.findByText("The ford floods at the new moon.");
    expect(drawnPlates()).toHaveLength(1);
  });
});

describe("a player's view of a shared NPC", () => {
  const asPlayer = async (path: string) => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "player", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/player`, {
      status: 200,
      body: [{ ...playerCazril, image: drawnNpcPortrait }],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}/player`, {
      status: 200,
      body: { ...playerCazril, image: drawnNpcPortrait },
    });
    await renderAt(path, (route) => (
      <HostedSessionScope session={mintingSession()}>{route}</HostedSessionScope>
    ));
  };

  it("puts the portrait on the NPC's card on the player's campaign page", async () => {
    await asPlayer(`/campaigns/${campaignId}`);
    await screen.findByText("People you can talk to");
    expect(drawnPlates()).toHaveLength(1);
  });

  it("puts the portrait on the private conversation's heading and panel", async () => {
    await asPlayer(`/campaigns/${campaignId}/cast/${npcId}/talk`);
    await screen.findByRole("region", { name: "Talk privately with Cazril" });
    // The profile's heading plate and the panel's header plate.
    await waitFor(() => expect(drawnPlates().length).toBeGreaterThanOrEqual(2));
  });
});
