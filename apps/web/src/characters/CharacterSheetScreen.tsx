import type { Character, InventoryItem, Trait } from "@taverns/api";
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
import { useApiResource } from "../api/resource";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadMyCharacters } from "./load";
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

/**
 * One character, whole — `ui_kits/dm-screen/CharacterSheet.jsx` against the real
 * API, **read-only**.
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
 * ### What is deliberately absent
 *
 * - **The live banner.** *"The Salt Road is playing right now · session 12 ·
 *   round 3 · Brannoc is up next"* and the *Go to the table* button beside it
 *   **have no read behind them**: they need the player projection of a fight,
 *   which does not exist, and a `session`/`run` pair a player is refused. That
 *   is step 12's decision and this screen does not get to make it by accident.
 * - **Everything that writes.** Rolling a check or an attack "to your DM's dice
 *   tray", spending a spell slot, marking a death save, preparing a spell,
 *   uploading a portrait, adding gear, editing the backstory, adding a journal
 *   entry. A player cannot write anything yet, and every one of those controls
 *   would fail. They are drawn as the values they are instead — the same call
 *   `bestiary/StatBlock.tsx` made about a rollable trait.
 * - **A tab with nothing in it.** The document is thirteen optional keys and a
 *   character written through `CharacterDialog` has none of them, so the tab
 *   strip carries what the sheet holds. An entirely empty sheet says so, once.
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

function SheetBody({ character }: { readonly character: Character }) {
  const sheet = character.sheet;
  const tabs = sheetTabs(sheet);
  const spellcasting = sheet.spellcasting;
  const story = sheet.story;
  const storyLines: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: "Personality", value: story?.personality },
    { label: "Ideal", value: story?.ideal },
    { label: "Bond", value: story?.bond },
    { label: "Flaw", value: story?.flaw },
  ].flatMap(({ label, value }) => (value === undefined || value === "" ? [] : [{ label, value }]));
  const purse = sheet.currency === undefined ? [] : coins(sheet.currency);

  // The first tab that exists. `defaultValue` must name a tab that is rendered,
  // or the strip opens on nothing.
  const first = tabs.stats
    ? "stats"
    : tabs.actions
      ? "actions"
      : tabs.gear
        ? "gear"
        : tabs.story
          ? "story"
          : "log";

  if (tabs.empty) {
    return (
      <EmptyState icon="scroll-text" title="Nothing written on the sheet yet">
        Abilities, skills, gear, spells and the backstory all live on the sheet, and your DM has not
        filled any of it in. Whatever they write appears here.
      </EmptyState>
    );
  }

  return (
    <Tabs defaultValue={first}>
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
            {sheet.inventory !== undefined && sheet.inventory.length > 0 && (
              <SheetSection title="Carried" className="min-w-0 flex-1">
                {sheet.inventory.map((item, index) => (
                  <InventoryLine key={item.name} item={item} first={index === 0} />
                ))}
              </SheetSection>
            )}
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
              {sheet.notes.trim() !== "" && (
                <SheetSection title="Backstory">
                  {sheet.notes.split(/\n{2,}/).map((paragraph, index) => (
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
                  ))}
                </SheetSection>
              )}
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

function IdentityColumn({ character }: { readonly character: Character }) {
  const identity = character.sheet.identity;
  const deathSaves = character.sheet.deathSaves;
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

      {deathSaves !== undefined && (
        <SheetSection title="Death saves">
          <div className="flex flex-col gap-2">
            <DeathSaveRow label="Successes" count={deathSaves.successes} tone="success" />
            <DeathSaveRow label="Failures" count={deathSaves.failures} tone="danger" />
          </div>
        </SheetSection>
      )}
    </div>
  );
}

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
  const [resource, reload] = useApiResource(loadMyCharacters);
  const view = resource.state === "ready" ? resource.value : undefined;
  const character = view?.characters.find((row) => row.id === characterId);
  const campaignName =
    character === undefined ? undefined : view?.campaignNames.get(character.campaignId);

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
          // The delivery's 260px identity column beside the sheet body, and
          // `--rail-w` is that measurement — the token the rail used to spend,
          // still bridged. A container query rather than a breakpoint: `main` is
          // the container, and the Hob panel takes 400px out of it without the
          // window moving.
          <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
            <div className="@3xl:w-rail @3xl:shrink-0">
              <IdentityColumn character={character} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetBody character={character} />
            </div>
          </div>
        ))}
    </AppShell>
  );
}
