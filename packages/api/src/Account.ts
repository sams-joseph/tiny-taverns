import { Schema } from "effect";
import { AccountId } from "./Ids.js";

/**
 * Who the credential belongs to — the answer `GET /me` gives.
 *
 * **It is the answer to "who am I", and it is deliberately not an account
 * record.** Everything else in `/me` says what this account *has* — the tables
 * it is at, the characters it plays — and until this existed nothing said who it
 * *is*, so a screen that wanted to name the reader had to count something
 * instead. See `characters/sheet.ts`'s `rosterSummary`, which is the placeholder
 * this replaced.
 *
 * ### Two fields, and each one is here because something reads it
 *
 * - **`name`** — the display name, which is what the request was for. It is the
 *   same string `CampaignMember.name` carries about somebody else, read from the
 *   one end that needs no gate.
 * - **`id`** — the join key, and the only field that is not merely decoration.
 *   `CampaignMember.accountId` and `Character.accountId` are already on the
 *   wire and a client has no way to tell which of them is the reader's; the
 *   party screen says so out loud, declining to badge a roster row *You*
 *   because it cannot know. It is not a secret — it is the value every one of
 *   those rows already carries — and it is what a client would otherwise have
 *   to infer.
 *
 * ### What is deliberately absent
 *
 * - **`createdAt`.** No screen draws when an account was made, and a field with
 *   no reader is the stubbed-field rule met one layer earlier.
 * - **`clerkUserId`.** The vendor's subject lives below the identity seam and is
 *   named in exactly one column and one module (`apps/server/src/Accounts.ts`);
 *   putting it on the wire would make the vendor part of the contract, which is
 *   the whole thing `IdentityProvider` exists to prevent.
 * - **An email address, and anything else a provider knows.** There is no such
 *   column, and adding one would mean a Backend API call and a secret key this
 *   server deliberately does not have. See `Accounts.ts`'s
 *   `DEFAULT_ACCOUNT_NAME`, which is the same decision from the other side.
 *
 * ### It cannot become a lookup
 *
 * The endpoint takes no parameter and no payload, so there is nowhere for a
 * caller to name an account, and the row read is `CurrentActor`'s — the same
 * property that makes `me.updateCharacter` safe, one level simpler because
 * there is not even a row id in the path. It answers with no error type at all:
 * an actor exists by the time a handler runs, so "no such account" is not a
 * state this read can be in.
 */
export class AccountIdentity extends Schema.Class<AccountIdentity>("AccountIdentity")({
  id: AccountId,
  name: Schema.String,
}) {}
