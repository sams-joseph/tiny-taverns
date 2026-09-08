import type { CampaignId, Npc } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState, type ReactNode } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";
import {
  draftOf,
  emptyDraft,
  hasAdvanced,
  type NpcDraft,
  personaFrom,
  privateMaterialFrom,
} from "./persona";

/**
 * Writing an NPC — the builder, in the shipped dialog idiom.
 *
 * ### Basic first, and *Advanced* is a press
 *
 * The design's §4.3: the first screen must not be a wall of prompt
 * engineering. *Basic* is a name, a role, who they are and how they talk;
 * *Advanced* is everything else — pronouns, phrases, motives, boundaries, and
 * the creator-only material — behind one disclosure. It opens already shown
 * when an existing row has anything in it, so an edit never hides what was
 * written.
 *
 * ### Private material is its own section, and its own document
 *
 * *Secrets* and *Instructions from you* sit under their own heading, are
 * written into `privateMaterial` by `privateMaterialFrom`, and are never read
 * by `personaFrom`. The form cannot put a secret into the public document
 * because there is no field that reaches both — the secret-boundary decision,
 * spelled as two functions over two disjoint sets of keys.
 *
 * Each document is replaced whole on save, like a character sheet; the form
 * always holds the whole of both, so nothing it was not shown is lost.
 */

export function NpcDialog({
  campaignId,
  npc,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Absent for a new one. Present, and this edits it. */
  readonly npc: Npc | undefined;
  readonly onClose: () => void;
  readonly onSaved: (saved: Npc) => void;
}) {
  const [draft, setDraft] = useState<NpcDraft>(npc === undefined ? emptyDraft : draftOf(npc));
  const [advanced, setAdvanced] = useState(npc !== undefined && hasAdvanced(draft));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const set = (key: keyof NpcDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const problem = draft.name.trim() === "" ? "Give them a name." : undefined;

  const save = async () => {
    setShowProblems(true);
    if (problem !== undefined) return;
    const payload = {
      name: draft.name.trim(),
      role: draft.role.trim(),
      persona: personaFrom(draft),
      privateMaterial: privateMaterialFrom(draft),
    };
    const saved = await submit(
      (client) =>
        npc === undefined
          ? client.npcs.create({ params: { campaignId }, payload })
          : client.npcs.update({
              params: { campaignId, npcId: npc.id },
              // The version the form opened on: two tabs editing one persona
              // notice each other instead of silently overwriting.
              payload: { ...payload, expectedVersion: npc.version },
            }),
      npc === undefined ? [reads.npcs(campaignId)] : [reads.npcs(campaignId), reads.npc(npc.id)],
    );
    if (Result.isSuccess(saved)) onSaved(saved.success);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={npc === undefined ? "New NPC" : `Edit ${npc.name}`}
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{npc === undefined ? "New NPC" : `Edit ${npc.name}`}</DialogTitle>
          <DialogDescription>
            A person your players will meet. Give them a voice and a reason, then rehearse them
            before the night.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field label="Name" htmlFor="npc-name" error={showProblems ? problem : undefined}>
            <Input
              id="npc-name"
              placeholder="Cazril"
              value={draft.name}
              aria-invalid={showProblems && problem !== undefined}
              onChange={(event) => set("name")(event.target.value)}
            />
          </Field>

          <Field
            label="Role"
            htmlFor="npc-role"
            hint="One short line — where they stand in the world."
          >
            <Input
              id="npc-role"
              placeholder="The ferryman at the crossing"
              value={draft.role}
              onChange={(event) => set("role")(event.target.value)}
            />
          </Field>

          <Field
            label="Who they are"
            htmlFor="npc-summary"
            hint="A paragraph. What a player would learn in the first five minutes."
          >
            <Textarea
              id="npc-summary"
              placeholder="An old ferryman who takes names instead of coin, and remembers every one."
              value={draft.summary}
              onChange={(event) => set("summary")(event.target.value)}
            />
          </Field>

          <Field
            label="How they talk, and what they want"
            htmlFor="npc-manner"
            hint="Their manner of speaking and the thing under it. One paragraph is plenty."
          >
            <Textarea
              id="npc-manner"
              placeholder="Slow and dry. Answers a question with a smaller question. Wants to be left alone with the river."
              value={draft.manner}
              onChange={(event) => set("manner")(event.target.value)}
            />
          </Field>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={advanced}
              aria-controls="npc-advanced"
              onClick={() => setAdvanced((open) => !open)}
            >
              <Icon name={advanced ? "chevron-up" : "chevron-down"} size={14} />
              {advanced ? "Hide advanced" : "Advanced"}
            </Button>
          </div>

          {advanced && (
            <div id="npc-advanced" className="flex flex-col gap-6">
              <Section title="Identity">
                <div className="grid gap-4 @md:grid-cols-2">
                  <Field label="Pronouns" htmlFor="npc-pronouns">
                    <Input
                      id="npc-pronouns"
                      placeholder="he/him"
                      value={draft.pronouns}
                      onChange={(event) => set("pronouns")(event.target.value)}
                    />
                  </Field>
                  <Field label="Pronunciation" htmlFor="npc-pronunciation">
                    <Input
                      id="npc-pronunciation"
                      placeholder="KAZ-ril"
                      value={draft.pronunciation}
                      onChange={(event) => set("pronunciation")(event.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Voice">
                <Field label="Phrases they use" htmlFor="npc-phrases" hint="One per line.">
                  <Textarea
                    id="npc-phrases"
                    className="min-h-16"
                    placeholder={"Names keep. Coin sinks.\nThe water knows."}
                    value={draft.phrases}
                    onChange={(event) => set("phrases")(event.target.value)}
                  />
                </Field>
                <Field
                  label="Lines they have said"
                  htmlFor="npc-example-lines"
                  hint="Verbatim, one per line. The best teacher of a voice."
                >
                  <Textarea
                    id="npc-example-lines"
                    className="min-h-16"
                    placeholder="You will want to be across before the reeds go quiet."
                    value={draft.exampleLines}
                    onChange={(event) => set("exampleLines")(event.target.value)}
                  />
                </Field>
              </Section>

              <Section title="Motives">
                <div className="grid gap-4 @md:grid-cols-2">
                  <Field label="Wants" htmlFor="npc-wants">
                    <Textarea
                      id="npc-wants"
                      className="min-h-16"
                      value={draft.wants}
                      onChange={(event) => set("wants")(event.target.value)}
                    />
                  </Field>
                  <Field label="Fears" htmlFor="npc-fears">
                    <Textarea
                      id="npc-fears"
                      className="min-h-16"
                      value={draft.fears}
                      onChange={(event) => set("fears")(event.target.value)}
                    />
                  </Field>
                  <Field label="Loyalties" htmlFor="npc-loyalties">
                    <Textarea
                      id="npc-loyalties"
                      className="min-h-16"
                      value={draft.loyalties}
                      onChange={(event) => set("loyalties")(event.target.value)}
                    />
                  </Field>
                  <Field label="Attitude to the party" htmlFor="npc-attitude">
                    <Textarea
                      id="npc-attitude"
                      className="min-h-16"
                      value={draft.attitude}
                      onChange={(event) => set("attitude")(event.target.value)}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Boundaries"
                lede="What they will not go into — behaviour, not facts. A secret goes below."
              >
                <Field label="Dodges" htmlFor="npc-dodges" hint="One per line.">
                  <Textarea
                    id="npc-dodges"
                    className="min-h-16"
                    placeholder="Who pays him"
                    value={draft.dodges}
                    onChange={(event) => set("dodges")(event.target.value)}
                  />
                </Field>
                <Field label="Refuses outright" htmlFor="npc-refuses" hint="One per line.">
                  <Textarea
                    id="npc-refuses"
                    className="min-h-16"
                    placeholder="Naming the hag"
                    value={draft.refuses}
                    onChange={(event) => set("refuses")(event.target.value)}
                  />
                </Field>
                <Field label="Says to ask the DM" htmlFor="npc-asks-dm" hint="One per line.">
                  <Textarea
                    id="npc-asks-dm"
                    className="min-h-16"
                    placeholder="Anything about the crate"
                    value={draft.asksTheDm}
                    onChange={(event) => set("asksTheDm")(event.target.value)}
                  />
                </Field>
              </Section>

              <Section
                title="Private material"
                lede="Only you see this, and only your own rehearsal uses it. It is kept apart from everything above so a player channel can never be shown it."
                tone="private"
              >
                <Field
                  label="Secrets"
                  htmlFor="npc-secrets"
                  hint="What is true and must not be said."
                >
                  <Textarea
                    id="npc-secrets"
                    placeholder="The hag pays him in years. He has three left."
                    value={draft.secrets}
                    onChange={(event) => set("secrets")(event.target.value)}
                  />
                </Field>
                <Field
                  label="Instructions from you"
                  htmlFor="npc-instructions"
                  hint="How you want them played, beyond what the voice says."
                >
                  <Textarea
                    id="npc-instructions"
                    placeholder="If asked about the crate twice, go silent and pole faster."
                    value={draft.instructions}
                    onChange={(event) => set("instructions")(event.target.value)}
                  />
                </Field>
              </Section>
            </div>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : npc === undefined ? "Create NPC" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One labelled run of the advanced half. */
function Section({
  title,
  lede,
  tone = "public",
  children,
}: {
  readonly title: string;
  readonly lede?: string;
  readonly tone?: "public" | "private";
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={
        tone === "private"
          ? "flex flex-col gap-4 rounded-card border border-strong bg-surface-sunken p-4"
          : "flex flex-col gap-4 border-t border-hairline pt-4"
      }
    >
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-display text-body leading-title font-semibold text-heading">
          {tone === "private" && <Icon name="lock" size={14} className="text-faint" />}
          {title}
        </h3>
        {lede !== undefined && (
          <p className="text-caption leading-body text-muted-foreground">{lede}</p>
        )}
      </div>
      {children}
    </section>
  );
}
