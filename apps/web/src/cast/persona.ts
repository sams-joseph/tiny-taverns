import type { Npc, NpcPersona, NpcPrivateMaterial } from "@taverns/api";

/**
 * The pure half of the NPC builder: the form's flat drafts and the two
 * structured documents they become, plus the one-line summaries the card and
 * the detail draw.
 *
 * Separately tested, the way `characters/abilities.ts` is, because everything
 * decided here is wrong *silently*: a secret that landed in the public
 * document would render perfectly and be one audience away from a leak. So
 * `personaFrom` and `privateMaterialFrom` are two functions over two disjoint
 * sets of draft keys, and `privateKeys` is the list a test can check the
 * public document never carries.
 *
 * The rule for what is written: **a field with nothing in it is absent, not
 * blank.** An untouched section is an absent key, a list with no lines is no
 * key, and a document with nothing in it is `{}` — which is also what a row
 * created with only a name holds, so the form and the column default agree.
 */

/** Every box on the form, flat, as strings — lists as one line per entry. */
export interface NpcDraft {
  readonly name: string;
  readonly role: string;
  readonly summary: string;
  readonly manner: string;
  readonly pronouns: string;
  readonly pronunciation: string;
  readonly phrases: string;
  readonly exampleLines: string;
  readonly wants: string;
  readonly fears: string;
  readonly loyalties: string;
  readonly attitude: string;
  readonly dodges: string;
  readonly refuses: string;
  readonly asksTheDm: string;
  readonly secrets: string;
  readonly instructions: string;
}

/** The draft keys that are creator-only. The public document never reads them. */
export const privateKeys = ["secrets", "instructions"] as const satisfies ReadonlyArray<
  keyof NpcDraft
>;

export const emptyDraft: NpcDraft = {
  name: "",
  role: "",
  summary: "",
  manner: "",
  pronouns: "",
  pronunciation: "",
  phrases: "",
  exampleLines: "",
  wants: "",
  fears: "",
  loyalties: "",
  attitude: "",
  dodges: "",
  refuses: "",
  asksTheDm: "",
  secrets: "",
  instructions: "",
};

const lines = (text: string): ReadonlyArray<string> =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const text = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const list = (value: string): ReadonlyArray<string> | undefined => {
  const entries = lines(value);
  return entries.length === 0 ? undefined : entries;
};

/** Drops the keys whose value is `undefined`, and answers `undefined` for a section with nothing left. */
const section = <A extends Record<string, unknown>>(record: A): A | undefined => {
  const kept = Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as A;
  return Object.keys(kept).length === 0 ? undefined : kept;
};

/** The public document — reads none of `privateKeys`. */
export const personaFrom = (draft: NpcDraft): NpcPersona =>
  section({
    identity: section({
      pronouns: text(draft.pronouns),
      pronunciation: text(draft.pronunciation),
      summary: text(draft.summary),
    }),
    voice: section({
      manner: text(draft.manner),
      phrases: list(draft.phrases),
      exampleLines: list(draft.exampleLines),
    }),
    intent: section({
      wants: text(draft.wants),
      fears: text(draft.fears),
      loyalties: text(draft.loyalties),
      attitude: text(draft.attitude),
    }),
    boundaries: section({
      dodges: list(draft.dodges),
      refuses: list(draft.refuses),
      asksTheDm: list(draft.asksTheDm),
    }),
  }) ?? {};

/** The creator-only document — reads only `privateKeys`. */
export const privateMaterialFrom = (draft: NpcDraft): NpcPrivateMaterial =>
  section({ secrets: text(draft.secrets), instructions: text(draft.instructions) }) ?? {};

/** The form, opened on an existing row. */
export const draftOf = (npc: Npc): NpcDraft => ({
  name: npc.name,
  role: npc.role,
  summary: npc.persona.identity?.summary ?? "",
  manner: npc.persona.voice?.manner ?? "",
  pronouns: npc.persona.identity?.pronouns ?? "",
  pronunciation: npc.persona.identity?.pronunciation ?? "",
  phrases: (npc.persona.voice?.phrases ?? []).join("\n"),
  exampleLines: (npc.persona.voice?.exampleLines ?? []).join("\n"),
  wants: npc.persona.intent?.wants ?? "",
  fears: npc.persona.intent?.fears ?? "",
  loyalties: npc.persona.intent?.loyalties ?? "",
  attitude: npc.persona.intent?.attitude ?? "",
  dodges: (npc.persona.boundaries?.dodges ?? []).join("\n"),
  refuses: (npc.persona.boundaries?.refuses ?? []).join("\n"),
  asksTheDm: (npc.persona.boundaries?.asksTheDm ?? []).join("\n"),
  secrets: npc.privateMaterial.secrets ?? "",
  instructions: npc.privateMaterial.instructions ?? "",
});

/**
 * Whether the *Advanced* half has anything in it — what decides whether the
 * form opens with that half already shown, so an edit never hides what was
 * written.
 */
export const hasAdvanced = (draft: NpcDraft): boolean =>
  (
    [
      "pronouns",
      "pronunciation",
      "phrases",
      "exampleLines",
      "wants",
      "fears",
      "loyalties",
      "attitude",
      "dodges",
      "refuses",
      "asksTheDm",
      "secrets",
      "instructions",
    ] as const
  ).some((key) => draft[key].trim() !== "");

/** Whether the row carries any creator-only material — what the card's badge says. */
export const hasPrivateMaterial = (npc: Npc): boolean =>
  (npc.privateMaterial.secrets ?? "").trim() !== "" ||
  (npc.privateMaterial.instructions ?? "").trim() !== "";

/** Two letters for the avatar square — "Cazril" → "CA", "Old Fen" → "OF". */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
};

/** The card's one line under the name. */
export const describeNpc = (npc: Npc): string => {
  const summary = npc.persona.identity?.summary?.trim() ?? "";
  if (summary !== "") return summary;
  const manner = npc.persona.voice?.manner?.trim() ?? "";
  if (manner !== "") return manner;
  return "No persona written yet.";
};

/** Case-insensitive contains over the fields a search box should reach. */
export const npcMatches = (needle: string, npc: Npc): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return [npc.name, npc.role, npc.persona.identity?.summary ?? "", npc.persona.voice?.manner ?? ""]
    .join("\n")
    .toLowerCase()
    .includes(term);
};
