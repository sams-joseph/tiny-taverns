import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Button, Icon } from "@taverns/ui";
import { useState, type ReactNode } from "react";
import { HOB_COMMANDS, HOB_CONTEXT, HOB_STARTERS } from "./hob.fixtures";
import type { HobContextChip, HobStarter } from "./transcript";

/**
 * The chat building blocks — `ui_kits/dm-screen/ChatParts.jsx`, built out of the
 * shipped components and the theme's names.
 *
 * The prototype's inline styles and hand-rolled hover state are the visual
 * specification, not code to carry across: every value below is a token name
 * (`text-faint`, `rounded-pill`, `border-hairline`) or a step on the spacing
 * scale, and the panel's own width is the one measurement it introduces.
 */

/** Hob's face is the app's mark. `size` is the square edge, as `Icon` takes it. */
export function HobAvatar({ size = 28 }: { readonly size?: number }) {
  return (
    <img
      src={markUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0 rounded-sm border border-hairline"
    />
  );
}

/**
 * The "Knows" strip: context is shown, not asked for.
 *
 * The accented chip is whatever the DM has open — `live` on the fixture. It is
 * the one place the strip says something the DM did not have to tell it.
 */
export function ContextBar({
  chips = HOB_CONTEXT,
}: {
  readonly chips?: ReadonlyArray<HobContextChip>;
}) {
  return (
    <div
      aria-label="What Hob knows"
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-hairline bg-surface-sunken px-3 py-2"
    >
      <span className="mr-0.5 text-micro leading-snug font-medium tracking-caps uppercase text-faint">
        Knows
      </span>
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={
            chip.live === true
              ? "inline-flex items-center gap-1.5 rounded-pill border border-accent bg-accent-soft px-2 py-0.5 text-micro leading-snug text-accent-ink"
              : "inline-flex items-center gap-1.5 rounded-pill border border-strong px-2 py-0.5 text-micro leading-snug text-muted-foreground"
          }
        >
          <Icon name={chip.icon} size={11} />
          {chip.label}
        </span>
      ))}
    </div>
  );
}

/** What the DM said. Right-aligned, with the corner nearest the composer squared off. */
export function UserTurn({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex shrink-0 justify-end pl-10">
      <div className="rounded-card rounded-br-xs border border-strong bg-surface-raised px-3 py-2 text-body-s leading-body text-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * What Hob said, and — under it — the aside.
 *
 * Two voices, split by channel exactly as the kit's README requires: the reply
 * is plain and practical, one or two sentences; the persona is the italic
 * Alegreya line beneath it, at `--text-faint`, skippable by design.
 */
export function HobReply({
  children,
  aside,
}: {
  readonly children?: ReactNode;
  readonly aside?: string;
}) {
  return (
    <div className="flex shrink-0 gap-2.5">
      <HobAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        {children !== undefined && (
          <div className="text-body-s leading-body text-foreground">{children}</div>
        )}
        {aside !== undefined && (
          <div className="font-serif text-caption leading-body italic text-faint">{aside}</div>
        )}
      </div>
    </div>
  );
}

/**
 * An answer on its way.
 *
 * The designers drew one line here and `label` is that line, said more
 * precisely when there is something precise to say: *"Searching the record —
 * ferryman…"* while a tool call is out. That is not decoration — Hob's whole
 * claim is that its answers come out of the DM's own record, and the moment it
 * reaches for one is the only moment that claim is visible. It stays in the
 * persona's channel (italic Alegreya, `--text-faint`) because it is Hob
 * narrating itself rather than a control speaking.
 *
 * `role="status"` so a screen reader hears it arrive, and the default is the
 * delivered wording for the gap before the first tool call.
 */
export function Thinking({ label }: { readonly label?: string }) {
  return (
    <div role="status" className="flex shrink-0 items-center gap-2.5">
      <HobAvatar />
      <span className="font-serif text-caption leading-body italic text-faint">
        {label ?? "Hob is checking the ledger…"}
      </span>
    </div>
  );
}

/**
 * The composer.
 *
 * The slash menu is real and entirely local: it filters a fixed list of command
 * names as you type, which is a text-input affordance and not an answer. It
 * sits on `z-popup` — the rung anything anchored to a control takes, which is
 * above the `z-dialog` the panel itself takes when it is an overlay.
 *
 * `onSend` is optional, and its absence is the honest state of this product:
 * with no assistant behind the panel there is nowhere for a message to go, so
 * the panel renders `NothingListens` instead of this and no input is offered
 * that would swallow what the DM typed.
 */
export function Composer({
  onSend,
  placeholder = "Ask Hob, or type / for a command",
  showCommands = true,
}: {
  readonly onSend: (text: string) => void;
  readonly placeholder?: string;
  readonly showCommands?: boolean;
}) {
  const [value, setValue] = useState("");
  const matches = value.startsWith("/")
    ? HOB_COMMANDS.filter((command) => command.startsWith(value))
    : [];

  return (
    <div className="relative shrink-0 border-t border-hairline bg-surface-card p-3.5">
      {matches.length > 0 && (
        <ul
          aria-label="Commands"
          className="absolute right-3.5 bottom-[calc(100%-var(--s-2))] left-3.5 z-popup overflow-hidden rounded-card border border-strong bg-surface-raised shadow-3"
        >
          {matches.map((command, index) => (
            <li
              key={command}
              className={
                index === 0
                  ? "flex items-center gap-2 bg-accent-soft px-3 py-2 font-mono text-mono leading-snug font-medium text-accent-ink"
                  : "flex items-center gap-2 px-3 py-2 font-mono text-mono leading-snug font-medium text-muted-foreground"
              }
            >
              <Icon name="slash" size={12} />
              {command}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim() !== "") {
            onSend(value.trim());
            setValue("");
          }
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          aria-label="Ask Hob"
          className="h-control min-w-0 flex-1 rounded-control border border-strong bg-surface-sunken px-2.5 text-body-s text-foreground outline-none transition-control placeholder:text-faint focus-visible:border-accent focus-visible:ring-focus"
        />
        <Button size="icon" type="submit" aria-label="Send">
          <Icon name="arrow-up" size={16} />
        </Button>
      </form>

      {showCommands && (
        <div className="mt-2 flex flex-wrap gap-1">
          {HOB_COMMANDS.slice(0, 5).map((command) => (
            <button
              key={command}
              type="button"
              onClick={() => setValue(`${command} `)}
              className="h-6 cursor-pointer rounded-xs border border-hairline px-2 font-mono text-micro text-faint transition-control hover:border-strong hover:text-muted-foreground"
            >
              {command}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What sits where the composer would, when Hob cannot answer from here.
 *
 * This is the whole difference between a surface that is honest about its
 * limits and one that is not. An input here would accept a question, drop it,
 * and leave the DM waiting for an answer that was never going to come.
 *
 * The sentence is passed in because the two reasons are different and both are
 * actionable — no campaign in view, or no model configured on the server — and
 * "say what to do next, in two short sentences" is the voice guide's rule for
 * exactly this. `conversation.ts` is where they are written.
 */
export function NothingListens({ reason }: { readonly reason?: string }) {
  return (
    <div className="shrink-0 border-t border-hairline bg-surface-card p-3.5">
      <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
        <Icon name="info" size={14} className="mt-0.5 shrink-0 text-faint" />
        <span>{reason ?? "Hob cannot answer from here."}</span>
      </p>
    </div>
  );
}

/**
 * The empty state, which is the state every DM meets first.
 *
 * The kit's README defers this ("B stays the better empty state… not built
 * yet"), and B is what it points at: the centred mark, the question, and the
 * starter grid. One column rather than B's two, because 400px less the panel's
 * padding leaves 372px and a two-up starter card wraps its subtitle to three
 * lines. `onPick` is optional for the same reason `onSend` is.
 */
export function StarterGrid({
  starters = HOB_STARTERS,
  onPick,
}: {
  readonly starters?: ReadonlyArray<HobStarter>;
  readonly onPick?: (title: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {starters.map((starter) => (
        <button
          key={starter.title}
          type="button"
          disabled={onPick === undefined}
          onClick={() => onPick?.(starter.title)}
          className="flex flex-col gap-1 rounded-card border border-hairline bg-surface-raised px-3 py-2.5 text-left transition-control not-disabled:cursor-pointer not-disabled:hover:border-strong disabled:cursor-default"
        >
          <span className="flex items-center gap-2 text-accent-ink">
            <Icon name={starter.icon} size={14} />
            <span className="text-body-s leading-snug font-medium text-heading">
              {starter.title}
            </span>
          </span>
          <span className="text-caption leading-body text-muted-foreground">{starter.sub}</span>
        </button>
      ))}
    </div>
  );
}

/** The centred block above the starter grid. `ChatLayouts.jsx:142-148`. */
export function EmptyThread({ onPick }: { readonly onPick?: (title: string) => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-3.5">
      <div className="flex flex-col items-center px-2 pt-6 pb-1 text-center">
        <HobAvatar size={44} />
        <h3 className="mt-3 font-display text-display-s leading-tight font-semibold tracking-display text-heading">
          What are we building tonight?
        </h3>
        <p className="mt-1.5 text-body-s leading-body text-muted-foreground">
          I have your party, your notes and the eleven sessions behind you.
        </p>
      </div>
      <StarterGrid onPick={onPick} />
    </div>
  );
}
