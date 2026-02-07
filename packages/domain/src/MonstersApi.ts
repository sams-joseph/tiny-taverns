import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

export const MonsterId = Schema.UUID.pipe(Schema.brand("MonsterId"));
export type MonsterId = typeof MonsterId.Type;

export const MonsterIdFromString = Schema.UUID.pipe(Schema.compose(MonsterId));

export const MonsterSize = Schema.Literal(
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
);

export const MonsterKind = Schema.Literal(
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
);

export class Monster extends Schema.Class<Monster>("Monster")({
  id: MonsterId,
  name: Schema.NonEmptyTrimmedString,
  size: MonsterSize,
  kind: MonsterKind,
  subtype: Schema.optional(Schema.NonEmptyTrimmedString),
  alignment: Schema.NonEmptyTrimmedString,
  ac: Schema.Int,
  hpAvg: Schema.Int,
  hpFormula: Schema.NonEmptyTrimmedString,
  str: Schema.Int,
  dex: Schema.Int,
  con: Schema.Int,
  int: Schema.Int,
  wis: Schema.Int,
  cha: Schema.Int,
  cr: Schema.Number,
  xp: Schema.Int,
  proficiencyBonus: Schema.Int,
  passivePerception: Schema.optional(Schema.Int),
  languages: Schema.NonEmptyTrimmedString,
  senses: Schema.NonEmptyTrimmedString,
  source: Schema.NonEmptyTrimmedString,
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
}) {}

export class CreateMonsterPayload extends Schema.Class<CreateMonsterPayload>(
  "CreateMonsterPayload",
)({
  name: Schema.NonEmptyTrimmedString,
  size: MonsterSize,
  kind: MonsterKind,
  subtype: Schema.optional(Schema.NonEmptyTrimmedString),
  alignment: Schema.NonEmptyTrimmedString,
  ac: Schema.Int,
  hpAvg: Schema.Int,
  hpFormula: Schema.NonEmptyTrimmedString,
  str: Schema.Int,
  dex: Schema.Int,
  con: Schema.Int,
  int: Schema.Int,
  wis: Schema.Int,
  cha: Schema.Int,
  cr: Schema.Number,
  xp: Schema.Int,
  proficiencyBonus: Schema.Int,
  passivePerception: Schema.Int,
  languages: Schema.NonEmptyTrimmedString,
  senses: Schema.NonEmptyTrimmedString,
  source: Schema.NonEmptyTrimmedString,
}) {}

export class MonsterNotFound extends Schema.TaggedError<MonsterNotFound>()(
  "MonsterNotFound",
  {
    id: MonsterId,
  },
) {}

export class MonstersApiGroup extends HttpApiGroup.make("monsters")
  .add(
    HttpApiEndpoint.get("getAllMonsters", "/monsters")
      .addSuccess(Schema.Array(Monster))
      .setUrlParams(
        Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("createMonster", "/monsters")
      .addSuccess(Monster)
      .setPayload(CreateMonsterPayload),
  ) {}

export class MonstersApi extends HttpApi.make("api").add(MonstersApiGroup) {}
