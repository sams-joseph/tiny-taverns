import { api, apiStatus, expect, signIn, test } from "./support/fixtures";

/**
 * The DM's dice in a fight are kept by the server as the DM's own
 * (`run/dice.ts`): the runner's *Rolls* dock reads them back, so a reload and
 * a second tab show the same log, a roll made in one tab reaches the other on
 * the doorbell, and a player at the table is never answered one.
 *
 * The night and the fight are set up through the API as each signed-in user;
 * the rolling is done in the runner as the DM would.
 */

interface Row {
  readonly id: string;
}
interface SavedRoll extends Row {
  readonly label: string;
  readonly total: number;
  readonly visibility: string;
  readonly kind: string;
  readonly characterId: string | null;
}

test("the DM's rolls survive a reload, match in a second tab, and never reach a player", async ({
  browser,
}) => {
  const dmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  try {
    const dm = await dmContext.newPage();
    const player = await playerContext.newPage();
    await signIn(dm, "dm");
    await signIn(player, "player");

    const { campaignId, sessionId, runId } =
      await test.step("a shared night with a fight on the table, and a player at it", async () => {
        const campaign = await api<Row>(dm, "POST", "/campaigns", {
          name: `The Salt Road ${String(Date.now())}`,
          visibility: "shared",
        });
        const { token } = await api<{ token: string }>(
          dm,
          "POST",
          `/campaigns/${campaign.id}/invites`,
          { label: "The player" },
        );
        await api(player, "POST", "/invites/redeem", { token });
        const session = await api<Row>(dm, "POST", `/campaigns/${campaign.id}/sessions`, {
          number: 1,
          visibility: "shared",
        });
        await api(dm, "PATCH", `/campaigns/${campaign.id}`, { currentSessionId: session.id });
        const encounter = await api<Row>(dm, "POST", `/campaigns/${campaign.id}/encounters`, {
          name: "Ambush in the reeds",
        });
        const run = await api<Row>(
          dm,
          "POST",
          `/campaigns/${campaign.id}/sessions/${session.id}/runs`,
          {
            encounterId: encounter.id,
            visibility: "shared",
          },
        );
        await api(
          dm,
          "POST",
          `/campaigns/${campaign.id}/sessions/${session.id}/runs/${run.id}/combatants`,
          {
            displayName: "Goblin",
            ac: 15,
            hpMax: 7,
            hpCurrent: 7,
            visibility: "shared",
          },
        );
        return { campaignId: campaign.id, sessionId: session.id, runId: run.id };
      });

    const runner = `/campaigns/${campaignId}/sessions/${sessionId}/runs/${runId}`;
    const rollsPath = `/campaigns/${campaignId}/sessions/${sessionId}/rolls`;
    const dock = (page: typeof dm) => page.getByRole("region", { name: "Rolls", exact: true });
    const latest = (page: typeof dm) => dock(page).getByRole("status", { name: "Latest roll" });
    const count = (page: typeof dm) => dock(page).getByRole("button", { name: /^Rolls/ });
    /**
     * The dock's count, which holds the night's log lines (the fight starting,
     * the goblin added) as well as rolls: once it has stopped moving, since
     * those lines arrive off the stream after the first paint.
     */
    const settled = async (page: typeof dm): Promise<number> => {
      const read = async () =>
        Number(/(\d+) in log/.exec((await count(page).textContent()) ?? "")?.[1] ?? Number.NaN);
      let last = await read();
      for (;;) {
        await page.waitForTimeout(500);
        const now = await read();
        if (now === last) return now;
        last = now;
      }
    };
    const lines = (n: number) => `${String(n)} in log`;

    const first =
      await test.step("a die rolled in the runner shows at once and is kept as the DM's", async () => {
        await dm.goto(runner);
        await expect(count(dm)).toContainText(/\d+ in log/);
        const before = await settled(dm);
        await dock(dm).getByRole("button", { name: "Roll a d20" }).click();
        await expect(latest(dm)).toContainText("d20");
        let saved: ReadonlyArray<SavedRoll> = [];
        await expect
          .poll(async () => {
            saved = await api<ReadonlyArray<SavedRoll>>(dm, "GET", rollsPath);
            return saved.length;
          })
          .toBe(1);
        const [roll] = saved;
        expect(roll).toMatchObject({
          label: "d20",
          visibility: "dm",
          kind: "plain",
          characterId: null,
        });
        await expect(latest(dm)).toContainText(String(roll!.total));
        // One line for it: the copy shown at once gave way to the saved one.
        await expect(count(dm)).toContainText(lines(before + 1));
        return { roll: roll!, logged: before + 1 };
      });

    await test.step("a reload reads the same log back", async () => {
      await dm.reload();
      await expect(latest(dm)).toContainText("d20");
      await expect(latest(dm)).toContainText(String(first.roll.total));
      await expect(count(dm)).toContainText(lines(first.logged));
    });

    await test.step("a second tab shows the same log, and what it rolls reaches the first", async () => {
      const second = await dmContext.newPage();
      await second.goto(runner);
      await expect(latest(second)).toContainText("d20");
      await expect(latest(second)).toContainText(String(first.roll.total));
      await expect(count(second)).toContainText(lines(first.logged));

      await dock(second).getByRole("button", { name: "Roll a d8" }).click();
      await expect(latest(second)).toContainText("d8");
      // The first tab learns of it from the doorbell, not from anything it did.
      await expect(latest(dm)).toContainText("d8");
      await expect(count(dm)).toContainText(lines(first.logged + 1));
      await expect(count(second)).toContainText(lines(first.logged + 1));
      await second.close();
    });

    await test.step("a player at the table is never answered a DM roll", async () => {
      expect(await api<ReadonlyArray<SavedRoll>>(player, "GET", rollsPath)).toEqual([]);
      expect(await apiStatus(player, `${rollsPath}/${first.roll.id}`)).toBe(404);
      // The DM's own read still has both.
      expect(await api<ReadonlyArray<SavedRoll>>(dm, "GET", rollsPath)).toHaveLength(2);
    });
  } finally {
    await dmContext.close();
    await playerContext.close();
  }
});
