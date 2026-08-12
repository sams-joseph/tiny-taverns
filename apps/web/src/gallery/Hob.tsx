import { Button, Icon } from "@taverns/ui";
import { useCallback, useState, type ReactNode } from "react";
import { Hob } from "../hob/Hob";
import { HobDock, HobRegion } from "../hob/HobDock";
import { HobPanel } from "../hob/HobPanel";
import {
  HOB_CONTEXT,
  SAMPLE_CHECKLIST,
  SAMPLE_NPC,
  SAMPLE_RULES,
  SAMPLE_THREAD,
} from "../hob/hob.fixtures";
import { HOB_INLINE_MIN, useHobPanel } from "../hob/useHobPanel";
import type { HobArtifact, HobTurn } from "../hob/transcript";
import { Caption, Section, Specimen } from "./Layout";

/**
 * The Hob panel, as a specimen.
 *
 * Hob answers now — on the four campaign screens, where its tools have a
 * campaign to read. The specimens stay here because a gallery is where a
 * surface goes to be *looked at*: these are the states the designers drew, held
 * still, and this is the only place in the app where the delivered sample
 * thread is allowed to render. A panel that appeared to hold a conversation the
 * DM never had is the failure this area is most able to cause.
 *
 * `SeamSpecimen` below mounts the real thing, with no campaign — so it shows the
 * honest *there is no campaign in view* state rather than a composer with
 * nowhere to send. See `hob/conversation.ts`.
 *
 * The specimens are bounded boxes rather than the shell's own layout, so the
 * overlay's `absolute` positions inside the specimen and you can see both modes
 * on one screen. `inline` is passed explicitly for the same reason; in the app
 * it comes from `useHobPanel`, which measures the viewport against
 * `HOB_INLINE_MIN`.
 */

/** A stand-in for the content the panel sits beside, so the two modes read differently. */
function Backdrop() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto bg-surface-page p-card">
      <span className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
        Session 12 prep
      </span>
      <div className="grid grid-cols-2 gap-3">
        {[
          "Ambush in the reeds",
          "The ferryman's price",
          "Song in the reeds",
          "The long crossing",
        ].map((name) => (
          <div
            key={name}
            className="rounded-card border border-hairline bg-surface-card p-3.5 text-body-s leading-snug font-medium text-heading shadow-1"
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

function DockSpecimen({ inline }: { readonly inline: boolean }) {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Box>
      <HobRegion>
        <Backdrop />
        <HobDock open={open} inline={inline} turns={[]} onClose={close} />
      </HobRegion>
      {!open && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3"
          onClick={() => setOpen(true)}
        >
          <Icon name="sparkles" size={14} />
          Ask Hob
        </Button>
      )}
    </Box>
  );
}

/**
 * The whole mount, exactly as a shell does it: `HobRegion` around the content,
 * `Hob` as its last child, and `useHobPanel` owning open/inline and the ⌘K
 * binding. This specimen is the seam — if it renders, the shell's version will.
 * `inline` here is measured from the real viewport, so resizing the window
 * flips this box between the two modes at 1020.
 */
function SeamSpecimen({ hob }: { readonly hob: ReturnType<typeof useHobPanel> }) {
  return (
    <Box>
      <HobRegion>
        <Backdrop />
        <Hob hob={hob} />
      </HobRegion>
    </Box>
  );
}

/** A bounded stand-in for the viewport, so an overlay covers the specimen and not the page. */
function Box({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative flex h-165 w-full flex-col overflow-hidden rounded-card border border-hairline">
      {children}
    </div>
  );
}

/**
 * The thread, with every control live.
 *
 * The handlers are local and do only what they say: a save marks the card
 * saved, a discard removes the turn, a rename renames it. **None of them
 * invents a reply** — `onSend` appends the DM's own message and stops there,
 * which is exactly what would happen if you typed into a panel with nothing
 * behind it, and is the difference between showing the composer and faking an
 * assistant.
 */
function ThreadSpecimen() {
  const [turns, setTurns] = useState<ReadonlyArray<HobTurn>>(SAMPLE_THREAD);
  const [saved, setSaved] = useState<ReadonlyArray<string>>([]);

  return (
    <div className="flex h-150 w-100 max-w-full overflow-hidden rounded-card border border-hairline">
      <HobPanel
        context={HOB_CONTEXT}
        turns={turns}
        savedArtifactIds={saved}
        onSend={(text) =>
          setTurns((current) => [
            ...current,
            { id: `local-${String(current.length)}`, who: "user", text },
          ])
        }
        onSave={(artifact: HobArtifact) => setSaved((current) => [...current, artifact.id])}
        onDiscard={(artifact: HobArtifact) =>
          setTurns((current) =>
            current.filter((turn) => turn.who !== "artifact" || turn.artifact.id !== artifact.id),
          )
        }
        onRename={(artifact: HobArtifact, title: string) =>
          setTurns((current) =>
            current.map((turn) =>
              turn.who === "artifact" && turn.artifact.id === artifact.id
                ? { ...turn, artifact: { ...turn.artifact, title } }
                : turn,
            ),
          )
        }
        onNewThread={() => {
          setTurns(SAMPLE_THREAD);
          setSaved([]);
        }}
      />
    </div>
  );
}

function KindsSpecimen() {
  return (
    <div className="flex h-150 w-100 max-w-full overflow-hidden rounded-card border border-hairline">
      <HobPanel
        context={HOB_CONTEXT}
        turns={[
          { id: "k1", who: "hob", text: "He wants a courier, and he won't say who for." },
          { id: "k2", who: "artifact", artifact: SAMPLE_NPC },
          { id: "k3", who: "artifact", artifact: SAMPLE_CHECKLIST },
          { id: "k4", who: "hob", text: "Difficult terrain, in short:" },
          { id: "k5", who: "artifact", artifact: SAMPLE_RULES },
        ]}
        thinking
      />
    </div>
  );
}

export function HobSection() {
  // Open by default, as the kit specifies and as `useHobPanel` defaults.
  const hob = useHobPanel();

  return (
    <Section
      id="hob"
      title="Hob"
      blurb="The assistant panel — Option A of the designers' three: a fixed-width column that stays open beside the prep UI. Hob answers on the campaign screens; these specimens are its states held still, driven by the delivered fixtures."
    >
      <Specimen
        label="Empty, and inline"
        note={`beside the content · viewport at least ${String(HOB_INLINE_MIN)} wide`}
      >
        <DockSpecimen inline />
        <Caption>
          The state every DM meets first. Here the starter cards are inert and the composer is
          replaced by a line saying so, because this specimen is given no handlers — the same honest
          state a screen shows when no model is configured.
        </Caption>
      </Specimen>

      <Specimen
        label="Empty, as an overlay"
        note={`viewport under ${String(HOB_INLINE_MIN)} · z-scrim under z-dialog`}
      >
        <DockSpecimen inline={false} />
        <Caption>
          Below the threshold there is no room for the content and the panel side by side, so it
          covers the content instead of squeezing it. Two rungs of the layering scale, never one —
          click the scrim to dismiss.
        </Caption>
      </Specimen>

      <Specimen label="A thread" note="the delivered sample · every control live">
        <ThreadSpecimen />
        <Caption>
          Messages, the aside in italic Alegreya, and the artifact card: click the title to rename
          it, Save to session for the saved state. Sending appends your own message and nothing
          else.
        </Caption>
      </Specimen>

      <Specimen label="Artifact kinds, and thinking" note="npc · prep list · rules answer">
        <KindsSpecimen />
        <Caption>
          A rules answer carries no Save — “nothing to save, this one’s just an answer”. The
          controls here are disabled because no handler was given, which is the same mechanism the
          app uses.
        </Caption>
      </Specimen>

      <Specimen label="The mount, and the opener" note="⌘K toggles · Esc closes">
        <Button variant="secondary" onClick={hob.toggle}>
          <Icon name="sparkles" size={16} />
          Ask Hob
        </Button>
        <Caption>
          {hob.open ? "Open" : "Closed"} · {hob.inline ? "inline" : "overlay"} at this viewport. The
          shell owns the real button; this one drives the mount below, which is the seam itself —
          resize the window past {String(HOB_INLINE_MIN)} and it changes mode.
        </Caption>
        <SeamSpecimen hob={hob} />
      </Specimen>
    </Section>
  );
}
