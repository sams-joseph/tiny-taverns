import * as Schema from "effect/Schema";

export const ModelFamily = Schema.Literals(["qwen3-0.6b"]);
export type ModelFamily = typeof ModelFamily.Type;
