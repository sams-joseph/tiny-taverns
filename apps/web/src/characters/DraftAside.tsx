import { Button, Icon } from "@taverns/ui";
import { useState } from "react";
import { Textarea } from "../ui/form";
import { REDRAFTS } from "./draft";
import { SheetSection } from "./SheetParts";

/**
 * **What Hob did, and how to ask for something else** — the drawing's step 2
 * aside (`CharacterCreate.jsx:202-235`), built.
 *
 * ### The reasons are the assistant's own, and are on the proposal
 *
 * `rationale` is a parameter of `proposeCharacter` rather than something this
 * screen derives, and that is the whole reason the aside is honest: *"Wisdom is
 * highest because druid casting keys off it, and you described someone who
 * watches"* is a fact about **this** draft that no column records. It survives a
 * reload with the card because it is stored on the turn beside the sheet, and it
 * is deliberately *not* copied onto the accepted row — a character sheet has
 * nowhere to keep an argument, and `origin: 'assistant'` is the provenance the
 * row itself owes.
 *
 * A draft with no reasons draws no section rather than an empty one. A small
 * model that filled in the sheet and skipped the argument still made a usable
 * character, and a heading over nothing would say it had not.
 *
 * ### The redraft loop is here, before the accept, and only here
 *
 * The drawing docks this composer beside step 2, which is *before* a row
 * exists, and that is the only place it can be. After the accept there is a real
 * character being edited on the shipped sheet, and a redraft then would either
 * make a **second** character (a second accept is a second row) or silently
 * overwrite corrections Hob cannot see — the limitation §4.3 of the plan names.
 * So the loop lives entirely on this screen: ask, look, ask again, keep once.
 *
 * The chips are the delivery's four, sent as ordinary questions. They are fixed
 * client-side text unlike the chat panel's `HobArtifact.chips`, which is empty
 * on purpose — there a refinement chip is copy the assistant is supposed to
 * author; here they are the four changes a player asks for whatever was
 * drafted.
 */
export function DraftAside({
  rationale,
  onAsk,
  busy,
}: {
  readonly rationale: ReadonlyArray<string>;
  readonly onAsk: (text: string) => void;
  readonly busy: boolean;
}) {
  const [text, setText] = useState("");

  const send = (question: string) => {
    if (busy || question.trim() === "") return;
    setText("");
    onAsk(question.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      {rationale.length > 0 && (
        <SheetSection title="What Hob did">
          <div className="flex flex-col gap-4">
            {rationale.map((line) => (
              <div key={line} className="flex gap-2.5">
                <Icon
                  name="corner-down-right"
                  size={13}
                  className="mt-0.5 shrink-0 text-accent-ink"
                />
                <span className="min-w-0 flex-1 text-caption leading-body text-muted-foreground">
                  {line}
                </span>
              </div>
            ))}
          </div>
          {/* The delivery's own line, and it is doing real work: it is what
              makes the read-only card above legible as a starting point rather
              than as a result. */}
          <p className="mt-6 border-t border-hairline pt-5 font-display text-caption leading-body italic text-faint">
            Every one of these is a guess. Ask for a change and Hob will redo the rest around it.
          </p>
        </SheetSection>
      )}

      <SheetSection title="Ask for a change">
        <Textarea
          aria-label="Ask Hob for a change"
          placeholder="Make her a ranger instead"
          rows={3}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, shift-enter breaks the line — the composer idiom the
            // chat panel already uses, so the two surfaces do not disagree
            // about what the key means.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(text);
            }
          }}
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={busy || text.trim() === ""} onClick={() => send(text)}>
            <Icon name="sparkles" size={13} />
            Ask again
          </Button>
          {REDRAFTS.map((chip) => (
            <Button
              key={chip}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => send(chip)}
            >
              {chip}
            </Button>
          ))}
        </div>
      </SheetSection>
    </div>
  );
}
