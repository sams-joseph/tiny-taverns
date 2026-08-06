import { Context, Effect, Layer, Option } from "effect";

/**
 * A person, as some external identity provider has just vouched for them.
 *
 * This is the whole vocabulary the rest of the server has for a hosted
 * sign-in: a stable id, and a name if the provider volunteered one. It is a
 * *local* shape on purpose — no provider's claim type is ever handed across
 * this boundary. Two reasons, and they agree:
 *
 *  - Design: a reader of this file cannot tell which vendor is behind it, so
 *    replacing the vendor is a new layer rather than an audit.
 *  - The compiler: under pnpm's isolated layout the SDK's claim types live in
 *    a *transitive* dependency, which `apps/server` cannot name. An exported
 *    signature that infers one fails with TS2742. Mapping at the edge is the
 *    only shape that compiles, so the boundary cannot rot without noticing.
 */
export interface VerifiedIdentity {
  /**
   * The provider's own id for this person — opaque, stable, and never a
   * foreign key target. `account.id` remains the identity everything else
   * joins on.
   */
  readonly subject: string;
  /**
   * A display name, when the provider offered one. Session tokens generally
   * carry no name unless the provider is configured to add it, so `None` is
   * the ordinary case and not an error: `Accounts` supplies the fallback.
   */
  readonly name: Option.Option<string>;
}

/**
 * Turns a credential minted by a hosted sign-in into a `VerifiedIdentity`.
 *
 * Deliberately narrow. It verifies; it does not read the database, mint an
 * `Actor`, or decide what an unknown person is entitled to — provisioning
 * belongs to `Accounts`, which owns the account table, and authorization
 * belongs to `Authorization`. A second provider therefore has to supply
 * exactly one thing: "is this credential genuine, and whose is it?"
 *
 * `None` means "not a credential I recognise", which covers every ordinary
 * rejection — unknown signer, expired, malformed, wrong audience. The error
 * channel is `never` because none of those is a server fault; a credential
 * that fails to verify is simply not a credential. Misconfiguration is caught
 * during layer construction instead, where it can fail loudly at boot.
 */
export class IdentityProvider extends Context.Service<
  IdentityProvider,
  {
    readonly verify: (credential: string) => Effect.Effect<Option.Option<VerifiedIdentity>>;
  }
>()("IdentityProvider") {
  /**
   * No hosted sign-in is configured: nothing verifies, so every credential
   * that reaches here is unknown.
   *
   * This is load-bearing rather than a nicety. It is what lets someone who has
   * never opened a provider's dashboard run `pnpm -F server dev` and the whole
   * test suite — the machine-token path is untouched, and a session-token
   * shaped credential is rejected exactly like any other unknown one. Making
   * the verification key required would quietly turn an opt-in dependency into
   * a mandatory one.
   */
  static readonly disabled: Layer.Layer<IdentityProvider> = Layer.succeed(this)({
    verify: () => Effect.succeedNone,
  });
}
