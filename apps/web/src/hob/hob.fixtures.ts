import type { HobArtifact, HobContextChip, HobStarter, HobTurn } from "./transcript";

/**
 * The designers' chat fixtures, transcribed.
 *
 * `packages/design-system/ui_kits/dm-screen/chat-data.js` is the source for the
 * context strip, the starters and the slash commands; the sample thread is
 * `ChatPanel.jsx`'s `SEED` and `REPLIES`, and the artifact bodies are the
 * hard-coded ones in `ChatParts.jsx`. Copied here rather than imported, because
 * that package is the designers' artefact — vendored byte for byte, outside its
 * own `exports` map, and ESLint forbids reaching into `ui_kits/`.
 *
 * **Only the first three are wired into the running app.** The thread is a
 * specimen: it is what the gallery renders and what the tests assert against,
 * and it is the closest thing to a real conversation that exists, because
 * nothing answers yet. Do not let it reach a screen — a panel that appears to
 * hold a conversation the DM did not have is the failure this task is most
 * able to cause.
 */

/** "Knows" — what Hob has, shown rather than asked for. `chat-data.js:3-9`. */
export const HOB_CONTEXT: ReadonlyArray<HobContextChip> = [
  { icon: "book-open", label: "The Salt Road · Session 12" },
  { icon: "users", label: "4 players · avg. level 5" },
  { icon: "swords", label: "Ambush in the reeds", live: true },
  { icon: "history", label: "11 sessions of notes" },
  { icon: "footprints", label: "6 of your own creatures" },
];

/** The empty state's four prompts. `chat-data.js:10-15`. */
export const HOB_STARTERS: ReadonlyArray<HobStarter> = [
  { icon: "swords", title: "Build an encounter", sub: "Sized to your party, in the marsh" },
  { icon: "user-round", title: "Name an NPC", sub: "With a voice you can actually do" },
  { icon: "scroll-text", title: "Write read-aloud text", sub: "For a place they haven't seen yet" },
  { icon: "list-checks", title: "Prep tonight's session", sub: "From where session 11 left off" },
];

/** `chat-data.js:16`. The composer filters these as you type past a `/`. */
export const HOB_COMMANDS: ReadonlyArray<string> = [
  "/encounter",
  "/creature",
  "/npc",
  "/read-aloud",
  "/loot",
  "/location",
  "/hooks",
  "/rules",
];

export const SAMPLE_ENCOUNTER: HobArtifact = {
  id: "sample-encounter",
  kind: "encounter",
  title: "Song in the reeds",
  meta: "5 creatures · Adjusted XP 1,100",
  chips: ["Make it harder", "Swap the toad", "Add a twist"],
  roster: [
    { count: 3, name: "Bullywug Croaker", cr: "CR 1/4", hp: "11 hp" },
    { count: 1, name: "Will-o'-Wisp", cr: "CR 2", hp: "22 hp" },
    { count: 1, name: "Giant Toad", cr: "CR 1", hp: "39 hp" },
  ],
  adjustedXp: "Adjusted XP 1,100",
  verdict: "Hard for 4 level-5s",
};

export const SAMPLE_READ_ALOUD: HobArtifact = {
  id: "sample-read-aloud",
  kind: "readaloud",
  title: "Entering the reed maze",
  meta: "Read-aloud · 2 sentences",
  chips: ["Shorter", "More ominous"],
  text: "The reeds close over the path behind you. Somewhere ahead a frog is singing, badly, in what is unmistakably a human key.",
};

export const SAMPLE_NPC: HobArtifact = {
  id: "sample-npc",
  kind: "npc",
  title: "Ubbo, the reed envoy",
  meta: "Bullywug · Neutral · Wants a courier",
  chips: ["Less friendly", "Give him a rival"],
  species: "Bullywug envoy",
  alignment: "Neutral",
  summary: "Wants the party to carry a complaint upriver. Will not say who to.",
  voice: "Voice: slow, wet consonants, ends every sentence like a question",
};

export const SAMPLE_CHECKLIST: HobArtifact = {
  id: "sample-checklist",
  kind: "checklist",
  title: "Session 12 prep",
  meta: "4 items · 2 done",
  chips: ["Add a step", "Reorder"],
  items: [
    { text: "Decide what the ferryman wants", done: true },
    { text: "Reread session 11's last scene", done: true },
    { text: "Pick a name for the frog envoy", done: false },
    { text: "Sketch the reed maze", done: false },
  ],
};

export const SAMPLE_RULES: HobArtifact = {
  id: "sample-rules",
  kind: "rules",
  title: "Moving through reeds",
  meta: "Rules answer",
  chips: [],
  answer:
    "Difficult terrain costs one extra foot of movement per foot moved. Marsh reeds count, so a 30-foot walk covers 15 feet.",
};

/** `ChatPanel.jsx`'s `SEED`, plus one turn from `REPLIES`. */
export const SAMPLE_THREAD: ReadonlyArray<HobTurn> = [
  {
    id: "t1",
    who: "user",
    text: "The party's heading into the reeds tonight. Give me something that isn't just more goblins.",
  },
  {
    id: "t2",
    who: "hob",
    text: "Marsh, then. Four levels of five means I can push a bit harder than session 11.",
    aside: "You've used goblins in three of the last four sittings. I noticed.",
  },
  { id: "t3", who: "artifact", artifact: SAMPLE_ENCOUNTER },
  { id: "t4", who: "user", text: "/read-aloud for walking into it" },
  {
    id: "t5",
    who: "hob",
    text: "Here. Read it slow — the joke lands better if you take your time.",
  },
  { id: "t6", who: "artifact", artifact: SAMPLE_READ_ALOUD },
];
