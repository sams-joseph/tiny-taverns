import type { Random } from "@taverns/api";
import { Context, Layer } from "effect";
import { randomInt } from "node:crypto";

/**
 * **The server's dice**, for the one kind of roll the server makes: a
 * monster's turn Hob proposed and the DM kept (`repo/NpcTurns.ts`). Every
 * other roll is thrown in a browser and filed; the DM's own dice stay theirs.
 *
 * A service so a test can say what the dice come up: `random` is the source
 * every face is read from (`packages/api`'s `Dice.ts` and `Attack.ts`), and
 * `Dice.fixed` hands it a scripted one.
 */
export class Dice extends Context.Service<Dice, { readonly random: Random }>()("Dice") {
  /** A face from the operating system's CSPRNG: 2³² equally likely steps in `[0, 1)`. */
  static readonly layer: Layer.Layer<Dice> = Layer.succeed(this)({
    random: () => randomInt(0, 2 ** 32) / 2 ** 32,
  });

  /** Dice that come up as `random` says, for tests. */
  static readonly fixed = (random: Random): Layer.Layer<Dice> => Layer.succeed(this)({ random });
}
