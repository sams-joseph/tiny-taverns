import type { CampaignId, CharacterOption, OptionKind } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Button, Icon } from "@taverns/ui";
import { useState } from "react";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { EmptyState } from "../ui/states";
import { CopyOptionIn } from "./CopyOptionIn";
import { rulesAtom, type RulesView } from "./load";
import { isCampaignCopy } from "./option";
import { OptionCard } from "./OptionCard";
import { OptionDialog } from "./OptionDialog";
import { RemoveOptionDialog } from "./RemoveOptionDialog";

/**
 * **Rules** — the classes, species and backgrounds a character at this table is
 * built from.
 *
 * `#/campaigns/:campaignId/rules`, the sixth destination on the campaign row,
 * and the DM's half of the character-options feature. The other half is the
 * create form's three pickers, which read the same list this screen writes.
 *
 * ### What this screen is for, in one sentence
 *
 * A player cannot read their DM's Library — `libraryRowReadable` compares
 * `account_id` to the **reader's** account — so a homebrew class is unreachable
 * to the people who would pick it until it is copied into the campaign. This
 * screen is where that copy is made. It is not a convenience: without it the
 * feature does not work at all.
 *
 * ### The three lists that are not on it
 *
 * - **The Library itself.** Its own screen is not built, deliberately: nothing
 *   in the product draws an account's originals of *this* table yet, and a nav
 *   item is earned by a screen. What a DM can reach of it is exactly what they
 *   need here — *Copy from your library*, which lists the originals and copies
 *   one in. When a Library screen for options lands, this control is the read it
 *   is built from rather than a second one.
 * - **A "who is playing this" count.** Nothing can produce it: a character
 *   stores its class as a *label*, and two same-named classes in two campaigns
 *   are indistinguishable from it. That is the honest cost of having no
 *   `class_id`, and the pointer arrives at the slice where something reads it —
 *   the first plausible reader being exactly this count.
 * - **Anything about a subclass or a feat.** A subclass is a *child* of a class
 *   and needs a containment rule this table has none of; a feat is read by
 *   nothing in the product. Both are free text on the sheet today and work.
 *   **The background is here now** — it was held back from the first slice
 *   precisely because it changes the *seed* (2024's ability score increases
 *   moved onto it), which is a bigger change than adding a row type.
 *
 * ### It wears the campaign's frame, like every other campaign destination
 *
 * `CampaignChrome` carries the name in the bar, the way home, the session badge
 * and *Start session* — which are facts about the campaign rather than about
 * which of its screens is open. A screen that built its own `AppShell` would
 * silently have no session badge and no campaign action, which is exactly the
 * bug the Party and Chronicle screens shipped with. Its own two reads are
 * `rulesAtom`, passed as `extra`.
 *
 * The open dialogs live **above** the frame, the rule every campaign
 * destination follows: the top bar's buttons set them and the body reads them,
 * and two slots of one screen must not hold two copies of one answer.
 */

/** The subtitle: what this table offers, and how much of it the players can see. */
const summaryOf = (view: RulesView): string => {
  const count = (kind: OptionKind) => view.offered.filter((row) => row.kind === kind).length;
  const classes = count("class");
  const backgrounds = count("background");
  // Only a copy can be unshared — the bundle is written shared and is nobody's
  // to change here — so this counts what a DM can act on and nothing else.
  const hidden = view.offered.filter(
    (option) => isCampaignCopy(option) && option.visibility === "dm",
  ).length;
  const counted =
    `${String(classes)} class${classes === 1 ? "" : "es"}, ` +
    `${String(count("species"))} species, ` +
    `${String(backgrounds)} background${backgrounds === 1 ? "" : "s"}`;
  return hidden === 0 ? counted : `${counted} · ${String(hidden)} your players cannot pick yet`;
};

export function RulesScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  /** The option being written or edited, and which kind it is. */
  const [editing, setEditing] = useState<{
    readonly kind: OptionKind;
    readonly option: CharacterOption | undefined;
  }>();
  const [copying, setCopying] = useState(false);

  return (
    <CampaignChrome<RulesView>
      campaignId={campaignId}
      title="Rules"
      extra={rulesAtom(campaignId)}
      subtitle={({ extra }) => summaryOf(extra)}
      actions={() => (
        /* **Four controls, so they wrap** — the shell's own action slot is one
           unwrapped row, which is right for the two or three every other screen
           has. Written out here rather than in `AppShell` because it is this
           screen that is unusually wide, and the `min-w-0` is what lets the
           title beside it give way first. */
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setCopying(true)}>
            <Icon name="copy" size={14} />
            Copy from your library
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing({ kind: "background", option: undefined })}
          >
            <Icon name="plus" size={14} />
            Write a background
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing({ kind: "species", option: undefined })}
          >
            <Icon name="plus" size={14} />
            Write a species
          </Button>
          <Button size="sm" onClick={() => setEditing({ kind: "class", option: undefined })}>
            <Icon name="plus" size={14} />
            Write a class
          </Button>
        </div>
      )}
    >
      {(slots) => (
        <Rules
          slots={slots}
          campaignId={campaignId}
          editing={editing}
          onEdit={setEditing}
          copying={copying}
          onCopy={setCopying}
        />
      )}
    </CampaignChrome>
  );
}

function Rules({
  slots,
  campaignId,
  editing,
  onEdit,
  copying,
  onCopy,
}: {
  readonly slots: CampaignChromeSlots<RulesView>;
  readonly campaignId: CampaignId;
  readonly editing:
    { readonly kind: OptionKind; readonly option: CharacterOption | undefined } | undefined;
  readonly onEdit: (
    editing:
      { readonly kind: OptionKind; readonly option: CharacterOption | undefined } | undefined,
  ) => void;
  readonly copying: boolean;
  readonly onCopy: (copying: boolean) => void;
}) {
  const { extra } = slots;
  const [removing, setRemoving] = useState<CharacterOption>();

  const of = (kind: OptionKind) => extra.offered.filter((option) => option.kind === kind);

  return (
    <>
      <div className="flex flex-col gap-8">
        <Section
          title="Classes"
          options={of("class")}
          empty="No classes at all"
          emptyBody="This table has nothing to build a character from. Run the bundled ruleset importer, or write a class of your own with the button above."
          onEdit={(option) => onEdit({ kind: "class", option })}
          onRemove={setRemoving}
        />
        <Section
          title="Species"
          options={of("species")}
          empty="No species at all"
          emptyBody="This table has nothing to build a character from. Run the bundled ruleset importer, or write a species of your own with the button above."
          onEdit={(option) => onEdit({ kind: "species", option })}
          onRemove={setRemoving}
        />
        {/* **Third, and last on the page for the same reason it is third on the
            create form**: it is the pick that adjusts what the two above
            produced. The bundled sixteen all read *no ability score increases
            written down*, which is true and is the invitation — a table that
            plays the book's version writes its own here. */}
        <Section
          title="Backgrounds"
          options={of("background")}
          empty="No backgrounds at all"
          emptyBody="Run the bundled ruleset importer for the sixteen names, or write a background of your own with the button above — a background is where a new character's ability score increases come from."
          onEdit={(option) => onEdit({ kind: "background", option })}
          onRemove={setRemoving}
        />
      </div>

      {editing !== undefined && (
        <OptionDialog
          campaignId={campaignId}
          kind={editing.kind}
          option={editing.option}
          onClose={() => onEdit(undefined)}
          onSaved={() => onEdit(undefined)}
        />
      )}

      {copying && (
        <CopyOptionIn
          campaignId={campaignId}
          originals={extra.originals}
          offered={extra.offered}
          onClose={() => onCopy(false)}
          // **Stays open**, unlike every other dialog here, because copying two
          // things in is the ordinary case and closing after each one would
          // make setting up a table four presses per class. The list under it
          // redraws from the same read the write named.
          onCopied={() => undefined}
        />
      )}

      {removing !== undefined && (
        <RemoveOptionDialog
          campaignId={campaignId}
          option={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => setRemoving(undefined)}
        />
      )}
    </>
  );
}

/**
 * One of the two lists.
 *
 * Three labelled regions rather than tabs, the call `PartyScreen` makes about
 * its two: they are different questions about one table and each is short, so a
 * tab would hide two thirds of the answer behind a press.
 */
function Section({
  title,
  options,
  empty,
  emptyBody,
  onEdit,
  onRemove,
}: {
  readonly title: string;
  readonly options: ReadonlyArray<CharacterOption>;
  readonly empty: string;
  readonly emptyBody: string;
  readonly onEdit: (option: CharacterOption) => void;
  readonly onRemove: (option: CharacterOption) => void;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-display text-subtitle leading-snug font-semibold text-heading">
        {title}
      </h2>
      {options.length === 0 ? (
        <EmptyState icon="book-open" title={empty}>
          {emptyBody}
        </EmptyState>
      ) : (
        /* Two columns where the column is wide enough, because a bundled
           vocabulary is twenty-two rows and a single file of them is a page
           nobody reads to the end of. `@container` on the section and `@3xl`
           on the grid, never a viewport breakpoint: the question is how wide
           *this column* is, and the campaign frame's aside is not something a
           window width can see. */
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
            {options.map((option) => (
              <OptionCard key={option.id} option={option} onEdit={onEdit} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
