import type { CampaignId, CharacterId, Equipment, OwnedCharacter } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Icon,
  sectionHeadingVariants,
  BackLink,
  Loading,
} from "@taverns/ui";

import { Atom } from "effect/unstable/reactivity";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { TopBar } from "../shell/TopBar";
import { SaveFailure } from "../ui/form";
import { AbilitiesDialog } from "./AbilitiesDialog";
import { AddToCampaignDialog } from "./AddToCampaignDialog";
import { campaignsAvailableToJoin } from "./join";
import { BackstoryDialog } from "./BackstoryDialog";
import { DeleteCharacterDialog } from "./DeleteCharacterDialog";
import { GearDialog } from "./GearDialog";
import { IdentityDialog } from "./IdentityDialog";
import { SkillsDialog } from "./SkillsDialog";
import { SpellPickerDialog } from "./SpellPickerDialog";
import { type LiveBanner, liveBanner } from "./live";
import { loadCharacterSheet } from "./load";
import { drawnSections, hitPoints, sectionInView, type SheetSectionId } from "./sheet";
import { CharacterPortrait } from "./CharacterPortrait";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { DeathSaveRow, HpTrack, SectionSpine, StatPill } from "./SheetParts";
import { SheetDocument } from "./SheetDocument";
import { ownCharacterWrites, restOwnCharacter, saveOwnCharacter, sheetWith } from "./write";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * One character, whole — `ui_kits/dm-screen/CharacterSheetB.jsx` (the seventh
 * delivery's *"Variant B — one continuous sheet, no tabs"*) against the real
 * API, and **the one screen in the product where somebody who is not a DM
 * writes.**
 *
 * ### The shape: three columns, one document, and a spine
 *
 * Wide, the drawing is a `252px / minmax(0,1fr) / 186px` grid: a sticky
 * identity card, one continuous column of sections, and a sticky **spine** — a
 * table of contents whose lit item follows the reader's scroll and whose press
 * scrolls the reader to a section. Narrow, the same single surface: the card
 * collapses to a two-line summary that expands on a press, the spine flattens
 * into a sticky rail of pills, and every two-column grid inside the document
 * becomes one. The threshold is the app's container idiom rather than the
 * drawing's `window.innerWidth < 900`: `main` is the `@container`, and `@3xl`
 * is the step at which a 900px window's column (836px, inside the page gutter)
 * is wide enough for the three tracks — the same step the tabbed sheet already
 * used for its two. Inside the middle column the document is its **own**
 * container, so a grid there turns over on the width the column actually has,
 * which the Hob panel can take 400px out of without the window moving.
 *
 * The sheet scrolls with the window, like every screen. Both sticky columns
 * and the scroll-spy's reading line sit under the shell's sticky chrome, whose
 * height depends on the route, so they read it from `--chrome-height`, which
 * `AppShell` measures and publishes, rather than copying it.
 *
 * ### Where each thing on it comes from
 *
 * Nine columns and one `jsonb` document, and the split is the one `Character.ts`
 * argues: name, player, level, race, subrace, class, AC, hit points, temp,
 * conditions and `sheetUrl` are columns; the thirty-odd fields the drawing adds
 * are optional keys on `sheet`, which is why the whole of this screen cost no
 * migration. `descriptor` is generated from the identity columns and is drawn
 * once, under the name — never recomputed here, because a second implementation
 * of it is exactly what the generated column exists to prevent.
 *
 * ### Which sections are drawn
 *
 * `drawnSections(sheet, true)` in `sheet.ts` — the tabbed sheet's `sheetTabs`
 * rule, spelled over the seven sections the continuous sheet has. *Abilities &
 * skills*, *Gear & coin* and *Story* are drawn on a writable sheet whether or
 * not they hold anything, because each carries the affordance that creates its
 * own contents; *Actions*, *Spellcasting*, *Features & traits* and *Level ups*
 * appear only when the document fills them. Spellcasting is editable once it
 * exists because the authoritative picker needs the class context already on
 * the row; the others remain content-driven. The spine lists exactly the drawn
 * sections and nothing else.
 *
 * ### What it writes, and where the boundary is
 *
 * Seven durable surfaces, one endpoint — `PATCH /me/characters/:characterId`
 * through `write.ts`, which is where the endpoint is named once and where the
 * whole-document race is written down. The durable columns are the top bar's
 * *Edit*; the six cells, the skill list, spell preparation, the backstory and
 * the carried list are their sections' own header actions; a death save is the
 * pip itself. **Every
 * one of them re-reads the screen afterwards** rather than patching what it
 * holds, because a write here changes something it did not send: `descriptor`
 * is a generated column, so editing the level rewrites the line under the name.
 *
 * The boundary is not enforced here and must not be restated here. Which rows
 * is `ownRowWritable` on the server; which columns is `CharacterOwnUpdate`,
 * which has no field for `hpCurrent`, `tempHp`, `conditions`, `visibility` or
 * `accountId`. A control for one of those would not compile.
 *
 * ### Keeping your place across a write
 *
 * The tabbed sheet lifted the open tab above the resource because a re-read
 * unmounted the body and an uncontrolled strip threw the reader back to Stats.
 * The continuous sheet has the same hazard in a worse form — after *Add* → *Save
 * gear* the reader must still be looking at Gear, not the top of the sheet —
 * and it is answered in two layers, both deliberate:
 *
 * 1. **The previous document stays rendered while the re-read is in flight.**
 *    `useApiAtom` holds the last value through a refresh (`ready` with
 *    `refreshing: true`, `api/atoms.ts`), so the document, its sections and the
 *    window's scroll position are never unmounted or reset by a save;
 *    `Loading` is drawn only when there is no document at all.
 * 2. **The lit section and the scroll position are held above the resource
 *    anyway.** `active` is screen state, and the window's last `scrollY` is
 *    kept in a ref and restored by a layout effect whenever the document
 *    (re)mounts — so the one case the atom cannot cover, a character id
 *    changing under the same screen or a failure that really does replace the
 *    body, lands the reader where they were rather than at the top. It is the
 *    rule the campaign screens follow for a search term and an open dialog, and
 *    the same reason: the state belongs to the screen, not to what it is showing.
 *
 * ### The live banner, and where it stops
 *
 * *"The Salt Road is playing right now · session 12 · round 3 · Brannoc is up"*
 * and the *Go to the table* action beside it read `GET /campaigns/:c/table` —
 * `PlayerLiveTable`, a distinct schema on a distinct endpoint, which is the
 * rule `PlayerSessionRecap` set and the reason a monster's numbers cannot
 * arrive here even by mistake. What it says in each of its four states, and why
 * it draws nothing at all in the commonest of them, is `live.ts`. The drawing
 * puts a campaign badge and a permanent *Go to the table* in the bar; neither
 * is drawn here unless the state justifies it, which is `live.ts`'s call and
 * not the layout's.
 *
 * ### What is still deliberately absent
 *
 * - **The live half of the row.** Current hit points, temporary hit points,
 *   conditions and inspiration are drawn and are not editable — they are the
 *   DM's to move, which is why the payload has no field for any of them.
 * - **Rolling is browser-local.** A check rolled "to your DM's dice tray" has
 *   no endpoint at all, so dice buttons write only the ephemeral *Your rolls*
 *   panel and its feedback says that truth. Preparing a spell is a picker over
 *   the authoritative spell domain; a portrait and a journal entry are document
 *   keys with no drawn control behind them in this build. They are drawn as the
 *   values they are.
 */

/** How far below the sticky chrome the reading line sits, in CSS pixels. */
const SPY_SLACK = 60;

/**
 * The identity card — the drawing's sticky left rail wide, and its two-line
 * summary header narrow.
 *
 * **One card, restyled by the column's width, and never two.** The drawing
 * draws two components and picks one by window width; here the summary button
 * is drawn only under `@3xl` and the full head only at it, while everything the
 * two share — the hit-point track, the pills, the experience bar, the death
 * saves — is drawn once and shown narrow only when the summary is expanded.
 * That is what keeps every death-save pip in the tree exactly once, which is
 * what a test (and a screen reader) asking for *Successes 1* needs.
 */
function IdentityCard({
  owned,
  open,
  onToggle,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  /** Whether the narrow summary is expanded — screen state, above the resource. */
  readonly open: boolean;
  readonly onToggle: () => void;
  /** Re-read the sheet after a stale-version refusal on a death-save mark. */
  readonly onReload: () => void;
}) {
  const character = owned.character;
  const identity = character.sheet.identity;
  // Absent is nought up and nought down, and on a writable sheet the row is
  // drawn either way: a player whose character has never gone down still has to
  // be able to mark the first save on the night they do.
  const deathSaves = character.sheet.deathSaves ?? { successes: 0, failures: 0 };
  const { busy, failure, submit } = useMutation();
  const [hitDiceToSpend, setHitDiceToSpend] = useState(0);
  const hitDiceResource = character.sheet.resources?.find((resource) => resource.id === "hit-dice");
  const availableHitDice =
    hitDiceResource === undefined ? 0 : Math.max(0, hitDiceResource.max - hitDiceResource.used);

  /**
   * One mark, written straight through — **not optimistic, and deliberately.**
   *
   * The optimistic rule this app follows is the runner's: a single boolean the
   * DM flips every few seconds moves before the round trip, and everything that
   * changes the shape of what is on screen waits and re-reads. A death save is
   * neither frequent nor a boolean, and it is the kind of number somebody reads
   * back out loud, so it waits — the pips are disabled while it does. The whole
   * document goes with it, which is `sheetWith`'s rule and its race.
   */
  const mark = async (part: "successes" | "failures", next: number) => {
    await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { deathSaves: { ...deathSaves, [part]: next } }),
        }),
      ownCharacterWrites(owned),
    );
  };
  const rest = async (kind: "short" | "long") => {
    await submit(
      (client) =>
        restOwnCharacter(client, character, kind, kind === "short" ? hitDiceToSpend : undefined),
      ownCharacterWrites(owned),
    );
    setHitDiceToSpend(0);
  };

  const meta = [identity?.background, identity?.alignment].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const xp = identity?.xp;
  const xpNext = identity?.xpNext;
  const pills: ReadonlyArray<{
    readonly label: string;
    readonly value: string | number;
    readonly accent: boolean;
  }> = [
    { label: "AC", value: character.ac ?? undefined, accent: false },
    { label: "Init", value: identity?.initiative, accent: false },
    { label: "Speed", value: identity?.speed, accent: false },
    // The one accented number, as the delivery draws it: the proficiency bonus
    // is the value a player adds by hand most often.
    { label: "Prof", value: identity?.proficiency, accent: true },
  ].flatMap((pill) =>
    pill.value === undefined || pill.value === "" ? [] : [{ ...pill, value: pill.value }],
  );
  /* The summary's second line — `44 / 52 hp · AC 18 · +1 init` — from the same
     columns the track and the pills read, so it cannot say a different number. */
  const hp = hitPoints(character.hpCurrent, character.hpMax);
  const summary = [
    hp === undefined ? undefined : `${hp} hp`,
    character.ac === null ? undefined : `AC ${String(character.ac)}`,
    identity?.initiative === undefined || identity.initiative === ""
      ? undefined
      : `${identity.initiative} init`,
  ].filter((part): part is string => part !== undefined);
  const detailsId = `vitals-${character.id}`;

  return (
    <div className="order-1 @3xl:sticky @3xl:top-(--chrome-height) @3xl:w-63 @3xl:shrink-0">
      <Card>
        {/* Narrow: the two-line summary, and the press that opens the rest. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          // Named for what it does rather than for what it shows: the name and
          // the numbers inside it are content, and a control called
          // *"BD Brannoc Duskharrow 44 / 52 hp…"* says nothing about the press.
          aria-label={open ? "Hide vitals" : "Show vitals"}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center gap-2.75 p-2.75 text-left transition-control focus-visible:outline-none focus-visible:ring-focus @3xl:hidden"
        >
          <CharacterPortrait name={character.name} portrait={character.portrait} size="xs" />
          <div className="min-w-0 flex-1">
            <p className={cn(sectionHeadingVariants(), "truncate")}>{character.name}</p>
            {summary.length > 0 && (
              <p className="mt-1 font-mono text-mono leading-none text-muted-foreground">
                {summary.join(" · ")}
              </p>
            )}
          </div>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            className="shrink-0 text-faint"
          />
        </button>

        <CardContent
          id={detailsId}
          className={cn(
            "flex-col gap-4 px-2.75 pb-3.25 @3xl:flex @3xl:px-card @3xl:pt-card @3xl:pb-card",
            open ? "flex" : "hidden",
          )}
        >
          {/* Wide: the portrait plate and the name over the card. */}
          <div className="hidden items-start gap-3 @3xl:flex">
            <CharacterPortrait name={character.name} portrait={character.portrait} size="lg" />
            <p className={cn(sectionHeadingVariants(), "min-w-0")}>{character.name}</p>
          </div>
          {character.portraitPending && (
            // Quiet, and nothing blocks: the sheet stays editable and leaving is
            // safe, because the drawing happens on the server.
            <p role="status" className="text-micro leading-body text-muted-foreground">
              Hob is drawing their portrait…
            </p>
          )}
          {(meta.length > 0 || (character.playerName !== null && character.playerName !== "")) && (
            <div>
              {meta.length > 0 && (
                <p className="text-micro leading-body text-muted-foreground">{meta.join(" · ")}</p>
              )}
              {character.playerName !== null && character.playerName !== "" && (
                <p className="text-micro leading-body text-faint">
                  Played by {character.playerName}
                </p>
              )}
            </div>
          )}

          <HpTrack
            current={character.hpCurrent}
            max={character.hpMax}
            temp={character.tempHp}
            hitDice={identity?.hitDice}
          />

          {hitDiceResource !== undefined && (
            <div className="flex flex-col gap-2 border border-hairline bg-surface-sunken p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-micro leading-none text-muted-foreground">
                  Hit dice: {String(availableHitDice)} of {String(hitDiceResource.max)} left
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || hitDiceToSpend <= 0}
                  onClick={() => setHitDiceToSpend((value) => Math.max(0, value - 1))}
                >
                  −
                </Button>
                <span className="w-6 text-center font-mono text-mono leading-none text-heading">
                  {hitDiceToSpend}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || hitDiceToSpend >= availableHitDice}
                  onClick={() =>
                    setHitDiceToSpend((value) => Math.min(availableHitDice, value + 1))
                  }
                >
                  +
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void rest("short")}
                >
                  Short rest
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void rest("long")}
                >
                  Long rest
                </Button>
              </div>
            </div>
          )}

          {(character.inspiration || character.conditions.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {character.inspiration && <Badge variant="outline">Inspired</Badge>}
              {character.conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
            </div>
          )}

          {pills.length > 0 && (
            /* Four across narrow, the drawing's 2×2 wide. */
            <div className="grid grid-cols-4 gap-1.5 @3xl:grid-cols-2">
              {pills.map((pill) => (
                <StatPill
                  key={pill.label}
                  label={pill.label}
                  value={pill.value}
                  accent={pill.accent}
                />
              ))}
            </div>
          )}

          {xp !== undefined && xpNext !== undefined && xpNext > 0 && (
            <div>
              <div className="mb-1.5 flex justify-between text-micro leading-none text-muted-foreground">
                <span>{character.level === null ? "Experience" : `Level ${character.level}`}</span>
                <span>
                  {xp.toLocaleString()} / {xpNext.toLocaleString()} xp
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-pill bg-surface-sunken">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${String(Math.min(100, Math.round((xp / xpNext) * 100)))}%` }}
                />
              </div>
            </div>
          )}

          {character.sheetUrl !== null && (
            // The one column that names somewhere else. A stored link nobody
            // can reach is the same lie as a stubbed field, so it is a real one
            // — here and on the creator's seat page.
            <a
              href={character.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-label-s leading-none font-medium text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
            >
              The sheet they keep elsewhere
            </a>
          )}

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <p className="text-micro leading-none tracking-caps uppercase text-faint">
              Death saves
            </p>
            <DeathSaveRow
              label="Successes"
              count={deathSaves.successes}
              tone="success"
              busy={busy}
              onMark={(next) => void mark("successes", next)}
            />
            <DeathSaveRow
              label="Failures"
              count={deathSaves.failures}
              tone="danger"
              busy={busy}
              onMark={(next) => void mark("failures", next)}
            />
            {/* **The drawing's promise, corrected rather than repeated.**
                `CharacterSheet.jsx` says these "show on your DM's initiative row
                straight away" and nothing reads them: no delivery of the runner
                draws a death save, which is exactly why they are a document key
                and not a column. Saying so here is the honest version of the
                same line, and the DM-side read is a separate piece of work. */}
            {failure === undefined ? (
              <p className="mt-1 text-micro leading-body text-faint">
                Kept on your sheet. Your DM&rsquo;s screen does not show these yet.
              </p>
            ) : (
              <div className="mt-1">
                <SaveFailure failure={failure} onReload={onReload} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * *"The Salt Road is playing right now"*, and the way there.
 *
 * The delivery's card (`MyCharacters.jsx:83-91`): an accented border, a live dot
 * and two lines. It is drawn only when there is something to say — `liveBanner`
 * returns `undefined` otherwise, which is most of the time — so there is no
 * quiet state to design.
 *
 * **The card carries no button, and the delivery's own drawing is why.** The
 * roster's banner ends in *Take your turn* because the roster has no other
 * place to put it; the sheet's *Go to the table* is drawn in the **bar**
 * (`CharacterSheet.jsx:90`), which is where this screen's own actions already
 * live. Drawing both would put two controls with one name and one destination
 * on one screen, which is the ambiguity the backstory's *Edit* already had to
 * be labelled out of. So the card says what is happening and the bar is how you
 * get there.
 *
 * The dot is `--success` and carries `aria-hidden`: it repeats the headline's
 * own *"right now"* rather than adding to it, so a screen reader that read it
 * would be reading punctuation.
 */
function LiveTableBanner({ banner }: { readonly banner: LiveBanner }) {
  return (
    <Card className="mb-gutter border-accent">
      <CardContent className="flex flex-wrap items-center gap-x-gutter gap-y-3 pt-card">
        <span aria-hidden className="size-2 shrink-0 rounded-pill bg-success" />
        <div className="min-w-0 flex-1">
          <p className="text-body-s leading-snug font-semibold text-heading">{banner.headline}</p>
          <p className="text-caption leading-body text-muted-foreground">{banner.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The three columns and the scroll-spy — everything that has to know where the
 * reader is.
 *
 * The window is the scroller, as on every screen. This restores the position
 * it was last at when it mounts, and asks `sectionInView` which section is lit
 * on every scroll, measuring each section against the reading line under the
 * shell's sticky chrome (`--chrome-height`, which `AppShell` publishes) and,
 * narrow, the rail. A press on the spine **pins** its section until the reader
 * scrolls by hand (wheel, touch or key): a smooth scroll fires the same events
 * as a thumb does, and a short last section that cannot reach the reading line
 * would otherwise be lit for a frame and then lose the marker to the section
 * above it.
 */
function SheetLayout({
  owned,
  gearRows,
  banner,
  active,
  onActive,
  vitalsOpen,
  onToggleVitals,
  scrollTopRef,
  onEdit,
  onReload,
  rollCampaignId,
}: {
  readonly owned: OwnedCharacter;
  readonly gearRows: ReadonlyArray<Equipment>;
  readonly banner: LiveBanner | undefined;
  readonly rollCampaignId: CampaignId | undefined;
  readonly active: SheetSectionId;
  readonly onActive: (id: SheetSectionId) => void;
  readonly vitalsOpen: boolean;
  readonly onToggleVitals: () => void;
  readonly scrollTopRef: { current: number };
  readonly onEdit: (what: "abilities" | "skills" | "spells" | "backstory" | "gear") => void;
  readonly onReload: () => void;
}) {
  const spine = useRef<HTMLElement>(null);
  const sectionElements = useRef(new Map<SheetSectionId, HTMLElement>());
  const pinned = useRef<SheetSectionId | undefined>(undefined);
  // Writable, so the three starting sections are drawn whether or not they hold
  // anything — otherwise the affordance that fills a section would live behind
  // the section it fills, and a sheet nobody has written could never be started.
  const sections = drawnSections(owned.character.sheet, true);

  const register = (id: SheetSectionId, element: HTMLElement | null) => {
    if (element === null) sectionElements.current.delete(id);
    else sectionElements.current.set(id, element);
  };

  // Where the reader was, restored when the document (re)mounts — see the
  // screen's doc comment for why this is the second layer and not the first.
  useLayoutEffect(() => {
    if (scrollTopRef.current > 0) window.scrollTo(0, scrollTopRef.current);
  }, [scrollTopRef]);

  /**
   * How far below the viewport's top the reading line sits: the shell's sticky
   * chrome, and the rail's height when the nav is the rail. On the wide layout
   * the spine is a column beside the document and takes no headroom at all.
   * The two shapes are told apart by the nav's own flex direction, which the
   * same `@3xl` that lays the sheet out decides — a second copy of the
   * breakpoint would drift, and **position cannot be used instead**: Chromium
   * reports a stuck element's `offsetTop` at its stuck position, so a rail the
   * reader has scrolled under looks as though it sits below the sections
   * (measured: *Story* pressed at 390 landed at 0, under the rail, with the
   * position test).
   */
  const headroom = () => {
    const nav = spine.current;
    if (nav === null) return 0;
    const style = getComputedStyle(nav);
    const chrome = Number.parseFloat(style.getPropertyValue("--chrome-height")) || 0;
    return chrome + (style.flexDirection === "row" ? nav.offsetHeight : 0);
  };

  /** A section's top in the document, less the headroom above the line. */
  const topOf = (node: HTMLElement, room: number) =>
    node.getBoundingClientRect().top + window.scrollY - room;

  // The latest render's closures, for listeners attached once.
  const latest = useRef({ sections, onActive });
  latest.current = { sections, onActive };

  useEffect(() => {
    const onScroll = () => {
      scrollTopRef.current = window.scrollY;
      const room = headroom();
      const tops = latest.current.sections.flatMap((section) => {
        const node = sectionElements.current.get(section.id);
        return node === undefined ? [] : [{ id: section.id, top: topOf(node, room) }];
      });
      const page = document.documentElement;
      const atEnd = window.scrollY + window.innerHeight >= page.scrollHeight - 1;
      const spied = sectionInView(tops, window.scrollY, SPY_SLACK, atEnd);
      if (spied === undefined) return;
      if (pinned.current !== undefined) {
        // The smooth scroll has arrived when the spy agrees with the press.
        if (spied === pinned.current) pinned.current = undefined;
        return;
      }
      latest.current.onActive(spied);
    };
    const unpin = () => {
      pinned.current = undefined;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", unpin, { passive: true });
    window.addEventListener("touchmove", unpin, { passive: true });
    window.addEventListener("keydown", unpin);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", unpin);
      window.removeEventListener("touchmove", unpin);
      window.removeEventListener("keydown", unpin);
    };
  }, [scrollTopRef]);

  const go = (id: SheetSectionId) => {
    const target = sectionElements.current.get(id);
    onActive(id);
    if (target === undefined) return;
    pinned.current = id;
    const top = Math.max(0, topOf(target, headroom()));
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div>
      {banner !== undefined && <LiveTableBanner banner={banner} />}
      {/* The drawing's `252px / minmax(0,1fr) / 186px` grid as a flex row: the
          card and the spine are fixed tracks that stick, the document is the
          one that gives. `items-start` is what lets a flex item be sticky.
          Narrow, the same three stack — card, rail, document — which the
          `order-*` pair on the rail and the document arranges without a second
          copy of either. */}
      <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
        <IdentityCard
          owned={owned}
          open={vitalsOpen}
          onToggle={onToggleVitals}
          onReload={onReload}
        />
        <SectionSpine ref={spine} sections={sections} active={active} onGo={go} />
        <SheetDocument
          character={owned.character}
          gearRows={gearRows}
          sections={sections}
          register={register}
          writes={{
            owned,
            onEditAbilities: () => onEdit("abilities"),
            onEditBackstory: () => onEdit("backstory"),
            onEditGear: () => onEdit("gear"),
            onEditSkills: () => onEdit("skills"),
            onEditSpells: () => onEdit("spells"),
            rollCampaignId,
          }}
        />
      </div>
    </div>
  );
}

/**
 * One character's sheet and the live table behind its banner, keyed on the id.
 *
 * Two rounds, because the live read hangs off `/campaigns/:campaignId` and
 * which campaign that is arrives in the first — see `characters/load.ts`, which
 * is also where a `NotFound` from the second is argued to fail the screen
 * rather than degrade to a missing banner.
 */
const sheetAtom = Atom.family((characterId: CharacterId) =>
  // One key for both rounds, because both are a function of the same write: a
  // sheet save re-reads the roster this screen picks its character out of, and
  // the live banner beside it is read in the round that follows. Nothing on
  // this screen writes the table, so there is no second key to name.
  // …and the equipment Library, because the second round reads the rows the
  // gear names from it: an original written on the shelf reaches the sheet.
  apiAtom(loadCharacterSheet(characterId), [reads.myCharacters, reads.libraryEquipment]),
);

export function CharacterSheetScreen() {
  const { characterId } = useParams({ from: "/_shell/characters/$characterId" });
  /**
   * The roster's own load, reused whole — **and that is the point rather than a
   * shortcut.** `GET /me/characters` composes `ownRowReadable`, which is the
   * ownership predicate *conjoined* with ownership; reading one row through
   * `characters.findById` instead would need a campaign in the path this route
   * deliberately does not carry, and would answer through a wider predicate for
   * a screen that must only ever show your own.
   *
   * So a character that is not in the answer is not yours, and the honest thing
   * to say about it is what the server says about everything it will not show:
   * *not here*.
   */
  const [resource, reload] = useApiAtom(sheetAtom(characterId));
  const view = resource.state === "ready" ? resource.value : undefined;
  const owned = view?.characters.find((row) => row.character.id === characterId);
  const character = owned?.character;
  // While Hob draws, re-read until the portrait lands (or does not).
  useHobDrawingPolling(character?.portraitPending === true, reload);
  /**
   * The banner's table is the character's **first** seat — `load.ts` picked the
   * same one to read the live table from, so the name and the numbers cannot
   * disagree about which table they are about. A character seated nowhere has
   * no campaign line, no banner and no way to a table, which is the honest
   * shape of a character between tables.
   */
  const firstSeat = owned?.seats[0];
  const campaignName =
    firstSeat === undefined ? undefined : view?.campaignNames.get(firstSeat.campaignId);
  /**
   * What the banner says, or nothing.
   *
   * `undefined` covers both silences the endpoint deliberately does not tell
   * apart — nobody is playing, and the DM has not shared tonight — and the
   * screen draws neither a card nor an action for either. See `live.ts`.
   */
  const banner =
    character === undefined || view === undefined
      ? undefined
      : liveBanner(view.live, character, campaignName);
  const joinOptions =
    owned === undefined ? [] : campaignsAvailableToJoin(owned, view?.memberships ?? []);

  /**
   * Which write is open — one at a time, and above the sheet rather than inside
   * it, because the dialog outlives the section that opened it: a save re-reads
   * the screen, and a dialog owned by a subtree that re-renders under it would
   * be closed by its own success.
   */
  const [editing, setEditing] = useState<
    | "identity"
    | "abilities"
    | "skills"
    | "spells"
    | "backstory"
    | "gear"
    | "join"
    | "delete"
    | undefined
  >();
  /**
   * Which section is lit, whether the narrow summary is open, and where the
   * window was scrolled to — all three above the resource, for the reason the screen's
   * doc comment gives under *Keeping your place across a write*.
   */
  const [active, setActive] = useState<SheetSectionId>("abilities");
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const scrollTop = useRef(0);
  const close = () => setEditing(undefined);
  /**
   * The remedy for a stale-version refusal: read the sheet again and let the
   * player make the change over on the document as it now is. The dialog goes,
   * because the draft it holds was made against the version the server just
   * refused.
   */
  const reloadAndClose = () => {
    reload();
    close();
  };
  const navigate = useNavigate();
  // The lit section must be a drawn one — a section can stop being drawn
  // between renders — so the held value falls back to the first rather than
  // being trusted.
  const drawn = character === undefined ? [] : drawnSections(character.sheet, true);
  const lit = drawn.some((section) => section.id === active)
    ? active
    : (drawn[0]?.id ?? "abilities");

  return (
    <>
      <TopBar
        title={character?.name ?? "A character"}
        /* **The campaign's name is on this line now, and that is where it has
             to be.** It used to hang in the top nav beside the campaign the
             route named — but this route names none: `GET /me/characters` is the
             one read on `character` with no campaign in its path, so the sixth
             delivery's campaign row is correctly absent here and there is no
             second bar to put it in. It is still the thing that tells two
             characters at two tables apart, so it joins the line that already
             says which character this is. */
        subtitle={
          character === undefined
            ? undefined
            : [campaignName, character.descriptor, character.sheet.identity?.subclass]
                .filter(
                  (part): part is string => part !== null && part !== undefined && part !== "",
                )
                .join(" · ")
        }
      >
        <BackLink render={<Link to="/characters" />}>Characters</BackLink>
        {/* **The way to the table, in the bar the delivery draws it in**
              (`CharacterSheet.jsx:90`) — and absent unless there is a table to
              go to. A control that led to a screen with nothing on it would be
              the stubbed field this product refuses everywhere else, and the
              banner below is the sentence saying why this one is here. */}
        {firstSeat !== undefined && banner !== undefined && (
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/campaigns/$campaignId/table"
                params={{ campaignId: firstSeat.campaignId }}
              />
            }
          >
            <Icon name="swords" size={14} />
            Go to the table
          </Button>
        )}
        {owned !== undefined && joinOptions.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setEditing("join")}>
            <Icon name="user-plus" size={14} />
            Add to campaign
          </Button>
        )}
        {/* **The product's first character delete on screen**, and it is here
              because Hob drafting one is what made an unwanted character cheap:
              a player who describes somebody, keeps the draft and changes their
              mind owns a real row. It is a confirm rather than a press,
              because a character really goes — there is no
              archive for one the way there is for a campaign. See
              `DeleteCharacterDialog`. */}
        {character !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${character.name}`}
            onClick={() => setEditing("delete")}
          >
            <Icon name="trash-2" size={14} />
            Delete
          </Button>
        )}
        {/* The durable columns, and the one write with no drawn home of its
              own — the delivery gives the identity card no edit affordance, so
              it goes where a screen's own action goes. It is absent until the
              row is loaded, because there is nothing to edit until then. */}
        {character !== undefined && (
          <Button size="sm" onClick={() => setEditing("identity")}>
            <Icon name="pencil" size={14} />
            Edit
          </Button>
        )}
      </TopBar>
      {resource.state === "loading" && <Loading label="Reading the sheet…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (owned === undefined ? (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={{ kind: "missing", resource: "character" }} />
          </div>
        ) : (
          <SheetLayout
            owned={owned}
            gearRows={view.gear}
            banner={banner}
            active={lit}
            onActive={setActive}
            vitalsOpen={vitalsOpen}
            onToggleVitals={() => setVitalsOpen((current) => !current)}
            scrollTopRef={scrollTop}
            onEdit={setEditing}
            onReload={reload}
            rollCampaignId={view.live?.campaignId}
          />
        ))}

      {owned !== undefined && editing === "identity" && (
        <IdentityDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "abilities" && (
        <AbilitiesDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "skills" && (
        <SkillsDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "spells" && (
        <SpellPickerDialog
          owned={owned}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {owned !== undefined && editing === "backstory" && (
        <BackstoryDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "gear" && (
        <GearDialog
          owned={owned}
          rows={view?.gear ?? []}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {owned !== undefined && view !== undefined && editing === "join" && (
        <AddToCampaignDialog
          owned={owned}
          memberships={view.memberships}
          onClose={close}
          onJoined={reload}
        />
      )}
      {owned !== undefined && editing === "delete" && (
        <DeleteCharacterDialog
          owned={owned}
          onClose={close}
          /* The row is gone, so there is nothing left on this route to draw —
             back to the roster, replacing the entry so *Back* does not land on
             a sheet that no longer exists. */
          onDeleted={() => void navigate({ to: "/characters", replace: true })}
        />
      )}
    </>
  );
}
