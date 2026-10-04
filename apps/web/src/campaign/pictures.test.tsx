import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaign,
  campaignId,
  drawnCover,
  installStubServer,
  mintingSession,
  renderScreen,
} from "./campaign.fixtures";

/**
 * A campaign's own cover, uploaded, framed and removed from the Overview.
 *
 * The whole write is driven through the real dialog: the menu item, the file
 * chooser, the cropper's frame and the three calls one save makes (a ticket,
 * the file sent where it says with no credential, and the apply with the
 * crop). jsdom decodes no pictures, so `createImageBitmap` is stubbed to say
 * what size the chosen file is.
 */

const server = installStubServer();

// jsdom has neither; the dialog holds the chosen file at a blob URL, and
// revokes it as it unmounts, after a test has ended.
URL.createObjectURL = () => "blob:chosen";
URL.revokeObjectURL = () => undefined;
// jsdom's `Blob` has no `arrayBuffer`, which every browser the app supports does.
Blob.prototype.arrayBuffer ??= function (this: Blob) {
  return new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(this);
  });
};

const UPLOAD_ID = "6f0c5a7e-2b7d-4a4e-9b1e-4a4f4b1c2d3e";
const PUT_PATH = "/uploads";
const ticket = {
  uploadId: UPLOAD_ID,
  url: `${PUT_PATH}?k=uploads%2Fa%2Fb%2Fsource&t=image%2Fpng&n=8&e=9999999999&s=sig`,
  method: "PUT",
  headers: { "content-type": "image/png" },
  expiresAt: "2026-10-03T12:15:00.000Z",
};

const withCover = (image: typeof drawnCover | null) =>
  server.routes.set(`GET /campaigns/${campaignId}`, {
    status: 200,
    body: { ...campaign, image },
  });

beforeEach(() => {
  server.reset();
  server.routes.set("POST /pictures/uploads", { status: 200, body: ticket });
  server.routes.set(`PUT ${PUT_PATH}`, { status: 204, body: undefined });
  server.routes.set(`POST /pictures/uploads/${UPLOAD_ID}/apply`, { status: 204, body: undefined });
  server.routes.set(`DELETE /pictures/campaign/${campaignId}`, { status: 204, body: undefined });
  // A 400 × 200 picture, upright.
  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve({ width: 400, height: 200, close: () => undefined }),
  );
});

const openMenu = async () => {
  await renderScreen(mintingSession());
  await userEvent.click(await screen.findByRole("button", { name: "Campaign actions" }));
};

const callsTo = (method: string, pathname: string) =>
  server.calls.filter((call) => call.method === method && call.pathname === pathname);

describe("a campaign's cover, from its actions", () => {
  it("offers an upload when there is no cover, and a replace and a remove when there is", async () => {
    withCover(null);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Upload cover" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Remove cover" })).toBeNull();
  });

  it("uploads a chosen file, framed, in one save: a ticket, the bytes with no credential, the crop", async () => {
    withCover(drawnCover);
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Replace cover" }));
    const dialog = await screen.findByRole("dialog", { name: "Replace cover" });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "salt.png", {
      type: "image/png",
    });
    await userEvent.upload(dialog.querySelector<HTMLInputElement>("input[type=file]")!, file);
    expect(await within(dialog).findByRole("group", { name: /^Cover:/ })).toBeTruthy();

    const before = callsTo("GET", `/campaigns/${campaignId}`).length;
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [created] = callsTo("POST", "/pictures/uploads");
    expect(JSON.parse(created!.body)).toEqual({
      subject: "campaign",
      subjectId: campaignId,
      contentType: "image/png",
      contentLength: 8,
    });
    expect(created!.authorization).toMatch(/^Bearer /);

    // The file goes where the ticket says, with exactly its headers and no bearer:
    // a storage provider's URL must never see our credential.
    const [sent] = callsTo("PUT", PUT_PATH);
    expect(sent!.search).toContain("s=sig");
    expect(sent!.authorization).toBeUndefined();

    // Centred at 3:2 on a 2:1 picture: three quarters of its width, all its height.
    const [applied] = callsTo("POST", `/pictures/uploads/${UPLOAD_ID}/apply`);
    expect(JSON.parse(applied!.body)).toEqual({
      images: [{ kind: "campaign", crop: { x: 0.125, y: 0, width: 0.75, height: 1 } }],
    });
    // The Overview reads the campaign again, cover and all.
    await waitFor(() =>
      expect(callsTo("GET", `/campaigns/${campaignId}`).length).toBeGreaterThan(before),
    );
  });

  it("keeps the dialog open with the server's sentence when the file is refused", async () => {
    withCover(null);
    server.routes.set(`POST /pictures/uploads/${UPLOAD_ID}/apply`, {
      status: 422,
      body: { _tag: "UploadRejected", message: "That file is not a picture this server can read." },
    });
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Upload cover" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload cover" });
    await userEvent.upload(
      dialog.querySelector<HTMLInputElement>("input[type=file]")!,
      new File([new Uint8Array(8)], "x.png", { type: "image/png" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("That file is not a picture this server can read."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Upload cover" })).toBeTruthy();
  });

  it("says why a file the browser cannot open is not used, and sends nothing", async () => {
    withCover(null);
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("not an image")));
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Upload cover" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload cover" });
    await userEvent.upload(
      dialog.querySelector<HTMLInputElement>("input[type=file]")!,
      new File(["hello"], "notes.png", { type: "image/png" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That file is not a picture this browser can open.",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(callsTo("POST", "/pictures/uploads")).toHaveLength(0);
  });

  it("removes the cover only once it is confirmed", async () => {
    withCover(drawnCover);
    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove cover" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove cover?" });
    expect(callsTo("DELETE", `/pictures/campaign/${campaignId}`)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(callsTo("DELETE", `/pictures/campaign/${campaignId}`)).toHaveLength(1);
  });
});
