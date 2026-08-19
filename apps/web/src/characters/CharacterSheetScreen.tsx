import type { Character, CharacterId, InventoryItem, Trait } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { AppShell, TopBar } from "../shell/AppShell";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { BackstoryDialog } from "./BackstoryDialog";
import { GearDialog } from "./GearDialog";
import { IdentityDialog } from "./IdentityDialog";
import { type LiveBanner, liveBanner } from "./live";
import { loadCharacterSheet } from "./load";
import { coins, sheetTabs } from "./sheet";
import {
  AbilityCell,
  DeathSaveRow,
  HpTrack,
  KeyVal,
  Mark,
  Portrait,
  SheetSection,
  StatPill,
} from "./SheetParts";
import { saveOwnCharacter, sheetWith } from "./write";

/**
 * One character, whole — `ui_kits/dm-screen/CharacterSheet.jsx` against the real
 * API, and **the one screen in the product where somebody who is not a DM
 * writes.**
 *
 * ### Where each thing on it comes from
 *
 * Nine columns and one `jsonb` document, and the split is the one `Character.ts`
 * argues: name, player, level, species, class, AC, hit points, temp, conditions
 * and `sheetUrl` are columns; the thirty-odd fields the drawing adds are
 * optional keys on `sheet`, which is why the whole of this screen cost no
 * migration. `descriptor` is generated from three of the columns and is drawn
 * once, under the name — never recomputed here, because a second implementation
 * of it is exactly what the generated column exists to prevent.
 *
 * ### What it writes, and where the boundary is
 *
 * Four surfaces, one endpoint — `PATCH /me/characters/:characterId` through
 * `write.ts`, which is where the endpoint is named once and where the
 * whole-document race is written down. The durable columns are the top bar's
 * *Edit*; the backstory and the carried list are their sections' own headers;
 * a death save is the pip itself. **Every one of them re-reads the screen
 * afterwards** rather than patching what it holds, because a write here changes
 * something it did not send: `descriptor` is a generated column, so editing the
 * level rewrites the line under the name.
 *
 * The boundary is not enforced here and must not be restated here. Which rows
 * is `ownRowWritable` on the server; which columns is `CharacterOwnUpdate`,
 * which has no field for `hpCurrent`, `tempHp`, `conditions`, `visibility` or
 * `accountId`. A control for one of those would not compile.
 *
 * ### The live banner, and where it stops
 *
 * *"The Salt Road is playing right now · session 12 · round 3 · Brannoc is up"*
 * and the *Go to the table* action beside it read `GET /campaigns/:c/table` —
 * `PlayerLiveTable`, a distinct schema on a distinct endpoint, which is the
 * rule `PlayerSessionRecap` set and the reason a monster's numbers cannot
 * arrive here even by mistake. What it says in each of its four states, and why
 * it draws nothing at all in the commonest of them, is `live.ts`.
 *
 * It is a **snapshot**, read with the rest of the screen and re-read whenever
 * the screen is. There is no stream behind it and that is deliberate: the live
 * stream is scoped to one run and what a player may watch of a fight is the
 * player fight view's decision, which a banner must not settle by accident.
 *
 * *Go to the table* goes to `/play/campaigns/:c`, the table's own screen, which
 * is the truthful destination this build has. When the player fight view ships
 * it is the one line here that changes.
 *
 * ### What is still deliberately absent
 *
 * - **The live half of the row.** Current hit points, temporary hit points and
 *   conditions are drawn and are not editable — they are `0014`'s live trio and
 *   the DM's to move, which is why the payload has no field for any of them.
 * - **Rolling, spending, preparing, uploading, journalling.** A check rolled
 *   "to your DM's dice tray" has no endpoint at all; a spent spell slot, a
 *   prepared spell, a portrait and a journal entry are document keys with no
 *   drawn control behind them in this build. They are drawn as the values they
 *   are — the same call `bestiary/StatBlock.tsx` made about a rollable trait.
 * - **A tab with nothing to read *and* nothing to write.** Stats, Actions and
 *   Log are still drawn only when the document fills them. Gear and Story are
 *   always drawn, because each carries the affordance that creates its own
 *   contents — see `sheetTabs`.
 */

function Attack({ attack }: { readonly attack: Trait }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border border-hairline bg-surface-sunken px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-body-s leading-snug font-semibold text-heading">{attack.name}</p>
        {attack.text !== "" && (
          <p className="text-micro leading-body text-muted-foreground">{attack.text}</p>
        )}
      </div>
      {attack.note !== undefined && attack.note !== "" && (
        <span className="text-micro leading-none text-muted-foreground">{attack.note}</span>
      )}
      {attack.hit !== undefined && attack.hit !== "" && (
        <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
          {attack.hit}
        </span>
      )}
      {/* The notation, shown and not rolled — there is no dice tray behind a
          button here, and `StatBlock.tsx` renders a monster's the same way. */}
      {attack.dice !== undefined && attack.dice !== "" && (
        <span className="rounded-xs bg-surface-raised px-1.5 py-px font-mono text-micro leading-snug text-accent-ink">
          {attack.dice}
        </span>
      )}
    </div>
  );
}

function Feature({ trait }: { readonly trait: Trait }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{trait.name}</span>
        {trait.note !== undefined && trait.note !== "" && (
          <span className="text-micro leading-none text-accent-ink">{trait.note}</span>
        )}
      </div>
      {trait.text !== "" && (
        <p className="mt-1 max-w-measure text-caption leading-body text-muted-foreground">
          {trait.text}
        </p>
      )}
    </div>
  );
}

function InventoryLine({ item, first }: { readonly item: InventoryItem; readonly first: boolean }) {
  return (
    <div
      className={`flex min-h-row flex-wrap items-center gap-2.5 py-1 ${first ? "" : "border-t border-hairline"}`}
    >
      <Icon
        name={item.equipped === true ? "shield" : "package"}
        size={15}
        className={item.equipped === true ? "shrink-0 text-accent-ink" : "shrink-0 text-faint"}
      />
      <span className="min-w-0 flex-1 text-body-s leading-body text-foreground">{item.name}</span>
      {item.note !== undefined && item.note !== "" && <Badge variant="outline">{item.note}</Badge>}
      {item.quantity !== undefined && (
        <span className="font-mono text-mono leading-none text-muted-foreground">
          ×{item.quantity}
        </span>
      )}
      {item.weight !== undefined && item.weight !== "" && (
        <span className="text-micro leading-none text-faint">{item.weight}</span>
      )}
    </div>
  );
}

function SheetBody({
  character,
  open,
  onOpen,
  onEditBackstory,
  onEditGear,
}: {
  readonly character: Character;
  /** Which tab is open, held above the screen's own resource — see `onOpen`. */
  readonly open: string | undefined;
  readonly onOpen: (tab: string) => void;
  readonly onEditBackstory: () => void;
  readonly onEditGear: () => void;
}) {
  const sheet = character.sheet;
  // Writable, so Gear and Story are drawn whether or not they hold anything —
  // otherwise the affordance that fills a tab would live behind the tab it
  // fills, and a sheet nobody has written could never be started.
  const tabs = sheetTabs(sheet, true);
  const spellcasting = sheet.spellcasting;
  const story = sheet.story;
  const storyLines: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: "Personality", value: story?.personality },
    { label: "Ideal", value: story?.ideal },
    { label: "Bond", value: story?.bond },
    { label: "Flaw", value: story?.flaw },
  ].flatMap(({ label, value }) => (value === undefined || value === "" ? [] : [{ label, value }]));
  const purse = sheet.currency === undefined ? [] : coins(sheet.currency);

  // The first tab that exists. The value must name a tab that is rendered, or
  // the strip opens on nothing — which is also why the lifted value falls back
  // here rather than being trusted: a tab can stop being drawn between renders.
  const drawn = (["stats", "actions", "gear", "story", "log"] as const).filter(
    (name) => tabs[name],
  );
  const first = drawn[0] ?? "story";
  const value = open !== undefined && drawn.some((name) => name === open) ? open : first;

  return (
    /**
     * **Controlled, and the value is held above the resource.** Every write
     * here re-reads, and a re-read passes through `loading` — which unmounts
     * this subtree, so an uncontrolled strip would throw the reader back to
     * Stats every time they saved. Measured: *Add*, then *Save gear*, landed on
     * Stats with the new line one click away and invisible. It is the same rule
     * the campaign screens follow for a search term and an open dialog, and the
     * same reason: the state belongs to the screen, not to what it is showing.
     */
    <Tabs value={value} onValueChange={(next) => onOpen(String(next))}>
      <TabsList className="mb-gutter">
        {tabs.stats && (
          <TabsTrigger value="stats">
            <Icon name="hexagon" size={13} />
            Stats
          </TabsTrigger>
        )}
        {tabs.actions && (
          <TabsTrigger value="actions">
            <Icon name="swords" size={13} />
            Actions
          </TabsTrigger>
        )}
        {tabs.gear && (
          <TabsTrigger value="gear">
            <Icon name="backpack" size={13} />
            Gear
          </TabsTrigger>
        )}
        {tabs.story && (
          <TabsTrigger value="story">
            <Icon name="scroll-text" size={13} />
            Story
          </TabsTrigger>
        )}
        {tabs.log && (
          <TabsTrigger value="log">
            <Icon name="history" size={13} />
            Log
          </TabsTrigger>
        )}
      </TabsList>

      {tabs.stats && (
        <TabsContent value="stats" className="flex flex-col gap-gutter">
          {sheet.abilities.length > 0 && (
            <SheetSection title="Abilities">
              <div className="grid grid-cols-3 gap-2 @2xl:grid-cols-6">
                {sheet.abilities.map((ability) => (
                  <AbilityCell key={ability.label} ability={ability} />
                ))}
              </div>
            </SheetSection>
          )}

          <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
            {sheet.skills !== undefined && sheet.skills.length > 0 && (
              <SheetSection title="Skills" className="min-w-0 flex-1">
                <div className="grid grid-cols-1 gap-x-gutter @xl:grid-cols-2">
                  {sheet.skills.map((skill) => (
                    <div key={skill.name} className="flex min-h-7 items-center gap-2">
                      <Mark on={skill.proficient === true} />
                      <span
                        className={
                          skill.proficient === true
                            ? "min-w-0 flex-1 text-body-s leading-none text-foreground"
                            : "min-w-0 flex-1 text-body-s leading-none text-muted-foreground"
                        }
                      >
                        {skill.name}
                      </span>
                      {skill.ability !== undefined && (
                        <span className="text-micro leading-none text-faint">{skill.ability}</span>
                      )}
                      {skill.bonus !== undefined && (
                        <span
                          className={
                            skill.proficient === true
                              ? "min-w-7 text-right font-mono text-mono leading-none font-medium text-accent-ink"
                              : "min-w-7 text-right font-mono text-mono leading-none font-medium text-muted-foreground"
                          }
                        >
                          {skill.bonus}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </SheetSection>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-gutter">
              {sheet.proficiencies !== undefined && sheet.proficiencies.length > 0 && (
                <SheetSection title="Proficiencies &amp; languages">
                  <div className="flex flex-wrap gap-1.5">
                    {sheet.proficiencies.map((proficiency) => (
                      <Badge key={proficiency} variant="outline">
                        {proficiency}
                      </Badge>
                    ))}
                  </div>
                </SheetSection>
              )}
              {sheet.traits.length > 0 && (
                <SheetSection title="Features &amp; traits">
                  <div className="flex flex-col gap-3">
                    {sheet.traits.map((trait) => (
                      <Feature key={trait.name} trait={trait} />
                    ))}
                  </div>
                </SheetSection>
              )}
            </div>
          </div>
        </TabsContent>
      )}

      {tabs.actions && (
        <TabsContent value="actions">
          <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
            {sheet.attacks !== undefined && sheet.attacks.length > 0 && (
              <SheetSection title="Attacks" className="min-w-0 flex-1">
                <div className="flex flex-col gap-2">
                  {sheet.attacks.map((attack) => (
                    <Attack key={attack.name} attack={attack} />
                  ))}
                </div>
              </SheetSection>
            )}

            {spellcasting !== undefined && (
              <SheetSection
                title="Spellcasting"
                className="min-w-0 flex-1"
                aside={
                  <span className="text-micro leading-none text-faint">
                    {[
                      spellcasting.ability,
                      spellcasting.save === undefined ? undefined : `save ${spellcasting.save}`,
                      spellcasting.attack === undefined ? undefined : `atk ${spellcasting.attack}`,
                    ]
                      .filter((part): part is string => part !== undefined && part !== "")
                      .join(" · ")}
                  </span>
                }
              >
                {spellcasting.slots !== undefined && spellcasting.slots.length > 0 && (
                  <div className="mb-3 flex flex-col gap-2 border-b border-hairline pb-3">
                    {spellcasting.slots.map((slot) => (
                      <div key={slot.level} className="flex items-center gap-2">
                        <span className="w-14 text-micro leading-none text-muted-foreground">
                          Level {slot.level}
                        </span>
                        {/* Pips, not buttons: spending one is a write, and a
                            player has none. The count is said in words beside
                            them so the marks are decoration. */}
                        <span className="flex gap-1" aria-hidden="true">
                          {Array.from({ length: Math.max(0, slot.total) }, (_, index) => (
                            <span
                              key={index}
                              className={
                                index < slot.used
                                  ? "size-3.5 rotate-45 border border-strong bg-transparent"
                                  : "size-3.5 rotate-45 border border-magic bg-magic"
                              }
                            />
                          ))}
                        </span>
                        <span className="text-micro leading-none text-faint">
                          {Math.max(0, slot.total - slot.used)} of {slot.total} left
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col">
                  {(spellcasting.known ?? []).map((spell) => (
                    <div key={spell.name} className="flex min-h-8 items-center gap-2">
                      <Mark on={spell.prepared === true} tone="magic" />
                      <span
                        className={
                          spell.prepared === true
                            ? "min-w-0 flex-1 text-body-s leading-none text-foreground"
                            : "min-w-0 flex-1 text-body-s leading-none text-muted-foreground"
                        }
                      >
                        {spell.name}
                      </span>
                      {spell.note !== undefined && spell.note !== "" && (
                        <span className="text-micro leading-none text-faint">{spell.note}</span>
                      )}
                      {spell.level !== undefined && <Badge variant="outline">L{spell.level}</Badge>}
                    </div>
                  ))}
                </div>
              </SheetSection>
            )}
          </div>
        </TabsContent>
      )}

      {tabs.gear && (
        <TabsContent value="gear">
          <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
            <SheetSection
              title="Carried"
              className="min-w-0 flex-1"
              action={
                <Button variant="outline" size="sm" onClick={onEditGear}>
                  <Icon name="plus" size={13} />
                  Add
                </Button>
              }
            >
              {sheet.inventory === undefined || sheet.inventory.length === 0 ? (
                <p className="text-caption leading-body text-muted-foreground">
                  A rope, a lantern, the thing you were given last session.
                </p>
              ) : (
                sheet.inventory.map((item, index) => (
                  <InventoryLine key={item.name} item={item} first={index === 0} />
                ))
              )}
            </SheetSection>
            {purse.length > 0 && (
              <SheetSection title="Coin" className="@3xl:w-aside @3xl:shrink-0">
                <div className="flex flex-col gap-2">
                  {purse.map((pile) => (
                    <div key={pile.label} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-micro leading-none tracking-caps uppercase text-muted-foreground">
                        {pile.label}
                      </span>
                      <span className="font-mono text-mono leading-none font-medium text-heading">
                        {pile.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </SheetSection>
            )}
          </div>
        </TabsContent>
      )}

      {tabs.story && (
        <TabsContent value="story">
          <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-gutter">
              <SheetSection
                title="Backstory"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    /* The bar carries an *Edit* too, for the columns. Two
                       buttons with one name on one screen is a real ambiguity
                       and not only a test's problem, so this one says what it
                       edits — with the visible word kept as the prefix, so
                       anything driving by the label it can see still matches. */
                    aria-label="Edit backstory"
                    onClick={onEditBackstory}
                  >
                    <Icon name="pencil" size={13} />
                    Edit
                  </Button>
                }
              >
                {sheet.notes.trim() === "" ? (
                  <p className="text-caption leading-body text-muted-foreground">
                    Where they came from, and what they are still carrying about it.
                  </p>
                ) : (
                  sheet.notes.split(/\n{2,}/).map((paragraph, index) => (
                    <p
                      key={paragraph.slice(0, 32) + String(index)}
                      className={
                        index === 0
                          ? "max-w-measure font-serif text-body-l leading-loose text-slate-300 italic"
                          : "mt-3 max-w-measure font-serif text-body-l leading-loose text-slate-300 italic"
                      }
                    >
                      {paragraph}
                    </p>
                  ))
                )}
              </SheetSection>
              {sheet.journal !== undefined && sheet.journal.length > 0 && (
                <SheetSection title="Journal">
                  <div className="flex flex-col gap-4">
                    {sheet.journal.map((entry, index) => (
                      <div key={entry.text.slice(0, 32) + String(index)}>
                        {entry.session !== undefined && (
                          <Badge variant="secondary">Session {entry.session}</Badge>
                        )}
                        <p className="mt-1.5 max-w-measure text-body-s leading-loose text-muted-foreground">
                          {entry.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </SheetSection>
              )}
            </div>
            {storyLines.length > 0 && (
              <SheetSection title="Bonds, ideals, flaws" className="min-w-0 flex-1">
                <div className="flex flex-col gap-3">
                  {storyLines.map((line) => (
                    <KeyVal key={line.label} k={line.label} v={line.value} />
                  ))}
                </div>
              </SheetSection>
            )}
          </div>
        </TabsContent>
      )}

      {tabs.log && (
        <TabsContent value="log">
          <SheetSection title="Level ups">
            {(sheet.levelUps ?? []).map((levelUp, index) => (
              <div
                key={levelUp.level}
                className={`flex gap-4 py-3 ${index === 0 ? "" : "border-t border-hairline"}`}
              >
                <div className="flex w-11 shrink-0 flex-col items-center gap-0.5">
                  <span className="font-display text-display-s leading-none font-semibold text-accent-ink">
                    {levelUp.level}
                  </span>
                  <span className="text-micro leading-none text-faint">level</span>
                </div>
                <div className="min-w-0 flex-1">
                  {levelUp.session !== undefined && (
                    <Badge variant="outline">Session {levelUp.session}</Badge>
                  )}
                  {levelUp.note !== undefined && levelUp.note !== "" && (
                    <p className="mt-1.5 max-w-measure text-body-s leading-body text-foreground">
                      {levelUp.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </SheetSection>
        </TabsContent>
      )}
    </Tabs>
  );
}

function IdentityColumn({
  character,
  onSaved,
}: {
  readonly character: Character;
  readonly onSaved: () => void;
}) {
  const identity = character.sheet.identity;
  // Absent is nought up and nought down, and on a writable sheet the row is
  // drawn either way: a player whose character has never gone down still has to
  // be able to mark the first save on the night they do.
  const deathSaves = character.sheet.deathSaves ?? { successes: 0, failures: 0 };
  const { busy, failure, submit } = useMutation();

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
    const saved = await submit((client) =>
      saveOwnCharacter(client, character, {
        sheet: sheetWith(character, { deathSaves: { ...deathSaves, [part]: next } }),
      }),
    );
    if (Result.isSuccess(saved)) onSaved();
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

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-card">
          <div className="flex items-start gap-3">
            <Portrait name={character.name} size="lg" />
            <div className="min-w-0">
              <p className="font-display text-body leading-tight font-semibold text-heading">
                {character.name}
              </p>
              {meta.length > 0 && (
                <p className="mt-1 text-micro leading-body text-muted-foreground">
                  {meta.join(" · ")}
                </p>
              )}
              {character.playerName !== null && character.playerName !== "" && (
                <p className="mt-1 text-micro leading-body text-faint">
                  Played by {character.playerName}
                </p>
              )}
            </div>
          </div>

          <HpTrack
            current={character.hpCurrent}
            max={character.hpMax}
            temp={character.tempHp}
            hitDice={identity?.hitDice}
          />

          {character.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {character.conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
            </div>
          )}

          {pills.length > 0 && (
            <div className="flex gap-1.5">
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
            // — the call `campaign/PartyList.tsx` already made.
            <a
              href={character.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-label-s leading-none font-medium text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
            >
              The sheet they keep elsewhere
            </a>
          )}
        </CardContent>
      </Card>

      <SheetSection title="Death saves">
        <div className="flex flex-col gap-2">
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
              <SaveFailure failure={failure} />
            </div>
          )}
        </div>
      </SheetSection>
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
 * One character's sheet and the live table behind its banner, keyed on the id.
 *
 * Two rounds, because the live read hangs off `/campaigns/:campaignId` and
 * which campaign that is arrives in the first — see `characters/load.ts`, which
 * is also where a `NotFound` from the second is argued to fail the screen
 * rather than degrade to a missing banner.
 */
const sheetAtom = Atom.family((characterId: CharacterId) =>
  apiAtom(loadCharacterSheet(characterId)),
);

export function CharacterSheetScreen() {
  const { characterId } = useParams({ from: "/play/characters/$characterId" });
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
  const character = view?.characters.find((row) => row.id === characterId);
  const campaignName =
    character === undefined ? undefined : view?.campaignNames.get(character.campaignId);
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
  /**
   * Which write is open — one at a time, and above the sheet rather than inside
   * it, because the dialog outlives the section that opened it: a save re-reads
   * the screen, and a dialog owned by a subtree that re-renders under it would
   * be closed by its own success.
   */
  const [editing, setEditing] = useState<"identity" | "backstory" | "gear" | undefined>();
  /** Which tab is open — above the resource, for the reason `SheetBody` gives. */
  const [openTab, setOpenTab] = useState<string | undefined>();
  const close = () => setEditing(undefined);
  const saved = () => {
    setEditing(undefined);
    reload();
  };

  return (
    <AppShell
      topBar={
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
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/play/characters" />}
          >
            <Icon name="chevron-left" size={14} />
            Characters
          </Button>
          {/* **The way to the table, in the bar the delivery draws it in**
              (`CharacterSheet.jsx:90`) — and absent unless there is a table to
              go to. A control that led to a screen with nothing on it would be
              the stubbed field this product refuses everywhere else, and the
              banner below is the sentence saying why this one is here. */}
          {character !== undefined && banner !== undefined && (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/play/campaigns/$campaignId"
                  params={{ campaignId: character.campaignId }}
                />
              }
            >
              <Icon name="swords" size={14} />
              Go to the table
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
      }
    >
      {resource.state === "loading" && <Loading label="Reading the sheet…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (character === undefined ? (
          <div className="max-w-3xl">
            <FailureNotice failure={{ kind: "missing", resource: "character" }} />
          </div>
        ) : (
          <>
            {banner !== undefined && <LiveTableBanner banner={banner} />}
            {/* The delivery's 260px identity column beside the sheet body, and
                `--rail-w` is that measurement — the token the rail used to
                spend, still bridged. A container query rather than a breakpoint:
                `main` is the container, and the Hob panel takes 400px out of it
                without the window moving. */}
            <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
              <div className="@3xl:w-rail @3xl:shrink-0">
                <IdentityColumn character={character} onSaved={reload} />
              </div>
              <div className="min-w-0 flex-1">
                <SheetBody
                  character={character}
                  open={openTab}
                  onOpen={setOpenTab}
                  onEditBackstory={() => setEditing("backstory")}
                  onEditGear={() => setEditing("gear")}
                />
              </div>
            </div>
          </>
        ))}

      {character !== undefined && editing === "identity" && (
        <IdentityDialog character={character} onClose={close} onSaved={saved} />
      )}
      {character !== undefined && editing === "backstory" && (
        <BackstoryDialog character={character} onClose={close} onSaved={saved} />
      )}
      {character !== undefined && editing === "gear" && (
        <GearDialog character={character} onClose={close} onSaved={saved} />
      )}
    </AppShell>
  );
}
