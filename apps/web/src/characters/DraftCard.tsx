import { Badge, Button, Icon } from "@taverns/ui";
import type { CharacterProposal } from "./draft";
import { Portrait, SheetSection } from "./SheetParts";
import { AbilityCell } from "./SheetParts";

/**
 * **What Hob drafted, as the drawing's step 2** — and deliberately read-only.
 *
 * `ui_kits/dm-screen/CharacterCreate.jsx` draws every field of this with a
 * `DraftField` that edits in place, under a comment saying *"the draft is a
 * starting point, not a result"*. The intent is kept and the mechanism is not,
 * for two reasons and the first one is a security property:
 *
 * - **Accept takes no content.** `repo/Proposals.ts` is explicit that *if
 *   accept took the content instead, any client could post its own prose and
 *   have it recorded as the assistant's*. So an edited draft is not a thing the
 *   wire can carry: the sequence has to be Hob proposes → the player keeps it
 *   as it stands → the row exists with `origin: 'assistant'` → every correction
 *   from there is an ordinary `PATCH /me/characters/:id`. An edit-then-accept
 *   flow is the obvious shape and it breaks that.
 * - **`DraftField` is a third editing idiom** in a product with two, and the
 *   least accessible of the three. The shipped sheet's dialogs already satisfy
 *   *"every field Hob filled in is editable"* — one press later, against a real
 *   row, with the abilities and skills editors slice 2 built.
 *
 * So this draws the draft and the two ways to change it: **ask Hob again**
 * (which is what the aside beside it is for) or **keep it and edit the sheet**.
 *
 * ### What it does not draw, and why
 *
 * The portrait upload (the kit wires it to *"Not wired in this kit"*; there is
 * no asset store), *Roll again* (the tool takes no numbers at all — the server
 * assigns the standard array, and rolling belongs to the sheet's abilities
 * editor where the dice already live), and the skills picker's *"N of 4
 * picked"* counter (a background, a feat and expertise all grant more, so a
 * sheet that held the limit would tell a level-9 rogue their sheet is wrong —
 * the same call `SkillsDialog` made).
 */
export function DraftCard({
  draft,
  onKeep,
  onRewrite,
  keeping,
}: {
  readonly draft: CharacterProposal;
  readonly onKeep: () => void;
  readonly onRewrite: () => void;
  readonly keeping: boolean;
}) {
  const sheet = draft.sheet;
  const line = [draft.species, draft.className].filter((part) => part !== null).join(" ");
  const kit = sheet.inventory ?? [];
  const skills = sheet.skills ?? [];
  const story = sheet.story;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SheetSection title="Who they are">
        <div className="flex items-start gap-3.5 pb-5">
          <Portrait name={draft.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-display-s leading-tight font-semibold text-heading">
              {draft.name}
            </div>
            {/* Level is deliberately absent rather than shown as 1: `level` is
                not a parameter of the tool and the accepted row takes the
                column default, so a "Level 1" here would be a number nothing
                sent. It appears under the name on the sheet the moment the
                player sets one. */}
            <div className="mt-1 text-body-s leading-body text-muted-foreground">
              {[line, sheet.identity?.subclass]
                .filter((part) => part !== undefined && part !== "")
                .join(" · ")}
            </div>
          </div>
        </div>
        {sheet.identity?.background !== undefined && (
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="w-24 shrink-0 text-micro leading-body tracking-caps uppercase text-faint">
              Background
            </span>
            <span className="min-w-0 flex-1 text-body-s leading-body text-foreground">
              {sheet.identity.background}
            </span>
          </div>
        )}
      </SheetSection>

      <SheetSection title="Abilities" aside="Standard array, assigned to fit what you wrote">
        <div className="grid grid-cols-3 gap-1.5 @md:grid-cols-6">
          {sheet.abilities.map((ability) => (
            <AbilityCell key={ability.label} ability={ability} />
          ))}
        </div>
      </SheetSection>

      {skills.length > 0 && (
        <SheetSection title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill.name} variant="outline">
                {skill.name}
              </Badge>
            ))}
          </div>
        </SheetSection>
      )}

      {kit.length > 0 && (
        <SheetSection title="Starting kit">
          <div className="flex flex-wrap gap-1.5">
            {kit.map((item) => (
              <Badge key={item.name} variant="outline">
                {item.name}
              </Badge>
            ))}
          </div>
        </SheetSection>
      )}

      {(sheet.notes !== "" ||
        story?.bond !== undefined ||
        story?.ideal !== undefined ||
        story?.flaw !== undefined) && (
        <SheetSection title="Story">
          <div className="flex flex-col gap-4">
            {sheet.notes !== "" && (
              <p className="font-display text-body-m leading-body whitespace-pre-wrap text-foreground">
                {sheet.notes}
              </p>
            )}
            {story?.bond !== undefined && <StoryLine label="Bond" value={story.bond} />}
            {story?.ideal !== undefined && <StoryLine label="Ideal" value={story.ideal} />}
            {story?.flaw !== undefined && <StoryLine label="Flaw" value={story.flaw} />}
          </div>
        </SheetSection>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* *This is her* in the drawing. It is the accept, and it is the point
            at which a real row exists — so the label says what happens next
            rather than agreeing with a draft. */}
        <Button size="sm" disabled={keeping} onClick={onKeep}>
          {keeping ? "Keeping…" : "Keep them"}
          <Icon name="chevron-right" size={13} />
        </Button>
        <Button variant="secondary" size="sm" disabled={keeping} onClick={onRewrite}>
          <Icon name="chevron-left" size={13} />
          Rewrite the description
        </Button>
      </div>
    </div>
  );
}

function StoryLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="w-24 shrink-0 text-micro leading-body tracking-caps uppercase text-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-body-s leading-body text-foreground">{value}</span>
    </div>
  );
}
